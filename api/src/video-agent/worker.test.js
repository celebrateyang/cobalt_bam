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
import { uploadJsonArtifact,readJsonArtifact,readAudioArtifact,uploadAudioArtifact } from "./worker-artifacts.js";
import {createChunkHandler} from "./chunk-handler.js";
import {inspectPcmWav} from "./chunk-plan.js";
import {createTranscribeHandler} from "./transcribe-handler.js";
import {createSelectHandler} from "./select-handler.js";
import {createTranslateHandler} from "./translate-handler.js";
import { executeClaim,workerTick } from "./worker.js";
import { runAbortableProcess,productionHandlers } from "./worker-handlers.js";
import { cleanupVideoAgent } from "./cleanup.js";
import { setAiVideoDatabaseForTests,ensureAiVideoSchema } from "../db/ai-video.js";

test("worker leases, fencing, durable artifacts, retry, cancellation and real media probing",{ timeout:120000 },async(t)=>{
    process.env.NODE_ENV="test";process.env.VIDEO_AGENT_ENABLED="1";process.env.VIDEO_AGENT_RUNS_ENABLED="1";
    process.env.VIDEO_AGENT_ADMISSION_ENABLED="0";process.env.AI_VIDEO_EXECUTION_GLOBAL_CONCURRENCY="1";
    delete process.env.OPENAI_API_KEY; // Never contact a live paid service in Worker fixtures.
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
    await t.test("real probe and chunk produce verified audio; unsupported transcribe is not claimed",async()=>{
        const input=path.join(root,"fixture.mp4");await runAbortableProcess(ffmpeg,["-y","-f","lavfi","-i","color=c=black:s=320x180:r=10:d=20","-itsoffset","2","-f","lavfi","-i","sine=frequency=1000:duration=18","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","-shortest",input]);
        const f=await seed({bytes:await readFile(input),probe:{durationMs:20000,width:320,height:180}});
        assert.equal(await workerTick({workerId:"real-probe",handlers:productionHandlers}),true);
        const steps=(await pg.query("SELECT * FROM video_agent_steps WHERE run_id=$1 ORDER BY ordinal",[f.runId])).rows;
        assert.equal(steps[0].status,"succeeded");assert.equal(steps[0].checkpoint.width,320);assert.equal(steps[0].output_refs.length,1);assert.equal(steps[1].status,"ready");
        assert.equal(await workerTick({workerId:"real-chunk"}),true);
        const chunk=(await pg.query("SELECT * FROM video_agent_steps WHERE run_id=$1 AND stage='chunk'",[f.runId])).rows[0];
        assert.equal(chunk.status,"succeeded");assert.equal(chunk.checkpoint.chunks.length,1);assert.equal(chunk.checkpoint.chunks[0].sampleCount,320000);
        const asset=(await pg.query("SELECT * FROM video_agent_assets WHERE id=$1",[chunk.checkpoint.chunks[0].asset.id])).rows[0];assert.equal(asset.kind,"audio_chunk");assert.equal(asset.status,"ready");
        assert.equal(await workerTick({workerId:"no-fake-handler"}),false);assert.equal((await pg.query("SELECT status FROM video_agent_runs WHERE id=$1",[f.runId])).rows[0].status,"running");
        const reader=await claimStep({workerId:"offset-reader",stages:["transcribe"]}),filename=path.join(root,"offset.wav");
        await readAudioArtifact(reader,asset.id,{filename});
        const info=await inspectPcmWav(filename),fs=await import("node:fs/promises"),fd=await fs.open(filename,"r");
        try{const firstSecond=Buffer.alloc(32000);await fd.read(firstSecond,0,firstSecond.length,info.dataOffset);assert.ok(firstSecond.every(byte=>byte===0),"late audio must retain leading silence on the video timeline");}finally{await fd.close();}
        await stop(f);await failStep(reader,new Error("cancelled"));await advanceRuns();
    });
    await t.test("long media resumes after a saved chunk; binaries are fenced and dependency scoped",async()=>{
        const input=path.join(root,"long.mp4");await runAbortableProcess(ffmpeg,["-nostdin","-v","error","-f","lavfi","-i","color=c=black:s=96x64:r=1:d=620","-f","lavfi","-i","sine=frequency=1000:duration=620","-c:v","libx264","-preset","ultrafast","-c:a","aac","-shortest",input]);
        const f=await seed({bytes:await readFile(input),probe:{durationMs:620000,width:96,height:64}});
        await workerTick({workerId:"long-probe"});
        let encodes=0;const interrupted=createChunkHandler({runProcess:async(...args)=>{
            if(args[1].includes("-af") && args[1].some(value=>value.startsWith("atrim=")) && ++encodes===2)throw Object.assign(new Error("fault"),{code:"ECONNRESET"});
            return runAbortableProcess(...args);
        }});
        await workerTick({workerId:"fault-worker",handlers:{chunk:interrupted}});
        let chunk=(await pg.query("SELECT * FROM video_agent_steps WHERE run_id=$1 AND stage='chunk'",[f.runId])).rows[0];
        assert.equal(chunk.status,"retry_wait");assert.equal(chunk.output_refs.length,1);const first=chunk.checkpoint.chunks[0].asset.id;
        await pg.query("UPDATE video_agent_steps SET available_at=0 WHERE id=$1",[chunk.id]);
        await advanceRuns();
        const retry=await claimStep({workerId:"resume-worker",stages:["chunk"]});assert.equal(retry.step.attempt,2);
        const oversized=path.join(root,"too-large.wav");await import("node:fs/promises").then(async fs=>{const fd=await fs.open(oversized,"w");await fd.truncate(24*1024*1024+1);await fd.close();});
        await assert.rejects(uploadAudioArtifact(retry,oversized),{code:"VIDEO_AGENT_CHUNK_TOO_LARGE"});
        let resumedEncodes=0;const resumed=createChunkHandler({runProcess:(command,args,options)=>{
            if(args.some(value=>value.startsWith("atrim=")))resumedEncodes++;
            return runAbortableProcess(command,args,options);
        }});
        await executeClaim(retry,{handlers:{chunk:resumed}});await advanceRuns();
        chunk=await step(chunk.id);assert.equal(chunk.status,"succeeded");assert.equal(resumedEncodes,1);assert.equal(chunk.checkpoint.chunks[0].asset.id,first);
        assert.equal(chunk.checkpoint.chunks.length,2);assert.equal(chunk.output_refs.length,3);assert.equal(chunk.checkpoint.chunks[1].ownershipStartMs,600000);assert.equal(chunk.checkpoint.chunks[1].processingStartMs,598000);
        await assert.rejects(uploadAudioArtifact(retry,input),{code:"VIDEO_AGENT_LEASE_LOST"});
        const transcribe=await claimStep({workerId:"binary-reader",stages:["transcribe"]});
        const {manifestRef,...manifest}=chunk.checkpoint;
        assert.deepEqual(await readJsonArtifact(transcribe,manifestRef),manifest);
        const local=path.join(root,"downloaded.wav");const metadata=await readAudioArtifact(transcribe,first,{filename:local});assert.equal(metadata.id,first);assert.equal((await inspectPcmWav(local)).sampleCount,602000*16);
        await assert.rejects(readAudioArtifact(transcribe,randomUUID()),{code:"VIDEO_AGENT_OUTPUT_INVALID"});
        // Generation still matches after same-length corruption: SHA verification must catch it.
        const row=(await pg.query("SELECT * FROM video_agent_assets WHERE id=$1",[first])).rows[0];
        const fs=await import("node:fs/promises"),handle=await fs.open(storage.resolve(row.object_key),"r+");try{const byte=Buffer.alloc(1);await handle.read(byte,0,1,1000);byte[0]^=255;await handle.write(byte,0,1,1000);}finally{await handle.close();}
        const head=await storage.headObject(row.object_key);await pg.query("UPDATE video_agent_assets SET generation=$2 WHERE id=$1",[first,head.generation]);
        await assert.rejects(readAudioArtifact(transcribe,first),{code:"VIDEO_AGENT_OUTPUT_INVALID"});
        await stop(f);await failStep(transcribe,new Error("cancelled"));await advanceRuns();
    });
    await t.test("ASR resumes durable chunks after rate limit and post-raw crash without repeating successful calls",async()=>{
        const f=await seed({bytes:await readFile(path.join(root,"long.mp4")),probe:{durationMs:620000,width:96,height:64}});
        await workerTick({workerId:"asr-probe"});await workerTick({workerId:"asr-chunks"});
        const calls=[];let rate=true;
        const provider={transcribe:async({filename,signal})=>{
            signal.throwIfAborted();const ordinal=filename.includes("asr-0")?0:1;calls.push(ordinal);
            if(ordinal===1 && rate){rate=false;throw Object.assign(new Error("limited"),{status:429,code:"VIDEO_AGENT_ASR_HTTP_429",retryAfterMs:5000});}
            const raw=ordinal===0?{segments:[{start:599.8,end:600.15,text:"Hello"}],words:[{word:"Hello",start:599.8,end:600.15}]}:
                {segments:[{start:1.9,end:3,text:"Hello world"}],words:[{word:"Hello",start:1.9,end:2.3},{word:"world",start:2.5,end:3}]};
            return {raw:{...raw,originalMetadata:{tokens:[1,2,3]}},requestId:`fixture-${ordinal}`};
        }};
        const handler=createTranscribeHandler({provider});
        await workerTick({workerId:"asr-rate",handlers:{transcribe:handler}});
        let stepRow=(await pg.query("SELECT * FROM video_agent_steps WHERE run_id=$1 AND stage='transcribe'",[f.runId])).rows[0];
        assert.equal(stepRow.status,"retry_wait");assert.equal(stepRow.checkpoint.results.length,1);const firstRaw=stepRow.checkpoint.results[0].rawRef;
        assert.ok(Number(stepRow.available_at)>Date.now()+3000);
        const retry=async()=>{await pg.query("UPDATE video_agent_steps SET available_at=0 WHERE id=$1",[stepRow.id]);await advanceRuns();return claimStep({workerId:"asr-resume",stages:["transcribe"]});};
        const secondClaim=await retry();
        await executeClaim(secondClaim,{handlers:{transcribe:context=>handler({...context,commitCheckpoint:async output=>{
            await context.commitCheckpoint(output);
            if(output.checkpoint.results.length===2 && !output.checkpoint.results[1].normalizedRef)throw Object.assign(new Error("saved raw then interrupted"),{code:"VIDEO_AGENT_WORKER_INTERRUPTED"});
        }})}});
        stepRow=await step(stepRow.id);assert.equal(stepRow.status,"retry_wait");assert.equal(stepRow.checkpoint.results.length,2);assert.equal(stepRow.checkpoint.results[1].normalizedRef,undefined);
        await executeClaim(await retry(),{handlers:{transcribe:handler}});await advanceRuns();
        stepRow=await step(stepRow.id);assert.equal(stepRow.status,"succeeded");assert.equal(stepRow.provider,"openai");assert.equal(stepRow.model,stepRow.checkpoint.config.model);
        assert.deepEqual(calls,[0,1,1]);assert.equal(stepRow.checkpoint.results[0].rawRef,firstRaw);assert.equal(stepRow.checkpoint.duplicateWords,1);
        const reader=await claimStep({workerId:"normalized-reader",stages:["normalize"]});
        const output=await readJsonArtifact(reader,stepRow.checkpoint.transcriptRef,{kind:"transcript"});assert.deepEqual(output.segments.map(segment=>segment.sourceText),["Hello","world"]);assert.equal(output.segments[1].startMs,600500);
        const raw=await readJsonArtifact(reader,firstRaw,{kind:"asr_raw"});assert.deepEqual(raw.raw.originalMetadata,{tokens:[1,2,3]});
        await assert.rejects(readJsonArtifact(reader,firstRaw),{code:"VIDEO_AGENT_OUTPUT_INVALID"});
        await executeClaim(reader);await advanceRuns();
        const normalizedStep=await step(reader.step.id);assert.equal(normalizedStep.status,"succeeded");assert.equal(normalizedStep.checkpoint.cueCount,1);
        const selectedReader=await claimStep({workerId:"cue-reader",stages:["select_clips"]});
        const normalized=await readJsonArtifact(selectedReader,normalizedStep.checkpoint.normalizedTranscriptRef,{kind:"transcript"});
        assert.equal(normalized.cues[0].sourceText,"Hello world");assert.equal(normalized.cues[0].startMs,599800);assert.equal(normalized.cues[0].endMs,601000);assert.equal(normalized.sourceTranscriptRef,stepRow.checkpoint.transcriptRef);
        await executeClaim(selectedReader,{handlers:{select_clips:createSelectHandler({provider:{suggest:async()=>({raw:{status:"completed",output_text:JSON.stringify({clips:[]})},requestId:"selection-fixture"})}})}});await advanceRuns();
        const selectedStep=await step(selectedReader.step.id);assert.equal(selectedStep.status,"succeeded");assert.equal(selectedStep.checkpoint.selectedCount,0);assert.equal(selectedStep.checkpoint.shortfall,3);
        const translatedReader=await claimStep({workerId:"selected-reader",stages:["translate_selected"]});
        const selected=await readJsonArtifact(translatedReader,selectedStep.checkpoint.selectedClipsRef);assert.equal(selected.version,"selected-clips-v1");assert.equal(selected.sourceTranscriptRef,normalizedStep.checkpoint.normalizedTranscriptRef);assert.equal(selected.shortfallReason,"insufficient_valid_nonoverlapping_candidates");
        await stop(f);await failStep(translatedReader,new Error("cancelled"));await advanceRuns();
    });
    await t.test("hour-long normalized transcript selects and translates with durable rate-limit and raw-crash recovery",async()=>{
        const f=await seed({probe:{durationMs:3600000,width:320,height:180}});
        await pg.query("UPDATE video_agent_steps SET status='succeeded' WHERE run_id=$1 AND ordinal<2",[f.runId]);await advanceRuns();
        const asr=await claimStep({workerId:"long-asr-fixture",stages:["transcribe"]}),source=asr.run.source_snapshot;
        const segments=Array.from({length:1200},(_,i)=>({id:`segment-${i}`,sourceText:`Idea number ${i}.`,startMs:i*3000,endMs:i*3000+2990,speakerLocalId:null,timingQuality:"word",words:[{id:`word-${i}`,text:`Idea number ${i}.`,startMs:i*3000,endMs:i*3000+2990,timingQuality:"word"}]}));
        const rawTranscript=await uploadJsonArtifact(asr,{version:"transcript-v1",sourceChecksum:source.checksum,durationMs:source.durationMs,configHash:"fixture-asr",segments},{kind:"transcript"});
        await succeedStep(asr,{checkpoint:{transcriptRef:rawTranscript.id},assets:[rawTranscript],outputRefs:[rawTranscript.id]});await advanceRuns();
        const normalize=await claimStep({workerId:"long-normalize",stages:["normalize"]});await executeClaim(normalize);await advanceRuns();
        assert.equal((await step(normalize.step.id)).checkpoint.cueCount,1200);
        const select=await claimStep({workerId:"long-select",stages:["select_clips"]}),calls=[];let limited=true;
        const selector=createSelectHandler({provider:{suggest:async({window,repair})=>{
            calls.push([window.ordinal,repair]);if(window.ordinal===1 && limited){limited=false;throw Object.assign(new Error("limited"),{status:429,retryAfterMs:2000,code:"VIDEO_AGENT_SELECTION_HTTP_429"});}
            const clips=[{startCueId:window.ordinal===0&&!repair?"unknown":window.core[0].id,endCueId:window.core[9].id,title:"A complete idea",reason:"Clear opening and conclusion",score:.9,completeIdea:true}];
            return {raw:{status:"completed",output_text:JSON.stringify({clips})},requestId:`window-${window.ordinal}`};
        }}});
        await executeClaim(select,{handlers:{select_clips:selector}});let row=await step(select.step.id);assert.equal(row.status,"retry_wait");const firstBatch=row.checkpoint.windows[0].validatedRef;
        await pg.query("UPDATE video_agent_steps SET available_at=0 WHERE id=$1",[row.id]);await advanceRuns();
        const selectRetry=await claimStep({workerId:"long-select-retry",stages:["select_clips"]});await executeClaim(selectRetry,{handlers:{select_clips:selector}});await advanceRuns();
        row=await step(row.id);assert.equal(row.status,"succeeded");assert.equal(row.checkpoint.selectedCount,3);assert.equal(row.checkpoint.windows[0].validatedRef,firstBatch);assert.equal(calls.filter(([ordinal])=>ordinal===0).length,2);
        const translation=await claimStep({workerId:"long-translate",stages:["translate_selected"]});let translationCalls=0;
        const translator=createTranslateHandler({provider:{translate:async({batch})=>{translationCalls++;return {raw:{status:"completed",output_text:JSON.stringify({translations:batch.items.map(item=>({cueId:item.cueId,translatedText:`Idea numero ${item.text.match(/\d+/)[0]}.`}))})},requestId:"long-translation"};}}});
        await executeClaim(translation,{handlers:{translate_selected:context=>translator({...context,commitCheckpoint:async output=>{await context.commitCheckpoint(output);throw Object.assign(new Error("interrupted after raw commit"),{code:"VIDEO_AGENT_WORKER_INTERRUPTED"});}})}});
        let translationRow=await step(translation.step.id);assert.equal(translationRow.status,"retry_wait");const firstRaw=translationRow.checkpoint.nodes[0].rawRefs[0];
        await pg.query("UPDATE video_agent_steps SET available_at=0 WHERE id=$1",[translationRow.id]);await advanceRuns();
        const retry=await claimStep({workerId:"long-translate-retry",stages:["translate_selected"]});await executeClaim(retry,{handlers:{translate_selected:translator}});await advanceRuns();
        translationRow=await step(translationRow.id);assert.equal(translationRow.status,"succeeded");assert.equal(translationCalls,1);assert.equal(translationRow.checkpoint.nodes[0].rawRefs[0],firstRaw);assert.equal(translationRow.checkpoint.translatedCueCount,30);
        const reader=await claimStep({workerId:"long-handoff",stages:["build_subtitles"]}),output=await readJsonArtifact(reader,translationRow.checkpoint.translatedClipsRef,{kind:"transcript"});
        assert.equal(output.clips.length,3);assert.equal(output.cues.length,30);assert.equal(output.cues[0].wordIds[0],"word-0");assert.ok(output.cues.every(cue=>cue.translatedText && cue.endMs<=3600000));assert.equal(output.clips[0].endMs,29990);
        await stop(f);await failStep(reader,new Error("cancelled"));await advanceRuns();
    });
    await t.test("translation publishes owned cues with unchanged source timing and provenance",async()=>{
        const f=await seed();await pg.query("UPDATE video_agent_steps SET status='succeeded' WHERE run_id=$1 AND ordinal<3",[f.runId]);await advanceRuns();
        const normalize=await claimStep({workerId:"translation-normalize-fixture",stages:["normalize"]}),source=normalize.run.source_snapshot;
        const cues=[{id:"cue-one",sourceText:"A complete opening.",startMs:0,endMs:10000,flags:[],wordIds:["word-one"]},{id:"cue-two",sourceText:"A complete conclusion.",startMs:10000,endMs:20000,flags:[],wordIds:["word-two"]}];
        const normalized=await uploadJsonArtifact(normalize,{version:"normalized-transcript-v1",sourceChecksum:source.checksum,durationMs:source.durationMs,cues},{kind:"transcript"});
        await succeedStep(normalize,{checkpoint:{normalizedTranscriptRef:normalized.id},assets:[normalized],outputRefs:[normalized.id]});await advanceRuns();
        const select=await claimStep({workerId:"translation-select-fixture",stages:["select_clips"]});
        const selected=await uploadJsonArtifact(select,{version:"selected-clips-v1",sourceChecksum:source.checksum,durationMs:source.durationMs,sourceTranscriptRef:normalized.id,clips:[{id:"clip-one",startMs:0,endMs:20000,cueIds:["cue-one","cue-two"]}],shortfall:0,shortfallReason:null});
        await succeedStep(select,{checkpoint:{selectedClipsRef:selected.id},assets:[selected],outputRefs:[selected.id,normalized.id]});await advanceRuns();
        const translation=await claimStep({workerId:"translation-provider",stages:["translate_selected"]});let calls=0;
        await executeClaim(translation,{handlers:{translate_selected:createTranslateHandler({provider:{translate:async({batch})=>{calls++;return {raw:{status:"completed",output_text:JSON.stringify({translations:batch.items.map(item=>({cueId:item.cueId,translatedText:"Una idea completa."}))})},requestId:"translation-fixture"};}}})}});await advanceRuns();
        const row=await step(translation.step.id);assert.equal(row.status,"succeeded");assert.equal(row.provider,"openai");assert.equal(row.translatedCueCount,undefined);assert.equal(row.checkpoint.translatedCueCount,2);assert.equal(calls,1);
        const reader=await claimStep({workerId:"translated-cue-reader",stages:["build_subtitles"]}),result=await readJsonArtifact(reader,row.checkpoint.translatedClipsRef,{kind:"transcript"});
        assert.equal(result.version,"translated-clips-v1");assert.equal(result.cues[0].startMs,0);assert.equal(result.cues[1].endMs,20000);assert.equal(result.cues[1].wordIds[0],"word-two");assert.equal(result.sourceSelectedClipsRef,selected.id);
        await stop(f);await failStep(reader,new Error("cancelled"));await advanceRuns();
        const cancelled=await seed();await pg.query("UPDATE video_agent_steps SET status='succeeded',output_refs=$2,checkpoint=$3 WHERE run_id=$1 AND stage='select_clips'",[cancelled.runId,[selected.id,normalized.id],{selectedClipsRef:selected.id}]);
        await pg.query("UPDATE video_agent_steps SET status='succeeded' WHERE run_id=$1 AND ordinal<4",[cancelled.runId]);await advanceRuns();
        // Build project-owned fixtures for cancellation; cross-project assets must
        // still be rejected, never used as a shortcut to a provider request.
        let contacted=false;const isolated=await claimStep({workerId:"cross-project-translation",stages:["translate_selected"]});
        await executeClaim(isolated,{handlers:{translate_selected:createTranslateHandler({provider:{translate:async()=>{contacted=true;throw new Error("must not call");}}})}});await advanceRuns();
        assert.equal(contacted,false);assert.equal((await step(isolated.step.id)).error_code,"VIDEO_AGENT_OUTPUT_INVALID");
    });
    await t.test("cancelling live translation aborts provider and prevents raw and final publication",async()=>{
        const f=await seed();await pg.query("UPDATE video_agent_steps SET status='succeeded' WHERE run_id=$1 AND ordinal<3",[f.runId]);await advanceRuns();
        const normalize=await claimStep({workerId:"cancel-translation-normalize",stages:["normalize"]}),source=normalize.run.source_snapshot;
        const normalized=await uploadJsonArtifact(normalize,{version:"normalized-transcript-v1",sourceChecksum:source.checksum,durationMs:source.durationMs,cues:[{id:"cancel-cue",sourceText:"A complete idea.",startMs:0,endMs:20000,flags:[]}]},{kind:"transcript"});
        await succeedStep(normalize,{checkpoint:{normalizedTranscriptRef:normalized.id},assets:[normalized],outputRefs:[normalized.id]});await advanceRuns();
        const select=await claimStep({workerId:"cancel-translation-select",stages:["select_clips"]});
        const selected=await uploadJsonArtifact(select,{version:"selected-clips-v1",sourceChecksum:source.checksum,durationMs:source.durationMs,sourceTranscriptRef:normalized.id,clips:[{id:"cancel-clip",startMs:0,endMs:20000,cueIds:["cancel-cue"]}]});
        await succeedStep(select,{checkpoint:{selectedClipsRef:selected.id},assets:[selected],outputRefs:[selected.id,normalized.id]});await advanceRuns();
        let aborted=false;const provider={translate:async({signal})=>{
            const wait=new Promise((_resolve,reject)=>signal.addEventListener("abort",()=>{aborted=true;reject(signal.reason);},{once:true}));
            await command(f.projectId,"cancel_run",{runId:f.runId},1);return wait;
        }};
        await workerTick({workerId:"cancel-live-translation",heartbeatMs:20,handlers:{translate_selected:createTranslateHandler({provider})}});
        const row=(await pg.query("SELECT * FROM video_agent_steps WHERE run_id=$1 AND stage='translate_selected'",[f.runId])).rows[0];
        assert.equal(aborted,true);assert.equal(row.status,"cancelled");assert.deepEqual(row.output_refs,[]);assert.equal((await pg.query("SELECT status FROM video_agent_runs WHERE id=$1",[f.runId])).rows[0].status,"cancelled");
    });
    await t.test("cancelling a live ASR request aborts the provider and prevents raw output publication",async()=>{
        const f=await seed({bytes:await readFile(path.join(root,"long.mp4")),probe:{durationMs:620000,width:96,height:64}});
        await workerTick({workerId:"cancel-probe"});await workerTick({workerId:"cancel-chunks"});
        const provider={transcribe:async({signal})=>{
            const wait=new Promise((_resolve,reject)=>signal.addEventListener("abort",()=>reject(signal.reason),{once:true}));
            const row=(await pg.query("SELECT id FROM video_agent_runs WHERE project_id=$1",[f.projectId])).rows[0];
            await command(f.projectId,"cancel_run",{runId:row.id},1);return wait;
        }};
        await workerTick({workerId:"cancel-asr",heartbeatMs:20,handlers:{transcribe:createTranscribeHandler({provider})}});
        const run=(await pg.query("SELECT status FROM video_agent_runs WHERE id=$1",[f.runId])).rows[0];assert.equal(run.status,"cancelled");
        const asr=(await pg.query("SELECT * FROM video_agent_steps WHERE run_id=$1 AND stage='transcribe'",[f.runId])).rows[0];assert.equal(asr.status,"cancelled");assert.deepEqual(asr.output_refs,[]);
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
