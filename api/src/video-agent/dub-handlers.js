import path from "node:path";
import {writeFile,unlink} from "node:fs/promises";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import {agentError} from "../db/video-agent.js";
import {renderAss,renderSrt,renderVtt} from "../ai-video/subtitles.js";
import {hashInput} from "./plans.js";
import {getTtsConfig,estimateRunTtsBudget} from "./tts-config.js";
import {ttsAdapter} from "./tts-adapter.js";
import {validateTranslatedClips} from "./translated-contract.js";
import {applyResultEdits} from "./subtitle-handler.js";
import {runAbortableProcess} from "./worker-media.js";
import {getRenderLayout} from "./delivery-config.js";

const dubConfig=(plan,stage)=>({dubbing:plan.dubbing,budget:estimateRunTtsBudget(plan.clips,getTtsConfig()),tts:getTtsConfig(),...(stage==="build_dub_subtitles"?{video:plan.video}:{}),...(plan.edits?{edits:plan.edits}:{})});
const assertConfig=claim=>{
    const stage=claim.step.stage || (claim.step.input_snapshot.config.video?"build_dub_subtitles":null);
    if(!claim.run.plan.dubbing?.enabled || hashInput(dubConfig(claim.run.plan,stage))!==hashInput(claim.step.input_snapshot.config))
        throw agentError("VIDEO_AGENT_DUB_CONFIG_CHANGED",409,"Dubbing configuration changed; create a new run");
    return getTtsConfig();
};
const sourceText=text=>text.replace(/\[(?:music|applause|laughter|noise|silence|música|aplausos|musique|applaudissements|musik|音乐|掌声|笑声|音楽|拍手|음악|박수|музыка|аплодисменты|ดนตรี|เสียงปรบมือ|âm nhạc|tiếng vỗ tay)\]/giu,"").replace(/\s+/gu," ").trim();
const refs=clips=>clips.flatMap(clip=>[clip.ttsAudio?.id,clip.dubAudio?.id,...Object.values(clip.subtitles || {}).map(asset=>asset.id)].filter(Boolean));
export const fitDubSpeed=(actualMs,spanMs)=>{
    if(!Number.isSafeInteger(actualMs) || actualMs<=0 || actualMs>180000 || !Number.isSafeInteger(spanMs) || spanMs<15000 || spanMs>90000)
        throw agentError("VIDEO_AGENT_DUB_AUDIO_INVALID",422,"Invalid TTS audio duration");
    const required=actualMs/spanMs;
    if(required>1.3)throw agentError("VIDEO_AGENT_DUB_TOO_LONG",422,"Speech exceeds the 1.3x speed limit; shorten the script");
    return Math.max(0.9,required);
};
const wrapSpeech=text=>{
    const lines=[];let line="",units=0;
    for(const {segment} of new Intl.Segmenter(undefined,{granularity:"grapheme"}).segment(text)){
        const width=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u.test(segment)?2:[...segment].length;
        if(units+width>32 && line){lines.push(line.trim());line="";units=0;}
        line+=segment;units+=width;
    }
    if(line.trim())lines.push(line.trim());return lines;
};

export const prepareDubTextHandler=async({claim,dependencies,signal,readArtifact,artifact})=>{
    signal.throwIfAborted();const config=assertConfig(claim),source=claim.run.source_snapshot;
    const ref=dependencies.find(step=>step.stage==="translate_selected")?.checkpoint?.translatedClipsRef;
    if(!ref)throw agentError("VIDEO_AGENT_DUB_INPUT_INVALID",409,"Translated clips unavailable");
    const translated=validateTranslatedClips(await readArtifact(ref,{kind:"transcript"}),{
        sourceChecksum:source.checksum,durationMs:source.durationMs,targetLanguage:claim.run.plan.targetLanguage,...claim.run.plan.clips});
    const value=applyResultEdits(translated,claim.run.plan.edits),byId=new Map(value.cues.map(cue=>[cue.id,cue]));
    const clips=value.clips.map(clip=>{
        const cues=clip.cueIds.map(id=>{const cue=byId.get(id);return {id,sourceText:cue.sourceText,translatedText:cue.translatedText,
            spokenText:sourceText(cue.translatedText)};}).filter(cue=>cue.spokenText);
        const spokenText=cues.map(cue=>cue.spokenText).join(" ");
        if(!spokenText || Array.from(spokenText).length>4096 || Buffer.byteLength(spokenText,"utf8")>8192)
            throw agentError("VIDEO_AGENT_DUB_TEXT_INVALID",422,"Clip speech text is empty or exceeds TTS input limit");
        return {...clip,cues,spokenText};
    });
    const chars=clips.reduce((sum,clip)=>sum+Array.from(clip.spokenText).length,0);
    const durationMs=clips.reduce((sum,clip)=>sum+clip.endMs-clip.startMs,0);
    if(chars>config.maxRunChars || durationMs>config.maxRunAudioMs)
        throw agentError("VIDEO_AGENT_TTS_BUDGET_EXCEEDED",422,"Selected clips exceed dubbing limits");
    const output=await artifact({version:"dub-text-v1",sourceChecksum:source.checksum,clips,chars,durationMs,requiresReview:value.requiresReview});
    return {checkpoint:{dubTextRef:output.id,chars,durationMs},assets:[output],outputRefs:[output.id]};
};

