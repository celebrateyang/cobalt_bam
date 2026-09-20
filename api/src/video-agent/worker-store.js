import { randomUUID } from "node:crypto";
import { agentError, transaction } from "../db/video-agent.js";
import { appendEvent } from "./execution.js";
import { assertCompletion } from "./state-machine.js";
import { PIPELINE_VERSION, UUID } from "./plans.js";
import { executionCapacity,releaseRunUsage } from "../ai-video/execution-admission.js";

export const retryDelay = (attempt, retryAfterMs = 0, random = Math.random) => Math.ceil(Math.min(24 * 60 * 60 * 1000, Math.max(retryAfterMs, Math.min(60000, 1000 * 2 ** Math.max(0, attempt - 1)) * (0.75 + random() * 0.5))));
export const retryableError = (error) => [429, 500, 502, 503, 504].includes(Number(error.status || error.statusCode))
    || ["VIDEO_AGENT_WORKER_INTERRUPTED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"].includes(error.code);
const event = (client, run, type, data, now) => appendEvent(client, { projectId: run.project_id, runId: run.id, type, payload: data, now });
const setRunStatus = async (client, run, status, now, errorCode = null, producedCount = 0) => {
    if(["failed","cancelled","completed","partially_completed"].includes(status) && run.budget_snapshot?.reservationId)await releaseRunUsage(client,run.id,now);
    await client.query(`UPDATE video_agent_runs SET status=$2,error_code=$3,produced_count=$4,updated_at=$5,completed_at=$6 WHERE id=$1`,
        [run.id, status, errorCode, producedCount, now, ["failed", "cancelled", "completed", "partially_completed"].includes(status) ? now : null]);
    await event(client, run, "run.status", { runId: run.id, status, errorCode, producedCount }, now);
};
const finishAttempt = (client, step, status, now, code = null) => client.query(`UPDATE video_agent_step_attempts SET status=$3,error_code=$4,completed_at=$5 WHERE step_id=$1 AND fencing_token=$2 AND status='running'`, [step.id, step.fencing_token, status, code, now]);

