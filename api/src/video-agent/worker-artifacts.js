import { randomUUID, createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createOpaqueObjectKey, getAiVideoObjectStorage } from "../ai-video/object-storage.js";
import { withLease } from "./worker-store.js";
import { agentError } from "../db/video-agent.js";
import { UUID } from "./plans.js";

export const readJsonArtifact = async (claim,id,{ signal,storage=getAiVideoObjectStorage() }={}) => {
    if(!UUID.test(id || ""))throw agentError("VIDEO_AGENT_OUTPUT_INVALID",400,"Invalid artifact");
    const asset=await withLease(claim,async (client,{ step,now }) => {
        const dependencies=(await client.query(`SELECT output_refs FROM video_agent_steps WHERE id=ANY($1::uuid[]) AND run_id=$2 AND status='succeeded'`,[step.dependencies,claim.run.id])).rows;
        const allowed=[...step.output_refs,...dependencies.flatMap((dependency)=>dependency.output_refs)];
        if(!allowed.includes(id))throw agentError("VIDEO_AGENT_OUTPUT_INVALID",409,"Artifact is not a dependency");
        return (await client.query(`SELECT * FROM video_agent_assets WHERE id=$1 AND project_id=$2 AND kind='checkpoint' AND status='ready' AND expires_at>$3`,[id,claim.projectId,now])).rows[0];
    });
    if(!asset || Number(asset.size_bytes)>1024*1024)throw agentError("VIDEO_AGENT_OUTPUT_INVALID",409,"Artifact unavailable");
    const head=await storage.headObject(asset.object_key);
    if(head.generation!==asset.generation || head.sizeBytes!==Number(asset.size_bytes))throw agentError("VIDEO_AGENT_OUTPUT_INVALID",409,"Artifact changed");
    let size=0;const chunks=[];
    await pipeline(storage.openReadStream(asset.object_key),new Writable({ write(chunk,_encoding,done){ size+=chunk.length;if(size>1024*1024)done(new Error("Artifact too large"));else{ chunks.push(chunk);done(); } } }),{ signal });
    const bytes=Buffer.concat(chunks);
    if(size!==Number(asset.size_bytes) || createHash("sha256").update(bytes).digest("hex")!==asset.checksum)throw agentError("VIDEO_AGENT_OUTPUT_INVALID",409,"Artifact checksum changed");
    return JSON.parse(bytes.toString("utf8"));
};

export const uploadJsonArtifact = async (claim, value, { signal, storage = getAiVideoObjectStorage() } = {}) => {
    const bytes = Buffer.from(JSON.stringify(value));
    if (bytes.length > 1024 * 1024) throw new Error("Checkpoint artifact exceeds 1 MiB");
    const id = randomUUID();
    const objectKey = createOpaqueObjectKey(process.env.AI_VIDEO_STORAGE_PREFIX);
    await withLease(claim, async (client, { step, now }) => {
        await client.query(`INSERT INTO video_agent_assets(id,project_id,source_id,kind,object_key,size_bytes,status,expires_at,run_id,step_id,attempt_token,input_hash)
            VALUES($1,$2,$3,'checkpoint',$4,$5,'pending',$6,$7,$8,$9,$10)`,
        [id,claim.projectId,claim.run.source_snapshot.id,objectKey,bytes.length,now+24*60*60*1000,claim.run.id,step.id,step.fencing_token,step.input_hash]);
    });
    await pipeline(Readable.from(bytes),storage.createWriteStream(objectKey,{ metadata:{ contentType:"application/json" } }),{ signal });
    const object = await storage.headObject(objectKey);
    if (object.sizeBytes !== bytes.length) throw new Error("Artifact size mismatch");
    return { id,generation:object.generation,sizeBytes:bytes.length,checksum:createHash("sha256").update(bytes).digest("hex") };
};