export const createTtsHandler=({provider=ttsAdapter}={})=>async ctx=>{
    const {claim,dependencies,signal,readArtifact,artifact,fileArtifact,readFileArtifact,commitCheckpoint,workDir}=ctx;
    const config=assertConfig(claim),ref=dependencies.find(step=>step.stage==="prepare_dub_text")?.checkpoint?.dubTextRef;
    const prepared=await readArtifact(ref);
    if(prepared.version!=="dub-text-v1" || prepared.sourceChecksum!==claim.run.source_snapshot.checksum || !Array.isArray(prepared.clips))
        throw agentError("VIDEO_AGENT_DUB_INPUT_INVALID",422,"Invalid dub text");
    const configHash=hashInput({ref,config});
    const checkpoint=ctx.checkpoint?.configHash===configHash?ctx.checkpoint:{configHash,spentChars:0,spentMicroUsd:0,clips:[]};
    if(!Number.isSafeInteger(checkpoint.spentChars) || checkpoint.spentChars<0 || checkpoint.spentChars>config.maxRunChars ||
        !Number.isSafeInteger(checkpoint.spentMicroUsd) || checkpoint.spentMicroUsd<0 || checkpoint.spentMicroUsd>config.maxRunMicroUsd || !Array.isArray(checkpoint.clips))
        throw agentError("VIDEO_AGENT_TTS_CHECKPOINT_INVALID",409,"Invalid TTS budget checkpoint");
    for(const clip of prepared.clips){
        signal.throwIfAborted();const existing=checkpoint.clips.find(item=>item.id===clip.id);
        if(existing){await readFileArtifact(existing.ttsAudio.id,undefined,{kind:"tts_audio",maxBytes:16*1024*1024});continue;}
        const estimate=provider.estimate(clip.spokenText,config);
        if(checkpoint.spentChars+estimate.chars>config.maxRunChars || checkpoint.spentMicroUsd+estimate.estimatedMicroUsd>config.maxRunMicroUsd)
            throw agentError("VIDEO_AGENT_TTS_BUDGET_EXCEEDED",422,"Run TTS budget exhausted");
        // Reserve before the external call. A lost response still consumes the attempt budget.
        checkpoint.spentChars+=estimate.chars;checkpoint.spentMicroUsd+=estimate.estimatedMicroUsd;
        await commitCheckpoint({checkpoint,assets:[],outputRefs:refs(checkpoint.clips),provider:config.provider,model:config.model});
        const result=await provider.synthesize({text:clip.spokenText,voiceId:claim.run.plan.dubbing.voiceId,signal,config,
            budget:{remainingChars:config.maxRunChars-checkpoint.spentChars+estimate.chars,
                remainingMicroUsd:config.maxRunMicroUsd-checkpoint.spentMicroUsd+estimate.estimatedMicroUsd}});
        const filename=path.join(workDir,"speech.mp3");await writeFile(filename,result.audio);
        try{
            const ttsAudio=await fileArtifact(filename,{kind:"tts_audio",maxBytes:16*1024*1024});
            checkpoint.clips.push({id:clip.id,ttsAudio,ttsChars:estimate.chars,ttsEstimatedMicroUsd:estimate.estimatedMicroUsd,
                ...(typeof result.requestId==="string" && /^[A-Za-z0-9_-]{1,200}$/.test(result.requestId)?{ttsRequestId:result.requestId}:{})});
            await commitCheckpoint({checkpoint,assets:[ttsAudio],outputRefs:refs(checkpoint.clips),provider:config.provider,model:config.model});
        }finally{await unlink(filename).catch(()=>{});}
    }
    const completed=new Map(checkpoint.clips.map(clip=>[clip.id,clip]));
    const manifest=await artifact({version:"tts-clips-v1",sourceChecksum:prepared.sourceChecksum,
        clips:prepared.clips.map(clip=>({...clip,...completed.get(clip.id)})),
        spentChars:checkpoint.spentChars,spentMicroUsd:checkpoint.spentMicroUsd,requiresReview:prepared.requiresReview});
    return {checkpoint:{...checkpoint,ttsClipsRef:manifest.id},assets:[manifest],outputRefs:[manifest.id,...refs(checkpoint.clips)],provider:config.provider,model:config.model};
};
export const ttsHandler=createTtsHandler();