// Lock order is always project -> run -> steps. Scheduler/commands/events use the same order.
export const advanceRuns = ({ now, limit = 20 } = {}) => transaction(async (client) => {
    const projects = (await client.query(`SELECT p.* FROM video_agent_projects p WHERE EXISTS(SELECT 1 FROM video_agent_runs r WHERE r.project_id=p.id
        AND (r.status='cancelling' OR (r.status IN ('queued','running') AND r.admission_status='admitted' AND r.entitlement_snapshot IS NOT NULL AND r.budget_snapshot IS NOT NULL)))
        ORDER BY p.scheduler_checked_at,p.id FOR UPDATE SKIP LOCKED LIMIT $1`, [limit])).rows;
    now ??= Date.now();
    for (const project of projects) {
        await client.query(`UPDATE video_agent_projects SET scheduler_checked_at=$2 WHERE id=$1`,[project.id,now]);
        const runs = (await client.query(`SELECT * FROM video_agent_runs WHERE project_id=$1 AND status IN ('queued','running','cancelling') FOR UPDATE`, [project.id])).rows;
        for (const run of runs) {
            const steps = (await client.query(`SELECT * FROM video_agent_steps WHERE run_id=$1 ORDER BY ordinal FOR UPDATE`, [run.id])).rows;
            const cancelling = run.status === "cancelling" || project.deleted_at !== null;
            if (cancelling) {
                for (const step of steps) if (!["succeeded", "failed", "cancelled", "skipped"].includes(step.status) && (step.status !== "running" || Number(step.lease_expires_at) <= now)) {
                    await finishAttempt(client, step, "cancelled", now, "VIDEO_AGENT_CANCELLED");
                    await client.query(`UPDATE video_agent_steps SET status='cancelled',fencing_token=fencing_token+1,lease_owner=NULL,lease_expires_at=NULL,updated_at=$2 WHERE id=$1`, [step.id, now]);
                    step.status = "cancelled";
                }
                if (!steps.some((step) => step.status === "running")) await setRunStatus(client, run, "cancelled", now);
                else if (run.status !== "cancelling") await setRunStatus(client, run, "cancelling", now);
                continue;
            }
            if (run.admission_status !== "admitted" || !run.entitlement_snapshot || !run.budget_snapshot) continue;
            for (const step of steps) {
                if (step.status === "running" && Number(step.lease_expires_at) <= now) {
                    await finishAttempt(client, step, "abandoned", now, "VIDEO_AGENT_LEASE_EXPIRED");
                    step.status = step.attempt >= 3 ? "failed" : "retry_wait";
                    step.error_code = "VIDEO_AGENT_LEASE_EXPIRED";
                    step.available_at = now + retryDelay(step.attempt);
                    await client.query(`UPDATE video_agent_steps SET status=$2,available_at=$3,error_code='VIDEO_AGENT_LEASE_EXPIRED',fencing_token=fencing_token+1,lease_owner=NULL,lease_expires_at=NULL,updated_at=$4 WHERE id=$1`, [step.id, step.status, step.available_at, now]);
                    await event(client, run, "step.progress", { stepId: step.id, stage: step.stage, status: step.status, attempt: step.attempt, errorCode: "VIDEO_AGENT_LEASE_EXPIRED" }, now);
                }
                if (step.status === "retry_wait" && Number(step.available_at) <= now) {
                    step.status = "ready";
                    await client.query(`UPDATE video_agent_steps SET status='ready',updated_at=$2 WHERE id=$1`, [step.id, now]);
                }
                if (step.status === "pending" && step.dependencies.every((id) => steps.find((dependency) => dependency.id === id)?.status === "succeeded")) {
                    step.status = "ready";
                    await client.query(`UPDATE video_agent_steps SET status='ready',updated_at=$2 WHERE id=$1`, [step.id, now]);
                }
            }
            if (steps.some((step) => step.status === "failed")) {
                // No terminal Run while a parallel handler is still executing.
                await client.query(`UPDATE video_agent_steps SET status='skipped',updated_at=$2 WHERE run_id=$1 AND status IN ('pending','ready','retry_wait')`, [run.id, now]);
                if (!steps.some((step) => step.status === "running")) await setRunStatus(client, run, "failed", now, steps.find((step) => step.status === "failed").error_code || "VIDEO_AGENT_STEP_FAILED");
            } else if (steps.every((step) => ["succeeded", "skipped"].includes(step.status))) {
                const verify = steps.find((step) => step.stage === "verify");
                const publish = steps.find((step) => step.stage === "publish_results");
                const count = publish?.checkpoint?.producedCount;
                const refs=publish?.output_refs || [];
                const outputs=refs.length ? await client.query(`SELECT id FROM video_agent_assets WHERE id=ANY($1::uuid[]) AND project_id=$2 AND kind='rendered_video'
                    AND status='ready' AND expires_at>$3 AND generation IS NOT NULL AND checksum ~ '^[a-f0-9]{64}$' AND size_bytes>0`,[refs,run.project_id,now]) : { rowCount:0 };
                if (verify?.checkpoint?.verified !== true || !refs.length || new Set(refs).size!==count || outputs.rowCount!==count
                    || refs.some((id)=>!verify.output_refs.includes(id))) await setRunStatus(client, run, "failed", now, "VIDEO_AGENT_RESULTS_UNVERIFIED");
                else {
                    const status = count === run.requested_count ? "completed" : "partially_completed";
                    try { assertCompletion({ status, steps, requestedCount: run.requested_count, producedCount: count }); }
                    catch { await setRunStatus(client, run, "failed", now, "VIDEO_AGENT_RESULTS_UNVERIFIED"); continue; }
                    await setRunStatus(client, run, status, now, null, count);
                    await event(client, run, "run.completed", { runId: run.id, status, producedCount: count }, now);
                }
            }
        }
    }
    return { scanned: projects.length };
});

