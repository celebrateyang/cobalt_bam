import assert from "node:assert/strict";
import test from "node:test";
import {createTtsAdapter} from "./tts-adapter.js";
import {getTtsConfig} from "./tts-config.js";

const config={provider:"openai",model:"tts-1",voiceId:"alloy",maxRunChars:1000,maxRunAudioMs:90000,
    maxRunMicroUsd:1000000,rateMicroUsdPerMillionChars:15000000};
const mp3=Buffer.concat([Buffer.from([0x49,0x44,0x33,0x04,0x00,0x00]),Buffer.alloc(122)]);
const fakeClient=(body=mp3,headers=new Headers())=>{
    const calls=[];
    const client=()=>({withOptions(options){
        calls.push({options});
        return {audio:{speech:{create(params,requestOptions){
            calls.push({params,requestOptions});
            return {asResponse:async()=>({body:new ReadableStream({start(controller){controller.enqueue(body);controller.close();}}),headers})};
        }}}};
    }});
    return {client,calls};
};

test("TTS remains disabled without explicit feature flag and cost limits",()=>{
    const original={...process.env};
    try{
        delete process.env.VIDEO_AGENT_DUBBING_ENABLED;
        assert.throws(()=>getTtsConfig(),{code:"VIDEO_AGENT_DUBBING_DISABLED"});
        process.env.VIDEO_AGENT_DUBBING_ENABLED="1";
        process.env.OPENAI_API_KEY="test-only";
        process.env.VIDEO_AGENT_TTS_VOICE="alloy";
        delete process.env.VIDEO_AGENT_TTS_MAX_RUN_CHARS;
        assert.throws(()=>getTtsConfig(),{code:"VIDEO_AGENT_TTS_CONFIG_INVALID"});
        process.env.VIDEO_AGENT_TTS_MAX_RUN_CHARS="1000";
        process.env.VIDEO_AGENT_TTS_MAX_RUN_AUDIO_MS="90000";
        process.env.VIDEO_AGENT_MAX_RUN_COST_MICRO_USD="1000000";
        process.env.VIDEO_AGENT_TTS_MICRO_USD_PER_MILLION_CHARS="15000000";
        assert.deepEqual(getTtsConfig(),config);
    }finally{
        for(const name of ["OPENAI_API_KEY","VIDEO_AGENT_DUBBING_ENABLED","VIDEO_AGENT_TTS_VOICE","VIDEO_AGENT_TTS_MAX_RUN_CHARS",
            "VIDEO_AGENT_TTS_MAX_RUN_AUDIO_MS","VIDEO_AGENT_MAX_RUN_COST_MICRO_USD","VIDEO_AGENT_TTS_MICRO_USD_PER_MILLION_CHARS"]){
            if(original[name]===undefined)delete process.env[name];else process.env[name]=original[name];
        }
    }
});

test("TTS estimates and validates fixed voice and bounded text before contacting provider",async()=>{
    const {client,calls}=fakeClient(),adapter=createTtsAdapter({client});
    assert.deepEqual(adapter.capabilities(config).voices,["alloy"]);
    assert.deepEqual(adapter.estimate("Hello",config),{chars:5,estimatedMicroUsd:75});
    for(const text of ["","hello\nworld","a".repeat(4097)])
        assert.throws(()=>adapter.estimate(text,config),{code:"VIDEO_AGENT_TTS_INPUT_INVALID"});
    const base={text:"Hello",voiceId:"alloy",config,budget:{remainingChars:1000,remainingMicroUsd:1000000}};
    await assert.rejects(adapter.synthesize({...base,voiceId:"nova"}),{code:"VIDEO_AGENT_TTS_VOICE_INVALID"});
    await assert.rejects(adapter.synthesize({...base,budget:{remainingChars:4,remainingMicroUsd:1000000}}),{code:"VIDEO_AGENT_TTS_BUDGET_EXCEEDED"});
    await assert.rejects(adapter.synthesize({...base,budget:{remainingChars:1000,remainingMicroUsd:74}}),{code:"VIDEO_AGENT_TTS_BUDGET_EXCEEDED"});
    assert.equal(calls.length,0);
});

test("TTS returns bounded MP3 and request metadata with provider retries disabled",async()=>{
    const {client,calls}=fakeClient(mp3,new Headers({"x-request-id":"tts-request"}));
    const adapter=createTtsAdapter({client});
    const result=await adapter.synthesize({text:"Hello",voiceId:"alloy",config,
        budget:{remainingChars:1000,remainingMicroUsd:1000000}});
    assert.deepEqual(result.audio,mp3);
    assert.equal(result.estimatedMicroUsd,75);
    assert.equal(result.requestId,"tts-request");
    assert.deepEqual(calls[1].params,{model:"tts-1",voice:"alloy",input:"Hello",response_format:"mp3"});
    assert.equal(calls[1].requestOptions.maxRetries,0);
});

test("TTS cancellation before synthesis makes no provider call",async()=>{
    const {client,calls}=fakeClient(),adapter=createTtsAdapter({client});
    const controller=new AbortController();controller.abort(new Error("cancelled"));
    await assert.rejects(adapter.synthesize({text:"Hello",voiceId:"alloy",config,signal:controller.signal,
        budget:{remainingChars:1000,remainingMicroUsd:1000000}}),/cancelled/);
    assert.equal(calls.length,0);
});

test("TTS rejects empty or oversized provider output",async()=>{
    for(const body of [Buffer.alloc(0),Buffer.from("not audio"),Buffer.concat([mp3,Buffer.alloc(16*1024*1024)])]){
        const adapter=createTtsAdapter({client:fakeClient(body).client});
        await assert.rejects(adapter.synthesize({text:"Hello",voiceId:"alloy",config,
            budget:{remainingChars:1000,remainingMicroUsd:1000000}}),
        {code:body.length>16*1024*1024?"VIDEO_AGENT_TTS_OUTPUT_TOO_LARGE":"VIDEO_AGENT_TTS_OUTPUT_INVALID"});
    }
});

test("TTS keeps retry-after on a provider throttle",async()=>{
    const throttled=()=>({withOptions(){return {audio:{speech:{create(){return {asResponse:async()=>{
        throw Object.assign(new Error("throttled"),{status:429,headers:new Headers({"retry-after":"2"})});
    }};}}}};}});
    const adapter=createTtsAdapter({client:throttled});
    await assert.rejects(adapter.synthesize({text:"Hello",voiceId:"alloy",config,
        budget:{remainingChars:1000,remainingMicroUsd:1000000}}),error=>{
        assert.equal(error.code,"VIDEO_AGENT_TTS_HTTP_429");assert.equal(error.retryAfterMs,2000);return true;
    });
});
