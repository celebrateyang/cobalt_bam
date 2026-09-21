import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import { createVideoAgentRouter } from "../routes/video-agent.js";
import { ensureVideoAgentSchema, setVideoAgentDatabaseForTests } from "../db/video-agent.js";
import { cleanupExecutionHistory,submitCommand } from "./execution.js";
import { compilePlan, normalizePlan } from "./plans.js";
import { assertCompletion, assertTransition } from "./state-machine.js";

const sourceId = randomUUID();
const planInput = (sourceRef = sourceId) => ({ sourceRef, operation: "highlight_clips", targetLanguage: "es", clips: { requestedCount: 3 } });
test("strict business plans compile a fixed DAG with downstream invalidation", () => {
    const plan = normalizePlan(planInput());
    assert.equal(plan.sourceLanguage, "auto"); assert.equal(plan.clips.maxSeconds, 90);
    assert.deepEqual(plan.video,{aspectRatio:"source",preset:"source"});
    for (const input of [{ ...planInput(), ffmpeg: "run" }, { ...planInput(), targetLanguage: "auto" },
        { ...planInput(), clips: { requestedCount: 6 } }, { ...planInput(), clips: { requestedCount: 1, minSeconds: 14 } },
        { ...planInput(), video: { aspectRatio: "16:9", preset: "tiktok" } }, { ...planInput(), dubbing: { enabled: true } },
        { ...planInput(), subtitles: { enabled: true, mode: "translated", filter: "shell" } }, { ...planInput(), sourceRef: "https://media.example" }, { ...planInput(), sourceRef: [sourceId] }]) {
        assert.throws(() => normalizePlan(input), { code: "VIDEO_AGENT_PLAN_INVALID" });
    }
    const snapshot = { id: sourceId, checksum: "abc", generation: "1" };
    const graph = compilePlan({ plan, sourceSnapshot: snapshot, revision: 1 });
    assert.equal(graph.length, 10); assert.deepEqual(graph[0].dependsOn, []);
    graph.slice(1).forEach((step,index) => assert.deepEqual(step.dependsOn, [graph[index].stage]));
    const changed = compilePlan({ plan: { ...plan, targetLanguage: "fr" }, sourceSnapshot: snapshot, revision: 2 });
    graph.forEach((step,index) => index < 5 ? assert.equal(step.inputHash,changed[index].inputHash) : assert.notEqual(step.inputHash,changed[index].inputHash));
    const style = compilePlan({ plan: { ...plan, subtitles: { enabled: true, mode: "bilingual" } }, sourceSnapshot: snapshot, revision: 3 });
    graph.forEach((step,index) => index < 6 ? assert.equal(step.inputHash,style[index].inputHash) : assert.notEqual(step.inputHash,style[index].inputHash));
});
test("terminal states cannot reopen; incomplete or unverified runs cannot complete", () => {
    assertTransition("run", "queued", "cancelled"); assertTransition("run", "running", "cancelling");
    for (const state of ["completed", "cancelled", "failed", "partially_completed"]) assert.throws(() => assertTransition("run",state,"running"), { code: "VIDEO_AGENT_STATE_CONFLICT" });
    assert.throws(() => assertTransition("step","succeeded","running"), { code: "VIDEO_AGENT_STATE_CONFLICT" });
    assert.throws(() => assertTransition("step","pending","succeeded"), { code: "VIDEO_AGENT_STATE_CONFLICT" });
    const steps = [{ stage: "render", status: "succeeded" }, { stage: "verify", status: "succeeded" }, { stage: "publish_results", status: "succeeded" }];
    assertCompletion({ status: "completed", steps, requestedCount: 3, producedCount: 3 });
    assertCompletion({ status: "partially_completed", steps, requestedCount: 3, producedCount: 2 });
    assert.throws(() => assertCompletion({ status: "completed", steps, requestedCount: 3, producedCount: 2 }), { code: "VIDEO_AGENT_RESULTS_UNVERIFIED" });
    assert.throws(() => assertCompletion({ status: "completed", steps: steps.slice(0,1), requestedCount: 1, producedCount: 1 }), { code: "VIDEO_AGENT_RESULTS_UNVERIFIED" });
    assert.throws(() => assertCompletion({ status: "partially_completed", steps: [...steps,{ stage: "translate", status: "running" }], requestedCount: 3, producedCount: 2 }), { code: "VIDEO_AGENT_RESULTS_UNVERIFIED" });
});

