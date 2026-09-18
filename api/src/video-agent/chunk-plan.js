import { open } from "node:fs/promises";
import { agentError } from "../db/video-agent.js";

// Changes to these settings invalidate chunk and downstream stage input hashes.
export const AUDIO_CHUNK_CONFIG = Object.freeze({
    version:"pcm-chunks-v1",sampleRate:16000,channels:1,bitsPerSample:16,
    targetMs:600000,searchMs:8000,overlapMs:2000,minTailMs:10000,
    frameMs:20,minSilenceMs:300,silenceDb:-40,maxChunkBytes:24*1024*1024,
});
const invalid=()=>agentError("VIDEO_AGENT_AUDIO_INVALID",422,"Invalid PCM audio");

export const inspectPcmWav = async filename => {
    const file=await open(filename,"r");
    try{
        const size=(await file.stat()).size;const header=Buffer.alloc(12);
        if((await file.read(header,0,12,0)).bytesRead!==12 || header.toString("ascii",0,4)!=="RIFF" || header.toString("ascii",8,12)!=="WAVE")throw invalid();
        let offset=12,format;
        while(offset+8<=size && offset<65536){
            const h=Buffer.alloc(8);if((await file.read(h,0,8,offset)).bytesRead!==8)throw invalid();
            const kind=h.toString("ascii",0,4),length=h.readUInt32LE(4);offset+=8;
            if(offset+length>size)throw invalid();
            if(kind==="fmt "){
                if(length<16)throw invalid();const fmt=Buffer.alloc(16);
                if((await file.read(fmt,0,16,offset)).bytesRead!==16)throw invalid();
                format={codec:fmt.readUInt16LE(0),channels:fmt.readUInt16LE(2),sampleRate:fmt.readUInt32LE(4),blockAlign:fmt.readUInt16LE(12),bitsPerSample:fmt.readUInt16LE(14)};
            }else if(kind==="data"){
                if(!format || format.codec!==1 || format.channels!==1 || format.sampleRate!==16000 || format.blockAlign!==2 || format.bitsPerSample!==16 || !length || length%2)throw invalid();
                return {...format,sizeBytes:size,dataOffset:offset,dataBytes:length,sampleCount:length/2,durationMs:(length/2)/16};
            }
            offset+=length+(length%2);
        }
        throw invalid();
    }finally{await file.close();}
};

// One 64 KiB read buffer; only retain one silence candidate per nominal cut.
export const findSilenceCuts = async (filename,info,{signal,config=AUDIO_CHUNK_CONFIG}={}) => {
    const nominal=[];for(let ms=config.targetMs;ms<info.durationMs;ms+=config.targetMs)nominal.push(ms);
    if(!nominal.length)return [];
    const candidates=nominal.map(()=>null),frameSamples=config.sampleRate*config.frameMs/1000;
    const threshold=32768**2*10**(config.silenceDb/10);
    const consider=(start,end)=>{
        if(end-start<config.minSilenceMs)return;
        nominal.forEach((cut,index)=>{
            const lo=Math.max(start,cut-config.searchMs),hi=Math.min(end,cut+config.searchMs);
            if(hi-lo<config.minSilenceMs)return;
            const time=Math.round(Math.max(lo+config.minSilenceMs/2,Math.min(hi-config.minSilenceMs/2,cut)));
            if(!candidates[index] || Math.abs(time-cut)<Math.abs(candidates[index]-cut))candidates[index]=time;
        });
    };
    const file=await open(filename,"r");
    try{
        const buffer=Buffer.alloc(65536);let offset=0,sample=0,frameCount=0,sum=0,quietStart=null;
        while(offset<info.dataBytes){
            signal?.throwIfAborted();
            const {bytesRead}=await file.read(buffer,0,Math.min(buffer.length,info.dataBytes-offset),info.dataOffset+offset);
            if(!bytesRead || bytesRead%2)throw invalid();offset+=bytesRead;
            for(let i=0;i<bytesRead;i+=2){const value=buffer.readInt16LE(i);sum+=value*value;sample++;frameCount++;
                if(frameCount===frameSamples){
                    const start=(sample-frameCount)*1000/config.sampleRate,end=sample*1000/config.sampleRate;
                    if(sum/frameCount<=threshold){if(quietStart===null)quietStart=start;}
                    else if(quietStart!==null){consider(quietStart,start);quietStart=null;}
                    frameCount=0;sum=0;
                    if(end>info.durationMs)throw invalid();
                }
            }
        }
        if(quietStart!==null)consider(quietStart,(sample-frameCount)*1000/config.sampleRate);
        return nominal.map((cut,index)=>candidates[index] ?? cut);
    }finally{await file.close();}
};

export const planAudioChunks = (durationMs,cuts,config=AUDIO_CHUNK_CONFIG) => {
    if(!Number.isSafeInteger(durationMs) || durationMs<=0 || durationMs>3600000)throw invalid();
    const boundaries=[0,...cuts,durationMs];
    if(boundaries.some((ms,i)=>!Number.isSafeInteger(ms) || (i && ms<=boundaries[i-1]) || ms>durationMs))throw invalid();
    if(boundaries.length>2 && durationMs-boundaries.at(-2)<config.minTailMs)boundaries.splice(-2,1);
    return boundaries.slice(0,-1).map((start,i)=>{
        const end=boundaries[i+1],processingStartMs=Math.max(0,start-config.overlapMs),processingEndMs=Math.min(durationMs,end+config.overlapMs);
        return {ordinal:i,ownershipStartMs:start,ownershipEndMs:end,processingStartMs,processingEndMs,
            startSample:processingStartMs*16,endSample:processingEndMs*16,sampleCount:(processingEndMs-processingStartMs)*16};
    });
};

export const estimateChunkScratchBytes = snapshot => {
    if(!Number.isSafeInteger(snapshot.sizeBytes) || snapshot.sizeBytes<=0 || snapshot.sizeBytes>1024**3 || !Number.isSafeInteger(snapshot.durationMs) || snapshot.durationMs<=0 || snapshot.durationMs>3600000)throw invalid();
    return snapshot.sizeBytes+snapshot.durationMs*32+AUDIO_CHUNK_CONFIG.maxChunkBytes+64*1024*1024;
};
