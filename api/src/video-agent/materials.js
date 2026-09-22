import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import { agentError, assertSourceCapacity, ownedProject, ownedSource, sourceDTO, transaction } from "../db/video-agent.js";
import { createOpaqueObjectKey, getAiVideoObjectStorage } from "../ai-video/object-storage.js";
import { decryptUploadSession, encryptUploadSession } from "../ai-video/session-crypto.js";
import { readMediaImportToken } from "../ai-video/media-import-token.js";

export const CHUNK_BYTES = 8 * 1024 ** 2;
export const MAX_BYTES = 1024 ** 3;
const UPLOAD_TTL = 6 * 60 * 60 * 1000;
const RETENTION = 30 * 24 * 60 * 60 * 1000;
const invalid = (message) => { throw agentError("VIDEO_AGENT_INVALID_REQUEST", 400, message); };
export const validateSourceInput = (body) => {
    if (body?.kind === "download_import") {
        if (typeof body.mediaImportToken !== "string" || body.mediaImportToken.length > 16384 || !body.mediaImportToken) invalid("Media import token is required");
        return;
    }
    if (body?.kind !== "upload") invalid("Unsupported source kind");
    if (!Number.isSafeInteger(body.sizeBytes) || body.sizeBytes <= 0) invalid("Invalid file size");
    if (body.sizeBytes > MAX_BYTES) throw agentError("VIDEO_AGENT_FILE_TOO_LARGE", 413, "Maximum source size is 1 GiB");
    if (typeof body.filename !== "string" || !body.filename.trim() || body.filename.length > 255 || /[\x00-\x1f]/.test(body.filename)) invalid("Invalid filename");
    if (!["video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/x-m4v"].includes(body.contentType)) invalid("Unsupported video type");
    if (typeof body.fileFingerprint !== "string" || body.fileFingerprint.length < 16 || body.fileFingerprint.length > 512) invalid("Invalid file fingerprint");
};
export const uploadDTO = (session) => ({ status: session.status, committedBytes: Number(session.committed_bytes),
    totalBytes: Number(session.total_bytes), chunkSizeBytes: session.chunk_size_bytes,
    fileFingerprint: session.file_fingerprint, expiresAt: Number(session.expires_at) });

const linkLatestSourceRequest = async (client, { projectId, userId, sourceId, now }) => {
    const message = (await client.query(`SELECT m.* FROM video_agent_messages m
        WHERE m.project_id=$1 AND m.user_id=$2 AND m.role='user' AND m.status='completed'
        AND m.planner_output->>'status'='needs_input' AND m.planner_output->'missing' ? 'source'
        AND m.created_at>=$3
        AND NOT EXISTS(SELECT 1 FROM video_agent_sources linked WHERE linked.origin_message_id=m.id)
        ORDER BY m.created_at DESC,m.id DESC FOR UPDATE LIMIT 1`, [projectId, userId, now - 6 * 60 * 60 * 1000])).rows[0];
    if (!message) return null;
    const linked = await client.query(`UPDATE video_agent_sources SET origin_message_id=$2 WHERE id=$1 AND origin_message_id IS NULL RETURNING id`, [sourceId, message.id]);
    if (!linked.rowCount) return null;
    const outcome = { ...message.planner_output, pendingSourceId: sourceId };
    await client.query(`UPDATE video_agent_messages SET status='awaiting_source',planner_output=$2,error_code=NULL,
        planner_claim_token=NULL,planner_claim_until=NULL WHERE id=$1`, [message.id, outcome]);
    return message.id;
};

