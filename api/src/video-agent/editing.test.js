import assert from "node:assert/strict";
import test from "node:test";
import {createHash,randomUUID} from "node:crypto";
import {mkdtemp,mkdir,writeFile,stat,rm} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {PGlite} from "@electric-sql/pglite";
import {ensureVideoAgentSchema,setVideoAgentDatabaseForTests} from "../db/video-agent.js";
import {resetAiVideoObjectStorageForTests} from "../ai-video/object-storage.js";
import {submitCommand,getCurrentPlan,listRevisions} from "./execution.js";
import {getEditableResults} from "./results.js";
import {applyResultEdits} from "./subtitle-handler.js";
import {saveUserMessage} from "./conversation.js";
import {planMessage} from "./planner.js";
import {validateEditCandidate,isEditRequest} from "./edit-adapter.js";

test("result edits create immutable revisions, reuse upstream steps and restore old plans",{timeout:120000},async t=>{
    process.env.NODE_ENV="test";process.env.VIDEO_AGENT_ENABLED="1";process.env.VIDEO_AGENT_RUNS_ENABLED="1";process.env.VIDEO_AGENT_ADMISSION_ENABLED="0";
    const root=await mkdtemp(path.join(os.tmpdir(),"agent-edit-"));
    process.env.AI_VIDEO_STORAGE_PROVIDER="local";process.env.AI_VIDEO_STORAGE_PREFIX="agent-edit";process.env.AI_VIDEO_LOCAL_STORAGE_ROOT=root;
    resetAiVideoObjectStorageForTests();
    const pg=new PGlite();let tail=Promise.resolve();
    const sql=async(value,params)=>{const result=params?await pg.query(value,params):(await pg.exec(value)).at(-1);return {...result,rowCount:result.affectedRows || result.rows?.length || 0};};
    const acquire=async()=>{let release;const next=new Promise(resolve=>{release=resolve;});const previous=tail;tail=next;await previous;return release;};
    setVideoAgentDatabaseForTests({query:async(...args)=>{const release=await acquire();try{return await sql(...args);}finally{release();}},getClient:async()=>{const release=await acquire();return {query:sql,release};}});
    t.after(async()=>{await pg.close();await rm(root,{recursive:true,force:true});resetAiVideoObjectStorageForTests();});
    await pg.exec("CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users(id) VALUES(1),(2)");await ensureVideoAgentSchema();
    const projectId=randomUUID(),sourceId=randomUUID(),now=Date.now();
    await pg.query("INSERT INTO video_agent_projects(id,user_id,title,created_at,updated_at) VALUES($1,1,'Edit', $2,$2)",[projectId,now]);
    await pg.query(`INSERT INTO video_agent_sources(id,project_id,kind,filename,mime,size_bytes,object_key,generation,checksum,probe,status,retention_until,created_at,updated_at)
        VALUES($1,$2,'upload','source.mp4','video/mp4',100,$3,'1',$4,$5,'ready',$6,$7,$7)`,
    [sourceId,projectId,`agent-edit/${sourceId}`,"a".repeat(64),{durationMs:120000,width:320,height:180},now+86400000,now]);
    const input={sourceRef:sourceId,operation:"highlight_clips",targetLanguage:"es",clips:{requestedCount:1},subtitles:{enabled:true,mode:"bilingual"}};
    const command=(type,input,expectedRevision,key)=>submitCommand({projectId,userId:1,body:{type,input,expectedRevision,idempotencyKey:key},admissionPolicy:{metadataOnly:true}});
    const initial=await command("create_plan",input,0,"edit_initial_plan_0001");
    const started=await command("start_run",{planId:initial.planId},1,"edit_initial_run_00001");
    const runId=started.runId;
    const cues=[{id:"cue_a",startMs:0,endMs:10000,sourceText:"Hello",translatedText:"Hola"},{id:"cue_b",startMs:10000,endMs:20000,sourceText:"World",translatedText:"Mundo"}];
    const value={version:"translated-clips-v1",sourceChecksum:"a".repeat(64),durationMs:120000,config:{targetLanguage:"es"},
        clips:[{id:"clip_one",title:"Original",startMs:0,endMs:20000,cueIds:cues.map(cue=>cue.id)}],cues};
    const key="agent-edit/translated.json",filename=path.join(root,"agent-edit","translated.json"),bytes=Buffer.from(JSON.stringify(value));
    await mkdir(path.dirname(filename),{recursive:true});await writeFile(filename,bytes);
    const generation=String(Math.trunc((await stat(filename)).mtimeMs)),assetId=randomUUID();
    await pg.query(`INSERT INTO video_agent_assets(id,project_id,source_id,kind,object_key,generation,checksum,size_bytes,status,expires_at)
        VALUES($1,$2,$3,'transcript',$4,$5,$6,$7,'ready',$8)`,[assetId,projectId,sourceId,key,generation,createHash("sha256").update(bytes).digest("hex"),bytes.length,now+86400000]);
    await pg.query("UPDATE video_agent_runs SET status='completed',completed_at=$2 WHERE id=$1",[runId,now]);
    await pg.query(`UPDATE video_agent_steps SET status='succeeded',output_refs=$2,checkpoint=CASE WHEN stage='translate_selected' THEN $3 ELSE checkpoint END
        WHERE run_id=$1 AND ordinal<=5`,[runId,[assetId],{translatedClipsRef:assetId}]);
    const editable=await getEditableResults({projectId,userId:1,runId});assert.equal(editable.clips[0].cues[1].translatedText,"Mundo");
    await assert.rejects(getEditableResults({projectId,userId:2,runId}),{status:404});
    const patch={title:"New title",focusX:0.8,startCueId:"cue_a",endCueId:"cue_b"};
    const edit=await command("update_clip",{runId,clipId:"clip_one",patch},1,"edit_clip_command_0001");
    assert.equal(edit.revision,2);assert.ok(edit.planId);
    assert.equal((await command("update_clip",{runId,clipId:"clip_one",patch},1,"edit_clip_command_0001")).replayed,true);
    await assert.rejects(command("update_clip",{runId,clipId:"unknown",patch},2,"edit_bad_clip_000001"),{code:"VIDEO_AGENT_EDIT_CLIP_NOT_FOUND"});
    const subtitle=await command("update_subtitles",{runId,cueId:"cue_b",text:"Nuevo mundo"},2,"edit_subtitle_cmd_001");
    assert.equal(subtitle.revision,3);
    const current=await getCurrentPlan({projectId,userId:1});assert.equal(current.plan.input.edits.subtitles.cue_b,"Nuevo mundo");
    const applied=applyResultEdits(value,current.plan.input.edits);
    assert.equal(applied.clips[0].title,"New title");assert.equal(applied.clips[0].focusX,0.8);assert.equal(applied.cues[1].translatedText,"Nuevo mundo");
    const restored=await command("restore_revision",{revision:2},3,"edit_restore_cmd_0001");
    assert.equal(restored.revision,4);assert.equal((await getCurrentPlan({projectId,userId:1})).plan.input.edits.subtitles.cue_b,undefined);
    assert.equal((await command("restore_revision",{revision:2},3,"edit_restore_cmd_0001")).replayed,true);
    assert.equal((await listRevisions({projectId,userId:1,limit:10})).revisions[0].parentRevision,3);
    const rerun=await command("start_run",{planId:restored.planId},4,"edit_rerun_cmd_00001");
    const steps=(await pg.query("SELECT stage,status,reused_step_id FROM video_agent_steps WHERE run_id=$1 ORDER BY ordinal",[rerun.runId])).rows;
    assert.ok(steps.slice(0,6).every(step=>step.status==="succeeded" && step.reused_step_id));
    assert.equal(steps[6].stage,"build_subtitles");assert.equal(steps[6].status,"pending");
    assert.equal((await pg.query("SELECT status FROM video_agent_runs WHERE id=$1",[runId])).rows[0].status,"completed");
    await pg.query("UPDATE video_agent_runs SET status='completed',completed_at=$2 WHERE id=$1",[rerun.runId,now+1]);
    assert.equal(isEditRequest("Change the subtitle in this clip"),true);
    assert.throws(()=>validateEditCandidate({status:"ready",reply:"Done",action:"update_subtitles",clipId:"other",cueId:"cue_b",title:null,focusX:null,startCueId:null,endCueId:null,text:"Otra",executionIntent:"plan_only"},editable),{code:"VIDEO_AGENT_EDIT_FORMAT_INVALID"});
    const saved=await saveUserMessage({projectId,userId:1,clientMessageId:"edit_conversation_0001",content:"Change the subtitle on the second line to Otra."});
    const suggestion={status:"ready",reply:"Subtitle edit saved.",action:"update_subtitles",clipId:"clip_one",cueId:"cue_b",title:null,focusX:null,startCueId:null,endCueId:null,text:"Otra",executionIntent:"plan_only"};
    const planned=await planMessage({projectId,userId:1,messageId:saved.message.id},{edit:{suggest:async()=>({value:suggestion,model:"fake-edit"})},
        command:input=>submitCommand({...input,admissionPolicy:{metadataOnly:true}})});
    assert.equal(planned.outcome.editAction,"update_subtitles");assert.equal(planned.outcome.revision,5);
    assert.equal((await planMessage({projectId,userId:1,messageId:saved.message.id})).replayed,true);
});
