import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {mkdtemp,rm,readFile,writeFile,stat} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import {renderAss} from "../ai-video/subtitles.js";
import {createRenderHandler} from "./render-handler.js";
import {verifyHandler} from "./verify-handler.js";
import {RENDER_CONFIG,VERIFY_CONFIG} from "./delivery-config.js";
import {runAbortableProcess} from "./worker-media.js";

test("dubbed MP4 replaces the source tone and passes duration and stream verification",{timeout:120000},async()=>{
    const workDir=await mkdtemp(path.join(os.tmpdir(),"agent-dub-render-")),signal=new AbortController().signal;
    try{
        const sourceFile=path.join(workDir,"source-fixture.mp4"),dubFile=path.join(workDir,"dub-fixture.wav");
        await runAbortableProcess(ffmpeg,["-nostdin","-v","error","-y","-f","lavfi","-i","color=c=black:s=320x180:r=30:d=15",
            "-f","lavfi","-i","sine=frequency=880:duration=15","-c:v","libx264","-preset","ultrafast","-c:a","aac","-shortest",sourceFile],{signal});
        await runAbortableProcess(ffmpeg,["-nostdin","-v","error","-y","-f","lavfi","-i","sine=frequency=440:duration=15",
            "-ac","1","-ar","48000","-c:a","pcm_s16le",dubFile],{signal});
        const assets=new Map([["dub",await readFile(dubFile)],["ass",Buffer.from(renderAss([{id:"cue",startMs:0,endMs:15000,text:"Dubbed clip"}],{bilingual:false}))]]);
        const source={checksum:"a".repeat(64),durationMs:15000,sizeBytes:(await stat(sourceFile)).size};
        const plan={video:{aspectRatio:"9:16",preset:"tiktok"},dubbing:{enabled:true,voiceId:"alloy"}};
        const clip={id:"clip",startMs:0,endMs:15000,subtitles:{ass:{id:"ass"}},dubAudio:{id:"dub"},
            fit:{originalMs:15000,fittedMs:15000,spokenDurationMs:15000,speed:1,peakDb:-6,meanDb:-20}};
        const values=new Map([["subtitles",{version:"subtitle-clips-v1",sourceChecksum:source.checksum,clips:[clip]}]]);
        const readFileArtifact=async(id,filename)=>{assert.ok(assets.has(id));if(filename)await writeFile(filename,assets.get(id));return {id};};
        const artifact=async value=>{const id=randomUUID();values.set(id,value);return {id};};
        const fileArtifact=async filename=>{const id=randomUUID();assets.set(id,await readFile(filename));return {id};};
        const render=createRenderHandler({download:async()=>sourceFile});
        const rendered=await render({claim:{run:{plan,source_snapshot:source},step:{input_snapshot:{config:{...RENDER_CONFIG,...plan.video,dubbing:plan.dubbing}}}},
            dependencies:[{stage:"build_dub_subtitles",checkpoint:{subtitleClipsRef:"subtitles"}}],signal,workDir,
            readArtifact:async id=>values.get(id),readFileArtifact,fileArtifact,artifact,commitCheckpoint:async()=>{}});
        const videoId=rendered.checkpoint.clips[0].video.id;
        const verified=await verifyHandler({claim:{run:{plan,source_snapshot:source},step:{input_snapshot:{config:VERIFY_CONFIG}}},
            dependencies:[{stage:"render",checkpoint:rendered.checkpoint}],signal,workDir,readArtifact:async id=>values.get(id),readFileArtifact,artifact});
        assert.equal(verified.checkpoint.verified,true);
        const renderedFile=path.join(workDir,"frequency.mp4"),pcmFile=path.join(workDir,"tone.pcm");await writeFile(renderedFile,assets.get(videoId));
        await runAbortableProcess(ffmpeg,["-nostdin","-v","error","-y","-ss","1","-t","0.1","-i",renderedFile,
            "-vn","-ac","1","-ar","48000","-f","s16le",pcmFile],{signal});
        const samples=await readFile(pcmFile);let crossings=0;
        for(let offset=2;offset<samples.length;offset+=2)if(samples.readInt16LE(offset-2)<0 && samples.readInt16LE(offset)>=0)crossings++;
        assert.ok(crossings>=35 && crossings<=55,`Expected a 440 Hz dub tone; observed ${crossings} cycles in 0.1 seconds`);
    }finally{await rm(workDir,{recursive:true,force:true});}
});