export const addSource = async ({ projectId, userId, body, originMessageId = null, storage = getAiVideoObjectStorage() }) => {
    validateSourceInput(body);
    let sessionUri;
    let objectKey;
    let reservedSource;
    try {
        return await transaction(async (client) => {
            if (originMessageId) {
                await ownedProject(client, { projectId, userId, lock: false });
                const existing = (await client.query("SELECT * FROM video_agent_sources WHERE project_id=$1 AND origin_message_id=$2", [projectId, originMessageId])).rows[0];
                if (existing) return { source: sourceDTO(existing) };
            }
            const imported = body.kind === "download_import" ? readMediaImportToken(body.mediaImportToken, { expectedUserId: userId }) : null;
            const sizeBytes = imported ? MAX_BYTES : body.sizeBytes; // Reserve maximum before downloading an unknown size.
            await ownedProject(client, { projectId, userId, lock: true });
            if (originMessageId) {
                const existing = (await client.query("SELECT * FROM video_agent_sources WHERE project_id=$1 AND origin_message_id=$2", [projectId, originMessageId])).rows[0];
                if (existing) return { source: sourceDTO(existing) };
            }
            const existingSource = await client.query(`SELECT 1 FROM video_agent_sources
                WHERE project_id=$1 AND status NOT IN ('expired','deleting','deleted') LIMIT 1`, [projectId]);
            if (existingSource.rowCount) throw agentError("VIDEO_AGENT_PROJECT_SOURCE_LIMIT", 409, "A project can contain only one source video");
            await assertSourceCapacity(client, { userId, sizeBytes });
            if (imported) {
                const used = await client.query(`INSERT INTO ai_video_import_nonces(nonce,user_id,expires_at,used_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING nonce`, [imported.nonce, userId, imported.expiresAt, Date.now()]);
                if (!used.rowCount) throw agentError("AI_VIDEO_IMPORT_TOKEN_USED", 409, "Media import token was already used");
            }
            const now = Date.now();
            const sourceId = randomUUID();
            objectKey = createOpaqueObjectKey(process.env.AI_VIDEO_STORAGE_PREFIX);
            // Encryption configuration is verified before creating the storage session.
            const encryptedInput = imported ? encryptUploadSession(body.mediaImportToken) : null;
            encryptUploadSession("configuration-check");
            const result = await client.query(`INSERT INTO video_agent_sources(id,project_id,kind,filename,mime,size_bytes,
                source_input_encrypted,object_key,status,retention_until,created_at,updated_at,origin_message_id)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12) RETURNING *`,
            [sourceId, projectId, body.kind, imported?.filename || body.filename.trim(), imported?.mime || body.contentType,
                sizeBytes, encryptedInput, objectKey, imported ? "queued_ingest" : "uploading", now + RETENTION, now, originMessageId]);
            reservedSource = result.rows[0];
            if (!originMessageId) await linkLatestSourceRequest(client, { projectId, userId, sourceId, now });
            if (!imported) {
                sessionUri = await storage.startResumableUpload({ objectKey, contentType: body.contentType });
                await client.query(`INSERT INTO video_agent_upload_sessions(id,source_id,user_id,encrypted_storage_session,total_bytes,
                    chunk_size_bytes,file_fingerprint,expires_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                [randomUUID(), sourceId, userId, encryptUploadSession(sessionUri), sizeBytes, CHUNK_BYTES, body.fileFingerprint, now + UPLOAD_TTL, now]);
            }
            await client.query(`UPDATE video_agent_projects SET updated_at=$2 WHERE id=$1`, [projectId, now]);
            return { source: sourceDTO(result.rows[0]) };
        });
    } catch (error) {
        let cleanupFailed = false;
        if (sessionUri) await storage.abortResumableUpload({ sessionUri }).catch(() => { cleanupFailed = true; });
        if (objectKey) await storage.deleteObject(objectKey).catch(() => { cleanupFailed = true; });
        // Retain a cleanup record even when the external storage session was created but the DB transaction failed.
        if (reservedSource && sessionUri) {
            await transaction(async (client) => {
                const project = await client.query(`SELECT id FROM video_agent_projects WHERE id=$1 AND user_id=$2 FOR UPDATE`, [projectId, userId]);
                if (!project.rowCount) return;
                const now = Date.now();
                await client.query(`INSERT INTO video_agent_sources(id,project_id,kind,filename,mime,size_bytes,object_key,status,error_code,retention_until,created_at,updated_at,cleanup_after)
                    VALUES($1,$2,'upload',$3,$4,$5,$6,'failed','VIDEO_AGENT_UPLOAD_INIT_FAILED',$7,$8,$8,$8)
                    ON CONFLICT(id) DO UPDATE SET status='failed',error_code='VIDEO_AGENT_UPLOAD_INIT_FAILED',cleanup_after=$8`,
                [reservedSource.id, projectId, reservedSource.filename, reservedSource.mime, reservedSource.size_bytes, objectKey, now + 24 * 60 * 60 * 1000, now]);
                if (cleanupFailed) await client.query(`INSERT INTO video_agent_upload_sessions(id,source_id,user_id,encrypted_storage_session,total_bytes,chunk_size_bytes,file_fingerprint,expires_at,updated_at)
                    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) ON CONFLICT(source_id) DO UPDATE SET encrypted_storage_session=excluded.encrypted_storage_session`,
                [randomUUID(), reservedSource.id, userId, encryptUploadSession(sessionUri), reservedSource.size_bytes, CHUNK_BYTES, body.fileFingerprint, now]);
            }).catch(() => { console.error(`[VIDEO AGENT] source=${reservedSource.id} upload_initialization_cleanup_deferred`); });
        }
        throw error;
    }
};

export const activeUpload = async (client, input) => {
    const source = await ownedSource(client, input);
    const session = (await client.query(`SELECT * FROM video_agent_upload_sessions WHERE source_id=$1 AND user_id=$2 FOR UPDATE`, [input.sourceId, input.userId])).rows[0];
    if (!session) throw agentError("VIDEO_AGENT_UPLOAD_NOT_FOUND", 404, "Upload not found");
    if (session.status !== "completed" && (session.status !== "active" || source.status !== "uploading" || Number(session.expires_at) <= Date.now())) {
        throw agentError("VIDEO_AGENT_UPLOAD_EXPIRED", 410, "Upload has expired or is inactive");
    }
    return { source, session };
};
export const reconcileUpload = async (client, session, storage) => {
    if (session.status === "completed") return { completed: true, committedBytes: Number(session.total_bytes) };
    const remote = await storage.queryUploadOffset({ sessionUri: decryptUploadSession(session.encrypted_storage_session), totalBytes: Number(session.total_bytes) });
    if (!Number.isSafeInteger(remote.committedBytes) || remote.committedBytes < 0 || remote.committedBytes > Number(session.total_bytes)) throw agentError("VIDEO_AGENT_STORAGE_ERROR", 502, "Invalid storage offset");
    await client.query(`UPDATE video_agent_upload_sessions SET committed_bytes=$2,updated_at=$3 WHERE id=$1`, [session.id, remote.committedBytes, Date.now()]);
    session.committed_bytes = remote.committedBytes;
    return remote;
};
export const getUpload = (input) => transaction(async (client) => {
    const { session } = await activeUpload(client, input);
    await reconcileUpload(client, session, input.storage || getAiVideoObjectStorage());
    return uploadDTO(session);
});

// Buffer one bounded chunk and verify its digest BEFORE writing any bytes to storage.
export const readVerifiedChunk = async ({ body, length, digest }) => {
    if (!Number.isSafeInteger(length) || length <= 0 || length > CHUNK_BYTES || !/^[A-Za-z0-9+/]{43}=$/.test(digest || "")) invalid("Invalid chunk headers");
    const chunks = [];
    let bytes = 0;
    const timer = setTimeout(() => body.destroy?.(agentError("VIDEO_AGENT_UPLOAD_TIMEOUT", 408, "Upload chunk timed out")), 120000);
    try { for await (const chunk of body) {
        bytes += chunk.length;
        if (bytes > length) invalid("Chunk length does not match");
        chunks.push(chunk);
    } } finally { clearTimeout(timer); }
    if (bytes !== length) invalid("Chunk length does not match");
    const buffer = Buffer.concat(chunks);
    const actual = createHash("sha256").update(buffer).digest();
    const expected = Buffer.from(digest, "base64");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw agentError("VIDEO_AGENT_DIGEST_MISMATCH", 422, "Chunk digest does not match", {
        length: bytes, expectedDigestPrefix: String(digest || "").slice(0, 12), actualDigestPrefix: actual.toString("base64").slice(0, 12),
    });
    return buffer;
};
export const putUpload = (input) => transaction(async (client) => {
    const { session } = await activeUpload(client, input);
    if (session.status !== "active") throw agentError("VIDEO_AGENT_UPLOAD_INACTIVE", 409, "Upload is already complete");
    const storage = input.storage || getAiVideoObjectStorage();
    const remote = await reconcileUpload(client, session, storage);
    const offset = input.offset;
    const totalBytes = Number(session.total_bytes);
    if (!Number.isSafeInteger(offset) || offset !== remote.committedBytes) throw agentError("VIDEO_AGENT_OFFSET_MISMATCH", 409, "Upload offset does not match", { committedBytes: remote.committedBytes });
    if (offset + input.length > totalBytes || (offset + input.length < totalBytes && input.length !== session.chunk_size_bytes)) invalid("Invalid chunk size");
    let buffer;
    try { buffer = await readVerifiedChunk(input); }
    catch (error) {
        if (error.code === "VIDEO_AGENT_DIGEST_MISMATCH") console.warn(`[VIDEO AGENT] upload_chunk_digest_mismatch source=${input.sourceId} offset=${offset} length=${input.length} expected=${error.context?.expectedDigestPrefix || "none"} actual=${error.context?.actualDigestPrefix || "none"}`);
        throw error;
    }
    const result = await storage.writeUploadChunk({ sessionUri: decryptUploadSession(session.encrypted_storage_session), body: Readable.from(buffer), offset, length: buffer.length, totalBytes });
    if (result.committedBytes !== offset + buffer.length) throw agentError("VIDEO_AGENT_STORAGE_ERROR", 502, "Storage did not commit the complete chunk");
    await client.query(`UPDATE video_agent_upload_sessions SET committed_bytes=$2,updated_at=$3 WHERE id=$1`, [session.id, result.committedBytes, Date.now()]);
    return { committedBytes: result.committedBytes };
});
export const completeUpload = (input) => transaction(async (client) => {
    const { source, session } = await activeUpload(client, input);
    if (session.status === "completed") return { source: sourceDTO(source) };
    const storage = input.storage || getAiVideoObjectStorage();
    const remote = await reconcileUpload(client, session, storage);
    if (!remote.completed || remote.committedBytes !== Number(session.total_bytes)) throw agentError("VIDEO_AGENT_UPLOAD_INCOMPLETE", 409, "Upload is incomplete", { committedBytes: remote.committedBytes });
    const object = await storage.headObject(source.object_key);
    if (object.sizeBytes !== Number(session.total_bytes)) throw agentError("VIDEO_AGENT_SIZE_MISMATCH", 422, "Object size does not match");
    await client.query(`UPDATE video_agent_upload_sessions SET status='completed',encrypted_storage_session=NULL,updated_at=$2 WHERE id=$1`, [session.id, Date.now()]);
    const updated = await client.query(`UPDATE video_agent_sources SET status='queued_ingest',generation=$2,updated_at=$3 WHERE id=$1 RETURNING *`, [source.id, object.generation, Date.now()]);
    return { source: sourceDTO(updated.rows[0]) };
});
