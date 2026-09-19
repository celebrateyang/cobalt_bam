import {getAiVideoProviderClient} from "../ai-video/providers.js";
import {agentError} from "../db/video-agent.js";
import {retryAfterMs} from "./speech-adapter.js";
import {estimateTtsCost,getTtsConfig,TTS_MAX_INPUT_CHARS,TTS_MAX_OUTPUT_BYTES} from "./tts-config.js";

const validMp3=bytes=>bytes.length>=128 && (bytes.toString("ascii",0,3)==="ID3" || (bytes[0]===0xff && (bytes[1]&0xe0)===0xe0));

export const createTtsAdapter=({client=getAiVideoProviderClient}={})=>({
    capabilities(config=getTtsConfig()){
        return {provider:config.provider,model:config.model,voices:[config.voiceId],maxInputChars:TTS_MAX_INPUT_CHARS,
            maxRunChars:config.maxRunChars,maxRunAudioMs:config.maxRunAudioMs,maxRunMicroUsd:config.maxRunMicroUsd};
    },
    estimate(text,config=getTtsConfig()){
        if(typeof text!=="string" || !text.trim() || /[\u0000-\u001f\u007f]/u.test(text))
            throw agentError("VIDEO_AGENT_TTS_INPUT_INVALID",422,"Invalid TTS text");
        const chars=Array.from(text).length;
        if(chars>TTS_MAX_INPUT_CHARS || Buffer.byteLength(text,"utf8")>8192)
            throw agentError("VIDEO_AGENT_TTS_INPUT_INVALID",422,"TTS text exceeds limit");
        return {chars,estimatedMicroUsd:estimateTtsCost(chars,config)};
    },
    async synthesize({text,voiceId,signal,budget,config=getTtsConfig()}){
        signal?.throwIfAborted();
        if(voiceId!==config.voiceId)throw agentError("VIDEO_AGENT_TTS_VOICE_INVALID",422,"Unsupported TTS voice");
        const {chars,estimatedMicroUsd}=this.estimate(text,config);
        if(!budget || !Number.isSafeInteger(budget.remainingChars) || !Number.isSafeInteger(budget.remainingMicroUsd)
            || budget.remainingChars<chars || budget.remainingChars>config.maxRunChars
            || budget.remainingMicroUsd<estimatedMicroUsd || budget.remainingMicroUsd>config.maxRunMicroUsd)
            throw agentError("VIDEO_AGENT_TTS_BUDGET_EXCEEDED",422,"TTS budget exceeded");
        const timeout=Number(process.env.VIDEO_AGENT_TTS_TIMEOUT_MS || 180000);
        if(!Number.isSafeInteger(timeout) || timeout<1000 || timeout>300000)
            throw agentError("VIDEO_AGENT_TTS_CONFIG_INVALID",503,"Invalid TTS timeout");
        const controller=new AbortController(),abort=()=>controller.abort(signal.reason);
        signal?.addEventListener("abort",abort,{once:true});
        if(signal?.aborted)abort();
        const timer=setTimeout(()=>controller.abort(Object.assign(new Error("TTS timed out"),{code:"ETIMEDOUT"})),timeout);
        try{
            const response=await client().withOptions({maxRetries:0,timeout}).audio.speech.create({
                model:config.model,voice:voiceId,input:text,response_format:"mp3"
            },{signal:controller.signal,maxRetries:0}).asResponse();
            const reader=response.body?.getReader();
            if(!reader)throw agentError("VIDEO_AGENT_TTS_OUTPUT_INVALID",422,"Missing TTS audio");
            const chunks=[];let size=0;
            try{
                while(true){controller.signal.throwIfAborted();const {value,done}=await reader.read();if(done)break;
                    size+=value.byteLength;
                    if(size>TTS_MAX_OUTPUT_BYTES)throw agentError("VIDEO_AGENT_TTS_OUTPUT_TOO_LARGE",422,"TTS audio exceeds limit");
                    chunks.push(Buffer.from(value));
                }
            }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
            const audio=Buffer.concat(chunks);
            if(!validMp3(audio))throw agentError("VIDEO_AGENT_TTS_OUTPUT_INVALID",422,"Invalid TTS audio");
            return {audio,contentType:"audio/mpeg",chars,estimatedMicroUsd,provider:config.provider,
                model:config.model,voiceId,requestId:response.headers?.get?.("x-request-id") || null};
        }catch(error){
            if(controller.signal.aborted)throw controller.signal.reason;
            if(error.code?.startsWith?.("VIDEO_AGENT_"))throw error;
            const status=Number(error.status);
            const safe=agentError(status?`VIDEO_AGENT_TTS_HTTP_${status}`:"VIDEO_AGENT_TTS_CONNECTION_FAILED",status || 503,"TTS request failed");
            safe.retryAfterMs=retryAfterMs(error.headers);
            if(error.name==="APIConnectionTimeoutError")safe.code="ETIMEDOUT";
            else if(["ECONNRESET","ETIMEDOUT","EAI_AGAIN","UND_ERR_CONNECT_TIMEOUT","UND_ERR_BODY_TIMEOUT","UND_ERR_HEADERS_TIMEOUT"].includes(error.cause?.code))safe.code=error.cause.code;
            throw safe;
        }finally{clearTimeout(timer);signal?.removeEventListener("abort",abort);}
    }
});

export const ttsAdapter=createTtsAdapter();
