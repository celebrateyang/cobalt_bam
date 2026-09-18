import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import ffprobeStatic from "ffprobe-static";
import { agentError } from "../db/video-agent.js";
import { getAiVideoObjectStorage } from "../ai-video/object-storage.js";
import { withLease } from "./worker-store.js";

export const runAbortableProcess = (command,args,{ signal,timeoutMs=120000 }={}) => new Promise((resolve,reject) => {
    signal?.throwIfAborted();
    const child=spawn(command,args,{ windowsHide:true,stdio:["ignore","pipe","pipe"] });
    let stdout="",stderr="";
    child.stdout.on("data",(chunk) => { stdout=(stdout+chunk.toString("utf8")).slice(-1024*1024); });
    child.stderr.on("data",(chunk) => { stderr=(stderr+chunk.toString("utf8")).slice(-4000); });
    const abort=() => child.kill("SIGKILL");
    signal?.addEventListener("abort",abort,{ once:true });
    const timer=setTimeout(abort,timeoutMs);
    const clear=() => { clearTimeout(timer); signal?.removeEventListener("abort",abort); };
    child.once("error",(error) => { clear();reject(error); });
    child.once("close",(code) => { clear(); if(signal?.aborted) reject(signal.reason); else if(code===0) resolve({ stdout }); else reject(agentError("VIDEO_AGENT_MEDIA_PROCESS_FAILED",422,"Media process failed")); });
});
const probeHandler = async ({ claim,signal,workDir,artifact }) => {
    const storage=getAiVideoObjectStorage();
    const source=await withLease(claim,async (client) => (await client.query(`SELECT * FROM video_agent_sources WHERE id=$1 AND project_id=$2`,[claim.run.source_snapshot.id,claim.projectId])).rows[0]);
    const snapshot=claim.run.source_snapshot;
    if (!source || source.status!=="ready" || Number(source.retention_until)<=Date.now() || source.generation!==snapshot.generation || source.checksum!==snapshot.checksum) throw agentError("VIDEO_AGENT_SOURCE_CHANGED",409,"Source changed or expired");
    const object=await storage.headObject(source.object_key);
    if(object.generation!==snapshot.generation || object.sizeBytes!==snapshot.sizeBytes) throw agentError("VIDEO_AGENT_SOURCE_CHANGED",409,"Source object changed");
    const input=path.join(workDir,"source"); const hash=createHash("sha256"); let bytes=0;
    const verify=new Transform({ transform(chunk,_encoding,callback){ bytes+=chunk.length;hash.update(chunk);callback(bytes>snapshot.sizeBytes?new Error("Source size exceeded"):null,chunk); } });
    await pipeline(storage.openReadStream(source.object_key),verify,createWriteStream(input,{ flags:"wx" }),{ signal });
    if(bytes!==snapshot.sizeBytes || hash.digest("hex")!==snapshot.checksum) throw agentError("VIDEO_AGENT_SOURCE_CHANGED",409,"Source checksum changed");
    const result=await runAbortableProcess(ffprobeStatic.path,["-v","error","-show_streams","-show_format","-of","json",input],{ signal });
    const parsed=JSON.parse(result.stdout); const video=parsed.streams?.find((stream)=>stream.codec_type==="video"); const audio=parsed.streams?.find((stream)=>stream.codec_type==="audio");
    const durationMs=Math.round(Number(parsed.format?.duration)*1000);
    if(!video || !audio || video.width!==snapshot.width || video.height!==snapshot.height || !Number.isSafeInteger(durationMs) || durationMs<=0 || durationMs>3600000 || Math.abs(durationMs-snapshot.durationMs)>1000) throw agentError("VIDEO_AGENT_INVALID_MEDIA",422,"Invalid source media");
    const checkpoint={ durationMs,width:video.width,height:video.height,sourceId:source.id };
    const asset=await artifact(checkpoint);
    return { checkpoint,assets:[asset],outputRefs:[asset.id] };
};
// Media handlers are installed in Tasks 4-6. Unsupported stages are never claimed or marked successful.
export const productionHandlers = { probe:probeHandler };
