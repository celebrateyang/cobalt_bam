import { randomUUID } from "node:crypto";
import { agentError, agentQuery, ensureVideoAgentSchema, ownedProject, transaction } from "../db/video-agent.js";
import { compilePlan, hashInput, normalizePlan, normalizeEdits, PIPELINE_VERSION, UUID, validateSettings } from "./plans.js";
import {getEditableResults} from "./results.js";
import { ACTIVE_RUN_STATES, assertTransition } from "./state-machine.js";
import { lockExecutionUser,releaseRunUsage } from "../ai-video/execution-admission.js";
import { prepareAdmission,admitRun,admissionEnabled } from "./admission.js";

const commandTypes = ["update_settings", "create_plan", "start_run", "cancel_run", "retry_run", "update_clip", "update_subtitles", "restore_revision"];
const selectedEditableCues=(editable,edits)=>new Set(editable.clips.flatMap(clip=>{
    const patch=edits.clips?.[clip.id] || {},ids=clip.cues.map(cue=>cue.id);
    const first=ids.indexOf(patch.startCueId || ids[0]),last=ids.indexOf(patch.endCueId || ids.at(-1));
    return first>=0 && last>=first?ids.slice(first,last+1):[];
}));
const defaults = { sourceLanguage: "auto", targetLanguage: "en", subtitleMode: "translated" };
const requireFields = (input, fields) => {
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !fields.includes(key))) throw agentError("VIDEO_AGENT_COMMAND_INVALID", 400, "Invalid command input");
};
export const validateCommandEnvelope = (body) => {
    requireFields(body, ["type", "expectedRevision", "idempotencyKey", "input"]);
    if (!commandTypes.includes(body.type) || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || body.expectedRevision > 2147483646
        || typeof body.idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(body.idempotencyKey) || !body.input || typeof body.input !== "object" || Array.isArray(body.input)
        || JSON.stringify(body).length > 16384) throw agentError("VIDEO_AGENT_COMMAND_INVALID", 400, "Invalid command envelope");
};
export const appendEvent = async (client, { projectId, runId = null, type, payload, now = Date.now() }) => {
    // Callers hold the project row lock: event allocation and commits remain ordered within a project.
    const event = (await client.query(`INSERT INTO video_agent_events(project_id,run_id,type,safe_payload,created_at)
        VALUES($1,$2,$3,$4,$5) RETURNING id`, [projectId, runId, type, payload, now])).rows[0];
    await client.query(`UPDATE video_agent_projects SET last_event_id=$2,updated_at=$3 WHERE id=$1`, [projectId, event.id, now]);
    return String(event.id);
};
const baseline = async (client, project) => {
    await client.query(`INSERT INTO video_agent_revisions(project_id,revision,parent_revision,settings_snapshot,created_by,created_at)
        VALUES($1,0,NULL,$2,$3,$4) ON CONFLICT DO NOTHING`, [project.id, defaults, project.user_id, project.created_at]);
    return (await client.query(`SELECT * FROM video_agent_revisions WHERE project_id=$1 AND revision=$2`, [project.id, project.current_revision])).rows[0];
};
const createRevision = async (client, project, { settings, edits, userId }) => {
    const revision = project.current_revision + 1;
    await client.query(`INSERT INTO video_agent_revisions(project_id,revision,parent_revision,settings_snapshot,edit_snapshot,created_by,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [project.id, revision, project.current_revision, settings, edits, userId, Date.now()]);
    await client.query(`UPDATE video_agent_projects SET current_revision=$2 WHERE id=$1`, [project.id, revision]);
    await appendEvent(client, { projectId: project.id, type: "revision.created", payload: { revision, parentRevision: project.current_revision } });
    return revision;
};
const readySource = async (client, projectId, sourceId) => {
    const row = (await client.query(`SELECT s.* FROM video_agent_sources s WHERE s.id=$1 AND s.project_id=$2 FOR UPDATE`, [sourceId, projectId])).rows[0];
    if (!row) throw agentError("VIDEO_AGENT_SOURCE_NOT_FOUND", 404, "Source not found");
    if (row.status !== "ready" || Number(row.retention_until) <= Date.now() || !row.probe || !row.checksum || !row.generation) throw agentError("VIDEO_AGENT_SOURCE_NOT_READY", 409, "Source is not ready or expired");
    if (!Number.isSafeInteger(row.probe.durationMs) || row.probe.durationMs <= 0 || row.probe.durationMs > 3600000
        || !Number.isInteger(row.probe.width) || row.probe.width <= 0 || !Number.isInteger(row.probe.height) || row.probe.height <= 0
        || !Number.isSafeInteger(Number(row.size_bytes)) || Number(row.size_bytes) <= 0 || Number(row.size_bytes) > 1024 ** 3
        || !/^[0-9a-f]{64}$/.test(row.checksum)) throw agentError("VIDEO_AGENT_SOURCE_NOT_READY", 409, "Source probe or checksum is invalid");
    return { id: row.id, checksum: row.checksum, generation: row.generation, sizeBytes: Number(row.size_bytes),
        durationMs: row.probe.durationMs, width: row.probe.width, height: row.probe.height };
};
const ownedRun = async (client, projectId, runId, lock = false) => {
    if (typeof runId !== "string" || !UUID.test(runId)) throw agentError("VIDEO_AGENT_COMMAND_INVALID", 400, "Invalid run id");
    const row = (await client.query(`SELECT * FROM video_agent_runs WHERE id=$1 AND project_id=$2 ${lock ? "FOR UPDATE" : ""}`, [runId, projectId])).rows[0];
    if (!row) throw agentError("VIDEO_AGENT_RUN_NOT_FOUND", 404, "Run not found");
    return row;
};
const runDTO = (row) => ({ id: row.id, projectId: row.project_id, revision: row.base_revision, planId: row.plan_id, plan: row.plan,
    status: row.status, admissionStatus: row.admission_status, pipelineVersion: row.pipeline_version,
    retryOfRunId: row.retry_of_run_id, requestedCount: row.requested_count, producedCount: row.produced_count,
    errorCode: row.error_code, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
    completedAt: row.completed_at === null ? null : Number(row.completed_at) });

const createRun = async (client, project, planRow, retryOf = null, admissionPolicy, reuseOf = retryOf) => {
    if (process.env.VIDEO_AGENT_RUNS_ENABLED !== "1") throw agentError("VIDEO_AGENT_RUNS_NOT_ENABLED", 503, "Run acceptance is not enabled");
    if(!admissionEnabled() && !(process.env.NODE_ENV==="test" && admissionPolicy?.metadataOnly===true))throw agentError("VIDEO_AGENT_ADMISSION_NOT_ENABLED",503,"Execution admission is not enabled");
    if (planRow.pipeline_version !== PIPELINE_VERSION) throw agentError("VIDEO_AGENT_PIPELINE_OUTDATED", 409, "Create a plan for the current pipeline version");
    const active = await client.query(`SELECT id FROM video_agent_runs WHERE project_id=$1 AND status=ANY($2::text[]) LIMIT 1`, [project.id, ACTIVE_RUN_STATES]);
    if (active.rowCount) throw agentError("VIDEO_AGENT_PROJECT_RUN_ACTIVE", 409, "Another project run is active");
    const count = (await client.query(`SELECT count(*)::int AS count FROM video_agent_runs WHERE project_id=$1`, [project.id])).rows[0].count;
    if (count >= 100) throw agentError("VIDEO_AGENT_RUN_LIMIT", 409, "Run limit reached");
    if(planRow.plan.dubbing?.enabled){
        const dayStart=Math.floor(Date.now()/86400000)*86400000;
        const today=(await client.query(`SELECT count(*)::int AS count FROM video_agent_runs WHERE project_id=$1 AND created_at>=$2 AND plan->'dubbing'->>'enabled'='true'`,[project.id,dayStart])).rows[0].count;
        if(today>=10)throw agentError("VIDEO_AGENT_DUB_DAILY_LIMIT",409,"Daily dubbing run limit reached");
    }
    const currentSource = await readySource(client, project.id, planRow.plan.sourceRef);
    if (hashInput(currentSource) !== hashInput(planRow.source_snapshot)) throw agentError("VIDEO_AGENT_SOURCE_CHANGED", 409, "Source changed since planning");
    const runId = randomUUID();
    const now = Date.now();
    const row = (await client.query(`INSERT INTO video_agent_runs(id,project_id,base_revision,plan_id,plan,plan_hash,source_snapshot,pipeline_version,
        status,admission_status,retry_of_run_id,requested_count,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'queued','pending',$9,$10,$11,$11) RETURNING *`,
    [runId, project.id, planRow.revision, planRow.id, planRow.plan, planRow.plan_hash, currentSource, planRow.pipeline_version, retryOf?.id || null, planRow.plan.clips.requestedCount, now])).rows[0];
    const graph = compilePlan({ plan: planRow.plan, sourceSnapshot: currentSource, revision: planRow.revision });
    const ids = Object.fromEntries(graph.map((step) => [step.stage, randomUUID()]));
    const previous = reuseOf ? (await client.query(`SELECT * FROM video_agent_steps WHERE run_id=$1 ORDER BY created_at,id`, [reuseOf.id])).rows : [];
    if(planRow.plan.edits && !previous.some(step=>step.stage==="translate_selected" && step.status==="succeeded"))
        throw agentError("VIDEO_AGENT_EDIT_SOURCE_UNAVAILABLE",409,"Editable translation is unavailable");
    const reusedStages = new Set();
    for (const step of graph) {
        // Never reuse final publication/verification; these must validate the new run's result set.
        let reusable = !["verify", "publish_results"].includes(step.stage) && step.dependsOn.every((stage) => reusedStages.has(stage))
            ? previous.find((old) => old.stage === step.stage && old.scope_id === step.scopeId && old.input_hash === step.inputHash && old.status === "succeeded") : null;
        if (reusable) {
            const refs = reusable.output_refs;
            if (!Array.isArray(refs) || !refs.length || refs.some((ref) => typeof ref !== "string" || !UUID.test(ref))) reusable = null;
            else {
                const assets = await client.query(`SELECT id FROM video_agent_assets WHERE id=ANY($1::uuid[]) AND project_id=$2 AND status='ready' AND expires_at>$3`, [refs, project.id, now]);
                if (assets.rowCount !== new Set(refs).size) reusable = null;
            }
        }
        if (reusable) reusedStages.add(step.stage);
        await client.query(`INSERT INTO video_agent_steps(id,run_id,stage,scope_id,dependencies,input_snapshot,input_hash,pipeline_version,status,
            output_refs,reused_step_id,available_at,created_at,updated_at,ordinal,checkpoint,provider,model) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$12,$13,$14,$15,$16)`,
        [ids[step.stage], runId, step.stage, step.scopeId, step.dependsOn.map((dependency) => ids[dependency]), step.input, step.inputHash, PIPELINE_VERSION,
            reusable ? "succeeded" : "pending", reusable?.output_refs || [], reusable?.id || null, now, step.ordinal,reusable?.checkpoint || {},reusable?.provider || null,reusable?.model || null]);
    }
    if(planRow.plan.edits && !reusedStages.has("translate_selected"))
        throw agentError("VIDEO_AGENT_EDIT_SOURCE_UNAVAILABLE",409,"Editable translation assets have expired; create a fresh result before editing");
    const admitted=await admitRun(client,project,row,retryOf,admissionPolicy);
    await appendEvent(client, { projectId: project.id, runId, type: "run.status", payload: { runId, status: "queued", admissionStatus: admitted.admission_status, revision: planRow.revision } });
    return admitted;
};
const cancelRun = async (client, projectId, run) => {
    if (!ACTIVE_RUN_STATES.includes(run.status)) return run;
    if (run.status === "cancelling") return run;
    const next = ["queued", "awaiting_input"].includes(run.status) ? "cancelled" : "cancelling";
    assertTransition("run", run.status, next);
    const now = Date.now();
    const row = (await client.query(`UPDATE video_agent_runs SET status=$2,updated_at=$3,completed_at=$4 WHERE id=$1 RETURNING *`, [run.id, next, now, next === "cancelled" ? now : null])).rows[0];
    await client.query(`UPDATE video_agent_steps SET status='cancelled',updated_at=$2 WHERE run_id=$1 AND status IN ('pending','ready','retry_wait')`, [run.id, now]);
    if(next==="cancelled" && run.budget_snapshot?.reservationId)await releaseRunUsage(client,run.id,now);
    await appendEvent(client, { projectId, runId: run.id, type: "run.status", payload: { runId: run.id, status: next } });
    return row;
};

export const submitCommand = async ({ projectId, userId, body, admissionPolicy }) => {
    validateCommandEnvelope(body);
    let editable=null;
    if(["update_clip","update_subtitles"].includes(body.type)){
        await ensureVideoAgentSchema();
        const existing=(await agentQuery(`SELECT c.* FROM video_agent_commands c JOIN video_agent_projects p ON p.id=c.project_id
            WHERE c.project_id=$1 AND c.user_id=$2 AND c.idempotency_key=$3 AND p.user_id=$2 AND p.deleted_at IS NULL`,
        [projectId,userId,body.idempotencyKey])).rows[0];
        if(existing){
            if(existing.payload_hash!==hashInput({type:body.type,expectedRevision:body.expectedRevision,input:body.input}))
                throw agentError("VIDEO_AGENT_IDEMPOTENCY_CONFLICT",409,"Idempotency key has a different payload");
            return {...existing.receipt,replayed:true};
        }
        if(typeof body.input.runId!=="string" || !UUID.test(body.input.runId))throw agentError("VIDEO_AGENT_COMMAND_INVALID",400,"Invalid edit run");
        editable=await getEditableResults({projectId,userId,runId:body.input.runId});
    }
    await prepareAdmission();
    return transaction(async (client) => {
        await lockExecutionUser(client,userId);
        const project = await ownedProject(client, { projectId, userId, lock: true });
        const payloadHash = hashInput({ type: body.type, expectedRevision: body.expectedRevision, input: body.input });
        const existing = (await client.query(`SELECT * FROM video_agent_commands WHERE project_id=$1 AND user_id=$2 AND idempotency_key=$3`, [projectId, userId, body.idempotencyKey])).rows[0];
        if (existing) {
            if (existing.payload_hash !== payloadHash) throw agentError("VIDEO_AGENT_IDEMPOTENCY_CONFLICT", 409, "Idempotency key has a different payload");
            return { ...existing.receipt, replayed: true };
        }
        if (body.type !== "cancel_run" && process.env.VIDEO_AGENT_ENABLED !== "1") throw agentError("VIDEO_AGENT_NOT_ENABLED", 503, "New commands are not enabled");
        // Cancellation is immediate and may target an earlier run after project edits.
        if (body.type !== "cancel_run" && project.current_revision !== body.expectedRevision) throw agentError("VIDEO_AGENT_REVISION_CONFLICT", 409, "Project was changed elsewhere", { revision: project.current_revision });
        const current = await baseline(client, project);
        const commandId = randomUUID();
        let receipt = { commandId, status: "completed", revision: project.current_revision };
        if (body.type === "update_settings") {
            const patch = validateSettings(body.input);
            receipt.revision = await createRevision(client, project, { settings: { ...current.settings_snapshot, ...patch }, edits: current.edit_snapshot, userId });
        } else if (body.type === "create_plan") {
            if(body.input.edits!==undefined)throw agentError("VIDEO_AGENT_COMMAND_INVALID",400,"Use result edit commands to create edited plans");
            const plan = normalizePlan(body.input);
            const snapshot = await readySource(client, projectId, plan.sourceRef);
            if (snapshot.durationMs < plan.clips.minSeconds * 1000) throw agentError("VIDEO_AGENT_SOURCE_TOO_SHORT", 400, "Source is shorter than the minimum clip duration");
            receipt.revision = await createRevision(client, project, { settings: { sourceLanguage: plan.sourceLanguage, targetLanguage: plan.targetLanguage, subtitleMode: plan.subtitles.mode }, edits: current.edit_snapshot, userId });
            receipt.planId = randomUUID();
            await client.query(`INSERT INTO video_agent_plans(id,project_id,revision,plan,plan_hash,source_snapshot,pipeline_version,created_at)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [receipt.planId, projectId, receipt.revision, plan, hashInput({ plan, snapshot, revision: receipt.revision, pipelineVersion: PIPELINE_VERSION }), snapshot, PIPELINE_VERSION, Date.now()]);
            await appendEvent(client, { projectId, type: "plan.created", payload: { planId: receipt.planId, revision: receipt.revision, sourceId: plan.sourceRef, requestedCount: plan.clips.requestedCount } });
        } else if(["update_clip","update_subtitles"].includes(body.type)){
            const run=await ownedRun(client,projectId,body.input.runId);
            if(!["completed","partially_completed"].includes(run.status))throw agentError("VIDEO_AGENT_EDIT_RUN_NOT_READY",409,"Completed run required for editing");
            const prior=(await client.query("SELECT * FROM video_agent_plans WHERE project_id=$1 AND revision=$2 ORDER BY created_at DESC LIMIT 1",[projectId,project.current_revision])).rows[0];
            if(!prior || (prior.id!==run.plan_id && prior.plan.edits?.baseRunId!==run.id))throw agentError("VIDEO_AGENT_EDIT_BASE_CONFLICT",409,"Select or restore the matching version first");
            const edits=normalizeEdits(prior.plan.edits || {baseRunId:run.id,clips:{},subtitles:{}});
            if(body.type==="update_clip"){
                requireFields(body.input,["runId","clipId","patch"]);
                const clip=editable.clips.find(item=>item.id===body.input.clipId);
                if(!clip)throw agentError("VIDEO_AGENT_EDIT_CLIP_NOT_FOUND",404,"Clip not found in this run");
                requireFields(body.input.patch,["title","focusX","startCueId","endCueId"]);
                if(!Object.keys(body.input.patch).length)throw agentError("VIDEO_AGENT_COMMAND_INVALID",400,"Empty clip edit");
                const patch={...(edits.clips[clip.id] || {}),...body.input.patch};
                const first=clip.cues.findIndex(item=>item.id===(patch.startCueId || clip.cues[0]?.id));
                const last=clip.cues.findIndex(item=>item.id===(patch.endCueId || clip.cues.at(-1)?.id));
                if(first<0 || last<first || clip.cues[last].endMs-clip.cues[first].startMs<15000 || clip.cues[last].endMs-clip.cues[first].startMs>90000)
                    throw agentError("VIDEO_AGENT_EDIT_BOUNDARY_INVALID",422,"Clip boundaries must span 15–90 seconds within the selected clip");
                edits.clips={...edits.clips,[clip.id]:patch};
                const selected=selectedEditableCues(editable,edits);
                edits.subtitles=Object.fromEntries(Object.entries(edits.subtitles).filter(([id])=>selected.has(id)));
            }else{
                requireFields(body.input,["runId","cueId","text"]);
                if(!selectedEditableCues(editable,edits).has(body.input.cueId))throw agentError("VIDEO_AGENT_EDIT_CUE_NOT_FOUND",404,"Subtitle cue not found in the selected clip range");
                edits.subtitles={...edits.subtitles,[body.input.cueId]:body.input.text};
            }
            const plan=normalizePlan({...prior.plan,edits:normalizeEdits(edits)});
            receipt.revision=await createRevision(client,project,{settings:current.settings_snapshot,edits:plan.edits,userId});
            receipt.planId=randomUUID();
            await client.query(`INSERT INTO video_agent_plans(id,project_id,revision,plan,plan_hash,source_snapshot,pipeline_version,created_at)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[receipt.planId,projectId,receipt.revision,plan,
                hashInput({plan,snapshot:prior.source_snapshot,revision:receipt.revision,pipelineVersion:PIPELINE_VERSION}),prior.source_snapshot,PIPELINE_VERSION,Date.now()]);
            await appendEvent(client,{projectId,type:"plan.edited",payload:{revision:receipt.revision,planId:receipt.planId,runId:run.id}});
        } else if(body.type==="restore_revision"){
            requireFields(body.input,["revision"]);
            if(!Number.isInteger(body.input.revision) || body.input.revision<0 || body.input.revision>=project.current_revision)
                throw agentError("VIDEO_AGENT_COMMAND_INVALID",400,"Invalid revision to restore");
            const old=(await client.query("SELECT * FROM video_agent_revisions WHERE project_id=$1 AND revision=$2",[projectId,body.input.revision])).rows[0];
            if(!old)throw agentError("VIDEO_AGENT_REVISION_NOT_FOUND",404,"Revision not found");
            const oldPlan=(await client.query("SELECT * FROM video_agent_plans WHERE project_id=$1 AND revision=$2 ORDER BY created_at DESC LIMIT 1",[projectId,old.revision])).rows[0];
            receipt.revision=await createRevision(client,project,{settings:old.settings_snapshot,edits:old.edit_snapshot,userId});
            if(oldPlan){receipt.planId=randomUUID();await client.query(`INSERT INTO video_agent_plans(id,project_id,revision,plan,plan_hash,source_snapshot,pipeline_version,created_at)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[receipt.planId,projectId,receipt.revision,oldPlan.plan,
                hashInput({plan:oldPlan.plan,snapshot:oldPlan.source_snapshot,revision:receipt.revision,pipelineVersion:oldPlan.pipeline_version}),oldPlan.source_snapshot,oldPlan.pipeline_version,Date.now()]);}
            await appendEvent(client,{projectId,type:"revision.restored",payload:{revision:receipt.revision,restoredFrom:old.revision,planId:receipt.planId || null}});
        } else if (body.type === "start_run") {
            requireFields(body.input, ["planId"]);
            if (typeof body.input.planId !== "string" || !UUID.test(body.input.planId)) throw agentError("VIDEO_AGENT_COMMAND_INVALID", 400, "Invalid plan id");
            const plan = (await client.query(`SELECT * FROM video_agent_plans WHERE id=$1 AND project_id=$2`, [body.input.planId, projectId])).rows[0];
            if (!plan) throw agentError("VIDEO_AGENT_PLAN_NOT_FOUND", 404, "Plan not found");
            if (plan.revision !== project.current_revision) throw agentError("VIDEO_AGENT_PLAN_OUTDATED", 409, "Plan revision is outdated", { revision: project.current_revision });
            const reuse=plan.plan.edits?(await ownedRun(client,projectId,plan.plan.edits.baseRunId)):
                (await client.query(`SELECT * FROM video_agent_runs WHERE project_id=$1 AND status IN ('completed','partially_completed')
                    ORDER BY created_at DESC LIMIT 1`,[projectId])).rows[0] || null;
            const run = await createRun(client, project, plan,null,admissionPolicy,reuse);
            receipt = { ...receipt, status: "accepted", runId: run.id, admissionStatus: run.admission_status };
        } else {
            requireFields(body.input, ["runId"]);
            const run = await ownedRun(client, projectId, body.input.runId, true);
            if (body.type === "cancel_run") {
                const cancelled = await cancelRun(client, projectId, run);
                receipt = { ...receipt, runId: run.id, runStatus: cancelled.status, status: cancelled.status === "cancelling" ? "accepted" : "completed" };
            } else {
                if (!["failed", "partially_completed"].includes(run.status)) throw agentError("VIDEO_AGENT_RUN_NOT_RETRYABLE", 409, "Run is not retryable");
                const plan = (await client.query(`SELECT * FROM video_agent_plans WHERE id=$1`, [run.plan_id])).rows[0];
                // A retry intentionally uses the original immutable revision; later edits remain separate.
                const next = await createRun(client, project, plan, run,admissionPolicy);
                receipt = { ...receipt, status: "accepted", runId: next.id, runRevision: next.base_revision, admissionStatus: next.admission_status };
            }
        }
        await client.query(`INSERT INTO video_agent_commands(id,project_id,user_id,idempotency_key,payload_hash,expected_revision,type,receipt,status,created_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [commandId, projectId, userId, body.idempotencyKey, payloadHash, body.expectedRevision, body.type, receipt, receipt.status, Date.now()]);
        return { ...receipt, replayed: false };
    });
};

export const listRevisions = (input) => transaction(async (client) => {
    const project = await ownedProject(client, { ...input, lock: true });
    await baseline(client, project);
    const rows = (await client.query(`SELECT * FROM video_agent_revisions WHERE project_id=$1 AND ($2::integer IS NULL OR revision<$2) ORDER BY revision DESC LIMIT $3`, [input.projectId, input.before ?? null, input.limit + 1])).rows;
    const revisions = rows.slice(0, input.limit).map((row) => ({ revision: row.revision, parentRevision: row.parent_revision, settings: row.settings_snapshot, edits: row.edit_snapshot, createdAt: Number(row.created_at) }));
    return { revision: project.current_revision, revisions, nextCursor: rows.length > input.limit ? String(revisions.at(-1).revision) : null };
});
export const getPlan = (input) => transaction(async (client) => {
    await ownedProject(client, { ...input, lock: true });
    const row = (await client.query(`SELECT * FROM video_agent_plans WHERE id=$1 AND project_id=$2`, [input.planId, input.projectId])).rows[0];
    if (!row) throw agentError("VIDEO_AGENT_PLAN_NOT_FOUND", 404, "Plan not found");
    return { plan: { id: row.id, revision: row.revision, input: row.plan, pipelineVersion: row.pipeline_version } };
});
export const getCurrentPlan = (input)=>transaction(async(client)=>{
    const project=await ownedProject(client,{...input,lock:true});
    const row=(await client.query(`SELECT * FROM video_agent_plans WHERE project_id=$1 AND revision=$2 ORDER BY created_at DESC LIMIT 1`,[input.projectId,project.current_revision])).rows[0];
    return {revision:project.current_revision,plan:row?{id:row.id,revision:row.revision,input:row.plan,pipelineVersion:row.pipeline_version}:null};
});
export const getRun = (input) => transaction(async (client) => {
    const project = await ownedProject(client, { ...input, lock: true });
    const run = await ownedRun(client, input.projectId, input.runId);
    const steps = (await client.query(`SELECT id,stage,scope_id,dependencies,status,attempt,reused_step_id,error_code FROM video_agent_steps WHERE run_id=$1 ORDER BY ordinal`, [run.id])).rows;
    return { run: runDTO(run), steps: steps.map((row) => ({ id: row.id, stage: row.stage, scopeId: row.scope_id, dependencies: row.dependencies, status: row.status, attempt: row.attempt, reusedStepId: row.reused_step_id, errorCode: row.error_code })), eventCursor: String(project.last_event_id) };
});
export const listRuns = (input) => transaction(async (client) => {
    await ownedProject(client, { ...input, lock: true });
    const rows = (await client.query(`SELECT * FROM video_agent_runs WHERE project_id=$1 AND ($2::bigint IS NULL OR (created_at,id)<($2,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4`, [input.projectId, input.cursor?.at ?? null, input.cursor?.id ?? null, input.limit + 1])).rows;
    const page = rows.slice(0, input.limit);
    return { runs: page.map(runDTO), nextCursor: rows.length > input.limit ? `${page.at(-1).created_at}:${page.at(-1).id}` : null };
});
export const listEvents = (input) => transaction(async (client) => {
    const project = await ownedProject(client, { ...input, lock: true });
    if (BigInt(input.after) < BigInt(project.event_floor_id)) return { events: [], resetRequired: true, snapshotRequired: true, nextCursor: String(project.last_event_id) };
    if (BigInt(input.after) > BigInt(project.last_event_id)) throw agentError("VIDEO_AGENT_EVENT_CURSOR_INVALID", 400, "Event cursor is ahead of project state");
    const rows = (await client.query(`SELECT * FROM video_agent_events WHERE project_id=$1 AND id>$2 ORDER BY id LIMIT $3`, [input.projectId, input.after, input.limit + 1])).rows;
    const page = rows.slice(0, input.limit);
    return { events: page.map((row) => ({ id: String(row.id), type: row.type, schemaVersion: row.schema_version, runId: row.run_id, data: row.safe_payload, createdAt: Number(row.created_at) })),
        nextCursor: page.length ? String(page.at(-1).id) : input.after, hasMore: rows.length > input.limit, resetRequired: false };
});

// Runs are cancelled under the same project lock as deletion; no new signature or command can race it.
export const cancelProjectRuns = async (client, projectId) => {
    const rows = (await client.query(`SELECT * FROM video_agent_runs WHERE project_id=$1 AND status=ANY($2::text[]) FOR UPDATE`, [projectId, ACTIVE_RUN_STATES])).rows;
    for (const run of rows) await cancelRun(client, projectId, run);
};
export const cleanupExecutionHistory = async ({ limit = 100 } = {}) => transaction(async (client) => {
    const projects = (await client.query(`SELECT * FROM video_agent_projects WHERE
        (deleted_at IS NOT NULL AND (EXISTS(SELECT 1 FROM video_agent_events e WHERE e.project_id=video_agent_projects.id)
            OR EXISTS(SELECT 1 FROM video_agent_commands c WHERE c.project_id=video_agent_projects.id)
            OR EXISTS(SELECT 1 FROM video_agent_messages m WHERE m.project_id=video_agent_projects.id))) OR
        EXISTS(SELECT 1 FROM video_agent_events e WHERE e.project_id=video_agent_projects.id AND e.created_at<$1) OR
        EXISTS(SELECT 1 FROM video_agent_messages m WHERE m.project_id=video_agent_projects.id AND m.created_at<$1)
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $2`, [Date.now() - 90 * 24 * 60 * 60 * 1000, limit])).rows;
    for (const project of projects) {
        const expired = await client.query(`DELETE FROM video_agent_events WHERE project_id=$1 AND ($2::boolean OR created_at<$3) RETURNING id`, [project.id, project.deleted_at !== null, Date.now() - 90 * 24 * 60 * 60 * 1000]);
        if (expired.rowCount) {
            const floor = expired.rows.reduce((max, row) => BigInt(row.id) > max ? BigInt(row.id) : max, BigInt(project.event_floor_id));
            await client.query(`UPDATE video_agent_projects SET event_floor_id=$2 WHERE id=$1`, [project.id, String(floor)]);
        }
        if (project.deleted_at !== null) await client.query(`DELETE FROM video_agent_commands WHERE project_id=$1`, [project.id]);
        await client.query(`DELETE FROM video_agent_messages WHERE project_id=$1 AND ($2::boolean OR created_at<$3)`,[project.id,project.deleted_at!==null,Date.now()-90*24*60*60*1000]);
    }
    return { scanned: projects.length };
});
