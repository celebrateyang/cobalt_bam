import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { agentError } from "../db/video-agent.js";
import { getAiVideoObjectStorage } from "../ai-video/object-storage.js";
import { withLease } from "./worker-store.js";

export const runAbortableProcess = (command,args,{ signal,timeoutMs=120000 }={}) => new Promise((resolve,reject) => {
    signal?.throwIfAborted();
    const child=spawn(command,args,{ windowsHide:true,stdio:["ignore","pipe","pipe"] });
    let stdout="",timedOut=false;
    child.stdout.on("data",chunk=>{stdout=(stdout+chunk.toString("utf8")).slice(-1024*1024);});
    // Drain stderr without including source filenames or provider text in errors.
    child.stderr.resume();
    const abort=()=>child.kill("SIGKILL");
    signal?.addEventListener("abort",abort,{once:true});
    const timer=setTimeout(()=>{timedOut=true;abort();},timeoutMs);
    const clear=()=>{clearTimeout(timer);signal?.removeEventListener("abort",abort);};
    child.once("error",error=>{clear();reject(error);});
    child.once("close",code=>{
        clear();
        if(signal?.aborted)reject(signal.reason);
        else if(timedOut)reject(Object.assign(new Error("Media process timed out"),{code:"ETIMEDOUT"}));
        else if(code===0)resolve({stdout});
        else reject(agentError("VIDEO_AGENT_MEDIA_PROCESS_FAILED",422,"Media process failed"));
    });
});

export const downloadVerifiedSource = async (claim,workDir,{signal,storage=getAiVideoObjectStorage()}={}) => {
    const source=await withLease(claim,async client=>(await client.query("SELECT * FROM video_agent_sources WHERE id=$1 AND project_id=$2",[claim.run.source_snapshot.id,claim.projectId])).rows[0]);
    const snapshot=claim.run.source_snapshot;
    if(!source || source.status!=="ready" || Number(source.retention_until)<=Date.now() || source.generation!==snapshot.generation || source.checksum!==snapshot.checksum)throw agentError("VIDEO_AGENT_SOURCE_CHANGED",409,"Source changed or expired");
    const head=await storage.headObject(source.object_key);
    if(head.generation!==snapshot.generation || head.sizeBytes!==snapshot.sizeBytes)throw agentError("VIDEO_AGENT_SOURCE_CHANGED",409,"Source object changed");
    const input=path.join(workDir,"source");const hash=createHash("sha256");let size=0;
    const verify=new Transform({transform(chunk,_encoding,done){size+=chunk.length;hash.update(chunk);done(size>snapshot.sizeBytes?agentError("VIDEO_AGENT_SOURCE_CHANGED",409,"Source size exceeded"):null,chunk);}});
    await pipeline(storage.openReadStream(source.object_key),verify,createWriteStream(input,{flags:"wx"}),{signal});
    if(size!==snapshot.sizeBytes || hash.digest("hex")!==snapshot.checksum)throw agentError("VIDEO_AGENT_SOURCE_CHANGED",409,"Source checksum changed");
    return input;
};
