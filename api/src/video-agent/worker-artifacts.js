import { randomUUID, createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createOpaqueObjectKey, getAiVideoObjectStorage } from "../ai-video/object-storage.js";
import { withLease } from "./worker-store.js";
import { agentError } from "../db/video-agent.js";
import { UUID } from "./plans.js";
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Transform } from "node:stream";
import { ASR_MAX_JSON_BYTES } from "./asr-config.js";

const jsonLimit=kind=>{
    if(kind==="checkpoint")return 1024*1024;
    if(["asr_raw","transcript"].includes(kind))return ASR_MAX_JSON_BYTES;
    throw agentError("VIDEO_AGENT_OUTPUT_INVALID",400,"Unsupported JSON artifact kind");
};

const readableAsset = async (claim,id,kind) => {
    if(!UUID.test(id || ""))throw agentError("VIDEO_AGENT_OUTPUT_INVALID",400,"Invalid artifact");
    const asset=await withLease(claim,async (client,{ step,now }) => {
        const dependencies=(await client.query(`SELECT output_refs FROM video_agent_steps WHERE id=ANY($1::uuid[]) AND run_id=$2 AND status='succeeded'`,[step.dependencies,claim.run.id])).rows;
        const allowed=[...step.output_refs,...dependencies.flatMap((dependency)=>dependency.output_refs)];
        if(!allowed.includes(id))throw agentError("VIDEO_AGENT_OUTPUT_INVALID",409,"Artifact is not a dependency");
        return (await client.query(`SELECT * FROM video_agent_assets WHERE id=$1 AND project_id=$2 AND kind=$4 AND status='ready' AND expires_at>$3`,[id,claim.projectId,now,kind])).rows[0];
    });
    if(!asset)throw agentError("VIDEO_AGENT_OUTPUT_INVALID",409,"Artifact unavailable");
    return asset;
};

export const readJsonArtifact = async (claim,id,{ signal,storage=getAiVideoObjectStorage(),kind="checkpoint" }={}) => {
    const limit=jsonLimit(kind),asset=await readableAsset(claim,id,kind);
    if(Number(asset.size_bytes)>limit)throw agentError("VIDEO_AGENT_OUTPUT_INVALID",409,"Artifact unavailable");
    const head=await storage.headObject(asset.object_key);
    if(head.generation!==asset.generation || head.sizeBytes!==Number(asset.size_bytes))throw agentError("VIDEO_AGENT_OUTPUT_INVALID",409,"Artifact changed");
    let size=0;const chunks=[];
    await pipeline(storage.openReadStream(asset.object_key),new Writable({ write(chunk,_encoding,done){ size+=chunk.length;if(size>limit)done(agentError("VIDEO_AGENT_OUTPUT_INVALID",409,"Artifact too large"));else{ chunks.push(chunk);done(); } } }),{ signal });
    const bytes=Buffer.concat(chunks);
    if(size!==Number(asset.size_bytes) || createHash("sha256").update(bytes).digest("hex")!==asset.checksum)throw agentError("VIDEO_AGENT_OUTPUT_INVALID",409,"Artifact checksum changed");
    return JSON.parse(bytes.toString("utf8"));
};

// Verify stored bytes before reusing a chunk; optionally stream to a local ASR input.
export const readAudioArtifact = async (claim,id,{signal,storage=getAiVideoObjectStorage(),filename,maxBytes=24*1024*1024}={}) => {
    const asset=await readableAsset(claim,id,"audio_chunk");
    const sizeBytes=Number(asset.size_bytes);
    if(!Number.isSafeInteger(sizeBytes) || sizeBytes<=0 || sizeBytes>maxBytes)throw agentError("VIDEO_AGENT_OUTPUT_INVALID",409,"Audio artifact too large");
    const head=await storage.headObject(asset.object_key);
    if(head.generation!==asset.generation || head.sizeBytes!==sizeBytes)throw agentError("VIDEO_AGENT_OUTPUT_INVALID",409,"Audio artifact changed");
    const hash=createHash("sha256");let bytes=0;
    const verify=new Transform({transform(chunk,_encoding,done){bytes+=chunk.length;hash.update(chunk);done(bytes>sizeBytes?agentError("VIDEO_AGENT_OUTPUT_INVALID",409,"Audio size changed"):null,chunk);}});
    const sink=filename?createWriteStream(filename,{flags:"wx"}):new Writable({write(_chunk,_encoding,done){done();}});
    await pipeline(storage.openReadStream(asset.object_key),verify,sink,{signal});
    if(bytes!==sizeBytes || hash.digest("hex")!==asset.checksum)throw agentError("VIDEO_AGENT_OUTPUT_INVALID",409,"Audio checksum changed");
    return {id:asset.id,generation:asset.generation,sizeBytes,checksum:asset.checksum};
};