test("execution control plane: atomic commands, revisions, ownership, DAG, cancellation, retry and event recovery", { timeout: 120000 }, async (t) => {
    process.env.NODE_ENV = "test"; process.env.VIDEO_AGENT_ENABLED = "1";
    process.env.VIDEO_AGENT_ADMISSION_ENABLED="0";
    delete process.env.VIDEO_AGENT_RUNS_ENABLED;
    const pg = new PGlite();
    await pg.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1),(2);`);
    let receiptFailure = false;
    const sql = async (text,params) => {
        if (receiptFailure && text.includes("INSERT INTO video_agent_commands")) { receiptFailure = false; throw new Error("Simulated receipt failure"); }
        const result = params ? await pg.query(text,params) : (await pg.exec(text)).at(-1);
        return { ...result, rowCount: result.affectedRows || result.rows?.length || 0 };
    };
    // PGlite has one connection. Serialize full transactions, including competing HTTP requests.
    let tail = Promise.resolve();
    const acquire = async () => { let release; const next = new Promise((resolve) => { release=resolve; }); const previous=tail; tail=next; await previous; return release; };
    const adapter = { query: async (...args) => { const release=await acquire(); try { return await sql(...args); } finally { release(); } },
        getClient: async () => { const release=await acquire(); return { query: sql, release }; } };
    setVideoAgentDatabaseForTests(adapter);
    await ensureVideoAgentSchema(); await ensureVideoAgentSchema();
    const app = express(); app.use(express.json());
    app.use("/user/video-agent",createVideoAgentRouter({ operations:{submitCommand:input=>submitCommand({...input,admissionPolicy:{metadataOnly:true}})},authenticate: async (req) => req.header("x-test-user") ? { id: Number(req.header("x-test-user")), is_disabled: req.header("x-test-disabled") === "1" } : null }));
    const server=app.listen(0,"127.0.0.1"); await new Promise((resolve) => server.once("listening",resolve));
    t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await pg.close(); });
    const base=`http://127.0.0.1:${server.address().port}/user/video-agent`;
    const req=async (path,{ user=1,method="GET",body,headers={} }={}) => {
        const response=await fetch(base+path,{ method,headers:{ "Content-Type":"application/json",...(user ? { "x-test-user":String(user) } : {}),...headers },body:body===undefined?undefined:JSON.stringify(body) });
        const payload=response.status===204?null:await response.json(); return { status:response.status,data:payload?.data,error:payload?.error };
    };
    const p1=(await req("/projects",{ method:"POST",body:{ title:"Clips" } })).data.project;
    const p2=(await req("/projects",{ user:2,method:"POST",body:{ title:"Other user" } })).data.project;
    const prefix=`/projects/${p1.id}`;
    const now=Date.now();
    const seedSource=async (projectId,id) => pg.query(`INSERT INTO video_agent_sources(id,project_id,kind,filename,mime,size_bytes,object_key,generation,checksum,probe,status,retention_until,created_at,updated_at)
        VALUES($1,$2,'upload','video.mp4','video/mp4',100,$3,'1',$7,$4,'ready',$5,$6,$6)`,[id,projectId,`test/${id}`,{ durationMs:120000,durationSeconds:120,width:320,height:180 },now+86400000,now,"a".repeat(64)]);
    await seedSource(p1.id,sourceId); const otherSource=randomUUID(); await seedSource(p2.id,otherSource);
    let counter=0;
    const envelope=(type,input,revision,key) => ({ type,input,expectedRevision:revision,idempotencyKey:key||`test_command_${String(++counter).padStart(16,"0")}` });
    const command=(body,user=1) => req(`${prefix}/commands`,{ method:"POST",body,user });
    assert.equal((await req(`${prefix}/revisions`)).data.revisions[0].revision,0);
    assert.equal((await req(`${prefix}/revisions`,{ user:2 })).status,404);
    assert.equal((await req(`${prefix}/events`,{ user:null })).status,401);
    assert.equal((await req(`${prefix}/runs`,{ headers:{ "x-test-disabled":"1" } })).status,403);
    assert.equal((await command(envelope("create_plan",planInput(otherSource),0))).status,404);
    await pg.query(`UPDATE video_agent_sources SET retention_until=0 WHERE id=$1`,[sourceId]);
    assert.equal((await command(envelope("create_plan",planInput(),0))).error.code,"VIDEO_AGENT_SOURCE_NOT_READY");
    await pg.query(`UPDATE video_agent_sources SET retention_until=$2 WHERE id=$1`,[sourceId,now+86400000]);
    assert.equal((await command({ ...envelope("update_settings",{ targetLanguage:"es" },0),userId:2 })).status,400);
    assert.equal((await command({ ...envelope("update_settings",{},0),idempotencyKey:["invalid_array_key_123"] })).status,400);
    const settings=envelope("update_settings",{ targetLanguage:"es",subtitleMode:"bilingual" },0);
    const competing=await Promise.all([command(settings),command({ ...settings,input:{ subtitleMode:"bilingual",targetLanguage:"es" } })]);
    assert.ok(competing.every((result) => result.status===200)); assert.equal(competing[0].data.commandId,competing[1].data.commandId);
    assert.equal(competing.filter((result) => result.data.replayed).length,1);
    assert.equal((await command({ ...settings,input:{ targetLanguage:"fr" } })).error.code,"VIDEO_AGENT_IDEMPOTENCY_CONFLICT");
    const stale=await command(envelope("update_settings",{ targetLanguage:"fr" },0)); assert.equal(stale.error.code,"VIDEO_AGENT_REVISION_CONFLICT"); assert.equal(stale.error.context.revision,1);
    const before=(await req(`${prefix}/events`)).data.events.length;
    receiptFailure=true;
    assert.equal((await command(envelope("update_settings",{ targetLanguage:"fr" },1))).status,500);
    assert.equal((await req(prefix)).data.project.revision,1); assert.equal((await req(`${prefix}/events`)).data.events.length,before);
    const created=await command(envelope("create_plan",planInput(),1)); assert.equal(created.data.revision,2);
    const planId=created.data.planId;
    assert.equal((await req(`${prefix}/plans/${planId}`,{ user:2 })).status,404);
    assert.equal((await req(`${prefix}/plans/${planId}`)).data.plan.input.targetLanguage,"es");
    const start=envelope("start_run",{ planId },2);
    assert.equal((await command(start)).error.code,"VIDEO_AGENT_RUNS_NOT_ENABLED");
    process.env.VIDEO_AGENT_RUNS_ENABLED="1";
    await pg.query(`UPDATE video_agent_sources SET generation='2' WHERE id=$1`,[sourceId]);
    assert.equal((await command(start)).error.code,"VIDEO_AGENT_SOURCE_CHANGED");
    await pg.query(`UPDATE video_agent_sources SET generation='1' WHERE id=$1`,[sourceId]);
    const started=await command(start); assert.equal(started.status,202); assert.equal(started.data.admissionStatus,"pending");
    const runId=started.data.runId;
    assert.equal((await command(start)).data.runId,runId);
    assert.equal((await command(envelope("start_run",{ planId },2))).error.code,"VIDEO_AGENT_PROJECT_RUN_ACTIVE");
    const unknownPlan=randomUUID();
    assert.equal((await req(`/projects/${p2.id}/commands`,{ user:2,method:"POST",body:envelope("start_run",{ planId },0) })).status,404);
    assert.equal((await command(envelope("start_run",{ planId:unknownPlan },2))).status,404);
    const runPath=`${prefix}/runs/${runId}`;
    const detail=(await req(runPath)).data; assert.equal(detail.run.status,"queued"); assert.equal(detail.run.producedCount,0);
    assert.equal(detail.steps.length,10); assert.ok(detail.steps.every((step) => step.status==="pending"));
    detail.steps.slice(1).forEach((step,index) => assert.deepEqual(step.dependencies,[detail.steps[index].id]));
    assert.equal((await req(runPath,{ user:2 })).status,404);
    const privateRun=(await pg.query(`SELECT * FROM video_agent_runs WHERE id=$1`,[runId])).rows[0];
    assert.equal(privateRun.entitlement_snapshot,null); assert.equal(privateRun.budget_snapshot,null);
    assert.ok(!JSON.stringify(detail).match(/object_key|lease_owner|checkpoint|budget_snapshot/));
    const eventPage=(await req(`${prefix}/events?limit=2`)).data; assert.ok(eventPage.hasMore);
    const next=(await req(`${prefix}/events?after=${eventPage.nextCursor}`)).data; assert.ok(next.events.every((event) => BigInt(event.id)>BigInt(eventPage.nextCursor)));
    assert.equal((await req(`${prefix}/events?after=-1`)).status,400);
    assert.equal((await req(`${prefix}/events?after=9223372036854775808`)).status,400);
    assert.equal((await req(`${prefix}/events?after=9223372036854775807`)).status,400);
    const stream=await fetch(`${base}${prefix}/events/stream?after=0`,{ headers:{ "x-test-user":"1" } });
    assert.equal(stream.headers.get("content-type"),"text/event-stream");
    const reader=stream.body.getReader(); assert.match(new TextDecoder().decode((await reader.read()).value),/id: \d+/); await reader.cancel();
    assert.equal((await req(`${prefix}/events/stream`,{ user:2 })).status,404);
    // Cancellation bypasses stale project CAS and remains available during rollback/acceptance shutdown.
    await command(envelope("update_settings",{ targetLanguage:"fr" },2));
    process.env.VIDEO_AGENT_ENABLED="0"; process.env.VIDEO_AGENT_RUNS_ENABLED="0";
    assert.equal((await command(start)).data.replayed,true);
    assert.equal((await command(envelope("update_settings",{},3))).status,503);
    assert.equal((await req(`${runPath}/cancel`,{ method:"POST",body:{ expectedRevision:0,idempotencyKey:"cancel_old_revision_123" } })).data.runStatus,"cancelled");
    assert.ok((await req(runPath)).data.steps.every((step) => step.status==="cancelled"));
    assert.equal((await req(`${prefix}/runs`)).data.runs.length,1);
    process.env.VIDEO_AGENT_ENABLED="1"; process.env.VIDEO_AGENT_RUNS_ENABLED="1";
    assert.equal((await req(`${runPath}/retry`,{ method:"POST",body:{ expectedRevision:3,idempotencyKey:"retry_cancelled_12345" } })).error.code,"VIDEO_AGENT_RUN_NOT_RETRYABLE");
    assert.equal((await command(envelope("start_run",{ planId },3))).error.code,"VIDEO_AGENT_PLAN_OUTDATED");
    // Simulate a trusted worker failure, not a public endpoint that can forge execution success.
    await pg.query(`UPDATE video_agent_runs SET status='failed' WHERE id=$1`,[runId]);
    const assetId=randomUUID();
    await pg.query(`INSERT INTO video_agent_assets(id,project_id,source_id,object_key,generation,size_bytes,expires_at) VALUES($1,$2,$3,$4,'1',100,$5)`,[assetId,p1.id,sourceId,`test-asset/${assetId}`,now+86400000]);
    await pg.query(`UPDATE video_agent_steps SET status='succeeded',output_refs=$2 WHERE id=$1`,[detail.steps[0].id,[assetId]]);
    const retryBody={ expectedRevision:3,idempotencyKey:"retry_failed_run_12345" };
    const retried=await req(`${runPath}/retry`,{ method:"POST",body:retryBody }); assert.equal(retried.status,202);
    assert.equal(retried.data.revision,3); assert.equal(retried.data.runRevision,2); assert.notEqual(retried.data.runId,runId);
    assert.equal((await req(`${runPath}/retry`,{ method:"POST",body:retryBody })).data.runId,retried.data.runId);
    const retryRun=(await req(`${prefix}/runs/${retried.data.runId}`)).data;
    assert.equal(retryRun.run.retryOfRunId,runId); assert.equal(retryRun.steps[0].reusedStepId,detail.steps[0].id);
    assert.equal(retryRun.steps[0].status,"succeeded"); assert.ok(retryRun.steps.slice(1).every((step) => step.status==="pending"));
    assert.equal((await req(`${prefix}/runs?cursor=bad`)).status,400);
    const revisions=(await req(`${prefix}/revisions?limit=1`)).data; assert.equal(revisions.nextCursor,"3");
    assert.equal((await req(`${prefix}/revisions?cursor=${revisions.nextCursor}`)).data.revisions[0].revision,2);
    // Retention removal requires a snapshot, never silently drops a client's missing events.
    const first=(await req(`${prefix}/events`)).data.events[0]; await pg.query(`UPDATE video_agent_events SET created_at=0 WHERE id=$1`,[first.id]);
    await cleanupExecutionHistory(); assert.equal((await req(`${prefix}/events?after=0`)).data.resetRequired,true);
    const resetStream=await fetch(`${base}${prefix}/events/stream?after=0`,{ headers:{ "x-test-user":"1" } }); assert.match(await resetStream.text(),/event: reset/);
    await pg.query(`UPDATE video_agent_runs SET status='running' WHERE id=$1`,[retried.data.runId]);
    await pg.query(`UPDATE video_agent_steps SET status='running' WHERE id=$1`,[retryRun.steps[1].id]);
    assert.equal((await req(prefix,{ method:"DELETE" })).status,204);
    assert.equal((await pg.query(`SELECT status FROM video_agent_runs WHERE id=$1`,[retried.data.runId])).rows[0].status,"cancelling");
    assert.equal((await req(`${prefix}/events`)).status,404); assert.equal((await req(runPath)).status,404);
    await cleanupExecutionHistory(); assert.equal((await pg.query(`SELECT count(*)::int AS n FROM video_agent_events WHERE project_id=$1`,[p1.id])).rows[0].n,0);
    assert.equal((await pg.query(`SELECT count(*)::int AS n FROM video_agent_commands WHERE project_id=$1`,[p1.id])).rows[0].n,0);
});