export const claimStep = ({ workerId, stages, leaseMs = 120000, now }) => transaction(async (client) => {
    if (typeof workerId !== "string" || !workerId || workerId.length > 128 || !Array.isArray(stages) || !stages.length) throw new Error("Invalid worker claim");
    if(!await executionCapacity(client,now))return null;
    const project = (await client.query(`SELECT p.* FROM video_agent_projects p WHERE p.deleted_at IS NULL AND EXISTS(
        SELECT 1 FROM video_agent_runs r JOIN video_agent_steps s ON s.run_id=r.id WHERE r.project_id=p.id AND r.status IN ('queued','running')
        AND r.admission_status='admitted' AND r.entitlement_snapshot IS NOT NULL AND r.budget_snapshot IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM video_agent_steps failed WHERE failed.run_id=r.id AND failed.status='failed')
        AND r.pipeline_version=$1 AND s.status='ready' AND s.available_at<=$2 AND s.stage=ANY($3::text[]))
        ORDER BY p.updated_at FOR UPDATE SKIP LOCKED LIMIT 1`, [PIPELINE_VERSION, now ?? Date.now(), stages])).rows[0];
    if (!project) return null;
    now ??= Date.now();
    const run = (await client.query(`SELECT * FROM video_agent_runs WHERE project_id=$1 AND status IN ('queued','running') FOR UPDATE`, [project.id])).rows.find((row) => row.admission_status === "admitted" && row.entitlement_snapshot && row.budget_snapshot);
    if (!run) return null;
    const step = (await client.query(`SELECT * FROM video_agent_steps WHERE run_id=$1 AND status='ready' AND available_at<=$2 AND stage=ANY($3::text[]) AND attempt<3
        ORDER BY ordinal FOR UPDATE SKIP LOCKED LIMIT 1`, [run.id, now, stages])).rows[0];
    if (!step) return null;
    const dependencies = (await client.query(`SELECT * FROM video_agent_steps WHERE id=ANY($1::uuid[])`, [step.dependencies])).rows;
    if (dependencies.length !== step.dependencies.length || dependencies.some((row) => row.run_id !== run.id || row.status !== "succeeded")) return null;
    const updated = (await client.query(`UPDATE video_agent_steps SET status='running',attempt=attempt+1,fencing_token=fencing_token+1,lease_owner=$2,lease_expires_at=$3,error_code=NULL,updated_at=$4 WHERE id=$1 RETURNING *`, [step.id, workerId, now + leaseMs, now])).rows[0];
    if(step.stage==="transcribe" && run.budget_snapshot?.reservationId){
        const billed=await client.query(`UPDATE ai_video_usage_reservations SET status='committed',consumed_seconds=reserved_seconds,updated_at=$2 WHERE id=$1 AND status='reserved' RETURNING id`,[run.budget_snapshot.reservationId,now]);
        if(!billed.rowCount && !(await client.query(`SELECT id FROM ai_video_usage_reservations WHERE id=$1 AND status='committed'`,[run.budget_snapshot.reservationId])).rowCount)throw agentError("AI_VIDEO_RESERVATION_MISSING",409,"Usage reservation unavailable");
    }
    await client.query(`INSERT INTO video_agent_step_attempts(id,step_id,attempt,fencing_token,worker_id,status,started_at) VALUES($1,$2,$3,$4,$5,'running',$6)`, [randomUUID(), step.id, updated.attempt, updated.fencing_token, workerId, now]);
    if (run.status === "queued") await setRunStatus(client, run, "running", now);
    await event(client, run, "step.progress", { stepId: step.id, stage: step.stage, status: "running", attempt: updated.attempt }, now);
    return { projectId: project.id, run, step: { ...updated, fencing_token: String(updated.fencing_token) }, dependencies };
});

