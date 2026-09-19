import {transaction,ownedProject,agentError} from "../db/video-agent.js";
import {createHash} from "node:crypto";
import {getAiVideoObjectStorage} from "../ai-video/object-storage.js";
import {ASR_MAX_JSON_BYTES} from "./asr-config.js";
import {validateTranslatedClips} from "./translated-contract.js";
export const getPublishedResults=input=>transaction(async client=>{
    await ownedProject(client,input);
    const run=(await client.query("SELECT * FROM video_agent_runs WHERE id=$1 AND project_id=$2",[input.runId,input.projectId])).rows[0];
    if(!run)throw agentError("VIDEO_AGENT_RUN_NOT_FOUND",404,"Run not found");
    if(!["completed","partially_completed"].includes(run.status))return {results:[],producedCount:0};
    const publish=(await client.query("SELECT checkpoint FROM video_agent_steps WHERE run_id=$1 AND stage='publish_results' AND status='succeeded'",[run.id])).rows[0];
    const results=publish?.checkpoint?.results || [],ids=results.flatMap(clip=>[clip.video.id,...(clip.dubAudio?[clip.dubAudio.id]:[]),...Object.values(clip.subtitles).map(asset=>asset.id)]);
    const ready=ids.length?(await client.query("SELECT id FROM video_agent_assets WHERE id=ANY($1::uuid[]) AND project_id=$2 AND status='ready' AND expires_at>$3",[ids,input.projectId,Date.now()])).rows:[];
    const available=new Set(ready.map(asset=>asset.id));
    return {results:results.filter(clip=>available.has(clip.video.id)).map(clip=>({...clip,
        ...(clip.dubAudio && !available.has(clip.dubAudio.id)?{dubAudio:null}:{}),
        subtitles:Object.fromEntries(Object.entries(clip.subtitles).filter(([,asset])=>available.has(asset.id)))})),producedCount:run.produced_count,requiresReview:publish?.checkpoint?.requiresReview || false};
});

export const getEditableResults=async(input,{storage=getAiVideoObjectStorage()}={})=>{
    const context=await transaction(async client=>{
        await ownedProject(client,input);
        const run=(await client.query("SELECT * FROM video_agent_runs WHERE id=$1 AND project_id=$2",[input.runId,input.projectId])).rows[0];
        if(!run || !["completed","partially_completed"].includes(run.status))throw agentError("VIDEO_AGENT_EDIT_RUN_NOT_READY",409,"Completed run required for editing");
        const step=(await client.query("SELECT checkpoint,output_refs FROM video_agent_steps WHERE run_id=$1 AND stage='translate_selected' AND status='succeeded'",[run.id])).rows[0];
        const ref=step?.checkpoint?.translatedClipsRef;
        if(!ref || !step.output_refs?.includes(ref))throw agentError("VIDEO_AGENT_EDIT_SOURCE_UNAVAILABLE",409,"Editable subtitles are unavailable");
        const row=(await client.query("SELECT id,object_key,generation,size_bytes,checksum FROM video_agent_assets WHERE id=$1 AND project_id=$2 AND kind='transcript' AND status='ready' AND expires_at>$3",[ref,input.projectId,Date.now()])).rows[0];
        if(!row || Number(row.size_bytes)>ASR_MAX_JSON_BYTES)throw agentError("VIDEO_AGENT_EDIT_SOURCE_UNAVAILABLE",409,"Editable subtitles are unavailable");
        return {asset:row,sourceChecksum:run.source_snapshot.checksum,durationMs:run.source_snapshot.durationMs,
            targetLanguage:run.plan.targetLanguage,clipLimits:run.plan.clips};
    });
    const {asset}=context;
    const head=await storage.headObject(asset.object_key);
    if(head.generation!==asset.generation || head.sizeBytes!==Number(asset.size_bytes))throw agentError("VIDEO_AGENT_EDIT_SOURCE_UNAVAILABLE",409,"Editable source changed");
    const chunks=[];let size=0;
    for await(const chunk of storage.openReadStream(asset.object_key)){
        size+=chunk.length;if(size>ASR_MAX_JSON_BYTES)throw agentError("VIDEO_AGENT_EDIT_SOURCE_UNAVAILABLE",409,"Editable source is too large");chunks.push(chunk);
    }
    const bytes=Buffer.concat(chunks);
    if(size!==Number(asset.size_bytes) || createHash("sha256").update(bytes).digest("hex")!==asset.checksum)throw agentError("VIDEO_AGENT_EDIT_SOURCE_UNAVAILABLE",409,"Editable source checksum changed");
    let value;try{value=JSON.parse(bytes.toString("utf8"));}catch{throw agentError("VIDEO_AGENT_EDIT_SOURCE_UNAVAILABLE",409,"Editable source is invalid");}
    try{validateTranslatedClips(value,{sourceChecksum:context.sourceChecksum,durationMs:context.durationMs,
        targetLanguage:context.targetLanguage,...context.clipLimits});}
    catch{throw agentError("VIDEO_AGENT_EDIT_SOURCE_UNAVAILABLE",409,"Editable source is invalid");}
    const cues=new Map(value.cues.map(cue=>[cue.id,cue]));
    return {runId:input.runId,clips:value.clips.map(clip=>({id:clip.id,title:clip.title || "",startMs:clip.startMs,endMs:clip.endMs,
        cues:clip.cueIds.map(id=>{const cue=cues.get(id);return {id,startMs:cue.startMs,endMs:cue.endMs,sourceText:cue.sourceText,translatedText:cue.translatedText};})}))};
};
