import { statfs,unlink } from "node:fs/promises";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import { agentError } from "../db/video-agent.js";
import { hashInput } from "./plans.js";
import { AUDIO_CHUNK_CONFIG,inspectPcmWav,findSilenceCuts,planAudioChunks,estimateChunkScratchBytes } from "./chunk-plan.js";
import { downloadVerifiedSource,runAbortableProcess } from "./worker-media.js";

export const assertChunkScratch = async (workDir,snapshot,{disk=statfs}={}) => {
    const required=estimateChunkScratchBytes(snapshot),limit=Number(process.env.VIDEO_AGENT_CHUNK_SCRATCH_MAX_BYTES || 1536*1024*1024);
    if(!Number.isSafeInteger(limit) || limit<=0 || required>limit)throw agentError("VIDEO_AGENT_SCRATCH_LIMIT",422,"Chunk scratch budget exceeded");
    const fs=await disk(workDir);
    if(Number(fs.bavail)*Number(fs.bsize)<required)throw agentError("VIDEO_AGENT_SCRATCH_SPACE",503,"Insufficient scratch space");
    return required;
};

// Injectable media operations allow fault tests; production uses local files and real FFmpeg.
export const createChunkHandler = ({runProcess=runAbortableProcess,download=downloadVerifiedSource,checkScratch=assertChunkScratch}={}) => async context => {
    const {claim,signal,workDir,dependencies,commitCheckpoint,artifact,audioArtifact,readAudioArtifact}=context;
    const source=claim.run.source_snapshot;
    const probe=dependencies.find(step=>step.stage==="probe")?.checkpoint;
    if(!probe || probe.sourceId!==source.id || Math.abs(probe.durationMs-source.durationMs)>1000)throw agentError("VIDEO_AGENT_CHUNK_DEPENDENCY_INVALID",409,"Source probe missing");
    const config=AUDIO_CHUNK_CONFIG,configHash=hashInput({source,config});
    let checkpoint=context.checkpoint;
    if(checkpoint?.version!==config.version || checkpoint.configHash!==configHash)checkpoint=null;
    if(checkpoint){
        if(!Array.isArray(checkpoint.chunks) || checkpoint.chunks.length<1 || checkpoint.chunks.length>7 || checkpoint.durationMs!==source.durationMs)throw agentError("VIDEO_AGENT_CHECKPOINT_INVALID",409,"Invalid chunk checkpoint");
        const expected=planAudioChunks(source.durationMs,checkpoint.chunks.slice(1).map(chunk=>chunk.ownershipStartMs));
        if(expected.length!==checkpoint.chunks.length || expected.some((chunk,i)=>Object.keys(chunk).some(key=>chunk[key]!==checkpoint.chunks[i][key])))throw agentError("VIDEO_AGENT_CHECKPOINT_INVALID",409,"Chunk timeline changed");
    }
    const refs=()=>checkpoint.chunks.filter(chunk=>chunk.asset).map(chunk=>chunk.asset.id);
    const persist=async(assets=[])=>commitCheckpoint({checkpoint,assets,outputRefs:refs()});
    if(checkpoint){
        // Completed chunks survive lease expiry and process restarts. Verify actual bytes.
        for(const chunk of checkpoint.chunks){
            signal.throwIfAborted();if(!chunk.asset)continue;
            try{
                const verified=await readAudioArtifact(chunk.asset.id);
                if(hashInput(verified)!==hashInput(chunk.asset))throw agentError("VIDEO_AGENT_OUTPUT_INVALID",409,"Chunk metadata changed");
            }catch(error){
                if(!["VIDEO_AGENT_OUTPUT_INVALID","ENOENT",404].includes(error.code) && error.status!==404)throw error;
                delete chunk.asset;
            }
        }
        await persist();
    }
    if(!checkpoint || checkpoint.chunks.some(chunk=>!chunk.asset)){
        await checkScratch(workDir,source);signal.throwIfAborted();
        const input=await download(claim,workDir,{signal}),audio=path.join(workDir,"audio.wav");
        try{
            await runProcess(ffmpeg,["-nostdin","-v","error","-threads","1","-filter_threads","1","-i",input,"-map","0:a:0","-vn",
                "-af","aresample=16000:async=1:first_pts=0,apad","-t",String(source.durationMs/1000),"-ac","1","-ar","16000","-c:a","pcm_s16le","-f","wav",audio],{signal,timeoutMs:15*60*1000});
        }finally{await unlink(input).catch(error=>{if(error.code!=="ENOENT")throw error;});}
        const info=await inspectPcmWav(audio);
        if(info.sampleCount!==source.durationMs*16 || info.sizeBytes>source.durationMs*32+65536)throw agentError("VIDEO_AGENT_AUDIO_INVALID",422,"Audio timeline does not match source");
        if(!checkpoint){
            const cuts=await findSilenceCuts(audio,info,{signal});
            checkpoint={version:config.version,configHash,sourceId:source.id,sourceChecksum:source.checksum,durationMs:source.durationMs,config,
                chunks:planAudioChunks(source.durationMs,cuts)};
            await persist();
        }
        try{
            for(const chunk of checkpoint.chunks){
                signal.throwIfAborted();if(chunk.asset)continue;
                const filename=path.join(workDir,`chunk-${chunk.ordinal}.wav`);
                try{
                    await runProcess(ffmpeg,["-nostdin","-v","error","-threads","1","-filter_threads","1","-i",audio,"-map","0:a:0",
                        "-af",`atrim=start_sample=${chunk.startSample}:end_sample=${chunk.endSample},asetpts=PTS-STARTPTS`,
                        "-ac","1","-ar","16000","-c:a","pcm_s16le","-f","wav",filename],{signal});
                    const encoded=await inspectPcmWav(filename);
                    if(encoded.sampleCount!==chunk.sampleCount || encoded.sizeBytes>config.maxChunkBytes)throw agentError("VIDEO_AGENT_CHUNK_TOO_LARGE",422,"Invalid chunk size or duration");
                    const asset=await audioArtifact(filename);chunk.asset=asset;
                    await persist([asset]);
                }finally{await unlink(filename).catch(error=>{if(error.code!=="ENOENT")throw error;});}
            }
        }finally{await unlink(audio).catch(error=>{if(error.code!=="ENOENT")throw error;});}
    }
    signal.throwIfAborted();
    const manifest=await artifact(checkpoint);
    return {checkpoint:{...checkpoint,manifestRef:manifest.id},assets:[manifest],outputRefs:[...refs(),manifest.id]};
};

export const chunkHandler=createChunkHandler();
