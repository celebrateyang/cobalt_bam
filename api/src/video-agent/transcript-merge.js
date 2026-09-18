import {agentError} from "../db/video-agent.js";
import {hashInput} from "./plans.js";

const invalid=()=>agentError("VIDEO_AGENT_ASR_TIMING_INVALID",422,"Invalid ASR timing output");
const stableId=(type,seed)=>`${type}_${hashInput(seed).slice(0,24)}`;
const key=text=>text.normalize("NFKC").toLocaleLowerCase("und").replace(/[^\p{L}\p{N}]/gu,"");
export const joinWordText=words=>words.reduce((text,word)=>{
    const value=word.text;
    if(!text || /^\s|^[.,!?;:\u3001\u3002\uff0c\uff01\uff1f]/u.test(value) || /\s$|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]$/u.test(text) || /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u.test(value))return text+value;
    return text+" "+value;
},"").trim();

const times=(item,durationMs)=>{
    if(!item || [item.start,item.end].some(value=>!["number","string"].includes(typeof value) || (typeof value==="string" && !value.trim())))throw invalid();
    const start=Number(item.start)*1000,end=Number(item.end)*1000;
    if(!Number.isFinite(start) || !Number.isFinite(end) || end<=start || start < -200 || end>durationMs+200)throw invalid();
    const startMs=Math.max(0,Math.round(start)),endMs=Math.min(durationMs,Math.round(end));
    if(endMs<=startMs)throw invalid();return {startMs,endMs};
};
const estimatedWords=(text,start,end)=>{
    const parts=[...new Intl.Segmenter(undefined,{granularity:"word"}).segment(text)].map(part=>part.segment).filter(part=>part.trim());
    const tokens=[];for(const part of parts){if(!/[\p{L}\p{N}]/u.test(part) && tokens.length)tokens[tokens.length-1]+=part;else tokens.push(part);}
    const total=tokens.reduce((sum,token)=>sum+[...token].length,0);let used=0;
    return tokens.map(token=>{const a=start+(end-start)*used/total;used+=[...token].length;return {word:token,start:a/1000,end:(start+(end-start)*used/total)/1000};});
};

export const normalizeAsrChunk=(raw,chunk,{sourceChecksum,configHash}={})=>{
    if(!raw || typeof raw!=="object" || Array.isArray(raw))throw invalid();
    const durationMs=chunk.processingEndMs-chunk.processingStartMs;
    if(!Array.isArray(raw.segments) || raw.segments.length>6000 || (raw.words!==undefined && (!Array.isArray(raw.words) || raw.words.length>20000)))throw invalid();
    const segments=[];let wordTotal=0;
    raw.segments.forEach((segment,index)=>{
        if(!segment || typeof segment.text!=="string" || segment.text.length>32768)throw invalid();
        const text=segment.text.trim();if(!text)return;
        const segmentTime=times(segment,durationMs);
        let candidates=segment.words;
        if(candidates!==undefined && (!Array.isArray(candidates) || candidates.length>20000))throw invalid();
        if(!candidates?.length && raw.words?.length)candidates=raw.words.filter(word=>{
            const wordTime=times(word,durationMs),mid=(wordTime.startMs+wordTime.endMs)/2;
            return mid>=segmentTime.startMs && mid<segmentTime.endMs;
        });
        let alignmentWarning=null;
        if(candidates?.length){
            const texts=candidates.map(word=>{const value=word.word ?? word.text;if(typeof value!=="string")throw invalid();return {text:value};});
            if(key(joinWordText(texts))!==key(text)){candidates=null;alignmentWarning="word_text_mismatch";}
        }
        const timingQuality=candidates?.length?"word":"estimated";
        if(!candidates?.length)candidates=estimatedWords(text,segmentTime.startMs,segmentTime.endMs);
        wordTotal+=candidates.length;if(wordTotal>20000)throw invalid();
        const seed={sourceChecksum,configHash,chunkOrdinal:chunk.ordinal,segmentIndex:index};
        const words=[];
        candidates.forEach((word,wordIndex)=>{
            const value=word.word ?? word.text;
            if(typeof value!=="string" || value.length>2048)throw invalid();if(!value.trim())return;
            const local=times(word,durationMs),asrStartMs=chunk.processingStartMs+local.startMs,asrEndMs=chunk.processingStartMs+local.endMs;
            const mid=(asrStartMs+asrEndMs)/2;
            if(mid<chunk.ownershipStartMs || mid>=chunk.ownershipEndMs)return;
            const startMs=Math.max(chunk.ownershipStartMs,asrStartMs),endMs=Math.min(chunk.ownershipEndMs,asrEndMs);
            if(endMs<=startMs)return;
            words.push({id:stableId("word",{...seed,wordIndex}),text:value,startMs,endMs,asrStartMs,asrEndMs,
                timingQuality,boundaryClipped:startMs!==asrStartMs || endMs!==asrEndMs});
        });
        if(!words.length)return;
        words.sort((a,b)=>a.startMs-b.startMs || a.endMs-b.endMs);
        segments.push({id:stableId("segment",seed),chunkOrdinal:chunk.ordinal,sourceText:joinWordText(words),asrSegmentText:text,alignmentWarning,startMs:words[0].startMs,endMs:Math.max(...words.map(word=>word.endMs)),
            speakerLocalId:typeof segment.speaker==="string"?`chunk-${chunk.ordinal}:${segment.speaker.slice(0,128)}`:null,timingQuality,words});
    });
    return segments;
};

// Adjacent chunks only. Require actual ASR-time overlap so deliberate repeated
// words with distinct times, including repetitions inside one chunk, are retained.
export const mergeChunkTranscripts=(parts,{durationMs,sourceChecksum,configHash}={})=>{
    const segments=[],recent=[];let duplicateWords=0,totalWords=0;
    for(const part of parts){
        for(const segment of part){
            const kept=[];
            for(const word of segment.words){
                const duplicate=recent.find(previous=>{
                    if(previous.chunkOrdinal!==segment.chunkOrdinal-1 || !key(word.text) || key(previous.text)!==key(word.text))return false;
                    const overlap=Math.min(previous.asrEndMs,word.asrEndMs)-Math.max(previous.asrStartMs,word.asrStartMs);
                    const shorter=Math.min(previous.asrEndMs-previous.asrStartMs,word.asrEndMs-word.asrStartMs);
                    return overlap>0 && overlap>=shorter*.5 && Math.abs((previous.asrStartMs+previous.asrEndMs-word.asrStartMs-word.asrEndMs)/2)<=500;
                });
                if(duplicate){duplicateWords++;continue;}
                kept.push(word);recent.push({...word,chunkOrdinal:segment.chunkOrdinal});
                if(recent.length>100)recent.shift();totalWords++;if(totalWords>80000)throw invalid();
            }
            if(kept.length)segments.push({...segment,words:kept,sourceText:joinWordText(kept),startMs:kept[0].startMs,endMs:Math.max(...kept.map(word=>word.endMs))});
        }
    }
    segments.sort((a,b)=>a.startMs-b.startMs || a.endMs-b.endMs || a.id.localeCompare(b.id));
    if(segments.some(segment=>!segment.sourceText || segment.startMs<0 || segment.endMs>durationMs || segment.endMs<=segment.startMs))throw invalid();
    if(!segments.length)throw agentError("VIDEO_AGENT_NO_SPEECH",422,"No valid speech in source");
    return {version:"transcript-v1",sourceChecksum,configHash,durationMs,duplicateWords,segments,
        timingQuality:segments.every(segment=>segment.timingQuality==="word")?"word":"estimated"};
};
