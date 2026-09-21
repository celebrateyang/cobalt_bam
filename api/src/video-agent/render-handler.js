import path from "node:path";
import {unlink,statfs} from "node:fs/promises";
import ffmpeg from "ffmpeg-static";
import {agentError} from "../db/video-agent.js";
import {hashInput} from "./plans.js";
import {downloadVerifiedSource,runAbortableProcess} from "./worker-media.js";
import {RENDER_CONFIG,getRenderLayout} from "./delivery-config.js";
export const createRenderHandler=({download=downloadVerifiedSource,runProcess=runAbortableProcess}={})=>async ctx=>{
    const {claim,dependencies,signal,readArtifact,artifact,fileArtifact,readFileArtifact,commitCheckpoint,workDir}=ctx;
    const dubbed=!!claim.run.plan.dubbing?.enabled;
    const renderConfig={...RENDER_CONFIG,...claim.run.plan.video,...(dubbed?{dubbing:claim.run.plan.dubbing}:{})};
    if(hashInput(claim.step.input_snapshot.config)!==hashInput(renderConfig))throw agentError("VIDEO_AGENT_RENDER_CONFIG_CHANGED",409,"Render configuration changed");
    const ref=dependencies.find(step=>step.stage===(dubbed?"build_dub_subtitles":"build_subtitles"))?.checkpoint?.subtitleClipsRef,value=await readArtifact(ref),source=claim.run.source_snapshot;
    if(value.version!=="subtitle-clips-v1" || value.sourceChecksum!==source.checksum || !value.clips?.length || value.clips.length>5)throw agentError("VIDEO_AGENT_RENDER_INPUT_INVALID",422,"Invalid subtitle clips");
    const layout=getRenderLayout(claim.run.plan.video,source);if(!layout)throw agentError("VIDEO_AGENT_RENDER_INPUT_INVALID",422,"Source dimensions are unavailable");
    const configHash=hashInput({config:renderConfig,layout,ref}),checkpoint=ctx.checkpoint?.configHash===configHash?ctx.checkpoint:{configHash,clips:[]};
    let input;
    for(const clip of value.clips){
        signal.throwIfAborted();const existing=checkpoint.clips.find(item=>item.id===clip.id);if(existing){await readFileArtifact(existing.video.id,undefined,{kind:"rendered_video",maxBytes:RENDER_CONFIG.maxBytes});continue;}
        if(!Number.isSafeInteger(clip.startMs) || !Number.isSafeInteger(clip.endMs) || clip.startMs<0 || clip.endMs>source.durationMs || clip.endMs-clip.startMs<15000 || clip.endMs-clip.startMs>90000)throw agentError("VIDEO_AGENT_RENDER_INPUT_INVALID",422,"Invalid clip duration");
        if(!input){const needed=source.sizeBytes+RENDER_CONFIG.maxBytes+(dubbed?88:64)*1024*1024,fs=await statfs(workDir);if(needed>RENDER_CONFIG.scratchBytes || Number(fs.bavail)*Number(fs.bsize)<needed)throw agentError("VIDEO_AGENT_SCRATCH_SPACE",503,"Insufficient render scratch space");input=await download(claim,workDir,{signal});}
        const ass=path.join(workDir,"clip.ass"),output=path.join(workDir,"clip.mp4"),dub=path.join(workDir,"dub.wav");
        const focusX=clip.focusX===undefined?0.5:clip.focusX;
        if(typeof focusX!=="number" || !Number.isFinite(focusX) || focusX<0 || focusX>1)throw agentError("VIDEO_AGENT_RENDER_INPUT_INVALID",422,"Invalid frame focus");
        await readFileArtifact(clip.subtitles.ass.id,ass,{kind:"subtitle_ass",maxBytes:2*1024*1024});
        if(dubbed){if(!clip.dubAudio?.id)throw agentError("VIDEO_AGENT_RENDER_INPUT_INVALID",422,"Dub audio missing");
            await readFileArtifact(clip.dubAudio.id,dub,{kind:"dub_audio",maxBytes:24*1024*1024});}
        try{await runProcess(ffmpeg,["-nostdin","-v","error","-y","-threads","1","-filter_threads","1","-ss",(clip.startMs/1000).toFixed(3),"-i",input,
            ...(dubbed?["-i",dub]:[]),"-t",((clip.endMs-clip.startMs)/1000).toFixed(3),"-map","0:v:0","-map",dubbed?"1:a:0":"0:a:0",
            "-vf",layout.mode==="crop"?`scale=${layout.width}:${layout.height}:force_original_aspect_ratio=increase,crop=${layout.width}:${layout.height}:(in_w-out_w)*${focusX.toFixed(3)},setsar=1,ass=clip.ass`:
                `scale=${layout.width}:${layout.height}:force_original_aspect_ratio=decrease,setsar=1,ass=clip.ass`,
            "-af",dubbed?"aresample=async=1:first_pts=0":"aresample=async=1:first_pts=0,apad",
            "-c:v","libx264","-threads","1","-preset","veryfast","-crf","21","-pix_fmt","yuv420p","-r","30","-c:a","aac","-ar","48000","-b:a","128k","-movflags","+faststart","-fs",String(RENDER_CONFIG.maxBytes),output],{signal,cwd:workDir,timeoutMs:15*60*1000});
            const video=await fileArtifact(output,{kind:"rendered_video",maxBytes:RENDER_CONFIG.maxBytes});checkpoint.clips.push({...clip,video});await commitCheckpoint({checkpoint,assets:[video],outputRefs:checkpoint.clips.flatMap(item=>[item.video.id,...(item.dubAudio?[item.dubAudio.id]:[]),...Object.values(item.subtitles).map(asset=>asset.id)])});
        }finally{await unlink(ass).catch(()=>{});await unlink(dub).catch(()=>{});await unlink(output).catch(()=>{});}
    }
    const manifest=await artifact({version:"rendered-clips-v1",sourceChecksum:source.checksum,clips:checkpoint.clips,requiresReview:value.requiresReview});
    return {checkpoint:{...checkpoint,renderedClipsRef:manifest.id},assets:[manifest],outputRefs:[manifest.id,...checkpoint.clips.flatMap(item=>[item.video.id,...(item.dubAudio?[item.dubAudio.id]:[]),...Object.values(item.subtitles).map(asset=>asset.id)])]};
};
export const renderHandler=createRenderHandler();
