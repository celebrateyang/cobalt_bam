import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createProject,ensureVideoAgentSchema,setVideoAgentDatabaseForTests,deleteProject } from "../db/video-agent.js";
import { ensureAiVideoSchema,setAiVideoDatabaseForTests,createAiVideoJob,getAiVideoUsage,reserveAiVideoUsage,commitAiVideoUsage,releaseAiVideoUsage,retryAiVideoJob,queueAiVideoRender,claimAiVideoJob } from "../db/ai-video.js";
import { submitCommand } from "./execution.js";
import { advanceRuns,claimStep,failStep } from "./worker-store.js";
import { executionReady } from "./admission.js";
import express from "express";
import { createVideoAgentRouter } from "../routes/video-agent.js";

test("shared video admission: historical ledger, old/new concurrency and billing lifecycle",{timeout:120000},async(t)=>{
    process.env.NODE_ENV="test";process.env.VIDEO_AGENT_ENABLED="1";process.env.VIDEO_AGENT_RUNS_ENABLED="1";process.env.VIDEO_AGENT_ADMISSION_ENABLED="1";
    process.env.AI_VIDEO_MONTHLY_SECONDS="300";process.env.AI_VIDEO_EXECUTION_GLOBAL_CONCURRENCY="1";
    const pg=new PGlite();await pg.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,is_disabled BOOLEAN DEFAULT false);INSERT INTO users(id) VALUES(1),(2),(3);
        CREATE TABLE plans(id INTEGER PRIMARY KEY,is_active BOOLEAN);INSERT INTO plans VALUES(1,true);
        CREATE TABLE subscriptions(user_id INTEGER,plan_id INTEGER,status TEXT,current_period_end BIGINT);INSERT INTO subscriptions VALUES(1,1,'active',NULL),(2,1,'active',NULL),(3,1,'active',NULL);
        CREATE TABLE plan_entitlements(plan_id INTEGER,entitlement_key TEXT);INSERT INTO plan_entitlements VALUES(1,'ai_video_studio');`);
    let failReceipt=false;
    const sql=async(text,params)=>{if(failReceipt && text.includes("INSERT INTO video_agent_commands")){failReceipt=false;throw new Error("receipt unavailable");}const r=params?await pg.query(text,params):(await pg.exec(text)).at(-1);return {...r,rowCount:r.affectedRows || r.rows?.length || 0};};
    let tail=Promise.resolve();const acquire=async()=>{let release;const next=new Promise(r=>release=r),prev=tail;tail=next;await prev;return release;};
    const adapter={query:async(...args)=>{const release=await acquire();try{return await sql(...args);}finally{release();}},getClient:async()=>{const release=await acquire();return{query:sql,release};}};
    setVideoAgentDatabaseForTests(adapter);setAiVideoDatabaseForTests(adapter);await ensureVideoAgentSchema();await ensureAiVideoSchema();
    const app=express();app.use(express.json());app.use("/agent",createVideoAgentRouter({authenticate:async req=>req.header("x-user")?{id:Number(req.header("x-user")),is_disabled:req.header("x-disabled")==="1"}:null}));
    const server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));
    t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await pg.close();});
    const request=async(path,user=1,options={})=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/agent${path}`,{...options,headers:{"Content-Type":"application/json",...(user?{"x-user":String(user)}:{}),...options.headers}});return{status:response.status,payload:await response.json()};};
    let i=0;
    const command=(f,type,input,key,ready=true)=>submitCommand({projectId:f.projectId,userId:f.userId,admissionPolicy:{ready:async()=>ready},body:{type,input,expectedRevision:1,idempotencyKey:key || `admission_test_${String(++i).padStart(16,"0")}`}});
    const fixture=async(userId=1,durationMs=61000)=>{
        const p=await createProject({userId,title:"Admission"}),sourceId=randomUUID(),now=Date.now();
        await pg.query(`INSERT INTO video_agent_sources(id,project_id,kind,filename,mime,size_bytes,object_key,generation,checksum,probe,status,retention_until,created_at,updated_at)
            VALUES($1,$2,'upload','video.mp4','video/mp4',100,$3,'1',$4,$5,'ready',$6,$7,$7)`,[sourceId,p.id,`fixture/${sourceId}`,"a".repeat(64),{durationMs,width:320,height:180},now+86400000,now]);
        const plan=await submitCommand({projectId:p.id,userId,body:{type:"create_plan",expectedRevision:0,idempotencyKey:`create_plan_${randomUUID()}`,input:{sourceRef:sourceId,operation:"highlight_clips",targetLanguage:"es",clips:{requestedCount:3}}}});
        return {projectId:p.id,userId,planId:plan.planId};
    };
    const start=(f,key,ready)=>command(f,"start_run",{planId:f.planId},key,ready);
    const cancel=(f,runId)=>command(f,"cancel_run",{runId});
    const old=(userId=1)=>createAiVideoJob({userId,sourceKind:"upload",filename:"original.mp4",contentType:"video/mp4",sizeBytes:100,sourceLanguage:"auto",targetLanguage:"es",subtitleMode:"bilingual",monthlySeconds:300});
    await t.test("pipeline readiness blocks all reservations and metadata commits",async()=>{
        assert.equal(await executionReady(),false);const f=await fixture();await assert.rejects(start(f,undefined,false),{code:"VIDEO_AGENT_PIPELINE_NOT_READY"});
        assert.equal((await pg.query("SELECT count(*)::int AS n FROM video_agent_runs")).rows[0].n,0);
        assert.equal((await getAiVideoUsage({userId:1,limitSeconds:300})).reservedSeconds,0);
    });
    await t.test("membership expiry/disabled account cannot admit; quota/receipt rollback are atomic",async()=>{
        const f=await fixture();await pg.query("UPDATE subscriptions SET current_period_end=0 WHERE user_id=1");await assert.rejects(start(f),{code:"MEMBERSHIP_REQUIRED"});
        await pg.query("UPDATE subscriptions SET current_period_end=NULL WHERE user_id=1");await pg.query("UPDATE users SET is_disabled=true WHERE id=1");await assert.rejects(start(f),{code:"MEMBERSHIP_REQUIRED"});await pg.query("UPDATE users SET is_disabled=false WHERE id=1");
        failReceipt=true;await assert.rejects(start(f),/receipt unavailable/);assert.equal((await getAiVideoUsage({userId:1,limitSeconds:300})).reservedSeconds,0);
        const huge=await fixture(1,301000);await assert.rejects(start(huge),{code:"AI_VIDEO_QUOTA_EXCEEDED"});
    });
    await t.test("new execution blocks old creation, render and retry; duplicates reserve once",async()=>{
        const legacy=await old();await pg.query("UPDATE ai_video_jobs SET status='draft_ready' WHERE id=$1",[legacy.job.id]);
        const f=await fixture();const key=`same_command_${randomUUID()}`;
        const receipts=await Promise.all([start(f,key),start(f,key)]);assert.equal(receipts[0].runId,receipts[1].runId);assert.equal(receipts.filter(r=>r.replayed).length,1);
        assert.equal(receipts[0].admissionStatus,"admitted");assert.equal((await getAiVideoUsage({userId:1,limitSeconds:300})).reservedSeconds,120);
        await assert.rejects(old(),{code:"AI_VIDEO_CONCURRENCY_LIMIT"});await assert.rejects(queueAiVideoRender({jobId:legacy.job.id,userId:1,expectedRevision:0}),{code:"AI_VIDEO_CONCURRENCY_LIMIT"});
        await pg.query("UPDATE ai_video_jobs SET status='failed',failed_stage='transcribing',error_detail=$2 WHERE id=$1",[legacy.job.id,{retryable:true}]);await assert.rejects(retryAiVideoJob({jobId:legacy.job.id,userId:1}),{code:"AI_VIDEO_CONCURRENCY_LIMIT"});
        await cancel(f,receipts[0].runId);assert.equal((await getAiVideoUsage({userId:1,limitSeconds:300})).reservedSeconds,0);
        assert.ok(await retryAiVideoJob({jobId:legacy.job.id,userId:1}));await pg.query("UPDATE ai_video_jobs SET status='cancelled' WHERE id=$1",[legacy.job.id]);
    });
    await t.test("old execution blocks new and both share historical consumption",async()=>{
        const legacy=await old();const f=await fixture();await assert.rejects(start(f),{code:"AI_VIDEO_CONCURRENCY_LIMIT"});
        const reservation=await reserveAiVideoUsage({jobId:legacy.job.id,userId:1,durationSeconds:121,limitSeconds:300});await commitAiVideoUsage({jobId:legacy.job.id});await releaseAiVideoUsage({jobId:legacy.job.id});
        const before=(await pg.query("SELECT * FROM ai_video_usage_reservations WHERE id=$1",[reservation.id])).rows[0];
        setAiVideoDatabaseForTests(adapter);await ensureAiVideoSchema();const after=(await pg.query("SELECT * FROM ai_video_usage_reservations WHERE id=$1",[reservation.id])).rows[0];assert.deepEqual(after,before);
        await pg.query("UPDATE ai_video_jobs SET status='completed' WHERE id=$1",[legacy.job.id]);
        const receipt=await start(f);const usage=await getAiVideoUsage({userId:1,limitSeconds:300});assert.equal(usage.usedSeconds,180);assert.equal(usage.reservedSeconds,120);assert.equal(usage.remainingSeconds,0);await cancel(f,receipt.runId);
    });
    await t.test("global capacity spans workers; charge starts at ASR and survives retry without duplicate debit",async()=>{
        const f=await fixture(2);const receipt=await start(f);await advanceRuns();const c=await claimStep({workerId:"agent",stages:["probe"]});assert.equal(c.run.id,receipt.runId);
        const legacy=await old(3);await pg.query("UPDATE ai_video_jobs SET status='queued_ingest' WHERE id=$1",[legacy.job.id]);assert.equal(await claimAiVideoJob({workerId:"legacy",leaseMs:120000}),null);
        await failStep(c,{code:"PROBE_INVALID",status:422});await advanceRuns();assert.equal((await getAiVideoUsage({userId:2,limitSeconds:300})).reservedSeconds,0);
        const oldClaim=await claimAiVideoJob({workerId:"legacy",leaseMs:120000});assert.equal(oldClaim.id,legacy.job.id);
        const next=await fixture(2);const r=await start(next);await advanceRuns();assert.equal(await claimStep({workerId:"blocked",stages:["probe"]}),null);
        await pg.query("UPDATE ai_video_jobs SET status='completed',lease_owner=NULL,lease_expires_at=NULL WHERE id=$1",[legacy.job.id]);
        await pg.query("UPDATE video_agent_steps SET status='succeeded' WHERE run_id=$1 AND ordinal<2",[r.runId]);await advanceRuns();const asr=await claimStep({workerId:"asr",stages:["transcribe"]});assert.ok(asr);
        assert.equal((await getAiVideoUsage({userId:2,limitSeconds:300})).usedSeconds,120);await failStep(asr,{code:"INVALID_TRANSCRIPT",status:422});await advanceRuns();
        const retried=await command(next,"retry_run",{runId:r.runId});const usage=await getAiVideoUsage({userId:2,limitSeconds:300});assert.equal(usage.usedSeconds,120);assert.equal(usage.reservedSeconds,0);await cancel(next,retried.runId);
    });
    await t.test("deletion releases uncommitted quota but live leases keep user concurrency occupied",async()=>{
        const f=await fixture(3);const r=await start(f);await advanceRuns();const c=await claimStep({workerId:"delete",stages:["probe"]});
        await deleteProject({projectId:f.projectId,userId:3});await assert.rejects(old(3),{code:"AI_VIDEO_CONCURRENCY_LIMIT"});await failStep(c,new Error("cancel"));await advanceRuns();
        assert.equal((await getAiVideoUsage({userId:3,limitSeconds:300})).reservedSeconds,0);const available=await old(3);assert.ok(available.job.id);
        await pg.query("UPDATE ai_video_jobs SET status='cancelled' WHERE id=$1",[available.job.id]);
    });
    await t.test("legacy released reservation is re-reserved and committed usage stays unchanged",async()=>{
        const legacy=await old(3);const first=await reserveAiVideoUsage({jobId:legacy.job.id,userId:3,durationSeconds:61,limitSeconds:300,now:Date.now()-35*86400000});await releaseAiVideoUsage({jobId:legacy.job.id});
        const second=await reserveAiVideoUsage({jobId:legacy.job.id,userId:3,durationSeconds:61,limitSeconds:300});assert.equal(second.id,first.id);assert.equal(second.status,"reserved");
        assert.notEqual(second.period_key,first.period_key);
        await commitAiVideoUsage({jobId:legacy.job.id});const same=await reserveAiVideoUsage({jobId:legacy.job.id,userId:3,durationSeconds:61,limitSeconds:300});assert.equal(same.status,"committed");assert.equal((await getAiVideoUsage({userId:3,limitSeconds:300})).usedSeconds,120);
    });
    await t.test("authenticated usage/plan recovery and production startup gates cannot be overridden by JSON",async()=>{
        const f=await fixture(2);const current=await request(`/projects/${f.projectId}/plan`,2);assert.equal(current.payload.data.plan.id,f.planId);assert.equal(current.payload.data.revision,1);
        assert.equal((await request(`/projects/${f.projectId}/plan`,1)).status,404);
        assert.equal((await request("/usage",0)).status,401);assert.equal((await request("/usage",2,{headers:{"x-disabled":"1"}})).status,403);
        const usage=await request("/usage?userId=1",2);assert.equal(usage.payload.data.usage.usedSeconds,120);
        const capabilities=await request("/capabilities",2);assert.equal(capabilities.payload.data.pipelineReady,false);assert.equal(capabilities.payload.data.executionEnabled,false);
        const body={type:"start_run",input:{planId:f.planId},expectedRevision:1,idempotencyKey:`http_command_${randomUUID()}`};
        const path=`/projects/${f.projectId}/commands`;
        assert.equal((await request(path,2,{method:"POST",body:JSON.stringify({...body,admissionPolicy:{metadataOnly:true}})})).status,400);
        const blocked=await request(path,2,{method:"POST",body:JSON.stringify(body)});assert.equal(blocked.payload.error.code,"VIDEO_AGENT_PIPELINE_NOT_READY");
        process.env.VIDEO_AGENT_ADMISSION_ENABLED="0";const disabled=await request(path,2,{method:"POST",body:JSON.stringify(body)});assert.equal(disabled.payload.error.code,"VIDEO_AGENT_ADMISSION_NOT_ENABLED");
        process.env.VIDEO_AGENT_ADMISSION_ENABLED="1";
    });
});