export const fitDubTimelineHandler=async ctx=>{
    const {claim,dependencies,signal,readArtifact,artifact,fileArtifact,readFileArtifact,commitCheckpoint,workDir}=ctx;
    const config=assertConfig(claim),ref=dependencies.find(step=>step.stage==="tts")?.checkpoint?.ttsClipsRef;
    const value=await readArtifact(ref);
    if(value.version!=="tts-clips-v1" || value.sourceChecksum!==claim.run.source_snapshot.checksum || !value.clips?.length)
        throw agentError("VIDEO_AGENT_DUB_INPUT_INVALID",422,"Invalid TTS clips");
    const configHash=hashInput({ref,config}),checkpoint=ctx.checkpoint?.configHash===configHash?ctx.checkpoint:{configHash,clips:[]};
    for(const clip of value.clips){
        signal.throwIfAborted();const existing=checkpoint.clips.find(item=>item.id===clip.id);
        if(existing){await readFileArtifact(existing.dubAudio.id,undefined,{kind:"dub_audio",maxBytes:24*1024*1024});continue;}
        const input=path.join(workDir,"speech.mp3"),output=path.join(workDir,"dub.wav");
        try{
            await readFileArtifact(clip.ttsAudio.id,input,{kind:"tts_audio",maxBytes:16*1024*1024});
            const data=JSON.parse((await runAbortableProcess(ffprobe.path,["-v","error","-show_streams","-show_format","-of","json",input],{signal})).stdout);
            const audio=data.streams?.find(stream=>stream.codec_type==="audio"),actualMs=Math.round(Number(data.format?.duration)*1000);
            const spanMs=clip.endMs-clip.startMs;
            if(!audio)throw agentError("VIDEO_AGENT_DUB_AUDIO_INVALID",422,"Missing TTS audio stream");
            const speed=fitDubSpeed(actualMs,spanMs);
            await runAbortableProcess(ffmpeg,["-nostdin","-v","error","-y","-i",input,"-vn","-af",`atempo=${speed.toFixed(5)},aresample=48000:async=1:first_pts=0,apad,atrim=duration=${(spanMs/1000).toFixed(3)}`,
                "-ac","1","-ar","48000","-c:a","pcm_s16le",output],{signal,timeoutMs:5*60*1000});
            const fitted=JSON.parse((await runAbortableProcess(ffprobe.path,["-v","error","-show_format","-show_streams","-of","json",output],{signal})).stdout);
            const fittedMs=Math.round(Number(fitted.format?.duration)*1000);
            if(!fitted.streams?.some(stream=>stream.codec_type==="audio") || Math.abs(fittedMs-spanMs)>250)
                throw agentError("VIDEO_AGENT_DUB_AUDIO_INVALID",422,"Fitted audio duration mismatch");
            const volume=(await runAbortableProcess(ffmpeg,["-nostdin","-hide_banner","-i",output,"-af","volumedetect","-f","null","-"],{signal,captureStderr:true})).stderr;
            const peak=Number(/max_volume:\s*(-?[\d.]+) dB/u.exec(volume)?.[1]),mean=Number(/mean_volume:\s*(-?[\d.]+) dB/u.exec(volume)?.[1]);
            if(!Number.isFinite(peak) || !Number.isFinite(mean) || peak>=0 || mean< -50 || mean> -8)
                throw agentError("VIDEO_AGENT_DUB_LOUDNESS_INVALID",422,"Dub audio is silent, clipped or too loud");
            const dubAudio=await fileArtifact(output,{kind:"dub_audio",maxBytes:24*1024*1024});
            checkpoint.clips.push({id:clip.id,dubAudio,fit:{originalMs:actualMs,fittedMs,spokenDurationMs:Math.min(spanMs,Math.round(actualMs/speed)),
                speed,peakDb:peak,meanDb:mean,timingQuality:"estimated"}});
            await commitCheckpoint({checkpoint,assets:[dubAudio],outputRefs:refs(checkpoint.clips)});
        }finally{await unlink(input).catch(()=>{});await unlink(output).catch(()=>{});}
    }
    const fitted=new Map(checkpoint.clips.map(clip=>[clip.id,clip]));
    const manifest=await artifact({version:"fitted-dub-v1",sourceChecksum:value.sourceChecksum,
        clips:value.clips.map(clip=>({...clip,...fitted.get(clip.id)})),
        spentChars:value.spentChars,spentMicroUsd:value.spentMicroUsd,requiresReview:value.requiresReview});
    return {checkpoint:{...checkpoint,fittedDubRef:manifest.id},assets:[manifest],outputRefs:[manifest.id,...refs(checkpoint.clips)]};
};

