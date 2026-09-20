import test from "node:test";
import assert from "node:assert/strict";
import {normalizeTranscript,textUnits} from "./normalize-transcript.js";
import {normalizeHandler} from "./normalize-handler.js";
import {NORMALIZE_CONFIG} from "./normalize-config.js";
import {compilePlan} from "./plans.js";

const source={sourceChecksum:"checksum",durationMs:20000};
const input=(words)=>({version:"transcript-v1",...source,configHash:"asr-hash",segments:[{id:"segment-1",speakerLocalId:"chunk-0:A",words:words.map((word,i)=>({id:`word-${i}`,timingQuality:"word",...word}))}]});
test("cues follow word boundaries, punctuation, pauses and stable identities without dropping interjections",()=>{
    const transcript=input([{text:"Hello",startMs:0,endMs:700},{text:"world.",startMs:700,endMs:1500},{text:"Yes!",startMs:1600,endMs:1900},{text:"Next",startMs:3000,endMs:4300},{text:"sentence.",startMs:4300,endMs:5000}]);
    const before=JSON.stringify(transcript),result=normalizeTranscript(transcript,source);
    assert.equal(JSON.stringify(transcript),before);assert.equal(result.cues.length,2);assert.equal(result.cues[0].sourceText,"Hello world. Yes!");
    assert.deepEqual(result.cues.flatMap(cue=>cue.wordIds),transcript.segments[0].words.map(word=>word.id));
    assert.deepEqual(result.cues.map(cue=>cue.id),normalizeTranscript(transcript,source).cues.map(cue=>cue.id));
    const changed=normalizeTranscript(transcript,{...source,config:{...NORMALIZE_CONFIG,version:"next"}});assert.notEqual(changed.cues[0].id,result.cues[0].id);
});
test("multilingual width and estimated timing are preserved; long words and repetition are explicit",()=>{
    const transcript=input(Array.from({length:12},(_,i)=>({text:"\u4e2d\u6587",startMs:i*300,endMs:(i+1)*300,timingQuality:"estimated"})));
    const result=normalizeTranscript(transcript,source);assert.equal(result.timingQuality,"estimated");
    for(const cue of result.cues){assert.ok(cue.lines.length<=2);assert.ok(cue.lines.every(line=>textUnits(line)<=32));assert.ok(cue.endMs-cue.startMs<=3500);}
    const repeated=normalizeTranscript(input(Array.from({length:4},(_,i)=>({text:"yes",startMs:i*300,endMs:(i+1)*300}))),source);
    assert.ok(repeated.cues[0].flags.includes("repetition_candidate"));assert.equal(repeated.cues[0].wordIds.length,4);
    const long=normalizeTranscript(input([{text:"oh",startMs:0,endMs:6000}]),source);assert.ok(long.cues[0].flags.includes("long_timed_word"));
    const wide=normalizeTranscript(input(Array.from({length:3},(_,i)=>({text:"abcdefghijklmnopqrst",startMs:i*500,endMs:(i+1)*500}))),source);
    assert.equal(wide.cues.length,2);assert.ok(wide.cues.every(cue=>cue.lines.length<=2));
    assert.throws(()=>normalizeTranscript(input([{text:"x".repeat(65),startMs:0,endMs:3000}]),source),{code:"VIDEO_AGENT_SUBTITLE_TEXT_TOO_WIDE"});
});
test("small jitter is marked estimated; invalid, ambiguous and out-of-source timelines fail explicitly",()=>{
    const jitter=normalizeTranscript(input([{text:"one",startMs:0,endMs:1000},{text:"two",startMs:950,endMs:1800}]),source);
    assert.equal(jitter.timingQuality,"estimated");assert.equal(jitter.warnings[0].code,"timing_jitter_clipped");
    const mismatch=input([{text:"one",startMs:0,endMs:1000,timingQuality:"estimated"}]);mismatch.segments[0].alignmentWarning="word_text_mismatch";
    assert.equal(normalizeTranscript(mismatch,source).warnings[0].reason,"word_text_mismatch");
    for(const words of [[{text:"one",startMs:0,endMs:1500},{text:"two",startMs:1000,endMs:2000}],[{text:"x",startMs:-1,endMs:1000}],[{text:"x",startMs:0,endMs:21000}],[{text:"",startMs:0,endMs:1000}],[{text:"x",startMs:0,endMs:0}]])assert.throws(()=>normalizeTranscript(input(words),source),{code:"VIDEO_AGENT_SUBTITLE_TIMELINE_INVALID"});
    assert.throws(()=>normalizeTranscript(input([{text:"x",startMs:0,endMs:1000}]),{...source,sourceChecksum:"other"}),{code:"VIDEO_AGENT_SUBTITLE_TIMELINE_INVALID"});
});
test("bounded estimated overlap across ASR segments keeps all words and requires review",()=>{
    const transcript=input([{text:"first",startMs:1000,endMs:1400,timingQuality:"estimated"},{text:"third",startMs:1400,endMs:1650,timingQuality:"estimated"}]);
    transcript.segments.push({id:"segment-2",speakerLocalId:"chunk-0:B",words:[
        {id:"word-2",text:"second",startMs:1200,endMs:1500,timingQuality:"estimated"},
        {id:"word-3",text:"fourth",startMs:1500,endMs:1800,timingQuality:"estimated"}]});
    const before=JSON.stringify(transcript);
    const result=normalizeTranscript(transcript,source);
    assert.equal(JSON.stringify(transcript),before);
    assert.deepEqual(result.cues.flatMap(cue=>cue.wordIds),["word-0","word-2","word-1","word-3"]);
    assert.equal(result.requiresReview,true);
    assert.equal(result.warnings.filter(warning=>warning.code==="estimated_segment_overlap_clipped").length,2);
    const precise=structuredClone(transcript);precise.segments[1].words[0].timingQuality="word";
    assert.throws(()=>normalizeTranscript(precise,source),{code:"VIDEO_AGENT_SUBTITLE_TIMELINE_INVALID"});
    const excessive=structuredClone(transcript);excessive.segments[0].words[0].endMs=1800;
    assert.throws(()=>normalizeTranscript(excessive,source),{code:"VIDEO_AGENT_SUBTITLE_TIMELINE_INVALID"});
});
test("normalize handler publishes typed derived artifacts, validates configuration and observes cancellation",async()=>{
    const transcript=input([{text:"Hello",startMs:0,endMs:1500}]);let calls=0;
    const ctx={signal:new AbortController().signal,claim:{step:{input_snapshot:{config:NORMALIZE_CONFIG}},run:{source_snapshot:{checksum:source.sourceChecksum,durationMs:source.durationMs},plan:{sourceLanguage:"en"}}},dependencies:[{stage:"transcribe",checkpoint:{transcriptRef:"raw-transcript"}}],readArtifact:async(ref,options)=>{assert.equal(ref,"raw-transcript");assert.equal(options.kind,"transcript");return transcript;},artifact:async(value,options)=>{calls++;assert.equal(options.kind,"transcript");assert.equal(value.sourceTranscriptRef,"raw-transcript");assert.equal(value.segments,transcript.segments);return {id:"normalized"};}};
    const result=await normalizeHandler(ctx);assert.equal(result.checkpoint.normalizedTranscriptRef,"normalized");assert.equal(result.checkpoint.cueCount,1);
    await assert.rejects(normalizeHandler({...ctx,dependencies:[]}),{code:"VIDEO_AGENT_NORMALIZE_DEPENDENCY_INVALID"});
    await assert.rejects(normalizeHandler({...ctx,claim:{...ctx.claim,step:{input_snapshot:{config:{}}}}}),{code:"VIDEO_AGENT_NORMALIZE_CONFIG_CHANGED"});
    const controller=new AbortController();controller.abort(new Error("cancelled"));await assert.rejects(normalizeHandler({...ctx,signal:controller.signal}),/cancelled/);assert.equal(calls,1);
    const stages=compilePlan({plan:{sourceLanguage:"en",clips:{},subtitles:{},video:{},targetLanguage:"es"},sourceSnapshot:{},revision:1});assert.deepEqual(stages.find(stage=>stage.stage==="normalize").input.config,NORMALIZE_CONFIG);
});
