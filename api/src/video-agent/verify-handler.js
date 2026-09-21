import path from "node:path";
import {unlink} from "node:fs/promises";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import {agentError} from "../db/video-agent.js";
import {runAbortableProcess} from "./worker-media.js";
import {RENDER_CONFIG,VERIFY_CONFIG,getRenderLayout} from "./delivery-config.js";
import {hashInput} from "./plans.js";
export const verifyHandler=async({claim,dependencies,signal,readArtifact,readFileArtifact,artifact,workDir})=>{
    if(hashInput(claim.step.input_snapshot.config)!==hashInput(VERIFY_CONFIG))throw agentError("VIDEO_AGENT_VERIFY_CONFIG_CHANGED",409,"Verification configuration changed");
    const value=await readArtifact(dependencies.find(step=>step.stage==="render")?.checkpoint?.renderedClipsRef);
    if(value.version!=="rendered-clips-v1" || value.sourceChecksum!==claim.run.source_snapshot.checksum || !value.clips?.length || value.clips.length>5)throw agentError("VIDEO_AGENT_VERIFY_FAILED",422,"Invalid rendered clips");
    const layout=getRenderLayout(claim.run.plan.video,claim.run.source_snapshot);if(!layout)throw agentError("VIDEO_AGENT_VERIFY_FAILED",422,"Source dimensions are unavailable");
    for(const clip of value.clips){signal.throwIfAborted();const filename=path.join(workDir,"verify.mp4");
        try{await readFileArtifact(clip.video.id,filename,{kind:"rendered_video",maxBytes:RENDER_CONFIG.maxBytes});
            const data=JSON.parse((await runAbortableProcess(ffprobe.path,["-v","error","-show_format","-show_streams","-of","json",filename],{signal})).stdout),video=data.streams?.find(item=>item.codec_type==="video"),audio=data.streams?.find(item=>item.codec_type==="audio"),duration=Number(data.format?.duration)*1000;
            const span=clip.endMs-clip.startMs,videoDuration=Number(video?.duration)*1000,audioDuration=Number(audio?.duration)*1000;
            if(!Number.isSafeInteger(span) || span<15000 || span>90000 || clip.startMs<0 || clip.endMs>claim.run.source_snapshot.durationMs || video?.width!==layout.width || video?.height!==layout.height || video.codec_name!=="h264" || video.pix_fmt!=="yuv420p" || video.avg_frame_rate!=="30/1" || audio?.codec_name!=="aac" || [duration,videoDuration,audioDuration].some(time=>!Number.isFinite(time) || Math.abs(time-span)>VERIFY_CONFIG.toleranceMs) || Math.abs(videoDuration-audioDuration)>VERIFY_CONFIG.toleranceMs)throw agentError("VIDEO_AGENT_VERIFY_FAILED",422,"Invalid rendered video streams or duration");
            await runAbortableProcess(ffmpeg,["-nostdin","-v","error","-xerror","-threads","1","-i",filename,"-map","0:v:0","-map","0:a:0","-f","null","-"],{signal,timeoutMs:15*60*1000});
            for(const [format,asset] of Object.entries(clip.subtitles))await readFileArtifact(asset.id,undefined,{kind:`subtitle_${format}`,maxBytes:2*1024*1024});
            if(claim.run.plan.dubbing?.enabled){
                if(!clip.dubAudio?.id || !clip.fit || clip.fit.speed>1.3 || clip.fit.speed<0.9 || clip.fit.spokenDurationMs<=0 || clip.fit.spokenDurationMs>span || Math.abs(clip.fit.fittedMs-span)>VERIFY_CONFIG.toleranceMs)
                    throw agentError("VIDEO_AGENT_VERIFY_FAILED",422,"Dub fit report is invalid");
                await readFileArtifact(clip.dubAudio.id,undefined,{kind:"dub_audio",maxBytes:24*1024*1024});
            }
        }finally{await unlink(filename).catch(()=>{});}
    }
    const report=await artifact({...value,version:"verified-clips-v1",verified:true});
    return {checkpoint:{verified:true,verifiedClipsRef:report.id},assets:[report],outputRefs:[report.id,...value.clips.flatMap(clip=>[clip.video.id,...(clip.dubAudio?[clip.dubAudio.id]:[]),...Object.values(clip.subtitles).map(asset=>asset.id)])]};
};
export const publishHandler=async({claim,dependencies,signal,readArtifact})=>{
    signal.throwIfAborted();const verify=dependencies.find(step=>step.stage==="verify"),value=await readArtifact(verify?.checkpoint?.verifiedClipsRef);
    if(!verify?.checkpoint?.verified || value.version!=="verified-clips-v1" || value.verified!==true || value.sourceChecksum!==claim.run.source_snapshot.checksum || !value.clips?.length || value.clips.length>claim.run.plan.clips.requestedCount || value.clips.some(clip=>!verify.output_refs.includes(clip.video.id) || (claim.run.plan.dubbing?.enabled && (!clip.dubAudio?.id || !verify.output_refs.includes(clip.dubAudio.id)))))throw agentError("VIDEO_AGENT_RESULTS_UNVERIFIED",422,"Results not verified");
    return {checkpoint:{producedCount:value.clips.length,results:value.clips,requiresReview:value.requiresReview},outputRefs:value.clips.map(clip=>clip.video.id)};
};
