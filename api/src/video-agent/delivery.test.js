import assert from "node:assert/strict";
import test from "node:test";
import {buildSourceClipCues,subtitleHandler} from "./subtitle-handler.js";
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