export const withLease = (claim, action, { now, allowCancel = false } = {}) => transaction(async (client) => {
    const project = (await client.query(`SELECT * FROM video_agent_projects WHERE id=$1 FOR UPDATE`, [claim.projectId])).rows[0];
    const run = (await client.query(`SELECT * FROM video_agent_runs WHERE id=$1 AND project_id=$2 FOR UPDATE`, [claim.run.id, claim.projectId])).rows[0];
    const step = (await client.query(`SELECT * FROM video_agent_steps WHERE id=$1 AND run_id=$2 FOR UPDATE`, [claim.step.id, claim.run.id])).rows[0];
    now ??= Date.now();
    if (!project || !run || !step || step.status !== "running" || step.lease_owner !== claim.step.lease_owner
        || String(step.fencing_token) !== claim.step.fencing_token || Number(step.lease_expires_at) <= now) throw agentError("VIDEO_AGENT_LEASE_LOST", 409, "Step lease lost");
    const cancelled = project.deleted_at !== null || run.status === "cancelling" || run.status === "cancelled";
    if (cancelled && !allowCancel) throw agentError("VIDEO_AGENT_CANCELLED", 409, "Run cancelled");
    if (!cancelled && (run.status !== "running" || run.admission_status !== "admitted" || !run.entitlement_snapshot || !run.budget_snapshot)) throw agentError("VIDEO_AGENT_LEASE_LOST", 409, "Run no longer executable");
    return action(client, { project, run, step, cancelled, now });
});
export const heartbeatStep = (claim, { leaseMs = 120000, now } = {}) => withLease(claim, async (client, { step, now }) => {
    await client.query(`UPDATE video_agent_steps SET lease_expires_at=$2 WHERE id=$1`, [step.id, now + leaseMs]);
    return { leaseExpiresAt: now + leaseMs };
}, { now });
export const saveCheckpoint = (claim, checkpoint) => {
    if (!checkpoint || typeof checkpoint !== "object" || Array.isArray(checkpoint) || Buffer.byteLength(JSON.stringify(checkpoint)) > 32768) throw agentError("VIDEO_AGENT_CHECKPOINT_INVALID", 400, "Invalid checkpoint");
    return withLease(claim, async (client, { step, now }) => {
        await client.query(`UPDATE video_agent_steps SET checkpoint=$2,updated_at=$3 WHERE id=$1`, [step.id, checkpoint, now]);
    });
};
const persistOutputs = async (client,claim,{ step,now },{ checkpoint = {}, outputRefs = [], assets: uploaded = [],provider,model } = {}) => {
    if(provider!==undefined || model!==undefined){
        if(!/^[a-z0-9_-]{1,80}$/.test(provider || "") || !/^[a-zA-Z0-9_.:/-]{1,120}$/.test(model || ""))throw agentError("VIDEO_AGENT_OUTPUT_INVALID",400,"Invalid provider metadata");
        await client.query("UPDATE video_agent_steps SET provider=$2,model=$3 WHERE id=$1",[step.id,provider,model]);
    }
    if (!checkpoint || typeof checkpoint !== "object" || Array.isArray(checkpoint)) throw agentError("VIDEO_AGENT_CHECKPOINT_INVALID", 400, "Invalid checkpoint");
    if (!Array.isArray(uploaded) || uploaded.length>100 || !Array.isArray(outputRefs) || outputRefs.length>100) throw agentError("VIDEO_AGENT_OUTPUT_INVALID",400,"Invalid outputs");
    for (const asset of uploaded) {
        if (!UUID.test(asset.id || "") || !outputRefs.includes(asset.id) || typeof asset.generation!=="string" || !asset.generation || !/^[a-f0-9]{64}$/.test(asset.checksum || "") || !Number.isSafeInteger(asset.sizeBytes) || asset.sizeBytes<=0) throw agentError("VIDEO_AGENT_OUTPUT_INVALID",400,"Invalid uploaded asset");
        const updated = await client.query(`UPDATE video_agent_assets SET status='ready',generation=$5,checksum=$6,size_bytes=$7,expires_at=$8
            WHERE id=$1 AND step_id=$2 AND attempt_token=$3 AND project_id=$4 AND status='pending' RETURNING id`,
        [asset.id,step.id,step.fencing_token,claim.projectId,asset.generation,asset.checksum,asset.sizeBytes,now+7*24*60*60*1000]);
        if (!updated.rowCount) throw agentError("VIDEO_AGENT_OUTPUT_INVALID", 409, "Asset attempt mismatch");
    }
    if (!Array.isArray(outputRefs) || outputRefs.some((id) => typeof id !== "string" || !UUID.test(id))) throw agentError("VIDEO_AGENT_OUTPUT_INVALID", 400, "Invalid output references");
    if (Buffer.byteLength(JSON.stringify(checkpoint)) > 32768) throw agentError("VIDEO_AGENT_CHECKPOINT_INVALID", 400, "Checkpoint too large");
    if (outputRefs.length) {
        const assets = await client.query(`SELECT id FROM video_agent_assets WHERE id=ANY($1::uuid[]) AND project_id=$2 AND status='ready' AND expires_at>$3`, [outputRefs, claim.projectId, now]);
        if (assets.rowCount !== new Set(outputRefs).size) throw agentError("VIDEO_AGENT_OUTPUT_INVALID", 409, "Output asset unavailable");
    }
    await client.query(`UPDATE video_agent_steps SET checkpoint=$2,output_refs=$3::jsonb,updated_at=$4 WHERE id=$1`, [step.id, checkpoint, JSON.stringify(outputRefs), now]);
};
export const commitCheckpoint = (claim,result) => withLease(claim,async(client,context)=>{
    await persistOutputs(client,claim,context,result);
    await event(client,context.run,"step.progress",{stepId:context.step.id,stage:context.step.stage,status:"running",attempt:context.step.attempt,checkpointSaved:true},context.now);
});
export const succeedStep = (claim,result) => withLease(claim,async(client,context)=>{
    const { run,step,now }=context;
    await persistOutputs(client,claim,context,result);
    await client.query(`UPDATE video_agent_steps SET status='succeeded',lease_owner=NULL,lease_expires_at=NULL WHERE id=$1`,[step.id]);
    await finishAttempt(client, step, "succeeded", now);
    await event(client, run, "step.progress", { stepId: step.id, stage: step.stage, status: "succeeded", attempt: step.attempt }, now);
});
export const failStep = (claim, error, { now } = {}) => withLease(claim, async (client, { run, step, cancelled, now }) => {
    const code = cancelled ? "VIDEO_AGENT_CANCELLED" : /^[A-Z0-9_]{1,80}$/.test(error.code || "") ? error.code : "VIDEO_AGENT_STEP_FAILED";
    const retry = !cancelled && retryableError(error) && step.attempt < 3;
    const status = cancelled ? "cancelled" : retry ? "retry_wait" : "failed";
    await client.query(`UPDATE video_agent_steps SET status=$2,error_code=$3,available_at=$4,lease_owner=NULL,lease_expires_at=NULL,updated_at=$5 WHERE id=$1`, [step.id, status, code, now + (retry ? retryDelay(step.attempt, Number(error.retryAfterMs) || 0) : 0), now]);
    await finishAttempt(client, step, status, now, code);
    await event(client, run, "step.progress", { stepId: step.id, stage: step.stage, status, attempt: step.attempt, errorCode: code }, now);
}, { now, allowCancel: true });
