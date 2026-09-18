import {agentError} from "../db/video-agent.js";

// Task 6 must validate this contract before building subtitle/export assets.
export const validateTranslatedClips=(value,{sourceChecksum,durationMs,targetLanguage,minSeconds=15,maxSeconds=90}={})=>{
    const invalid=()=>{throw agentError("VIDEO_AGENT_TRANSLATED_CONTRACT_INVALID",422,"Invalid translated clip handoff");};
    if(value?.version!=="translated-clips-v1" || value.sourceChecksum!==sourceChecksum || value.durationMs!==durationMs || value.config?.targetLanguage!==targetLanguage || !Array.isArray(value.clips) || !value.clips.length || value.clips.length>5 || !Array.isArray(value.cues) || !value.cues.length || value.cues.length>80000)invalid();
    const byId=new Map(),needed=new Set(),clipIds=new Set();
    for(const [index,cue] of value.cues.entries()){
        if(typeof cue.id!=="string" || !cue.id || byId.has(cue.id) || typeof cue.sourceText!=="string" || !cue.sourceText.trim() || typeof cue.translatedText!=="string" || !cue.translatedText.trim() || cue.translatedText.length>2048 || /[\u0000-\u001f\u007f]/u.test(cue.translatedText) || !Number.isSafeInteger(cue.startMs) || !Number.isSafeInteger(cue.endMs) || cue.startMs<0 || cue.endMs>durationMs || cue.endMs<=cue.startMs || (index && cue.startMs<value.cues[index-1].endMs))invalid();
        byId.set(cue.id,{cue,index});
    }
    for(const clip of value.clips){
        if(typeof clip.id!=="string" || !clip.id || clipIds.has(clip.id) || !Array.isArray(clip.cueIds) || !clip.cueIds.length || new Set(clip.cueIds).size!==clip.cueIds.length || clip.cueIds.some(id=>!byId.has(id)))invalid();
        clipIds.add(clip.id);const selected=clip.cueIds.map(id=>byId.get(id)),span=clip.endMs-clip.startMs;
        if(!Number.isSafeInteger(clip.startMs) || !Number.isSafeInteger(clip.endMs) || clip.startMs!==selected[0].cue.startMs || clip.endMs!==selected.at(-1).cue.endMs || span<minSeconds*1000 || span>maxSeconds*1000 || selected.some((item,i)=>i && item.index!==selected[i-1].index+1))invalid();
        clip.cueIds.forEach(id=>needed.add(id));
    }
    if(needed.size!==byId.size || value.clips.some((clip,i)=>value.clips.slice(0,i).some(previous=>Math.min(previous.endMs,clip.endMs)>Math.max(previous.startMs,clip.startMs))))invalid();
    return value;
};
