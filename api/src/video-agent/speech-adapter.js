import {createReadStream} from "node:fs";
import {stat} from "node:fs/promises";
import {getAiVideoProviderClient} from "../ai-video/providers.js";
import {agentError} from "../db/video-agent.js";
import {ASR_MAX_JSON_BYTES,getAsrConfig} from "./asr-config.js";

const header=(headers,name)=>headers?.get?.(name) ?? headers?.[name];
export const retryAfterMs=(headers,now=Date.now())=>{
    const ms=Number(header(headers,"retry-after-ms"));if(Number.isFinite(ms) && ms>0)return Math.min(ms,86400000);
    const value=header(headers,"retry-after");if(!value)return 0;
    const seconds=Number(value);return Math.min(86400000,Math.max(0,Number.isFinite(seconds)?seconds*1000:Date.parse(value)-now || 0));
};
const boundedJson=async(response,signal,onProgress=()=>{})=>{
    const reader=response.body?.getReader();if(!reader)throw agentError("VIDEO_AGENT_ASR_RESPONSE_INVALID",422,"Missing ASR body");
    const chunks=[];let size=0;
    try{
        while(true){signal.throwIfAborted();const {value,done}=await reader.read();if(done)break;size+=value.byteLength;onProgress(size);
            if(size>ASR_MAX_JSON_BYTES)throw agentError("VIDEO_AGENT_ASR_RESPONSE_TOO_LARGE",422,"ASR response exceeds limit");chunks.push(Buffer.from(value));}
        try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw agentError("VIDEO_AGENT_ASR_RESPONSE_INVALID",422,"Invalid ASR JSON");}
    }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
};

const logAsr=(record)=>console.info("[VIDEO AGENT ASR]",JSON.stringify(record));
const safeCode=(value)=>typeof value==="string" && /^[A-Za-z0-9_]{1,80}$/.test(value)?value:null;
const safeRequestId=(value)=>typeof value==="string" && /^[A-Za-z0-9_-]{1,128}$/.test(value)?value:null;
export const createSpeechAdapter=({client=getAiVideoProviderClient,log=logAsr}={})=>({
    async transcribe({filename,language,signal,config=getAsrConfig(),diagnostics={}}){
        signal.throwIfAborted();
        if(!config.responseFormat)throw agentError("VIDEO_AGENT_ASR_MODEL_UNSUPPORTED",503,"Configured model lacks timed transcription output");
        const size=(await stat(filename)).size;
        if(size<=0 || size>24*1024*1024)throw agentError("VIDEO_AGENT_CHUNK_TOO_LARGE",422,"ASR input exceeds limit");
        const timeout=Number(process.env.VIDEO_AGENT_ASR_TIMEOUT_MS || process.env.AI_VIDEO_OPENAI_TIMEOUT_MS || process.env.AI_VIDEO_PROVIDER_TIMEOUT_MS || 180000);
        if(!Number.isSafeInteger(timeout) || timeout<=0 || timeout>600000)throw agentError("VIDEO_AGENT_ASR_CONFIG_INVALID",503,"Invalid ASR timeout");
        const context={runId:diagnostics.runId || null,stepId:diagnostics.stepId || null,attempt:diagnostics.attempt ?? null,chunkOrdinal:diagnostics.chunkOrdinal ?? null,
            chunkDurationMs:diagnostics.chunkDurationMs ?? null,audioBytes:size,provider:config.provider,model:config.model,timeoutMs:timeout};
        const startedAt=Date.now();let phase="awaiting_response",abortSource=null,requestId=null,responseBytes=0,contentLengthBytes=null;
        const record=(event,details={})=>log({...context,event,phase,durationMs:Date.now()-startedAt,...details});
        const controller=new AbortController(),abort=()=>{if(!controller.signal.aborted){abortSource="worker";controller.abort(signal.reason);}};
        signal.addEventListener("abort",abort,{once:true});if(signal.aborted)abort();
        const timer=setTimeout(()=>{if(!controller.signal.aborted){abortSource="asr_deadline";controller.abort(Object.assign(new Error("ASR timed out"),{code:"ETIMEDOUT"}));}},timeout);
        const file=createReadStream(filename);
        try{
            record("request.started");
            const service=client().withOptions({maxRetries:0,timeout});
            const params={file,model:config.model,response_format:config.responseFormat,
                ...(language && language!=="auto"?{language}:{}),
                ...(config.model==="whisper-1"?{timestamp_granularities:config.timestampGranularities}:{chunking_strategy:"auto"})};
            const response=await service.audio.transcriptions.create(params,{signal:controller.signal,maxRetries:0}).asResponse();
            phase="response_body";requestId=safeRequestId(response.headers.get("x-request-id"));
            const contentLengthHeader=response.headers.get("content-length"),contentLength=Number(contentLengthHeader);
            contentLengthBytes=contentLengthHeader!==null && Number.isSafeInteger(contentLength) && contentLength>=0?contentLength:null;
            record("response.headers",{httpStatus:response.status,requestId,contentLengthBytes});
            const raw=await boundedJson(response,controller.signal,size=>{responseBytes=size;});
            record("request.succeeded",{requestId,responseBytes});
            return {raw,requestId:response.headers.get("x-request-id") || null};
        }catch(error){
            record("request.failed",{abortSource,errorCode:safeCode(error.code),causeCode:safeCode(error.cause?.code),
                errorType:safeCode(error.name),httpStatus:Number.isInteger(error.status)?error.status:null,
                requestId:requestId || safeRequestId(header(error.headers,"x-request-id")),responseBytes,contentLengthBytes});
            if(controller.signal.aborted)throw controller.signal.reason;
            if(error.code?.startsWith?.("VIDEO_AGENT_"))throw error;
            const status=Number(error.status);
            const safe=agentError(status?`VIDEO_AGENT_ASR_HTTP_${status}`:"VIDEO_AGENT_ASR_CONNECTION_FAILED",status || 503,"ASR request failed");
            safe.retryAfterMs=retryAfterMs(error.headers);
            if(error.name==="APIConnectionTimeoutError")safe.code="ETIMEDOUT";
            else if(["ECONNRESET","ETIMEDOUT","EAI_AGAIN","UND_ERR_CONNECT_TIMEOUT","UND_ERR_BODY_TIMEOUT","UND_ERR_HEADERS_TIMEOUT"].includes(error.cause?.code))safe.code=error.cause.code;
            throw safe;
        }finally{clearTimeout(timer);signal.removeEventListener("abort",abort);file.destroy();}
    },
});
export const existingSpeechAdapter=createSpeechAdapter();
