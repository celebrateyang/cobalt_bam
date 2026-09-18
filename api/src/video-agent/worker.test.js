import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID,createHash } from "node:crypto";
import { mkdtemp,rm,readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import ffmpeg from "ffmpeg-static";
import { PGlite } from "@electric-sql/pglite";
import { ensureVideoAgentSchema,setVideoAgentDatabaseForTests,createProject } from "../db/video-agent.js";
import { getAiVideoObjectStorage,resetAiVideoObjectStorageForTests } from "../ai-video/object-storage.js";
import { submitCommand } from "./execution.js";
import { advanceRuns,claimStep,heartbeatStep,saveCheckpoint,commitCheckpoint,succeedStep,failStep,retryDelay } from "./worker-store.js";
import { uploadJsonArtifact,readJsonArtifact } from "./worker-artifacts.js";
import { executeClaim,workerTick } from "./worker.js";
import { runAbortableProcess,productionHandlers } from "./worker-handlers.js";
import { cleanupVideoAgent } from "./cleanup.js";
import { setAiVideoDatabaseForTests,ensureAiVideoSchema } from "../db/ai-video.js";

test("worker leases, fencing, durable artifacts, retry, cancellation and real media probing",{ timeout:120000 },async(t)=>{
    process.env.NODE_ENV="test";process.env.VIDEO_AGENT_ENABLED="1";process.env.VIDEO_AGENT_RUNS_ENABLED="1";
    process.env.VIDEO_AGENT_ADMISSION_ENABLED="0";process.env.AI_VIDEO_EXECUTION_GLOBAL_CONCURRENCY="1";
    const root=await mkdtemp(path.join(os.tmpdir(),"agent-worker-test-"));
    process.env.AI_VIDEO_STORAGE_PROVIDER="local";process.env.AI_VIDEO_LOCAL_STORAGE_ROOT=root;process.env.AI_VIDEO_STORAGE_PREFIX="worker-test";
    resetAiVideoObjectStorageForTests();
    const storage=getAiVideoObjectStorage();const pg=new PGlite();
    await pg.exec("CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1);");
    const sql=async(text,params)=>{ const r=params?await pg.query(text,params):(await pg.exec(text)).at(-1);return { ...r,rowCount:r.affectedRows || r.rows?.length || 0 }; };
    let tail=Promise.resolve();const acquire=async()=>{let release;const next=new Promise((r)=>release=r);const prev=tail;tail=next;await prev;return release;};
    const adapter={ query:async(...args)=>{const release=await acquire();try{return await sql(...args);}finally{release();}},getClient:async()=>{const release=await acquire();return { query:sql,release };} };
    setVideoAgentDatabaseForTests(adapter);setAiVideoDatabaseForTests(adapter);
    await ensureVideoAgentSchema();await ensureVideoAgentSchema();
    await ensureAiVideoSchema();
    t.after(async()=>{await pg.close();resetAiVideoObjectStorageForTests();await rm(root,{recursive:true,force:true});});
    let n=0;
    const command=(projectId,type,input,expectedRevision)=>submitCommand({ projectId,userId:1,admissionPolicy:{metadataOnly:true},body:{type,input,expectedRevision,idempotencyKey:`worker_command_${String(++n).padStart(16,"0")}`} });
    const seed=async({ admitted=true,bytes=Buffer.from("source"),probe={ durationMs:120000,width:320,height:180 } }={})=>{
        const project=await createProject({userId:1,title:"Worker fixture"});const sourceId=randomUUID(),key=`worker-test/${sourceId}`;
        await pipeline(Readable.from(bytes),storage.createWriteStream(key));const object=await storage.headObject(key);const now=Date.now();
        await pg.query(`INSERT INTO video_agent_sources(id,project_id,kind,filename,mime,size_bytes,object_key,generation,checksum,probe,status,retention_until,created_at,updated_at)
            VALUES($1,$2,'upload','video.mp4','video/mp4',$3,$4,$5,$6,$7,'ready',$8,$9,$9)`,[sourceId,project.id,bytes.length,key,object.generation,createHash("sha256").update(bytes).digest("hex"),probe,now+86400000,now]);
        await pg.query(`INSERT INTO video_agent_assets(id,project_id,source_id,kind,object_key,generation,size_bytes,expires_at) VALUES($1,$2,$3,'source',$4,$5,$6,$7)`,[randomUUID(),project.id,sourceId,key,object.generation,bytes.length,now+86400000]);
        const plan=await command(project.id,"create_plan",{sourceRef:sourceId,operation:"highlight_clips",targetLanguage:"es",clips:{requestedCount:3}},0);
        const receipt=await command(project.id,"start_run",{planId:plan.planId},1);
        // Admission is deliberately fixture-only. No public command can bypass Task 3-3.
        if(admitted)await pg.query(`UPDATE video_agent_runs SET admission_status='admitted',entitlement_snapshot=$2,budget_snapshot=$3 WHERE id=$1`,[receipt.runId,{fixture:true},{fixture:true}]);
        return {projectId:project.id,runId:receipt.runId,sourceId,key};
    };
    const step=(id)=>pg.query("SELECT * FROM video_agent_steps WHERE id=$1",[id]).then(r=>r.rows[0]);
    const stop=async(f)=>{await command(f.projectId,"cancel_run",{runId:f.runId},1);await advanceRuns();};
    const claim=async(f)=>{await advanceRuns();const c=await claimStep({workerId:"fixture-worker",stages:["probe"]});assert.equal(c?.run.id,f.runId);return c;};
    await t.test("pending and incomplete admission never execute",async()=>{
        const f=await seed({admitted:false});assert.equal(await workerTick({workerId:"fixture"}),false);
        await pg.query(`UPDATE video_agent_runs SET admission_status='admitted',entitlement_snapshot=$2 WHERE id=$1`,[f.runId,{fixture:true}]);
        assert.equal(await workerTick({workerId:"fixture"}),false);await stop(f);
    });
    await t.test("one owner, atomic artifact commit, dependency reads and stale fencing",async()=>{
        const f=await seed();await advanceRuns();const claims=await Promise.all([claimStep({workerId:"one",stages:["probe"]}),claimStep({workerId:"two",stages:["probe"]})]);
        assert.equal(claims.filter(Boolean).length,1);const c=claims.find(Boolean);
        const intermediate=await uploadJsonArtifact(c,{cursor:42});await commitCheckpoint(c,{checkpoint:{cursor:42},assets:[intermediate],outputRefs:[intermediate.id]});
        assert.equal((await step(c.step.id)).status,"running");assert.deepEqual(await readJsonArtifact(c,intermediate.id),{cursor:42});
        const asset=await uploadJsonArtifact(c,{value:"durable"});
        await assert.rejects(succeedStep(c,{assets:[asset],outputRefs:[asset.id,randomUUID()]}),{code:"VIDEO_AGENT_OUTPUT_INVALID"});
        assert.equal((await pg.query("SELECT status FROM video_agent_assets WHERE id=$1",[asset.id])).rows[0].status,"pending");
        await pg.query("UPDATE video_agent_steps SET lease_expires_at=$2 WHERE id=$1",[c.step.id,Date.now()-1]);
        await assert.rejects(heartbeatStep(c),{code:"VIDEO_AGENT_LEASE_LOST"});await advanceRuns();
        await pg.query("UPDATE video_agent_steps SET available_at=0 WHERE id=$1",[c.step.id]);const recovered=await claim(f);
        assert.equal(recovered.step.attempt,2);assert.deepEqual(recovered.step.checkpoint,{cursor:42});assert.notEqual(recovered.step.fencing_token,c.step.fencing_token);
        assert.deepEqual(await readJsonArtifact(recovered,intermediate.id),{cursor:42});
        await assert.rejects(saveCheckpoint(c,{cursor:99}),{code:"VIDEO_AGENT_LEASE_LOST"});
        await assert.rejects(succeedStep(c,{assets:[asset],outputRefs:[asset.id]}),{code:"VIDEO_AGENT_LEASE_LOST"});
        await assert.rejects(succeedStep(recovered,{assets:[asset],outputRefs:[asset.id]}),{code:"VIDEO_AGENT_OUTPUT_INVALID"});
        const fresh=await uploadJsonArtifact(recovered,{value:"durable"});await succeedStep(recovered,{assets:[fresh],outputRefs:[fresh.id]});await advanceRuns();
        const next=await claimStep({workerId:"reader",stages:["chunk"]});assert.deepEqual(await readJsonArtifact(next,fresh.id),{value:"durable"});
        await assert.rejects(readJsonArtifact(next,randomUUID()),{code:"VIDEO_AGENT_OUTPUT_INVALID"});
        await stop(f);await failStep(next,new Error("cancelled"));await advanceRuns();
        assert.equal((await pg.query("SELECT status FROM video_agent_runs WHERE id=$1",[f.runId])).rows[0].status,"cancelled");
        assert.equal((await pg.query("SELECT status FROM video_agent_step_attempts WHERE step_id=$1 ORDER BY attempt",[c.step.id])).rows[0].status,"abandoned");
        await pg.query("UPDATE video_agent_assets SET expires_at=0 WHERE id=$1",[asset.id]);await cleanupVideoAgent({storage});
        assert.equal((await pg.query("SELECT status FROM video_agent_assets WHERE id=$1",[asset.id])).rows[0].status,"deleted");
    });
    await t.test("429 honors delay, retries are bounded and permanent failure is terminal",async()=>{
        const f=await seed();const c=await claim(f);const before=Date.now();await failStep(c,{status:429,code:"RATE_LIMITED",retryAfterMs:5000});
        assert.ok(Number((await step(c.step.id)).available_at)>=before+5000);assert.equal(await claimStep({workerId:"early",stages:["probe"]}),null);
        for(let i=2;i<=3;i++){await pg.query("UPDATE video_agent_steps SET available_at=0 WHERE id=$1",[c.step.id]);const retry=await claim(f);assert.equal(retry.step.attempt,i);await failStep(retry,{status:503,code:"PROVIDER_UNAVAILABLE"});}
        await advanceRuns();assert.equal((await step(c.step.id)).status,"failed");assert.equal((await pg.query("SELECT status FROM video_agent_runs WHERE id=$1",[f.runId])).rows[0].status,"failed");
        const permanent=await seed();const p=await claim(permanent);await failStep(p,{status:422,code:"INVALID_MEDIA"});await advanceRuns();assert.equal((await step(p.step.id)).status,"failed");
        assert.equal(retryDelay(1,5000,()=>0),5000);
    });
    await t.test("shutdown preserves checkpoint and cancellation kills a child process",async()=>{
        const f=await seed();const c=await claim(f);const controller=new AbortController();
        await executeClaim(c,{signal:controller.signal,handlers:{probe:async({signal,saveCheckpoint})=>{await saveCheckpoint({cursor:7});controller.abort();signal.throwIfAborted();}}});
        assert.equal((await step(c.step.id)).status,"retry_wait");assert.deepEqual((await step(c.step.id)).checkpoint,{cursor:7});await stop(f);
        const cancelled=await seed();const owned=await claim(cancelled);
        await executeClaim(owned,{heartbeatMs:20,handlers:{probe:async({signal})=>{const child=runAbortableProcess(process.execPath,["-e","setInterval(()=>{},1000)"],{signal});await command(cancelled.projectId,"cancel_run",{runId:cancelled.runId},1);await child;}}});
        await advanceRuns();assert.equal((await step(owned.step.id)).status,"cancelled");
        assert.equal((await pg.query("SELECT status FROM video_agent_runs WHERE id=$1",[cancelled.runId])).rows[0].status,"cancelled");
    });
    await t.test("cleanup holds objects while leased and releases them after cancellation",async()=>{
        const f=await seed();const c=await claim(f);const artifact=await uploadJsonArtifact(c,{pending:true});
        await pg.query("UPDATE video_agent_sources SET retention_until=0 WHERE id=$1",[f.sourceId]);await pg.query("UPDATE video_agent_assets SET expires_at=0 WHERE id=$1",[artifact.id]);
        await pg.query("UPDATE video_agent_assets SET expires_at=0 WHERE source_id=$1 AND kind='source'",[f.sourceId]);
        await cleanupVideoAgent({storage});assert.equal((await pg.query("SELECT status FROM video_agent_sources WHERE id=$1",[f.sourceId])).rows[0].status,"ready");
        assert.ok((await storage.headObject(f.key)).generation);
        assert.equal((await pg.query("SELECT status FROM video_agent_assets WHERE id=$1",[artifact.id])).rows[0].status,"pending");
        await stop(f);await failStep(c,new Error("cancel"));await advanceRuns();await cleanupVideoAgent({storage});
        assert.equal((await pg.query("SELECT status FROM video_agent_sources WHERE id=$1",[f.sourceId])).rows[0].status,"deleted");
    });
    await t.test("real ffprobe writes a durable result; unsupported chunk is not claimed",async()=>{
        const input=path.join(root,"fixture.mp4");await runAbortableProcess(ffmpeg,["-y","-f","lavfi","-i","color=c=black:s=320x180:r=10:d=20","-f","lavfi","-i","sine=frequency=1000:duration=20","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","-shortest",input]);
        const f=await seed({bytes:await readFile(input),probe:{durationMs:20000,width:320,height:180}});
        assert.equal(await workerTick({workerId:"real-probe",handlers:productionHandlers}),true);
        const steps=(await pg.query("SELECT * FROM video_agent_steps WHERE run_id=$1 ORDER BY ordinal",[f.runId])).rows;
        assert.equal(steps[0].status,"succeeded");assert.equal(steps[0].checkpoint.width,320);assert.equal(steps[0].output_refs.length,1);assert.equal(steps[1].status,"ready");
        assert.equal(await workerTick({workerId:"no-fake-handler"}),false);assert.equal((await pg.query("SELECT status FROM video_agent_runs WHERE id=$1",[f.runId])).rows[0].status,"running");await stop(f);
    });
    await t.test("all succeeded stages still cannot complete without verified publication",async()=>{
        const f=await seed();await pg.query("UPDATE video_agent_steps SET status='succeeded' WHERE run_id=$1",[f.runId]);await advanceRuns();
        assert.equal((await pg.query("SELECT error_code FROM video_agent_runs WHERE id=$1",[f.runId])).rows[0].error_code,"VIDEO_AGENT_RESULTS_UNVERIFIED");
    });
    await t.test("heartbeat keeps a long operation owned and deadline abort is retryable",async()=>{
        const f=await seed();await advanceRuns();const c=await claimStep({workerId:"heartbeat-test",stages:["probe"],leaseMs:3000});
        await executeClaim(c,{leaseMs:3000,heartbeatMs:300,handlers:{probe:async({saveCheckpoint,signal})=>{
            await new Promise(resolve=>setTimeout(resolve,3300));signal.throwIfAborted();await saveCheckpoint({renewed:true});return {checkpoint:{renewed:true}};
        }}});
        assert.equal((await step(c.step.id)).status,"succeeded");await stop(f);
        const timed=await seed();const owned=await claim(timed);
        await executeClaim(owned,{timeoutMs:25,handlers:{probe:({signal})=>runAbortableProcess(process.execPath,["-e","setInterval(()=>{},1000)"],{signal})}});
        assert.equal((await step(owned.step.id)).status,"retry_wait");assert.equal((await step(owned.step.id)).error_code,"ETIMEDOUT");await stop(timed);
    });
    await t.test("completion requires owned verified video assets; partial count stays partial",async()=>{
        for(const count of [2,3]){
            const f=await seed();const refs=[];
            for(let i=0;i<count;i++){
                const id=randomUUID();refs.push(id);
                // Contract fixture, not rendered media. Real rendering/verification is Task 6.
                await pg.query(`INSERT INTO video_agent_assets(id,project_id,source_id,kind,object_key,generation,checksum,size_bytes,status,expires_at)
                    VALUES($1,$2,$3,'rendered_video',$4,'1',$5,100,'ready',$6)`,[id,f.projectId,f.sourceId,`worker-test/contract/${id}`,"b".repeat(64),Date.now()+86400000]);
            }
            await pg.query("UPDATE video_agent_steps SET status='succeeded' WHERE run_id=$1",[f.runId]);
            await pg.query("UPDATE video_agent_steps SET checkpoint=$2,output_refs=$3 WHERE run_id=$1 AND stage='verify'",[f.runId,{verified:true},refs]);
            await pg.query("UPDATE video_agent_steps SET checkpoint=$2,output_refs=$3 WHERE run_id=$1 AND stage='publish_results'",[f.runId,{producedCount:count},refs]);
            await advanceRuns();const run=(await pg.query("SELECT * FROM video_agent_runs WHERE id=$1",[f.runId])).rows[0];assert.equal(run.status,count===3?"completed":"partially_completed");assert.equal(run.produced_count,count);
        }
        const f=await seed();const c=await claim(f);const json=await uploadJsonArtifact(c,{pretendVideo:true});await succeedStep(c,{assets:[json],outputRefs:[json.id]});
        await pg.query("UPDATE video_agent_steps SET status='succeeded' WHERE run_id=$1",[f.runId]);
        await pg.query("UPDATE video_agent_steps SET checkpoint=$2,output_refs=$3 WHERE run_id=$1 AND stage='verify'",[f.runId,{verified:true},[json.id]]);
        await pg.query("UPDATE video_agent_steps SET checkpoint=$2,output_refs=$3 WHERE run_id=$1 AND stage='publish_results'",[f.runId,{producedCount:1},[json.id]]);
        await advanceRuns();assert.equal((await pg.query("SELECT status FROM video_agent_runs WHERE id=$1",[f.runId])).rows[0].status,"failed");
    });
    await t.test("bounded scheduler rotates through projects instead of starving later work",async()=>{
        const fixtures=[];for(let i=0;i<3;i++)fixtures.push(await seed());
        for(let i=0;i<3;i++)await advanceRuns({limit:1});
        const rows=(await pg.query("SELECT * FROM video_agent_steps WHERE run_id=ANY($1::uuid[]) AND stage='probe'",[fixtures.map(f=>f.runId)])).rows;
        assert.equal(rows.length,3);assert.ok(rows.every(row=>row.status==="ready"));
        for(const f of fixtures)await stop(f);
    });
});
