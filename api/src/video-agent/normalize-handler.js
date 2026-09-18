import {agentError} from "../db/video-agent.js";
import {hashInput} from "./plans.js";
import {NORMALIZE_CONFIG} from "./normalize-config.js";
import {normalizeTranscript} from "./normalize-transcript.js";

export const normalizeHandler=async({claim,dependencies,signal,readArtifact,artifact})=>{
    signal.throwIfAborted();
    if(hashInput(claim.step.input_snapshot.config)!==hashInput(NORMALIZE_CONFIG))throw agentError("VIDEO_AGENT_NORMALIZE_CONFIG_CHANGED",409,"Subtitle configuration changed; create a new run");
    const ref=dependencies.find(step=>step.stage==="transcribe")?.checkpoint?.transcriptRef;
    if(!ref)throw agentError("VIDEO_AGENT_NORMALIZE_DEPENDENCY_INVALID",409,"Transcription unavailable");
    const transcript=await readArtifact(ref,{kind:"transcript"});
    const source=claim.run.source_snapshot;
    const normalized=normalizeTranscript(transcript,{sourceChecksum:source.checksum,durationMs:source.durationMs});
    signal.throwIfAborted();
    const output=await artifact({...normalized,sourceLanguage:claim.run.plan.sourceLanguage,sourceTranscriptRef:ref},{kind:"transcript"});
    return {checkpoint:{version:NORMALIZE_CONFIG.version,normalizedTranscriptRef:output.id,cueCount:normalized.cues.length,timingQuality:normalized.timingQuality,requiresReview:normalized.requiresReview},assets:[output],outputRefs:[output.id]};
};
