import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {mkdtemp,rm,readFile,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import {compilePlan,normalizePlan} from "./plans.js";
import {prepareDubTextHandler,createTtsHandler,fitDubTimelineHandler,buildDubSubtitlesHandler,fitDubSpeed} from "./dub-handlers.js";
import {ttsAdapter} from "./tts-adapter.js";
import {runAbortableProcess} from "./worker-media.js";
import {createRenderHandler} from "./render-handler.js";
import {publishHandler} from "./verify-handler.js";
import {PGlite} from "@electric-sql/pglite";
import {createProject,ensureVideoAgentSchema,setVideoAgentDatabaseForTests} from "../db/video-agent.js";
import {submitCommand} from "./execution.js";

const withConfig=async action=>{
    const names={VIDEO_AGENT_DUBBING_ENABLED:"1",OPENAI_API_KEY:"test-only",VIDEO_AGENT_TTS_VOICE:"alloy",
        VIDEO_AGENT_TTS_MAX_RUN_CHARS:"1000",VIDEO_AGENT_TTS_MAX_RUN_AUDIO_MS:"90000",
        VIDEO_AGENT_MAX_RUN_COST_MICRO_USD:"1000000",VIDEO_AGENT_TTS_MICRO_USD_PER_MILLION_CHARS:"15000000"};
    const prior=Object.fromEntries(Object.keys(names).map(key=>[key,process.env[key]]));Object.assign(process.env,names);
    try{return await action();}finally{for(const [key,value] of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
};
const source={id:randomUUID(),checksum:"a".repeat(64),generation:"1",sizeBytes:1000,durationMs:20000,width:320,height:240};
const translated={version:"translated-clips-v1",sourceChecksum:source.checksum,durationMs:20000,config:{targetLanguage:"es"},
    clips:[{id:"clip_one",title:"Dubbed clip",startMs:0,endMs:20000,cueIds:["cue_a","cue_b"]}],
    cues:[{id:"cue_a",sourceText:"First idea.",translatedText:"Primera idea.",startMs:0,endMs:10000},
        {id:"cue_b",sourceText:"Second idea.",translatedText:"Segunda idea.",startMs:10000,endMs:20000}]};

test("explicit dubbing compiles only the short-clip dub DAG; ordinary plans retain original audio",()=>withConfig(async()=>{
    const input={sourceRef:source.id,operation:"highlight_clips",targetLanguage:"es",clips:{requestedCount:1,minSeconds:15,maxSeconds:20},
        dubbing:{enabled:true,voiceId:"alloy"}};
    const plan=normalizePlan(input),dub=compilePlan({plan,sourceSnapshot:source,revision:1});
    assert.deepEqual(dub.slice(6,10).map(step=>step.stage),["prepare_dub_text","tts","fit_dub_timeline","build_dub_subtitles"]);
    assert.equal(dub.find(step=>step.stage==="render").input.config.dubbing.enabled,true);
    assert.equal(dub.find(step=>step.stage==="tts").input.config.budget.estimatedChars,300);
    assert.throws(()=>normalizePlan({...input,dubbing:{enabled:true,voiceId:"nova"}}),{code:"VIDEO_AGENT_PLAN_INVALID"});
    const ordinary=compilePlan({plan:normalizePlan({...input,dubbing:{enabled:false,voiceId:null}}),sourceSnapshot:source,revision:1});
    assert.ok(ordinary.some(step=>step.stage==="build_subtitles"));assert.ok(!ordinary.some(step=>step.stage==="tts"));
}));

test("speech fit never exceeds the hard 1.3 speed ceiling",()=>{
    assert.equal(fitDubSpeed(19500,15000),1.3);
    assert.equal(fitDubSpeed(3000,15000),0.9);
    assert.throws(()=>fitDubSpeed(19501,15000),{code:"VIDEO_AGENT_DUB_TOO_LONG"});
});

test("a dubbing command creates an admitted-shape Run with only dub-specific downstream stages",()=>withConfig(async()=>{
    const prior={NODE_ENV:process.env.NODE_ENV,VIDEO_AGENT_ENABLED:process.env.VIDEO_AGENT_ENABLED,
        VIDEO_AGENT_RUNS_ENABLED:process.env.VIDEO_AGENT_RUNS_ENABLED,VIDEO_AGENT_ADMISSION_ENABLED:process.env.VIDEO_AGENT_ADMISSION_ENABLED};
    Object.assign(process.env,{NODE_ENV:"test",VIDEO_AGENT_ENABLED:"1",VIDEO_AGENT_RUNS_ENABLED:"1",VIDEO_AGENT_ADMISSION_ENABLED:"0"});
    const pg=new PGlite();
    try{
        await pg.exec("CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1);");
        const sql=async(text,params)=>{const r=params?await pg.query(text,params):(await pg.exec(text)).at(-1);return {...r,rowCount:r.affectedRows || r.rows?.length || 0};};
        let tail=Promise.resolve();const acquire=async()=>{let release;const next=new Promise(resolve=>release=resolve),previous=tail;tail=next;await previous;return release;};
        setVideoAgentDatabaseForTests({query:async(...args)=>{const release=await acquire();try{return await sql(...args);}finally{release();}},
            getClient:async()=>{const release=await acquire();return {query:sql,release};}});
        await ensureVideoAgentSchema();
        const project=await createProject({userId:1,title:"Dub fixture"}),now=Date.now();
        await pg.query(`INSERT INTO video_agent_sources(id,project_id,kind,filename,mime,size_bytes,object_key,generation,checksum,probe,status,retention_until,created_at,updated_at)
            VALUES($1,$2,'upload','source.mp4','video/mp4',$3,$4,$5,$6,$7,'ready',$8,$9,$9)`,
        [source.id,project.id,source.sizeBytes,"test/source",source.generation,source.checksum,
            {durationMs:source.durationMs,width:source.width,height:source.height},now+86400000,now]);
        const command=(type,input,revision)=>submitCommand({projectId:project.id,userId:1,admissionPolicy:{metadataOnly:true},
            body:{type,input,expectedRevision:revision,idempotencyKey:`dub_${randomUUID().replaceAll("-","")}`}});
        const plan=await command("create_plan",{sourceRef:source.id,operation:"highlight_clips",targetLanguage:"es",
            clips:{requestedCount:1,minSeconds:15,maxSeconds:20},dubbing:{enabled:true,voiceId:"alloy"}},0);
        const run=await command("start_run",{planId:plan.planId},1);
        const rows=(await pg.query("SELECT stage FROM video_agent_steps WHERE run_id=$1 ORDER BY ordinal",[run.runId])).rows.map(row=>row.stage);
        assert.ok(rows.includes("tts"));assert.ok(rows.includes("build_dub_subtitles"));assert.ok(!rows.includes("build_subtitles"));
    }finally{
        await pg.close();for(const [key,value] of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    }
}));

test("dub stages reserve TTS budget before calls and produce fitted audio and spoken subtitles",()=>withConfig(async()=>{
    const workDir=await mkdtemp(path.join(os.tmpdir(),"agent-dub-test-"));
    try{
        const plan=normalizePlan({sourceRef:source.id,operation:"highlight_clips",targetLanguage:"es",clips:{requestedCount:1,minSeconds:15,maxSeconds:20},
            subtitles:{enabled:true,mode:"translated"},dubbing:{enabled:true,voiceId:"alloy"}});
        const graph=compilePlan({plan,sourceSnapshot:source,revision:1}),json=new Map([["translation",translated]]),files=new Map();
        const artifact=async value=>{const id=randomUUID();json.set(id,value);return {id};};
        const fileArtifact=async(filename,{kind})=>{const id=randomUUID();files.set(id,{kind,bytes:await readFile(filename)});return {id};};
        const readFileArtifact=async(id,filename,{kind})=>{const file=files.get(id);assert.equal(file?.kind,kind);if(filename)await writeFile(filename,file.bytes);return {id};};
        const signal=new AbortController().signal;
        const context=(stage,dependency,checkpoint={})=>({claim:{run:{plan,source_snapshot:source},step:{input_snapshot:graph.find(step=>step.stage===stage).input}},
            dependencies:[dependency],checkpoint,signal,workDir,readArtifact:async id=>json.get(id),artifact,fileArtifact,readFileArtifact,
            commitCheckpoint:async result=>{Object.assign(checkpoint,result.checkpoint);}});
        const prepared=await prepareDubTextHandler(context("prepare_dub_text",{stage:"translate_selected",checkpoint:{translatedClipsRef:"translation"}}));
        assert.equal(json.get(prepared.checkpoint.dubTextRef).clips[0].spokenText,"Primera idea. Segunda idea.");
        const fixture=path.join(workDir,"speech-fixture.mp3");
        await runAbortableProcess(ffmpeg,["-nostdin","-v","error","-y","-f","lavfi","-i","sine=frequency=440:duration=3","-af","volume=0.5","-c:a","libmp3lame",fixture],{signal});
        let calls=0;const provider={estimate:ttsAdapter.estimate,async synthesize(){calls++;return {audio:await readFile(fixture)};}};
        const spending={};const tts=await createTtsHandler({provider})(context("tts",{stage:"prepare_dub_text",checkpoint:prepared.checkpoint},spending));
        assert.equal(calls,1);assert.ok(spending.spentChars>0);assert.ok(spending.spentMicroUsd>0);
        const fit=await fitDubTimelineHandler(context("fit_dub_timeline",{stage:"tts",checkpoint:tts.checkpoint}));
        const fitted=json.get(fit.checkpoint.fittedDubRef).clips[0];
        assert.equal(fitted.fit.fittedMs,20000);assert.ok(fitted.fit.speed>=0.9 && fitted.fit.speed<=1.3);
        const subtitles=await buildDubSubtitlesHandler(context("build_dub_subtitles",{stage:"fit_dub_timeline",checkpoint:fit.checkpoint}));
        const output=json.get(subtitles.checkpoint.subtitleClipsRef).clips[0];
        assert.ok(files.get(output.subtitles.srt.id).bytes.toString("utf8").includes("Segunda idea."));
        assert.equal(output.dubAudio.id,fitted.dubAudio.id);
        assert.ok(subtitles.outputRefs.includes(output.dubAudio.id));
        let renderArgs=[];const sourceFile=path.join(workDir,"source.mp4");await writeFile(sourceFile,"source fixture");
        const render=createRenderHandler({download:async()=>sourceFile,runProcess:async(_command,args)=>{
            renderArgs=args;await writeFile(args.at(-1),"render fixture");return {stdout:""};
        }});
        const rendered=await render(context("render",{stage:"build_dub_subtitles",checkpoint:subtitles.checkpoint}));
        assert.equal(renderArgs[renderArgs.indexOf("-map")+1],"0:v:0");
        assert.ok(renderArgs.includes("1:a:0"));assert.ok(!renderArgs.includes("0:a:0"));
        assert.equal(json.get(rendered.checkpoint.renderedClipsRef).clips[0].dubAudio.id,output.dubAudio.id);
        const published=await publishHandler({claim:{run:{plan,source_snapshot:source}},signal,dependencies:[{stage:"verify",
            checkpoint:{verified:true,verifiedClipsRef:"verified"},output_refs:["verified",rendered.checkpoint.clips[0].video.id,output.dubAudio.id]}],
            readArtifact:async()=>({version:"verified-clips-v1",verified:true,sourceChecksum:source.checksum,
                clips:[json.get(rendered.checkpoint.renderedClipsRef).clips[0]]})});
        assert.equal(published.checkpoint.results[0].dubAudio.id,output.dubAudio.id);
    }finally{await rm(workDir,{recursive:true,force:true});}
}));

test("a failed provider attempt keeps its durable character reservation",()=>withConfig(async()=>{
    const plan=normalizePlan({sourceRef:source.id,operation:"highlight_clips",targetLanguage:"es",clips:{requestedCount:1,minSeconds:15,maxSeconds:20},
        dubbing:{enabled:true,voiceId:"alloy"}});
    const step=compilePlan({plan,sourceSnapshot:source,revision:1}).find(item=>item.stage==="tts");
    const checkpoint={},prepared={version:"dub-text-v1",sourceChecksum:source.checksum,clips:[{id:"clip_one",spokenText:"Primera idea."}]};
    let calls=0;
    const provider={estimate:ttsAdapter.estimate,async synthesize(){calls++;throw new Error("provider lost response");}};
    const context={claim:{run:{plan,source_snapshot:source},step:{input_snapshot:step.input}},dependencies:[{stage:"prepare_dub_text",checkpoint:{dubTextRef:"text"}}],
        signal:new AbortController().signal,checkpoint,readArtifact:async()=>prepared,commitCheckpoint:async result=>Object.assign(checkpoint,result.checkpoint)};
    await assert.rejects(createTtsHandler({provider})(context),/provider lost response/);
    assert.equal(calls,1);assert.ok(checkpoint.spentChars>0);
    checkpoint.spentChars=1000;
    await assert.rejects(createTtsHandler({provider})(context),{code:"VIDEO_AGENT_TTS_BUDGET_EXCEEDED"});
    assert.equal(calls,1);
}));
