import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm,writeFile,open} from "node:fs/promises";
import {createWriteStream} from "node:fs";
import {Readable} from "node:stream";
import {pipeline} from "node:stream/promises";
import os from "node:os";
import path from "node:path";
import {AUDIO_CHUNK_CONFIG,planAudioChunks,inspectPcmWav,findSilenceCuts,estimateChunkScratchBytes} from "./chunk-plan.js";
import {assertChunkScratch} from "./chunk-handler.js";
import {compilePlan} from "./plans.js";
import {runAbortableProcess} from "./worker-media.js";

test("chunk ownership covers an hour exactly with bounded context and legal fallback",()=>{
    for(const duration of [1,9999,600000,605000,610000,3600000]){
        const cuts=[];for(let ms=600000;ms<duration;ms+=600000)cuts.push(ms);
        const chunks=planAudioChunks(duration,cuts);
        assert.equal(chunks[0].ownershipStartMs,0);assert.equal(chunks.at(-1).ownershipEndMs,duration);
        chunks.forEach((chunk,i)=>{
            if(i)assert.equal(chunk.ownershipStartMs,chunks[i-1].ownershipEndMs);
            assert.ok(chunk.processingStartMs<=chunk.ownershipStartMs && chunk.processingEndMs>=chunk.ownershipEndMs);
            assert.equal(chunk.startSample,chunk.processingStartMs*16);
            assert.equal(chunk.sampleCount,chunk.endSample-chunk.startSample);
            assert.ok(chunk.sampleCount*2+65536<AUDIO_CHUNK_CONFIG.maxChunkBytes);
        });
        if(duration===605000)assert.equal(chunks.length,1);
        if(duration===3600000)assert.equal(chunks.length,6);
    }
    for(const cuts of [[600000,600000],[610000,600000],[-1],[3600001],[1.5]])assert.throws(()=>planAudioChunks(3600000,cuts),{code:"VIDEO_AGENT_AUDIO_INVALID"});
});

test("PCM scanner chooses a nearby pause without assuming ordinal times",async t=>{
    const root=await mkdtemp(path.join(os.tmpdir(),"agent-pcm-test-"));t.after(()=>rm(root,{recursive:true,force:true}));
    const filename=path.join(root,"audio.wav"),duration=620000,samples=duration*16;
    const header=Buffer.alloc(44);header.write("RIFF");header.writeUInt32LE(samples*2+36,4);header.write("WAVEfmt ",8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(16000,24);header.writeUInt32LE(32000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write("data",36);header.writeUInt32LE(samples*2,40);
    async function* pcm(){yield header;for(let start=0;start<samples;start+=32768){const bytes=Buffer.alloc(Math.min(32768,samples-start)*2);for(let i=0;i<bytes.length/2;i++){const ms=(start+i)/16;bytes.writeInt16LE(ms>=594000 && ms<596000?0:1000,i*2);}yield bytes;}}
    await pipeline(Readable.from(pcm()),createWriteStream(filename));
    const info=await inspectPcmWav(filename);assert.equal(info.sampleCount,samples);
    const cuts=await findSilenceCuts(filename,info);assert.ok(cuts[0]>=594000 && cuts[0]<596000);
    const chunks=planAudioChunks(duration,cuts);assert.equal(chunks[1].processingStartMs,cuts[0]-2000);assert.notEqual(chunks[1].processingStartMs,600000);
    const aborted=AbortSignal.abort(new Error("cancelled"));await assert.rejects(findSilenceCuts(filename,info,{signal:aborted}),/cancelled/);
    // Same file, no pause: hard cut remains legal.
    const handle=await open(filename,"r+");try{const loud=Buffer.alloc(64000);for(let i=0;i<loud.length;i+=2)loud.writeInt16LE(1000,i);await handle.write(loud,0,loud.length,44+594000*32);}finally{await handle.close();}
    assert.deepEqual(await findSilenceCuts(filename,info),[600000]);
    const broken=path.join(root,"invalid.wav");await writeFile(broken,Buffer.from("not-wave"));await assert.rejects(inspectPcmWav(broken),{code:"VIDEO_AGENT_AUDIO_INVALID"});
});

test("scratch admission checks capacity before download and config hashes reach downstream",async()=>{
    const source={sizeBytes:1024**3,durationMs:3600000};const required=estimateChunkScratchBytes(source);
    assert.ok(required<1536*1024*1024);
    await assert.rejects(assertChunkScratch("unused",source,{disk:async()=>({bavail:1,bsize:4096})}),{code:"VIDEO_AGENT_SCRATCH_SPACE"});
    assert.equal(await assertChunkScratch("unused",source,{disk:async()=>({bavail:required,bsize:1})}),required);
    assert.throws(()=>estimateChunkScratchBytes({...source,sizeBytes:1024**3+1}),{code:"VIDEO_AGENT_AUDIO_INVALID"});
    const plan={sourceLanguage:"auto",clips:{requestedCount:3},targetLanguage:"es",subtitles:{mode:"bilingual"},video:{preset:"tiktok"}};
    const compiled=compilePlan({plan,sourceSnapshot:source,revision:1});assert.deepEqual(compiled[1].input.config,AUDIO_CHUNK_CONFIG);assert.equal(compiled[2].input.upstreamHash,compiled[1].inputHash);
});

test("a media subprocess timeout is retryable and kills the process",async()=>{
    await assert.rejects(runAbortableProcess(process.execPath,["-e","setInterval(()=>{},1000)"],{timeoutMs:30}),{code:"ETIMEDOUT"});
});
