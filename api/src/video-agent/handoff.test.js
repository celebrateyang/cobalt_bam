import test from "node:test";
import assert from "node:assert/strict";
import {validateTranslatedClips} from "./translated-contract.js";
import {compilePlan} from "./plans.js";
const options={sourceChecksum:"checksum",durationMs:60000,targetLanguage:"es"};
const fixture=()=>({version:"translated-clips-v1",sourceChecksum:"checksum",durationMs:60000,config:{targetLanguage:"es"},clips:[{id:"clip",startMs:0,endMs:20000,cueIds:["one","two"]}],cues:[{id:"one",sourceText:"First idea",translatedText:"Primera idea",startMs:0,endMs:10000},{id:"two",sourceText:"Conclusion",translatedText:"Conclusion",startMs:10000,endMs:20000}]});
test("Task 6 handoff rejects missing, extra, overlapping or changed cue boundaries",()=>{
    assert.equal(validateTranslatedClips(fixture(),options).clips.length,1);
    const mutations=[value=>value.cues[0].translatedText="",value=>value.clips[0].startMs=1,value=>value.clips[0].cueIds=["one","unknown"],value=>value.cues[1].startMs=9000,value=>value.cues.push({id:"extra",sourceText:"extra",translatedText:"extra",startMs:30000,endMs:40000}),value=>value.clips.push({...value.clips[0],id:"duplicate-time"}),value=>value.config.targetLanguage="zh",value=>value.sourceChecksum="different"];
    for(const mutate of mutations){const value=fixture();mutate(value);assert.throws(()=>validateTranslatedClips(value,options),{code:"VIDEO_AGENT_TRANSLATED_CONTRACT_INVALID"});}
});
test("target language and glossary edits retain selection but invalidate translation and downstream",()=>{
    const plan={sourceLanguage:"en",targetLanguage:"es",clips:{requestedCount:3,minSeconds:15,maxSeconds:90},subtitles:{mode:"bilingual"},video:{},glossary:[]};
    const base=compilePlan({plan,sourceSnapshot:{checksum:"source"},revision:1});
    for(const changed of [{...plan,targetLanguage:"zh"},{...plan,glossary:[{source:"brand",target:"Brand"}]}]){
        const graph=compilePlan({plan:changed,sourceSnapshot:{checksum:"source"},revision:2});assert.deepEqual(base.slice(0,5).map(step=>step.inputHash),graph.slice(0,5).map(step=>step.inputHash));assert.ok(base.slice(5).every((step,i)=>step.inputHash!==graph[i+5].inputHash));
    }
});
