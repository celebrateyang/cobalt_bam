import {agentError} from "../db/video-agent.js";
import {hashInput} from "./plans.js";
import {joinWordText} from "./transcript-merge.js";
import {NORMALIZE_CONFIG} from "./normalize-config.js";

const invalid=()=>agentError("VIDEO_AGENT_SUBTITLE_TIMELINE_INVALID",422,"Invalid subtitle timeline; review source transcription");
const wordSegmenter=new Intl.Segmenter(undefined,{granularity:"word"}),graphemeSegmenter=new Intl.Segmenter(undefined,{granularity:"grapheme"});
const clean=text=>text.normalize("NFC").replace(/[\u0000-\u001f\u007f]/gu," ").replace(/\s+/gu," ").trim();
export const textUnits=text=>[...text].reduce((sum,c)=>sum+(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u.test(c)?2:1),0);
const wrap=(text,config)=>{
    const lines=[];let line="";
    for(const token of wordSegmenter.segment(text)){
        const pieces=textUnits(token.segment)>config.lineUnits?[...graphemeSegmenter.segment(token.segment)].map(item=>item.segment):[token.segment];
        for(const segment of pieces){
            if(line && textUnits(line+segment)>config.lineUnits){if(line.trim())lines.push(line.trim());line="";}
            line+=segment;
        }
    }
    if(line.trim())lines.push(line.trim());
    if(lines.length>config.maxLines)throw agentError("VIDEO_AGENT_SUBTITLE_TEXT_TOO_WIDE",422,"A timed word exceeds subtitle width; review source transcription");
    return lines;
};
const fits=(words,config)=>{
    const text=joinWordText(words);if(textUnits(text)>config.lineUnits*config.maxLines)return false;
    try{wrap(text,config);return true;}catch(error){if(error.code==="VIDEO_AGENT_SUBTITLE_TEXT_TOO_WIDE")return false;throw error;}
};
export const normalizeTranscript=(transcript,{sourceChecksum,durationMs,config=NORMALIZE_CONFIG}={})=>{
    if(transcript?.version!=="transcript-v1" || transcript.sourceChecksum!==sourceChecksum || transcript.durationMs!==durationMs || !Number.isSafeInteger(durationMs) || durationMs<=0 || durationMs>3600000 || !Array.isArray(transcript.segments) || !transcript.segments.length || transcript.segments.length>42000)throw invalid();
    const words=[],ids=new Set(),warnings=[];
    for(const segment of transcript.segments){
        if(typeof segment.id!=="string" || !Array.isArray(segment.words) || !segment.words.length)throw invalid();
        if(segment.alignmentWarning)warnings.push({code:"source_alignment_warning",segmentId:segment.id,reason:segment.alignmentWarning});
        for(const word of segment.words){
            if(typeof word.id!=="string" || ids.has(word.id) || typeof word.text!=="string" || word.text.length>2048 || !["word","estimated"].includes(word.timingQuality) || !Number.isSafeInteger(word.startMs) || !Number.isSafeInteger(word.endMs) || word.startMs<0 || word.endMs>durationMs || word.endMs<=word.startMs)throw invalid();
            ids.add(word.id);const text=clean(word.text);if(!text)throw invalid();
            words.push({...word,text,segmentId:segment.id,speakerLocalId:segment.speakerLocalId ?? null});
        }
    }
    if(words.length>80000)throw invalid();
    words.sort((a,b)=>a.startMs-b.startMs || a.endMs-b.endMs || a.id.localeCompare(b.id));
    // Estimated words inherit segment timestamps, so adjacent segments can overlap
    // even when their word order is unambiguous. Keep every word and flag the repair.
    // Precise word timing and larger overlaps still require source review.
    for(let i=1;i<words.length;i++)if(words[i].startMs<words[i-1].endMs){
        const previous=words[i-1],current=words[i],overlap=previous.endMs-current.startMs;
        const estimatedBoundary=previous.segmentId!==current.segmentId && previous.timingQuality==="estimated" && current.timingQuality==="estimated";
        if(overlap>(estimatedBoundary?500:100) || current.startMs<=previous.startMs)throw invalid();
        previous.endMs=current.startMs;previous.timingQuality="estimated";
        warnings.push({code:estimatedBoundary && overlap>100?"estimated_segment_overlap_clipped":"timing_jitter_clipped",wordId:previous.id});
    }
    const groups=[];let group=[];
    const flush=()=>{if(group.length)groups.push(group);group=[];};
    for(const word of words){
        const last=group.at(-1),candidate=[...group,word];
        if(last && (last.speakerLocalId!==word.speakerLocalId || word.startMs-last.endMs>=config.pauseMs || word.endMs-group[0].startMs>config.maxDurationMs || !fits(candidate,config) || (/[.!?\u3002\uff01\uff1f]$/u.test(last.text) && last.endMs-group[0].startMs>=config.minDurationMs)))flush();
        group.push(word);
    }
    flush();
    // Retain short interjections; merge only when timing, speaker and width allow.
    for(let i=1;i<groups.length;i++){
        const previous=groups[i-1],current=groups[i],combined=[...previous,...current];
        if((current.at(-1).endMs-current[0].startMs<config.minDurationMs || previous.at(-1).endMs-previous[0].startMs<config.minDurationMs) && current[0].speakerLocalId===previous[0].speakerLocalId && current[0].startMs-previous.at(-1).endMs<config.pauseMs && current.at(-1).endMs-previous[0].startMs<=config.maxDurationMs && fits(combined,config)){groups[i-1]=combined;groups.splice(i,1);i--;}
    }
    const cues=groups.map(group=>{
        const sourceText=joinWordText(group),startMs=group[0].startMs,endMs=group.at(-1).endMs,flags=[];
        if(endMs-startMs<config.minDurationMs)flags.push("short_cue");
        if(endMs-startMs>config.maxDurationMs)flags.push("long_timed_word");
        if(textUnits(sourceText)/((endMs-startMs)/1000)>config.readingUnitsPerSecond)flags.push("reading_speed");
        const lexical=group.map(word=>word.text.toLocaleLowerCase("und").replace(/[^\p{L}\p{N}]/gu,"")).filter(Boolean);
        if(lexical.length>=4 && new Set(lexical).size===1)flags.push("repetition_candidate");
        return {id:`cue_${hashInput({config,sourceChecksum,wordIds:group.map(word=>word.id)}).slice(0,24)}`,sourceText,lines:wrap(sourceText,config),startMs,endMs,wordIds:group.map(word=>word.id),segmentIds:[...new Set(group.map(word=>word.segmentId))],speakerLocalId:group[0].speakerLocalId,timingQuality:group.every(word=>word.timingQuality==="word")?"word":"estimated",flags};
    });
    if(cues.some((cue,i)=>!cue.sourceText || cue.endMs<=cue.startMs || (i && cue.startMs<cues[i-1].endMs)))throw invalid();
    return {version:"normalized-transcript-v1",sourceChecksum,durationMs,config,sourceConfigHash:transcript.configHash,segments:transcript.segments,cues,warnings,requiresReview:warnings.length>0 || cues.some(cue=>cue.flags.length),timingQuality:cues.every(cue=>cue.timingQuality==="word")?"word":"estimated"};
};