export const buildDubSubtitlesHandler=async ctx=>{
    const {claim,dependencies,signal,readArtifact,artifact,fileArtifact,readFileArtifact,commitCheckpoint,workDir}=ctx;
    assertConfig(claim);const ref=dependencies.find(step=>step.stage==="fit_dub_timeline")?.checkpoint?.fittedDubRef;
    const value=await readArtifact(ref);
    if(value.version!=="fitted-dub-v1" || value.sourceChecksum!==claim.run.source_snapshot.checksum || !value.clips?.length)
        throw agentError("VIDEO_AGENT_DUB_INPUT_INVALID",422,"Invalid fitted dub");
    const configHash=hashInput({ref,mode:claim.run.plan.subtitles.mode}),checkpoint=ctx.checkpoint?.configHash===configHash?ctx.checkpoint:{configHash,clips:[]};
    for(const clip of value.clips){
        signal.throwIfAborted();const existing=checkpoint.clips.find(item=>item.id===clip.id);
        if(existing){for(const [format,asset] of Object.entries(existing.subtitles))await readFileArtifact(asset.id,undefined,{kind:`subtitle_${format}`,maxBytes:2*1024*1024});continue;}
        const spanMs=clip.fit?.spokenDurationMs,spoken=clip.cues.filter(cue=>cue.spokenText),total=spoken.reduce((sum,cue)=>sum+Array.from(cue.spokenText).length,0);
        if(!Number.isSafeInteger(spanMs) || spanMs<=0 || spanMs>clip.endMs-clip.startMs)throw agentError("VIDEO_AGENT_DUB_SUBTITLE_INVALID",422,"Invalid spoken duration");
        if(!total)throw agentError("VIDEO_AGENT_DUB_TEXT_INVALID",422,"Missing spoken cues");
        let consumed=0;
        const bilingual=claim.run.plan.subtitles.mode==="bilingual";
        const cues=spoken.flatMap((cue,index)=>{
            const startMs=Math.round(spanMs*consumed/total);consumed+=Array.from(cue.spokenText).length;
            const endMs=index===spoken.length-1?spanMs:Math.round(spanMs*consumed/total);
            const translated=wrapSpeech(cue.spokenText),original=bilingual?wrapSpeech(cue.sourceText):[];
            const count=Math.max(1,Math.ceil(translated.length/(bilingual?1:2)),bilingual?original.length:1);
            if(count>Math.floor((endMs-startMs)/200))throw agentError("VIDEO_AGENT_DUB_SUBTITLE_INVALID",422,"Dub subtitle is too dense");
            const partition=(lines,part,linesPerPart)=>lines.slice(part*linesPerPart,(part+1)*linesPerPart).join("\n");
            return Array.from({length:count},(_,part)=>({id:count===1?cue.id:`${cue.id}_part${part}`,
                startMs:startMs+Math.round((endMs-startMs)*part/count),endMs:startMs+Math.round((endMs-startMs)*(part+1)/count),
                text:bilingual?[partition(original,part,1),partition(translated,part,1)].filter(Boolean).join("\n"):partition(translated,part,2),
                timingQuality:"estimated"})).filter(item=>item.text);
        });
        if(cues.some(cue=>cue.endMs<=cue.startMs))throw agentError("VIDEO_AGENT_DUB_SUBTITLE_INVALID",422,"Dub subtitle timing is invalid");
        const vttCues=cues.map(cue=>({...cue,text:cue.text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}));
        const layout=getRenderLayout(claim.run.plan.video,claim.run.source_snapshot);if(!layout)throw agentError("VIDEO_AGENT_DUB_SUBTITLE_INVALID",422,"Source dimensions are unavailable");
        const content={srt:renderSrt(cues),vtt:renderVtt(vttCues),ass:renderAss(cues,{bilingual,width:layout.width,height:layout.height})};
        const subtitles={},assets=[];
        for(const format of ["srt","vtt","ass"]){const filename=path.join(workDir,`dub.${format}`);await writeFile(filename,content[format],"utf8");
            try{subtitles[format]=await fileArtifact(filename,{kind:`subtitle_${format}`,maxBytes:2*1024*1024});assets.push(subtitles[format]);}
            finally{await unlink(filename).catch(()=>{});}}
        const {cues:_,spokenText:__,ttsAudio:___,ttsRequestId:____,...metadata}=clip;
        checkpoint.clips.push({...metadata,subtitles,estimatedSubtitleTiming:true});
        await commitCheckpoint({checkpoint,assets,outputRefs:refs(checkpoint.clips)});
    }
    const manifest=await artifact({version:"subtitle-clips-v1",sourceChecksum:value.sourceChecksum,clips:checkpoint.clips,
        requiresReview:true,dubbing:true,spentChars:value.spentChars,spentMicroUsd:value.spentMicroUsd});
    return {checkpoint:{...checkpoint,subtitleClipsRef:manifest.id},assets:[manifest],outputRefs:[manifest.id,...refs(checkpoint.clips)]};
};
