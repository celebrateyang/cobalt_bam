import {createHash} from "node:crypto";

export const ASR_VERSION="asr-chunks-v1";
export const ASR_MAX_JSON_BYTES=8*1024*1024;
export const getAsrConfig=()=>{
    const model=process.env.AI_VIDEO_TRANSCRIPTION_MODEL || process.env.AI_VIDEO_TRANSCRIBE_MODEL || "gpt-4o-transcribe-diarize";
    const baseURL=(process.env.OPENAI_BASE_URL || process.env.AI_VIDEO_OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/,"");
    return {version:ASR_VERSION,provider:"openai",model,
        responseFormat:model==="whisper-1"?"verbose_json":model==="gpt-4o-transcribe-diarize"?"diarized_json":null,
        timestampGranularities:model==="whisper-1"?["segment","word"]:[],
        endpointHash:createHash("sha256").update(baseURL).digest("hex"),
        modelRevision:process.env.VIDEO_AGENT_ASR_MODEL_REVISION || "default",mergeVersion:"ownership-words-v1"};
};
export const speechConfigured=()=>!!process.env.OPENAI_API_KEY && !!getAsrConfig().responseFormat;