export const uploadAudioArtifact = async (claim,filename,{signal,storage=getAiVideoObjectStorage(),maxBytes=24*1024*1024}={}) => {
    const sizeBytes=(await stat(filename)).size;
    if(!Number.isSafeInteger(sizeBytes) || sizeBytes<=0 || sizeBytes>maxBytes)throw agentError("VIDEO_AGENT_CHUNK_TOO_LARGE",422,"Audio chunk exceeds byte limit");
    const id=randomUUID(),objectKey=createOpaqueObjectKey(process.env.AI_VIDEO_STORAGE_PREFIX);
    await withLease(claim,async(client,{step,now})=>{
        await client.query(`INSERT INTO video_agent_assets(id,project_id,source_id,kind,object_key,size_bytes,status,expires_at,run_id,step_id,attempt_token,input_hash)
            VALUES($1,$2,$3,'audio_chunk',$4,$5,'pending',$6,$7,$8,$9,$10)`,
        [id,claim.projectId,claim.run.source_snapshot.id,objectKey,sizeBytes,now+24*60*60*1000,claim.run.id,step.id,step.fencing_token,step.input_hash]);
    });
    let bytes=0;const hash=createHash("sha256");
    const verify=new Transform({transform(chunk,_encoding,done){bytes+=chunk.length;hash.update(chunk);done(bytes>sizeBytes?new Error("Audio file changed"):null,chunk);}});
    await pipeline(createReadStream(filename),verify,storage.createWriteStream(objectKey,{metadata:{contentType:"audio/wav"}}),{signal});
    const head=await storage.headObject(objectKey);
    if(bytes!==sizeBytes || head.sizeBytes!==sizeBytes)throw new Error("Audio upload size mismatch");
    return {id,generation:head.generation,sizeBytes,checksum:hash.digest("hex")};
};

export const uploadJsonArtifact = async (claim, value, { signal, storage = getAiVideoObjectStorage(),kind="checkpoint" } = {}) => {
    const limit=jsonLimit(kind);
    const bytes = Buffer.from(JSON.stringify(value));
    if (bytes.length > limit) throw agentError("VIDEO_AGENT_OUTPUT_INVALID",422,"JSON artifact exceeds limit");
    const id = randomUUID();
    const objectKey = createOpaqueObjectKey(process.env.AI_VIDEO_STORAGE_PREFIX);
    await withLease(claim, async (client, { step, now }) => {
        await client.query(`INSERT INTO video_agent_assets(id,project_id,source_id,kind,object_key,size_bytes,status,expires_at,run_id,step_id,attempt_token,input_hash)
            VALUES($1,$2,$3,$11,$4,$5,'pending',$6,$7,$8,$9,$10)`,
        [id,claim.projectId,claim.run.source_snapshot.id,objectKey,bytes.length,now+24*60*60*1000,claim.run.id,step.id,step.fencing_token,step.input_hash,kind]);
    });
    await pipeline(Readable.from(bytes),storage.createWriteStream(objectKey,{ metadata:{ contentType:"application/json" } }),{ signal });
    const object = await storage.headObject(objectKey);
    if (object.sizeBytes !== bytes.length) throw new Error("Artifact size mismatch");
    return { id,generation:object.generation,sizeBytes:bytes.length,checksum:createHash("sha256").update(bytes).digest("hex") };
};
