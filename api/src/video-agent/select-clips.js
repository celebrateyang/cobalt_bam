import {agentError} from "../db/video-agent.js";
import {hashInput} from "./plans.js";
export const selectionInvalid=()=>agentError("VIDEO_AGENT_SELECTION_FORMAT_INVALID",422,"Invalid clip selection output");
const size=value=>Buffer.byteLength(JSON.stringify(value));
export const buildSelectionWindows=(transcript,config)=>{
    const cues=transcript.cues;
    if(!Array.isArray(cues) || !cues.length || cues.length>80000)throw selectionInvalid();
    const ids=new Set();
    cues.forEach((cue,i)=>{if(typeof cue.id!=="string" || ids.has(cue.id) || typeof cue.sourceText!=="string" || !cue.sourceText.trim() || !Number.isSafeInteger(cue.startMs) || !Number.isSafeInteger(cue.endMs) || cue.startMs<0 || cue.endMs>transcript.durationMs || cue.endMs<=cue.startMs || (i && cue.startMs<cues[i-1].endMs))throw selectionInvalid();ids.add(cue.id);});
    const windows=[];let cursor=0;
    const item=cue=>({id:cue.id,text:cue.sourceText,startMs:cue.startMs,endMs:cue.endMs,flags:cue.flags || []});
    while(cursor<cues.length){
        const first=cursor,core=[];let bytes=0;
        while(cursor<cues.length){const cue=cues[cursor],value=item(cue),length=size(value);
            if(core.length && (cue.startMs-cues[first].startMs>=config.windowMs || core.length>=config.maxCoreCues || bytes+length>config.coreBytes))break;
            if(length>config.coreBytes)throw selectionInvalid();core.push(value);bytes+=length;cursor++;
        }
        const context=[];
        // Prioritize following context so a clip starting near a core boundary
        // can still end up to 90 seconds later; preceding context is read-only.
        for(let i=cursor;i<cues.length && cues[i].startMs-core.at(-1).endMs<=config.contextMs;i++){const value=item(cues[i]);if(bytes+size(value)>config.maxInputBytes-4096)break;context.push(value);bytes+=size(value);}
        const before=[];for(let i=first-1;i>=0 && core[0].startMs-cues[i].endMs<=config.contextMs;i--){const value=item(cues[i]);if(bytes+size(value)>config.maxInputBytes-4096)break;before.unshift(value);bytes+=size(value);}
        const window={ordinal:windows.length,core,context:[...before,...context]};
        if(size(window)>config.maxInputBytes)throw selectionInvalid();windows.push(window);
        if(windows.length>config.maxWindows)throw agentError("VIDEO_AGENT_SELECTION_TOO_DENSE",422,"Transcript exceeds bounded selection window budget");
    }
    return windows;
};
export const validateCandidates=(value,window,cues,limits)=>{
    if(!value || Array.isArray(value) || Object.keys(value).some(key=>key!=="clips") || !Array.isArray(value.clips) || value.clips.length>5)throw selectionInvalid();
    const provided=new Set([...window.core,...window.context].map(cue=>cue.id)),owned=new Set(window.core.map(cue=>cue.id)),indexes=new Map(cues.map((cue,i)=>[cue.id,i])),clips=[],rejected=[];
    for(const candidate of value.clips){
        if(!candidate || Object.keys(candidate).sort().join(",")!=="completeIdea,endCueId,reason,score,startCueId,title" || typeof candidate.startCueId!=="string" || typeof candidate.endCueId!=="string" || !provided.has(candidate.startCueId) || !provided.has(candidate.endCueId) || typeof candidate.title!=="string" || !candidate.title.trim() || candidate.title.length>160 || typeof candidate.reason!=="string" || !candidate.reason.trim() || candidate.reason.length>500 || typeof candidate.completeIdea!=="boolean" || !Number.isFinite(candidate.score) || candidate.score<0 || candidate.score>1)throw selectionInvalid();
        const start=indexes.get(candidate.startCueId),end=indexes.get(candidate.endCueId),duration=cues[end].endMs-cues[start].startMs;
        let code=!owned.has(candidate.startCueId)?"context_start":end<start?"reversed_range":!candidate.completeIdea?"incomplete_idea":duration<limits.minSeconds*1000 || duration>limits.maxSeconds*1000?"duration_out_of_bounds":null;
        if(!code && cues.slice(start,end+1).some(cue=>!provided.has(cue.id)))code="unprovided_content";
        if(code){rejected.push({startCueId:candidate.startCueId,endCueId:candidate.endCueId,code});continue;}
        const selected=cues.slice(start,end+1),contentHash=hashInput(selected.map(cue=>cue.sourceText).join(" ").normalize("NFKC").toLocaleLowerCase("und").replace(/[^\p{L}\p{N}]/gu,""));
        clips.push({...candidate,title:candidate.title.trim(),reason:candidate.reason.trim(),startMs:cues[start].startMs,endMs:cues[end].endMs,cueIds:selected.map(cue=>cue.id),contentHash,windowOrdinal:window.ordinal});
    }
    return {clips,rejected};
};
export const rankCandidates=(batches,{requestedCount,sourceChecksum,configHash})=>{
    const candidates=batches.flatMap(batch=>batch.clips).sort((a,b)=>b.score-a.score || a.startMs-b.startMs || a.endMs-b.endMs || a.startCueId.localeCompare(b.startCueId));
    const clips=[];let duplicateCount=0;
    for(const candidate of candidates){
        if(clips.some(clip=>Math.min(clip.endMs,candidate.endMs)>Math.max(clip.startMs,candidate.startMs) || clip.cueIds.join(",")===candidate.cueIds.join(",") || (candidate.contentHash && clip.contentHash===candidate.contentHash))){duplicateCount++;continue;}
        if(clips.length<requestedCount)clips.push({...candidate,id:`clip_${hashInput({sourceChecksum,configHash,startCueId:candidate.startCueId,endCueId:candidate.endCueId}).slice(0,24)}`});
    }
    return {clips,requestedCount,selectedCount:clips.length,shortfall:requestedCount-clips.length,shortfallReason:clips.length<requestedCount?"insufficient_valid_nonoverlapping_candidates":null,duplicateCount,rejected:batches.flatMap(batch=>batch.rejected)};
};
