import path from "node:path";
import {writeFile,unlink} from "node:fs/promises";
import {agentError} from "../db/video-agent.js";
import {hashInput} from "./plans.js";
import {validateTranslatedClips} from "./translated-contract.js";
import {renderSrt,renderVtt,renderAss} from "../ai-video/subtitles.js";
import {SUBTITLE_CONFIG} from "./delivery-config.js";
export const buildSourceClipCues=(value,clip,mode)=>{
    const byId=new Map(value.cues.map(cue=>[cue.id,cue]));
    const wrap=text=>{
        const lines=[];let line="",units=0;
        for(const {segment} of new Intl.Segmenter(undefined,{granularity:"grapheme"}).segment(text)){
            const width=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u.test(segment)?2:[...segment].length;
            if(units+width>32 && line){lines.push(line.trim());line="";units=0;}line+=segment;units+=width;
        }
        if(line.trim())lines.push(line.trim());return lines.join("\n");
    };
    return clip.cueIds.flatMap(id=>{const cue=byId.get(id),source=wrap(cue.sourceText).split("\n"),translated=wrap(cue.translatedText).split("\n"),perLanguage=mode==="bilingual"?1:2,count=Math.max(1,Math.ceil(translated.length/perLanguage),mode==="bilingual"?source.length:1);
        if(count>Math.floor((cue.endMs-cue.startMs)/200))throw agentError("VIDEO_AGENT_SUBTITLE_UNREADABLE",422,"Translation exceeds readable subtitle budget");
        const partition=(lines,index)=>lines.slice(Math.floor(index*lines.length/count),Math.floor((index+1)*lines.length/count)).join("\n");
        return Array.from({length:count},(_,index)=>({id:count===1?id:`${id}_part${index}`,startMs:cue.startMs-clip.startMs+Math.round((cue.endMs-cue.startMs)*index/count),endMs:cue.startMs-clip.startMs+Math.round((cue.endMs-cue.startMs)*(index+1)/count),text:mode==="bilingual"?[partition(source,index),partition(translated,index)].filter(Boolean).join("\n"):partition(translated,index),timingQuality:count>1?"estimated":cue.timingQuality})).filter(cue=>cue.text);
    });
};
export const subtitleHandler=async ctx=>{
    const {claim,dependencies,signal,readArtifact,artifact,fileArtifact,readFileArtifact,commitCheckpoint,workDir}=ctx;
    const config={...SUBTITLE_CONFIG,...claim.run.plan.subtitles};if(hashInput(config)!==hashInput(claim.step.input_snapshot.config))throw agentError("VIDEO_AGENT_SUBTITLE_CONFIG_CHANGED",409,"Subtitle configuration changed");
    const source=claim.run.source_snapshot,ref=dependencies.find(step=>step.stage==="translate_selected")?.checkpoint?.translatedClipsRef;
    const value=validateTranslatedClips(await readArtifact(ref,{kind:"transcript"}),{sourceChecksum:source.checksum,durationMs:source.durationMs,targetLanguage:claim.run.plan.targetLanguage,...claim.run.plan.clips});
    const configHash=hashInput({config,ref}),checkpoint=ctx.checkpoint?.configHash===configHash?ctx.checkpoint:{configHash,clips:[]};
    for(const clip of value.clips){signal.throwIfAborted();const existing=checkpoint.clips.find(item=>item.id===clip.id);if(existing){for(const [format,asset] of Object.entries(existing.subtitles))await readFileArtifact(asset.id,undefined,{kind:`subtitle_${format}`,maxBytes:2*1024*1024});continue;}
        const cues=buildSourceClipCues(value,clip,config.mode),subtitles={},assets=[];
        const vttCues=cues.map(cue=>({...cue,text:cue.text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}));
        const text={srt:renderSrt(cues),vtt:renderVtt(vttCues),ass:renderAss(cues,{bilingual:config.mode==="bilingual"})};
        for(const format of ["srt","vtt","ass"]){const filename=path.join(workDir,`subtitle.${format}`);await writeFile(filename,text[format],"utf8");try{subtitles[format]=await fileArtifact(filename,{kind:`subtitle_${format}`,maxBytes:2*1024*1024});assets.push(subtitles[format]);}finally{await unlink(filename);}}
        const {cueIds,...metadata}=clip;
        checkpoint.clips.push({...metadata,sourceCueCount:cueIds.length,subtitles,estimatedSubtitleTiming:cues.some(cue=>cue.timingQuality==="estimated")});await commitCheckpoint({checkpoint,assets,outputRefs:checkpoint.clips.flatMap(item=>Object.values(item.subtitles).map(asset=>asset.id))});
    }
    const manifest=await artifact({version:"subtitle-clips-v1",sourceChecksum:source.checksum,configHash,clips:checkpoint.clips,requiresReview:!!value.requiresReview || checkpoint.clips.some(clip=>clip.estimatedSubtitleTiming)});
    return {checkpoint:{...checkpoint,subtitleClipsRef:manifest.id},assets:[manifest],outputRefs:[manifest.id,...checkpoint.clips.flatMap(item=>Object.values(item.subtitles).map(asset=>asset.id))]};
};
