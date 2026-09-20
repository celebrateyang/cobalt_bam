import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import OpenAI from "openai";
import {normalizeAsrChunk,mergeChunkTranscripts,joinWordText} from "./transcript-merge.js";
import {createSpeechAdapter,retryAfterMs} from "./speech-adapter.js";
import {getAsrConfig} from "./asr-config.js";
import {compilePlan} from "./plans.js";

const seed={sourceChecksum:"a".repeat(64),configHash:"b".repeat(64)};
const first={ordinal:0,processingStartMs:0,processingEndMs:602000,ownershipStartMs:0,ownershipEndMs:600000};
const second={ordinal:1,processingStartMs:598000,processingEndMs:620000,ownershipStartMs:600000,ownershipEndMs:620000};
test("ASR local time maps through real offsets; boundary duplicates disappear but repetitions stay",()=>{
    const raw1={segments:[{start:599,end:600.15,text:"yes yes Hello",speaker:"A"}],words:[{word:"yes",start:599,end:599.1},{word:"yes",start:599.2,end:599.3},{word:"Hello",start:599.8,end:600.15}]};
    const raw2={segments:[{start:1.9,end:3,text:"Hello world",speaker:"A"}],words:[{word:"Hello",start:1.9,end:2.3},{word:"world",start:2.5,end:3}]};
    const a=normalizeAsrChunk(raw1,first,seed),b=normalizeAsrChunk(raw2,second,seed);
    assert.equal(b[0].words[1].startMs,600500);assert.equal(b[0].words[0].startMs,600000);
    const merged=mergeChunkTranscripts([a,b],{...seed,durationMs:620000});
    assert.equal(merged.duplicateWords,1);assert.deepEqual(merged.segments.flatMap(s=>s.words.map(w=>w.text)),["yes","yes","Hello","world"]);
    assert.equal(merged.timingQuality,"word");assert.notEqual(a[0].speakerLocalId,b[0].speakerLocalId);
    assert.deepEqual(normalizeAsrChunk(raw1,first,seed),a);
    assert.notEqual(normalizeAsrChunk(raw1,first,{...seed,configHash:"c".repeat(64)})[0].id,a[0].id);
    const shifted={...second,processingStartMs:594000,ownershipStartMs:596000};
    assert.equal(normalizeAsrChunk(raw2,shifted,seed)[0].words[1].startMs,596500);
});
test("segment-only output has explicitly estimated words and invalid timing never invents timestamps",()=>{
    const result=normalizeAsrChunk({segments:[{text:"A longer word.",start:0,end:3}]},first,seed);
    assert.equal(result[0].timingQuality,"estimated");assert.equal(result[0].sourceText,"A longer word.");assert.ok(result[0].words.every(word=>word.timingQuality==="estimated"));
    for(const segment of [{text:"bad",start:-1,end:1},{text:"bad",start:2,end:1},{text:"bad",start:0,end:700},{text:"bad",start:"invalid",end:1},{text:"bad",start:null,end:1}])assert.throws(()=>normalizeAsrChunk({segments:[segment]},first,seed),{code:"VIDEO_AGENT_ASR_TIMING_INVALID"});
    const mismatch=normalizeAsrChunk({segments:[{text:"Actual words",start:0,end:2}],words:[{word:"different",start:0,end:1}]},first,seed);
    assert.equal(mismatch[0].timingQuality,"estimated");assert.equal(mismatch[0].sourceText,"Actual words");assert.equal(mismatch[0].alignmentWarning,"word_text_mismatch");
    assert.deepEqual(normalizeAsrChunk({segments:[]},first,seed),[]);
    assert.throws(()=>mergeChunkTranscripts([[]],{...seed,durationMs:620000}),{code:"VIDEO_AGENT_NO_SPEECH"});
    assert.equal(joinWordText([{text:"\u4f60"},{text:"\u597d"},{text:"\uff01"}]),"\u4f60\u597d\uff01");
});
test("provider/model/base URL revisions invalidate ASR and downstream only",()=>{
    const saved=process.env.AI_VIDEO_TRANSCRIPTION_MODEL;const plan={sourceLanguage:"auto",clips:{requestedCount:3},targetLanguage:"es",subtitles:{mode:"bilingual"},video:{preset:"tiktok"}};
    try{process.env.AI_VIDEO_TRANSCRIPTION_MODEL="whisper-1";const a=compilePlan({plan,sourceSnapshot:{checksum:"a"},revision:1});
        process.env.AI_VIDEO_TRANSCRIPTION_MODEL="gpt-4o-transcribe-diarize";const b=compilePlan({plan,sourceSnapshot:{checksum:"a"},revision:1});
        assert.equal(a[1].inputHash,b[1].inputHash);assert.notEqual(a[2].inputHash,b[2].inputHash);assert.notEqual(a[3].inputHash,b[3].inputHash);
    }finally{if(saved===undefined)delete process.env.AI_VIDEO_TRANSCRIPTION_MODEL;else process.env.AI_VIDEO_TRANSCRIPTION_MODEL=saved;}
});
test("existing SDK sends proper formats, disables hidden retries, honors Retry-After and abort",async t=>{
    const root=await mkdtemp(path.join(os.tmpdir(),"agent-asr-http-"));t.after(()=>rm(root,{recursive:true,force:true}));const filename=path.join(root,"input.wav");await writeFile(filename,Buffer.alloc(64));
    let mode="ok",calls=0,body="";
    const server=http.createServer(async(req,res)=>{calls++;const chunks=[];for await(const part of req)chunks.push(part);body=Buffer.concat(chunks).toString();
        if(mode==="wait")return;
        if(mode==="bodywait"){res.writeHead(200,{"Content-Type":"application/json","x-request-id":"slow-body"});res.flushHeaders();return;}
        if(mode==="huge"){res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({text:"x".repeat(8*1024*1024+1)}));return;}
        if(mode==="rate"){res.writeHead(429,{"Content-Type":"application/json","Retry-After":"5"});res.end(JSON.stringify({error:{message:"rate limit"}}));return;}
        res.writeHead(200,{"Content-Type":"application/json","x-request-id":"fixture-request"});res.end(JSON.stringify({text:"hello",segments:[{start:0,end:1,text:"hello"}],words:[{start:0,end:1,word:"hello"}],unmodified:{tokens:[1,2]}}));
    });
    await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>{server.closeAllConnections();server.close();});
    const client=new OpenAI({apiKey:"fixture-key",baseURL:`http://127.0.0.1:${server.address().port}/v1`,maxRetries:2});
    const records=[];const adapter=createSpeechAdapter({client:()=>client,log:record=>records.push(record)});const config={...getAsrConfig(),model:"whisper-1",responseFormat:"verbose_json",timestampGranularities:["segment","word"]};
    const output=await adapter.transcribe({filename,language:"es",signal:new AbortController().signal,config});assert.deepEqual(output.raw.unmodified,{tokens:[1,2]});assert.equal(output.requestId,"fixture-request");
    assert.equal(records.find(record=>record.event==="request.started")?.audioBytes,64);
    assert.equal(records.find(record=>record.event==="response.headers")?.requestId,"fixture-request");
    assert.equal(records.find(record=>record.event==="request.succeeded")?.phase,"response_body");
    assert.ok(records.find(record=>record.event==="request.succeeded")?.responseBytes>0);
    assert.ok(records.every(record=>!JSON.stringify(record).includes("hello")));
    assert.match(body,/verbose_json/);assert.match(body,/timestamp_granularities\[\]/);assert.match(body,/name="language"/);
    await adapter.transcribe({filename,language:"auto",signal:new AbortController().signal,config:{...config,model:"gpt-4o-transcribe-diarize",responseFormat:"diarized_json",timestampGranularities:[]}});
    assert.match(body,/diarized_json/);assert.match(body,/chunking_strategy/);assert.doesNotMatch(body,/timestamp_granularities|name="language"/);
    mode="rate";const before=calls;await assert.rejects(adapter.transcribe({filename,language:"auto",signal:new AbortController().signal,config}),error=>error.status===429 && error.retryAfterMs===5000);assert.equal(calls,before+1);
    assert.equal(records.at(-1).httpStatus,429);
    mode="wait";const controller=new AbortController(),pending=adapter.transcribe({filename,signal:controller.signal,config});setTimeout(()=>controller.abort(Object.assign(new Error("stop"),{code:"VIDEO_AGENT_CANCELLED"})),100);
    await assert.rejects(pending,{code:"VIDEO_AGENT_CANCELLED"});
    assert.equal(records.at(-1).abortSource,"worker");
    const timeout=process.env.AI_VIDEO_OPENAI_TIMEOUT_MS;
    try{process.env.AI_VIDEO_OPENAI_TIMEOUT_MS="100";await assert.rejects(adapter.transcribe({filename,signal:new AbortController().signal,config,diagnostics:{runId:"test-run",stepId:"test-step",chunkOrdinal:2,chunkDurationMs:602000}}),{code:"ETIMEDOUT"});
        assert.equal(records.at(-1).abortSource,"asr_deadline");assert.equal(records.at(-1).phase,"awaiting_response");
        assert.equal(records.at(-1).chunkOrdinal,2);assert.equal(records.at(-1).chunkDurationMs,602000);
        mode="bodywait";await assert.rejects(adapter.transcribe({filename,signal:new AbortController().signal,config}),{code:"ETIMEDOUT"});
        assert.equal(records.at(-1).phase,"response_body");assert.equal(records.at(-1).requestId,"slow-body");assert.equal(records.at(-1).responseBytes,0);
    }
    finally{if(timeout===undefined)delete process.env.AI_VIDEO_OPENAI_TIMEOUT_MS;else process.env.AI_VIDEO_OPENAI_TIMEOUT_MS=timeout;}
    mode="wait";const asrTimeout=process.env.VIDEO_AGENT_ASR_TIMEOUT_MS;
    try{
        process.env.AI_VIDEO_OPENAI_TIMEOUT_MS="5000";process.env.VIDEO_AGENT_ASR_TIMEOUT_MS="100";
        await assert.rejects(adapter.transcribe({filename,signal:new AbortController().signal,config}),{code:"ETIMEDOUT"});
        process.env.VIDEO_AGENT_ASR_TIMEOUT_MS="600001";
        await assert.rejects(adapter.transcribe({filename,signal:new AbortController().signal,config}),{code:"VIDEO_AGENT_ASR_CONFIG_INVALID"});
    }finally{
        if(timeout===undefined)delete process.env.AI_VIDEO_OPENAI_TIMEOUT_MS;else process.env.AI_VIDEO_OPENAI_TIMEOUT_MS=timeout;
        if(asrTimeout===undefined)delete process.env.VIDEO_AGENT_ASR_TIMEOUT_MS;else process.env.VIDEO_AGENT_ASR_TIMEOUT_MS=asrTimeout;
    }
    mode="huge";await assert.rejects(adapter.transcribe({filename,signal:new AbortController().signal,config}),{code:"VIDEO_AGENT_ASR_RESPONSE_TOO_LARGE"});
    assert.equal(retryAfterMs(new Headers({"Retry-After":"Thu, 01 Jan 1970 00:00:10 GMT"}),0),10000);
});
