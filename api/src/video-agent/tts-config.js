import {agentError} from "../db/video-agent.js";

export const TTS_VOICES=Object.freeze(["alloy","echo","fable","onyx","nova","shimmer"]);
export const TTS_MAX_INPUT_CHARS=4096;
export const TTS_MAX_OUTPUT_BYTES=16*1024*1024;

const positiveInt=(name,max)=>{
    const raw=process.env[name];
    const value=Number(raw);
    if(!raw || !Number.isSafeInteger(value) || value<=0 || value>max)
        throw agentError("VIDEO_AGENT_TTS_CONFIG_INVALID",503,`Invalid ${name}`);
    return value;
};

// These limits and the configured rate are required before any paid TTS request.
// Cost units are micro-USD; the rate is micro-USD per million Unicode characters.
export const getTtsConfig=()=>{
    if(process.env.VIDEO_AGENT_DUBBING_ENABLED!=="1")
        throw agentError("VIDEO_AGENT_DUBBING_DISABLED",503,"Dubbing is disabled");
    if(!process.env.OPENAI_API_KEY)
        throw agentError("VIDEO_AGENT_TTS_CONFIG_INVALID",503,"TTS provider is not configured");
    const voiceId=process.env.VIDEO_AGENT_TTS_VOICE || "alloy";
    if(!TTS_VOICES.includes(voiceId))throw agentError("VIDEO_AGENT_TTS_CONFIG_INVALID",503,"Invalid TTS voice");
    return Object.freeze({provider:"openai",model:"tts-1",voiceId,
        maxRunChars:positiveInt("VIDEO_AGENT_TTS_MAX_RUN_CHARS",20000),
        maxRunAudioMs:positiveInt("VIDEO_AGENT_TTS_MAX_RUN_AUDIO_MS",450000),
        maxRunMicroUsd:positiveInt("VIDEO_AGENT_MAX_RUN_COST_MICRO_USD",1000000000),
        rateMicroUsdPerMillionChars:positiveInt("VIDEO_AGENT_TTS_MICRO_USD_PER_MILLION_CHARS",1000000000)});
};

export const ttsConfigured=()=>{try{getTtsConfig();return true;}catch{return false;}};

export const estimateRunTtsBudget=(clips,config=getTtsConfig())=>{
    const maxAudioMs=clips.requestedCount*clips.maxSeconds*1000;
    const estimatedChars=Math.ceil(maxAudioMs/1000*15);
    const estimatedMicroUsd=Math.ceil(estimatedChars*config.rateMicroUsdPerMillionChars/1000000);
    if(maxAudioMs>config.maxRunAudioMs || estimatedChars>config.maxRunChars || estimatedMicroUsd>config.maxRunMicroUsd)
        throw agentError("VIDEO_AGENT_TTS_BUDGET_EXCEEDED",422,"Planned dubbing exceeds configured budget");
    return {estimatedChars,estimatedMicroUsd,maxAudioMs,currency:"USD",costUnit:"micro-USD"};
};

export const estimateTtsCost=(chars,config)=>{
    if(!Number.isSafeInteger(chars) || chars<=0 || chars>TTS_MAX_INPUT_CHARS)
        throw agentError("VIDEO_AGENT_TTS_INPUT_INVALID",422,"Invalid TTS text length");
    return Math.ceil(chars*config.rateMicroUsdPerMillionChars/1000000);
};
