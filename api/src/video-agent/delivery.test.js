import assert from "node:assert/strict";
import test from "node:test";
import {applyResultEdits,buildSourceClipCues,subtitleHandler} from "./subtitle-handler.js";
import {verifyHandler,publishHandler} from "./verify-handler.js";
import {SUBTITLE_CONFIG,VERIFY_CONFIG} from "./delivery-config.js";
import {mkdtemp,rm,readFile,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("clip-relative subtitles preserve text and source boundaries with at most two lines",()=>{
    const clip={startMs:15000,cueIds:["cue"]},value={cues:[{id:"cue",sourceText:"Opening.",translatedText:"Una idea completa.",startMs:15000,endMs:19000,timingQuality:"word"}]};
    assert.deepEqual(buildSourceClipCues(value,clip,"bilingual")[0],{id:"cue",startMs:0,endMs:4000,text:"Opening.\nUna idea completa.",timingQuality:"word"});
    value.cues[0].translatedText="Long translation ".repeat(20);
    const split=buildSourceClipCues(value,clip,"bilingual");assert.equal(split[0].startMs,0);assert.equal(split.at(-1).endMs,4000);
    assert.equal(split.map(cue=>cue.text.split("\n").filter(line=>line!=="Opening.").join("")).join("").replace(/\s/g,""),value.cues[0].translatedText.replace(/\s/g,""));
    assert.ok(split.every((cue,i)=>cue.text.split("\n").length<=2 && cue.timingQuality==="estimated" && (!i || cue.startMs===split[i-1].endMs)));
    value.cues[0].endMs=15100;assert.throws(()=>buildSourceClipCues(value,clip,"bilingual"),{code:"VIDEO_AGENT_SUBTITLE_UNREADABLE"});
});
test("an isolated ASR micro-cue is merged with its neighbor",()=>{
    const cues=[
        {id:"tiny",sourceText:"Brief.",translatedText:"短。",startMs:1000,endMs:1061,timingQuality:"estimated"},
        {id:"next",sourceText:"A readable sentence.",translatedText:"一条可读的字幕。",startMs:1061,endMs:4000,timingQuality:"estimated"}
    ],clip={startMs:1000,cueIds:cues.map(cue=>cue.id)};
    const built=buildSourceClipCues({cues},clip,"bilingual");
    assert.equal(built.length,1);assert.equal(built[0].startMs,0);assert.equal(built[0].endMs,3000);
    assert.match(built[0].text,/Brief\./);assert.match(built[0].text,/A readable sentence\./);assert.match(built[0].text,/短。/);assert.match(built[0].text,/一条可读的字幕。/);
    assert.equal(built[0].timingQuality,"estimated");
});
test("result edits change exported subtitles and keep clip boundaries on source cues",async()=>{
    const workDir=await mkdtemp(path.join(os.tmpdir(),"agent-edit-subtitles-"));
    try{
        const source={checksum:"f".repeat(64),durationMs:40000},cues=[
            {id:"cue_a",sourceText:"First",translatedText:"Primero",startMs:0,endMs:10000,timingQuality:"word"},
            {id:"cue_b",sourceText:"Second",translatedText:"Segundo",startMs:10000,endMs:20000,timingQuality:"word"},
            {id:"cue_c",sourceText:"Third",translatedText:"Tercero",startMs:20000,endMs:30000,timingQuality:"word"}];
        const value={version:"translated-clips-v1",sourceChecksum:source.checksum,durationMs:source.durationMs,config:{targetLanguage:"es"},
            clips:[{id:"clip_one",title:"Old",startMs:0,endMs:30000,cueIds:cues.map(cue=>cue.id)}],cues};
        const edits={baseRunId:"00000000-0000-4000-8000-000000000001",clips:{clip_one:{title:"New",focusX:0.75,startCueId:"cue_b",endCueId:"cue_c"}},subtitles:{cue_b:"Texto nuevo"}};
        const changed=applyResultEdits(value,edits);
        assert.equal(changed.clips[0].startMs,10000);assert.equal(changed.clips[0].endMs,30000);assert.equal(changed.clips[0].focusX,0.75);
        assert.deepEqual(changed.clips[0].cueIds,["cue_b","cue_c"]);
        assert.equal(buildSourceClipCues(changed,changed.clips[0],"translated")[0].text,"Texto nuevo");
        assert.throws(()=>applyResultEdits(value,{...edits,clips:{clip_one:{startCueId:"cue_c",endCueId:"cue_b"}}}),{code:"VIDEO_AGENT_EDIT_BOUNDARY_INVALID"});
        const files={},config={...SUBTITLE_CONFIG,enabled:true,mode:"translated",edits};
        const output=await subtitleHandler({claim:{run:{source_snapshot:source,plan:{targetLanguage:"es",subtitles:{enabled:true,mode:"translated"},clips:{},edits}},step:{input_snapshot:{config}}},
            dependencies:[{stage:"translate_selected",checkpoint:{translatedClipsRef:"translation"}}],signal:new AbortController().signal,workDir,
            readArtifact:async()=>value,artifact:async data=>({id:"manifest",value:data}),fileArtifact:async(filename,{kind})=>{files[kind]=await readFile(filename,"utf8");return {id:kind};},commitCheckpoint:async()=>{}});
        assert.equal(output.checkpoint.clips[0].title,"New");assert.equal(output.checkpoint.clips[0].focusX,0.75);
        assert.ok(files.subtitle_srt.includes("Texto nuevo"));assert.ok(!files.subtitle_srt.includes("Primero"));
    }finally{await rm(workDir,{recursive:true,force:true});}
});
test("exports escape VTT and ASS markup and preserve UTF-8 text",async()=>{
    const workDir=await mkdtemp(path.join(os.tmpdir(),"agent-subtitles-"));
    try{const files={},config={...SUBTITLE_CONFIG,enabled:true,mode:"bilingual"},source={checksum:"a".repeat(64),durationMs:20000};
        const value={version:"translated-clips-v1",sourceChecksum:source.checksum,durationMs:20000,config:{targetLanguage:"es"},clips:[{id:"clip",startMs:0,endMs:20000,cueIds:["cue"]}],cues:[{id:"cue",sourceText:"Hello {tag}",translatedText:"Hola <b> & \u4e2d\u6587",startMs:0,endMs:20000,timingQuality:"word"}]};
        const output=await subtitleHandler({claim:{run:{source_snapshot:source,plan:{targetLanguage:"es",subtitles:config,clips:{}}},step:{input_snapshot:{config}}},dependencies:[{stage:"translate_selected",checkpoint:{translatedClipsRef:"translation"}}],signal:new AbortController().signal,workDir,readArtifact:async()=>value,artifact:async value=>({id:"manifest",value}),fileArtifact:async(filename,{kind})=>{files[kind]=await readFile(filename,"utf8");return {id:kind};},commitCheckpoint:async()=>{}});
        assert.ok(files.subtitle_vtt.includes("&lt;b&gt; &amp;"));assert.ok(files.subtitle_ass.includes("\\{tag\\}"));assert.ok(files.subtitle_srt.includes("\u4e2d\u6587"));assert.equal(output.outputRefs.length,4);
    }finally{await rm(workDir,{recursive:true,force:true});}
});
test("verification rejects non-media bytes and publication rejects an unverified report",async()=>{
    const workDir=await mkdtemp(path.join(os.tmpdir(),"agent-verify-")),signal=new AbortController().signal;
    try{await assert.rejects(verifyHandler({claim:{run:{source_snapshot:{checksum:"source"}},step:{input_snapshot:{config:VERIFY_CONFIG}}},dependencies:[{stage:"render",checkpoint:{renderedClipsRef:"render"}}],signal,workDir,readArtifact:async()=>({version:"rendered-clips-v1",sourceChecksum:"source",clips:[{video:{id:"video"},startMs:0,endMs:20000,subtitles:{}}]}),readFileArtifact:async(_id,filename)=>writeFile(filename,"not a video"),artifact:async()=>{assert.fail("must not verify invalid media");}}));
        await assert.rejects(publishHandler({claim:{run:{source_snapshot:{checksum:"source"},plan:{clips:{requestedCount:3}}}},dependencies:[{stage:"verify",checkpoint:{verified:false,verifiedClipsRef:"report"}}],signal,readArtifact:async()=>({version:"verified-clips-v1",verified:true,clips:[{}]})}),{code:"VIDEO_AGENT_RESULTS_UNVERIFIED"});
    }finally{await rm(workDir,{recursive:true,force:true});}
});
