import path from "node:path";
import {writeFile,unlink} from "node:fs/promises";
import {agentError} from "../db/video-agent.js";
import {hashInput} from "./plans.js";
import {validateTranslatedClips} from "./translated-contract.js";
import {renderSrt,renderVtt,renderAss} from "../ai-video/subtitles.js";
import {SUBTITLE_CONFIG,getRenderLayout} from "./delivery-config.js";
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
    const describe=cues=>{const source=wrap(cues.map(cue=>cue.sourceText).join(" ")).split("\n"),translated=wrap(cues.map(cue=>cue.translatedText).join(" ")).split("\n"),perLanguage=mode==="bilingual"?1:2;
        return {source,translated,count:Math.max(1,Math.ceil(translated.length/perLanguage),mode==="bilingual"?source.length:1),startMs:cues[0].startMs,endMs:cues.at(-1).endMs};};
    const groups=[];let pending=[];
    for(const id of clip.cueIds){pending.push(byId.get(id));const block=describe(pending);if(block.count<=Math.floor((block.endMs-block.startMs)/200)){groups.push(pending);pending=[];}}
    if(pending.length){if(groups.length)groups.at(-1).push(...pending);else groups.push(pending);}
    return groups.flatMap(cues=>{const block=describe(cues),source=block.source,translated=block.translated,count=block.count;
        if(count>Math.floor((block.endMs-block.startMs)/200))throw agentError("VIDEO_AGENT_SUBTITLE_UNREADABLE",422,"Translation exceeds readable subtitle budget");
        const partition=(lines,index)=>lines.slice(Math.floor(index*lines.length/count),Math.floor((index+1)*lines.length/count)).join("\n");
        const id=cues.length===1?cues[0].id:`${cues[0].id}_merged_${cues.at(-1).id}`,duration=block.endMs-block.startMs;
        return Array.from({length:count},(_,index)=>({id:count===1?id:`${id}_part${index}`,startMs:block.startMs-clip.startMs+Math.round(duration*index/count),endMs:block.startMs-clip.startMs+Math.round(duration*(index+1)/count),text:mode==="bilingual"?[partition(source,index),partition(translated,index)].filter(Boolean).join("\n"):partition(translated,index),timingQuality:count>1 || cues.length>1?"estimated":cues[0].timingQuality})).filter(cue=>cue.text);
    });
};
export const applyResultEdits=(value,edits)=>{
    if(!edits)return value;
    const clips=value.clips.map(clip=>{
        const patch=edits.clips?.[clip.id];if(!patch)return clip;
        const first=clip.cueIds.indexOf(patch.startCueId || clip.cueIds[0]);
        const last=clip.cueIds.indexOf(patch.endCueId || clip.cueIds.at(-1));
        const byId=new Map(value.cues.map(cue=>[cue.id,cue]));
        if(first<0 || last<first)throw agentError("VIDEO_AGENT_EDIT_BOUNDARY_INVALID",422,"Edited clip boundary is unavailable");
        const cueIds=clip.cueIds.slice(first,last+1),startMs=byId.get(cueIds[0]).startMs,endMs=byId.get(cueIds.at(-1)).endMs;
        if(endMs-startMs<15000 || endMs-startMs>90000)throw agentError("VIDEO_AGENT_EDIT_BOUNDARY_INVALID",422,"Edited clip boundary is invalid");
        return {...clip,cueIds,startMs,endMs,title:patch.title || clip.title,...(patch.focusX!==undefined?{focusX:patch.focusX}:{})};
    });
    const selected=new Set(clips.flatMap(clip=>clip.cueIds));
    for(const id of Object.keys(edits.subtitles || {}))if(!selected.has(id))throw agentError("VIDEO_AGENT_EDIT_CUE_NOT_FOUND",422,"Edited subtitle cue is unavailable");
    return {...value,clips,cues:value.cues.map(cue=>edits.subtitles?.[cue.id]!==undefined?{...cue,translatedText:edits.subtitles[cue.id]}:cue)};
};
export const subtitleHandler=async ctx=>{
    const {claim,dependencies,signal,readArtifact,artifact,fileArtifact,readFileArtifact,commitCheckpoint,workDir}=ctx;
    const config={...SUBTITLE_CONFIG,...claim.run.plan.subtitles,video:claim.run.plan.video,...(claim.run.plan.edits?{edits:claim.run.plan.edits}:{})};if(hashInput(config)!==hashInput(claim.step.input_snapshot.config))throw agentError("VIDEO_AGENT_SUBTITLE_CONFIG_CHANGED",409,"Subtitle configuration changed");
    const source=claim.run.source_snapshot,ref=dependencies.find(step=>step.stage==="translate_selected")?.checkpoint?.translatedClipsRef;
    const value=applyResultEdits(validateTranslatedClips(await readArtifact(ref,{kind:"transcript"}),{sourceChecksum:source.checksum,durationMs:source.durationMs,targetLanguage:claim.run.plan.targetLanguage,...claim.run.plan.clips}),claim.run.plan.edits);
    const configHash=hashInput({config,ref}),checkpoint=ctx.checkpoint?.configHash===configHash?ctx.checkpoint:{configHash,clips:[]};
    for(const clip of value.clips){signal.throwIfAborted();const existing=checkpoint.clips.find(item=>item.id===clip.id);if(existing){for(const [format,asset] of Object.entries(existing.subtitles))await readFileArtifact(asset.id,undefined,{kind:`subtitle_${format}`,maxBytes:2*1024*1024});continue;}
        const cues=buildSourceClipCues(value,clip,config.mode),subtitles={},assets=[];
        const vttCues=cues.map(cue=>({...cue,text:cue.text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}));
        const layout=getRenderLayout(claim.run.plan.video,source);if(!layout)throw agentError("VIDEO_AGENT_SUBTITLE_CONFIG_CHANGED",409,"Source dimensions are unavailable");
        const text={srt:renderSrt(cues),vtt:renderVtt(vttCues),ass:renderAss(cues,{bilingual:config.mode==="bilingual",width:layout.width,height:layout.height})};
        for(const format of ["srt","vtt","ass"]){const filename=path.join(workDir,`subtitle.${format}`);await writeFile(filename,text[format],"utf8");try{subtitles[format]=await fileArtifact(filename,{kind:`subtitle_${format}`,maxBytes:2*1024*1024});assets.push(subtitles[format]);}finally{await unlink(filename);}}
        const {cueIds,...metadata}=clip;
        checkpoint.clips.push({...metadata,sourceCueCount:cueIds.length,subtitles,estimatedSubtitleTiming:cues.some(cue=>cue.timingQuality==="estimated")});await commitCheckpoint({checkpoint,assets,outputRefs:checkpoint.clips.flatMap(item=>Object.values(item.subtitles).map(asset=>asset.id))});
    }
    const manifest=await artifact({version:"subtitle-clips-v1",sourceChecksum:source.checksum,configHash,clips:checkpoint.clips,requiresReview:!!value.requiresReview || checkpoint.clips.some(clip=>clip.estimatedSubtitleTiming)});
    return {checkpoint:{...checkpoint,subtitleClipsRef:manifest.id},assets:[manifest],outputRefs:[manifest.id,...checkpoint.clips.flatMap(item=>Object.values(item.subtitles).map(asset=>asset.id))]};
};
