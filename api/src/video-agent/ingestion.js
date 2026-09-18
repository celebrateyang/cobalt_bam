import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { agentQuery as query, agentError, finalizeSource, ownedProject, transaction } from "../db/video-agent.js";
import { getAiVideoObjectStorage } from "../ai-video/object-storage.js";
import { decryptUploadSession } from "../ai-video/session-crypto.js";
import { readMediaImportToken } from "../ai-video/media-import-token.js";
import { probeVideo } from "../ai-video/media.js";
import { downloadAgentImport } from "./import-download.js";
import { MAX_BYTES } from "./materials.js";

const LEASE_MS = 5 * 60 * 1000;
export const claimSource = async () => {
    return transaction(async (client) => {
    const now = Date.now();
    const result = await client.query(`UPDATE video_agent_sources s SET status='ingesting',lease_token=$1,lease_until=$2,attempts=attempts+1,updated_at=$3
        WHERE s.id=(SELECT s2.id FROM video_agent_sources s2 JOIN video_agent_projects p ON p.id=s2.project_id
            WHERE p.deleted_at IS NULL AND s2.retention_until>$3 AND s2.attempts<3 AND
                (s2.status='queued_ingest' OR (s2.status='ingesting' AND s2.lease_until<$3))
            ORDER BY s2.created_at FOR UPDATE OF s2 SKIP LOCKED LIMIT 1) RETURNING s.*`, [randomUUID(), now + LEASE_MS, now]);
    const source = result.rows[0];
    if (source?.kind === 'download_import') {
        source.attempt_key = `${source.object_key}-${source.lease_token.replaceAll("-", "")}`;
        await client.query(`INSERT INTO video_agent_assets(id,project_id,source_id,object_key,size_bytes,status,expires_at)
            VALUES($1,$2,$3,$4,0,'pending',$5)`, [randomUUID(), source.project_id, source.id, source.attempt_key, now + 24 * 60 * 60 * 1000]);
    }
    return source || null;
    });
};
export const validateProbe = (probe) => {
    if (!Number.isFinite(probe.durationSeconds) || probe.durationSeconds <= 0 || probe.durationSeconds > 3600 || !probe.width || !probe.height) throw agentError("VIDEO_AGENT_INVALID_MEDIA", 422, "Source must be a valid video of at most 60 minutes");
};
export const ingestSource = async (source, { storage = getAiVideoObjectStorage(), probe = probeVideo, download = downloadAgentImport } = {}) => {
    const workDir = await mkdtemp(path.join(os.tmpdir(), "fsv-video-agent-"));
    const sourcePath = path.join(workDir, "source");
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 30 * 60 * 1000);
    let heartbeatBusy = false;
    const heartbeat = setInterval(async () => {
        if (heartbeatBusy) return;
        heartbeatBusy = true;
        try {
            const result = await query(`UPDATE video_agent_sources SET lease_until=$3 WHERE id=$1 AND lease_token=$2 AND status='ingesting'`, [source.id, source.lease_token, Date.now() + LEASE_MS]);
            if (!result.rowCount) controller.abort();
        } catch { controller.abort(); }
        finally { heartbeatBusy = false; }
    }, 30000);
    try {
        if (source.kind === "download_import") {
            const owner = await query(`SELECT user_id FROM video_agent_projects WHERE id=$1 AND deleted_at IS NULL`, [source.project_id]);
            if (!owner.rowCount) throw agentError("VIDEO_AGENT_SOURCE_DELETED", 410, "Project deleted");
            const payload = readMediaImportToken(decryptUploadSession(source.source_input_encrypted), { expectedUserId: owner.rows[0].user_id, allowExpired: true });
            await download({ url: payload.url, targetPath: sourcePath, maxBytes: MAX_BYTES, signal: controller.signal });
        } else {
            let bytes = 0;
            const limiter = new Transform({ transform(chunk, _encoding, callback) {
                bytes += chunk.length;
                callback(bytes > MAX_BYTES ? new Error("Source exceeds size limit") : null, chunk);
            } });
            await pipeline(storage.openReadStream(source.object_key), limiter, createWriteStream(sourcePath, { flags: "wx" }), { signal: controller.signal });
        }
        const size = (await stat(sourcePath)).size;
        if (!size || size > MAX_BYTES || (source.kind === "upload" && size !== Number(source.size_bytes))) throw agentError("VIDEO_AGENT_SIZE_MISMATCH", 422, "Invalid source size");
        const media = await probe(sourcePath);
        validateProbe(media);
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(sourcePath)) hash.update(chunk);
        const checksum = hash.digest("hex");
        // Every claimed attempt gets a new import object. A stale worker can never overwrite its successor.
        const attemptKey = source.kind === "download_import" ? source.attempt_key : source.object_key;
        if (source.kind === "download_import") {
            const permission = await query(`SELECT 1 FROM video_agent_sources s JOIN video_agent_projects p ON p.id=s.project_id
                WHERE s.id=$1 AND s.lease_token=$2 AND s.status='ingesting' AND s.lease_until>$3 AND p.deleted_at IS NULL`, [source.id, source.lease_token, Date.now()]);
            if (!permission.rowCount || controller.signal.aborted) throw agentError("VIDEO_AGENT_LEASE_LOST", 409, "Source lease lost");
            await pipeline(createReadStream(sourcePath), storage.createWriteStream(attemptKey, { metadata: { contentType: source.mime } }), { signal: controller.signal });
        }
        const object = await storage.headObject(attemptKey);
        if (object.sizeBytes !== size) throw agentError("VIDEO_AGENT_SIZE_MISMATCH", 422, "Stored source size mismatch");
        try {
            await transaction(async (client) => {
                await ownedProject(client, { projectId: source.project_id, userId: (await client.query(`SELECT user_id FROM video_agent_projects WHERE id=$1`, [source.project_id])).rows[0].user_id, lock: true });
                const current = (await client.query(`SELECT * FROM video_agent_sources WHERE id=$1 FOR UPDATE`, [source.id])).rows[0];
                if (current.status !== "ingesting" || current.lease_token !== source.lease_token || Number(current.lease_until) <= Date.now() || controller.signal.aborted) throw agentError("VIDEO_AGENT_LEASE_LOST", 409, "Source lease lost");
                if (attemptKey !== source.object_key) await client.query(`UPDATE video_agent_sources SET object_key=$2 WHERE id=$1`, [source.id, attemptKey]);
                await finalizeSource(client, { ...current, object_key: attemptKey }, { generation: object.generation, sizeBytes: size, checksum, probe: media });
            });
        } catch (error) {
            if (source.kind === "download_import") await storage.deleteObject(attemptKey, object.generation).catch(() => {});
            throw error;
        }
    } catch (error) {
        await query(`UPDATE video_agent_sources SET status='failed',error_code=$3,source_input_encrypted=NULL,cleanup_after=$4,lease_until=NULL,updated_at=$5
            WHERE id=$1 AND lease_token=$2 AND status='ingesting' AND lease_until>$5`, [source.id, source.lease_token, error.code || "VIDEO_AGENT_INGEST_FAILED", Date.now() + 24 * 60 * 60 * 1000, Date.now()]);
        console.warn(`[VIDEO AGENT] source=${source.id} ingestion_failed code=${error.code || "VIDEO_AGENT_INGEST_FAILED"}`);
    } finally {
        clearInterval(heartbeat);
        clearTimeout(deadline);
        await rm(workDir, { recursive: true, force: true });
    }
};
