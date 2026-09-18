import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import OpenAI from "openai";
import {getTranslationConfig,normalizeGlossary} from "./translation-config.js";
import {prepareTranslation,validateTranslations} from "./translate-cues.js";
import {createTranslateHandler} from "./translate-handler.js";
import {createTranslationAdapter,parseTranslationResponse} from "./translation-adapter.js";
import {compilePlan,normalizePlan} from "./plans.js";
const plan={sourceLanguage:"en",targetLanguage:"es",glossary:[{source:"OpenAI",target:"OpenAI"}],clips:{requestedCount:1,minSeconds:15,maxSeconds:90},subtitles:{},video:{}};
const cues=Array.from({length:8},(_,i)=>({id:`cue-${i}`,sourceText:`OpenAI has ${i+1} useful ideas.`,startMs:i*3000,endMs:(i+1)*3000,flags:[],wordIds:[`word-${i}`]}));
const transcript={version:"normalized-transcript-v1",sourceChecksum:"checksum",durationMs:24000,cues};
const selected={version:"selected-clips-v1",sourceChecksum:"checksum",durationMs:24000,sourceTranscriptRef:"normalized",clips:[{id:"clip-1",startMs:3000,endMs:21000,cueIds:cues.slice(1,7).map(cue=>cue.id)}],shortfall:0,shortfallReason:null};
const translated=batch=>({translations:batch.items.map(item=>({cueId:item.cueId,translatedText:`OpenAI tiene ${item.text.match(/\d+/)[0]} ideas utiles.`}))});
const response=value=>({raw:{status:"completed",output_text:JSON.stringify(value)},requestId:"fixture"});
test("only selected cues are batched once; context and glossary stay read-only",()=>{
    const config={...getTranslationConfig(plan),maxCues:2},prepared=prepareTranslation(selected,transcript,config);
    assert.equal(prepared.batches.length,3);assert.deepEqual(prepared.cues.map(cue=>cue.id),selected.clips[0].cueIds);
    assert.ok(prepared.batches.every(batch=>batch.context.every(item=>!batch.items.some(source=>source.cueId===item.cueId))));
    assert.ok(prepared.batches.every(batch=>Buffer.byteLength(JSON.stringify({...batch,glossary:config.glossary}))<=config.maxInputBytes));
    const duplicated={...selected,clips:[...selected.clips,{...selected.clips[0],id:"clip-2"}]};assert.equal(prepareTranslation(duplicated,transcript,config).cues.length,6);
    assert.throws(()=>normalizeGlossary([{source:"x",target:"y"},{source:"X",target:"z"}]),{code:"VIDEO_AGENT_PLAN_INVALID"});
});
test("strict translation coverage and immutable timing; numeric, glossary and language doubts are flags",()=>{
    assert.throws(()=>parseTranslationResponse({status:"completed",output:[{content:[{type:"refusal",refusal:"declined"}]}]}),{code:"VIDEO_AGENT_TRANSLATION_REFUSED"});
    assert.throws(()=>parseTranslationResponse({status:"incomplete",output_text:"{"}),{code:"VIDEO_AGENT_TRANSLATION_FORMAT_INVALID"});
    const config=getTranslationConfig(plan),batch=prepareTranslation(selected,transcript,config).batches[0];
    assert.equal(validateTranslations(translated(batch),batch,config).length,6);
    const good=translated(batch);
    for(const value of [{translations:good.translations.slice(1)},{translations:[good.translations[0],...good.translations.slice(0,5)]},{translations:good.translations.map((item,i)=>i?item:{...item,cueId:"cue-0"})},{translations:good.translations.map((item,i)=>i?item:{...item,startMs:0})},{translations:good.translations.map((item,i)=>i?item:{...item,translatedText:""})}])assert.throws(()=>validateTranslations(value,batch,config),{code:"VIDEO_AGENT_TRANSLATION_FORMAT_INVALID"});
    const flagged=validateTranslations({translations:good.translations.map(item=>({...item,translatedText:"This is a long English answer with 999 ideas."}))},batch,{...config,targetLanguage:"zh"});
    assert.ok(flagged[0].flags.includes("numbers_changed"));assert.ok(flagged[0].flags.includes("glossary_term_missing"));assert.ok(flagged[0].flags.includes("target_script_mismatch"));
});
test("repair then bisection persists successes; recovery never repeats saved provider calls",async()=>{
    const config=getTranslationConfig(plan),assets=new Map();let checkpoint,id=0,calls=[],interrupt=true;
    const ctx={claim:{step:{input_snapshot:{config}},run:{plan,source_snapshot:{checksum:"checksum",durationMs:24000}}},dependencies:[{stage:"select_clips",input_hash:"selection-hash",checkpoint:{selectedClipsRef:"selected"}}],signal:new AbortController().signal,readArtifact:async ref=>ref==="selected"?selected:ref==="normalized"?transcript:assets.get(ref),artifact:async value=>{const ref=`asset-${++id}`;assets.set(ref,structuredClone(value));return {id:ref};},commitCheckpoint:async output=>{checkpoint=structuredClone(output.checkpoint);if(interrupt && output.checkpoint.nodes.some(node=>node.id==="batch-0L" && node.validatedRef)){interrupt=false;throw new Error("interrupted after successful child");}}};
    const handler=createTranslateHandler({provider:{translate:async({batch,repair})=>{calls.push([batch.id,repair]);return batch.id==="batch-0"?response({translations:[]}):response(translated(batch));}}});
    await assert.rejects(handler(ctx),/interrupted/);assert.equal(checkpoint.nodes.find(node=>node.id==="batch-0").split,true);
    const result=await handler({...ctx,checkpoint});assert.deepEqual(calls,[["batch-0",false],["batch-0",true],["batch-0L",false],["batch-0R",false]]);
    const output=assets.get(result.checkpoint.translatedClipsRef);assert.equal(output.version,"translated-clips-v1");assert.equal(output.cues.length,6);assert.equal(output.cues[0].startMs,3000);assert.equal(output.cues[5].endMs,21000);assert.equal(output.cues[0].wordIds[0],"word-1");assert.equal(output.sourceSelectedClipsRef,"selected");
    calls=[];await handler({...ctx,checkpoint:result.checkpoint});assert.equal(calls.length,0);
    const controller=new AbortController();controller.abort(new Error("cancelled"));await assert.rejects(handler({...ctx,signal:controller.signal}),/cancelled/);
    await assert.rejects(handler({...ctx,claim:{...ctx.claim,step:{input_snapshot:{config:{}}}}}),{code:"VIDEO_AGENT_TRANSLATION_CONFIG_CHANGED"});
    await assert.rejects(handler({...ctx,readArtifact:async ref=>ref==="selected"?{...selected,clips:[]}:transcript}),{code:"VIDEO_AGENT_NO_VALID_CLIPS"});
});
test("an untranslatable single cue fails explicitly rather than copying source",async()=>{
    const one={...selected,clips:[{id:"one",cueIds:["cue-1"],startMs:3000,endMs:6000}]},config=getTranslationConfig(plan),assets=new Map();let id=0,calls=0;
    const handler=createTranslateHandler({provider:{translate:async()=>{calls++;return response({translations:[]});}}});
    await assert.rejects(handler({claim:{step:{input_snapshot:{config}},run:{plan,source_snapshot:{checksum:"checksum",durationMs:24000}}},dependencies:[{stage:"select_clips",input_hash:"hash",checkpoint:{selectedClipsRef:"selected"}}],signal:new AbortController().signal,readArtifact:async ref=>ref==="selected"?one:ref==="normalized"?transcript:assets.get(ref),artifact:async value=>{const ref=`asset-${++id}`;assets.set(ref,value);return {id:ref};},commitCheckpoint:async()=>{}}),{code:"VIDEO_AGENT_TRANSLATION_CUE_FAILED"});assert.equal(calls,2);
});
test("SDK translation uses exact-ID schema and shared model; glossary changes invalidate translation only",async t=>{
    let request;const server=http.createServer(async(req,res)=>{let body="";for await(const chunk of req)body+=chunk;request=JSON.parse(body);res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify(response({translations:[]}).raw));});await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>{server.closeAllConnections();server.close();});
    const config=getTranslationConfig(plan),batch=prepareTranslation(selected,transcript,config).batches[0],client=new OpenAI({apiKey:"dummy",baseURL:`http://127.0.0.1:${server.address().port}`});
    await createTranslationAdapter({client:()=>client}).translate({batch,config,signal:new AbortController().signal});assert.equal(request.text.format.name,"video_agent_translations");assert.equal(request.text.format.strict,true);assert.deepEqual(JSON.parse(request.input[1].content).glossary,config.glossary);assert.ok(request.input[0].content.includes("to es"));
    const base=compilePlan({plan,sourceSnapshot:{},revision:1}),changed=compilePlan({plan:{...plan,glossary:[{source:"OpenAI",target:"Brand"}]},sourceSnapshot:{},revision:2});assert.equal(base[4].inputHash,changed[4].inputHash);assert.notEqual(base[5].inputHash,changed[5].inputHash);
    const normalized=normalizePlan({sourceRef:"00000000-0000-0000-0000-000000000001",operation:"highlight_clips",targetLanguage:"es",clips:plan.clips,glossary:plan.glossary});assert.deepEqual(normalized.glossary,config.glossary);
});
