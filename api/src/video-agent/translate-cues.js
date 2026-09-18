import {agentError} from "../db/video-agent.js";
import {textUnits} from "./normalize-transcript.js";
const invalid=()=>agentError("VIDEO_AGENT_TRANSLATION_FORMAT_INVALID",422,"Translation IDs or text are invalid");
export const prepareTranslation=(selected,transcript,config)=>{
    if(!Array.isArray(selected.clips) || selected.clips.length>5 || !Array.isArray(transcript.cues))throw invalid();
    const byId=new Map(transcript.cues.map((cue,i)=>[cue.id,{...cue,index:i}]));if(byId.size!==transcript.cues.length)throw invalid();
    const needed=new Set();for(const clip of selected.clips){
        if(!Array.isArray(clip.cueIds) || !clip.cueIds.length || clip.cueIds.some(id=>!byId.has(id)))throw invalid();
        const items=clip.cueIds.map(id=>byId.get(id));
        if(items[0].startMs!==clip.startMs || items.at(-1).endMs!==clip.endMs || items.some((cue,i)=>i && cue.index!==items[i-1].index+1))throw invalid();
        clip.cueIds.forEach(id=>needed.add(id));
    }
    const cues=transcript.cues.filter(cue=>needed.has(cue.id));
    if(cues.some(cue=>typeof cue.sourceText!=="string" || !cue.sourceText.trim() || !Number.isSafeInteger(cue.startMs) || !Number.isSafeInteger(cue.endMs) || cue.startMs<0 || cue.endMs>transcript.durationMs || cue.endMs<=cue.startMs))throw invalid();
    const context=items=>{
        const ids=new Set(items.map(item=>item.cueId)),output=new Map();
        for(const item of [items[0],items.at(-1)]){const index=byId.get(item.cueId).index;for(const offset of [-2,-1,1,2]){const cue=transcript.cues[index+offset];if(cue && !ids.has(cue.id))output.set(cue.id,{cueId:cue.id,text:cue.sourceText});}}
        return [...output.values()];
    };
    const batches=[];let items=[];
    const flush=()=>{if(items.length){const batch={id:`batch-${batches.length}`,items,context:context(items)};if(Buffer.byteLength(JSON.stringify({...batch,glossary:config.glossary}))>config.maxInputBytes)throw invalid();batches.push(batch);items=[];}};
    for(const cue of cues){const item={cueId:cue.id,text:cue.sourceText,startMs:cue.startMs,endMs:cue.endMs},size=Buffer.byteLength(JSON.stringify([...items,item]));
        if(items.length && (size>config.maxBatchBytes || Math.ceil(size/3)>config.maxEstimatedTokens || items.length>=config.maxCues))flush();
        if(Buffer.byteLength(JSON.stringify(item))>config.maxBatchBytes)throw invalid();items.push(item);
    }
    flush();if(batches.length>config.maxNodes)throw invalid();
    return {cues,batches};
};
export const validateTranslations=(value,batch,config)=>{
    if(!value || Array.isArray(value) || Object.keys(value).join(",")!=="translations" || !Array.isArray(value.translations) || value.translations.length!==batch.items.length)throw invalid();
    const expected=new Map(batch.items.map(item=>[item.cueId,item])),seen=new Set(),translations=[];
    for(const item of value.translations){
        if(!item || Object.keys(item).sort().join(",")!=="cueId,translatedText" || !expected.has(item.cueId) || seen.has(item.cueId) || typeof item.translatedText!=="string" || !item.translatedText.trim() || item.translatedText.length>2048 || /[\u0000-\u001f\u007f]/u.test(item.translatedText))throw invalid();
        seen.add(item.cueId);const source=expected.get(item.cueId),translatedText=item.translatedText.normalize("NFC").trim(),flags=[];
        const numbers=text=>[...text.matchAll(/\d+(?:[.,]\d+)*/gu)].map(match=>match[0]).sort().join("|");
        if(numbers(source.text)!==numbers(translatedText))flags.push("numbers_changed");
        for(const term of config.glossary)if(source.text.toLocaleLowerCase("und").includes(term.source.toLocaleLowerCase("und")) && !translatedText.toLocaleLowerCase("und").includes(term.target.toLocaleLowerCase("und")))flags.push("glossary_term_missing");
        if(translatedText===source.text && config.sourceLanguage!==config.targetLanguage)flags.push("unchanged_translation");
        const scripts={zh:/\p{Script=Han}/u,ja:/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,ko:/\p{Script=Hangul}/u,ru:/\p{Script=Cyrillic}/u,th:/\p{Script=Thai}/u};
        if(scripts[config.targetLanguage] && (translatedText.match(/\p{L}/gu) || []).length>=12 && !scripts[config.targetLanguage].test(translatedText))flags.push("target_script_mismatch");
        if(translatedText.length>Math.max(120,source.text.length*4))flags.push("translation_length");
        if(textUnits(translatedText)/((source.endMs-source.startMs)/1000)>20)flags.push("reading_speed");
        translations.push({cueId:item.cueId,translatedText,flags:[...new Set(flags)]});
    }
    return translations.sort((a,b)=>batch.items.findIndex(item=>item.cueId===a.cueId)-batch.items.findIndex(item=>item.cueId===b.cueId));
};
