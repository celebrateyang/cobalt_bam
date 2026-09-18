import {statfs,unlink} from "node:fs/promises";
import path from "node:path";
import {agentError} from "../db/video-agent.js";
import {hashInput} from "./plans.js";
import {getAsrConfig,ASR_VERSION} from "./asr-config.js";
import {existingSpeechAdapter} from "./speech-adapter.js";
import {planAudioChunks,inspectPcmWav} from "./chunk-plan.js";
import {normalizeAsrChunk,mergeChunkTranscripts} from "./transcript-merge.js";

const invalid=()=>agentError("VIDEO_AGENT_ASR_CHECKPOINT_INVALID",409,"Invalid ASR checkpoint");
export const createTranscribeHandler=({provider=existingSpeechAdapter,disk=statfs}={})=>async context=>{
    const {claim,signal,dependencies,workDir,readArtifact,readAudioArtifact,artifact,commitCheckpoint}=context;
    const source=claim.run.source_snapshot,config=getAsrConfig(),input=claim.step.input_snapshot.config;
    if(hashInput(input)!==hashInput({...config,sourceLanguage:claim.run.plan.sourceLanguage}))throw agentError("VIDEO_AGENT_ASR_CONFIG_CHANGED",409,"ASR configuration changed; create a new run");
    const dependency=dependencies.find(step=>step.stage==="chunk"),manifestRef=dependency?.checkpoint?.manifestRef;
    if(!manifestRef)throw agentError("VIDEO_AGENT_ASR_DEPENDENCY_INVALID",409,"Chunk manifest unavailable");
    const manifest=await readArtifact(manifestRef);
    if(manifest.sourceId!==source.id || manifest.sourceChecksum!==source.checksum || manifest.durationMs!==source.durationMs || !Array.isArray(manifest.chunks) || !manifest.chunks.length || manifest.chunks.length>7)throw invalid();
    const expected=planAudioChunks(source.durationMs,manifest.chunks.slice(1).map(chunk=>chunk.ownershipStartMs));
    if(expected.length!==manifest.chunks.length || expected.some((chunk,i)=>Object.keys(chunk).some(key=>chunk[key]!==manifest.chunks[i][key])) || manifest.chunks.some(chunk=>!chunk.asset))throw invalid();
    const configHash=hashInput({config,sourceChecksum:source.checksum,chunkInputHash:dependency.input_hash,sourceLanguage:claim.run.plan.sourceLanguage});
    let checkpoint=context.checkpoint;
    if(checkpoint?.version!==ASR_VERSION || checkpoint.configHash!==configHash)checkpoint={version:ASR_VERSION,configHash,config,results:[]};
    if(!Array.isArray(checkpoint.results) || checkpoint.results.length>manifest.chunks.length || new Set(checkpoint.results.map(result=>result.ordinal)).size!==checkpoint.results.length || checkpoint.results.some(result=>!Number.isInteger(result.ordinal) || !manifest.chunks[result.ordinal]))throw invalid();
    const refs=()=>checkpoint.results.flatMap(result=>[result.rawRef,result.normalizedRef].filter(Boolean));
    const persist=(assets=[])=>commitCheckpoint({checkpoint,assets,outputRefs:refs(),provider:config.provider,model:config.model});
    const parts=[];
    for(const chunk of manifest.chunks){
        signal.throwIfAborted();let result=checkpoint.results.find(value=>value.ordinal===chunk.ordinal);
        if(result && result.chunkChecksum!==chunk.asset.checksum)throw invalid();
        if(!result){
            const fs=await disk(workDir);
            if(Number(fs.bavail)*Number(fs.bsize)<chunk.asset.sizeBytes+64*1024*1024)throw agentError("VIDEO_AGENT_SCRATCH_SPACE",503,"Insufficient ASR scratch space");
            const filename=path.join(workDir,`asr-${chunk.ordinal}.wav`);
            let response;
            try{
                const audio=await readAudioArtifact(chunk.asset.id,filename);
                if(hashInput(audio)!==hashInput(chunk.asset) || (await inspectPcmWav(filename)).sampleCount!==chunk.sampleCount)throw invalid();
                response=await provider.transcribe({filename,language:claim.run.plan.sourceLanguage,signal,config});
                signal.throwIfAborted();
            }finally{await unlink(filename).catch(error=>{if(error.code!=="ENOENT")throw error;});}
            const raw=await artifact({version:"asr-raw-v1",configHash,config,sourceChecksum:source.checksum,chunk,requestId:response.requestId,raw:response.raw},{kind:"asr_raw"});
            result={ordinal:chunk.ordinal,chunkChecksum:chunk.asset.checksum,rawRef:raw.id};checkpoint.results.push(result);
            // Persist raw output before interpreting timestamps. A later failure
            // can resume without repeating the successful provider request.
            await persist([raw]);
        }
        const saved=await readArtifact(result.rawRef,{kind:"asr_raw"});
        if(saved.version!=="asr-raw-v1" || saved.configHash!==configHash || saved.sourceChecksum!==source.checksum || hashInput(saved.chunk)!==hashInput(chunk))throw invalid();
        let normalized;
        if(result.normalizedRef){
            try{normalized=await readArtifact(result.normalizedRef,{kind:"transcript"});}
            catch(error){if(error.code!=="VIDEO_AGENT_OUTPUT_INVALID" && error.code!=="ENOENT" && error.code!==404 && error.status!==404)throw error;delete result.normalizedRef;await persist();}
        }
        if(!normalized){
            normalized={version:"asr-normalized-v1",configHash,ordinal:chunk.ordinal,segments:normalizeAsrChunk(saved.raw,chunk,{sourceChecksum:source.checksum,configHash})};
            const output=await artifact(normalized,{kind:"transcript"});result.normalizedRef=output.id;await persist([output]);
        }
        if(normalized.version!=="asr-normalized-v1" || normalized.configHash!==configHash || normalized.ordinal!==chunk.ordinal || !Array.isArray(normalized.segments))throw invalid();
        parts.push(normalized.segments);
    }
    signal.throwIfAborted();
    const transcript=mergeChunkTranscripts(parts,{durationMs:source.durationMs,sourceChecksum:source.checksum,configHash});
    const output=await artifact({...transcript,provider:config.provider,model:config.model,rawRefs:checkpoint.results.map(result=>result.rawRef)},{kind:"transcript"});
    return {checkpoint:{...checkpoint,transcriptRef:output.id,segmentCount:transcript.segments.length,timingQuality:transcript.timingQuality,duplicateWords:transcript.duplicateWords},
        assets:[output],outputRefs:[...refs(),output.id],provider:config.provider,model:config.model};
};
export const transcribeHandler=createTranscribeHandler();
