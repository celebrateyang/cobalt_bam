import { agentQuery as query, ensureVideoAgentSchema, transaction } from "../db/video-agent.js";
import { decryptUploadSession } from "../ai-video/session-crypto.js";
import { getAiVideoObjectStorage } from "../ai-video/object-storage.js";

const DAY = 24 * 60 * 60 * 1000;
const missing = (error) => error.code === "ENOENT" || error.code === 404 || error.statusCode === 404;
const deleteObject = async (storage, key, generation) => {
    try {
        const object = await storage.headObject(key);
        if (generation && object.generation !== generation) throw new Error("Object generation changed");
        await storage.deleteObject(key, generation || object.generation);
    } catch (error) { if (!missing(error)) throw error; }
};
export const cleanupVideoAgent = async ({ storage = getAiVideoObjectStorage(), limit = 100 } = {}) => {
    await ensureVideoAgentSchema();
    const now = Date.now();
    await query(`UPDATE video_agent_sources SET status='expired',cleanup_after=$1,source_input_encrypted=NULL,updated_at=$1
        WHERE status NOT IN ('deleting','deleted','expired') AND (retention_until<=$1 OR
            (status='uploading' AND EXISTS(SELECT 1 FROM video_agent_upload_sessions u WHERE u.source_id=video_agent_sources.id AND u.expires_at<=$1)))`, [now]);
    await query(`UPDATE video_agent_sources SET status='failed',error_code='VIDEO_AGENT_INGEST_ATTEMPTS_EXHAUSTED',cleanup_after=$1,source_input_encrypted=NULL
        WHERE status='ingesting' AND lease_until<$2 AND attempts>=3`, [now + DAY, now]);
    const candidates = await query(`SELECT id FROM video_agent_sources WHERE status IN ('deleting','expired','failed') AND cleanup_after<=$1 LIMIT $2`, [now, limit]);
    let cleaned = 0;
    for (const candidate of candidates.rows) {
        await transaction(async (client) => {
            const source = (await client.query(`SELECT * FROM video_agent_sources WHERE id=$1 AND status IN ('deleting','expired','failed') AND cleanup_after<=$2 FOR UPDATE SKIP LOCKED`, [candidate.id, Date.now()])).rows[0];
            if (!source) return;
            try {
                const upload = (await client.query(`SELECT * FROM video_agent_upload_sessions WHERE source_id=$1 FOR UPDATE`, [source.id])).rows[0];
                if (upload?.encrypted_storage_session) await storage.abortResumableUpload({ sessionUri: decryptUploadSession(upload.encrypted_storage_session) });
                // Do not delete an object while a stale ingestion attempt is still writing to it.
                if (source.lease_until && Number(source.lease_until) > Date.now()) throw new Error("Source lease still active");
                await deleteObject(storage, source.object_key, source.generation);
                await client.query(`UPDATE video_agent_upload_sessions SET status='aborted',encrypted_storage_session=NULL,updated_at=$2 WHERE source_id=$1`, [source.id, Date.now()]);
                await client.query(`UPDATE video_agent_sources SET status='deleted',cleanup_after=NULL,updated_at=$2 WHERE id=$1`, [source.id, Date.now()]);
                await client.query(`UPDATE video_agent_assets SET status='expired',expires_at=$2 WHERE source_id=$1 AND status<>'deleted'`, [source.id, Date.now()]);
                cleaned++;
            } catch {
                await client.query(`UPDATE video_agent_sources SET cleanup_attempts=cleanup_attempts+1,cleanup_after=$2 WHERE id=$1`, [source.id, Date.now() + Math.min(DAY, 60000 * 2 ** Math.min(source.cleanup_attempts, 10))]);
            }
        });
    }
    // Pending attempt records also cover objects abandoned by a process crash.
    const assets = await query(`SELECT id FROM video_agent_assets WHERE status<>'deleted' AND expires_at<=$1 AND (cleanup_after IS NULL OR cleanup_after<=$1) LIMIT $2`, [Date.now(), limit]);
    for (const candidate of assets.rows) {
        await transaction(async (client) => {
            const asset = (await client.query(`SELECT * FROM video_agent_assets WHERE id=$1 AND status<>'deleted' AND expires_at<=$2 AND (cleanup_after IS NULL OR cleanup_after<=$2) FOR UPDATE SKIP LOCKED`, [candidate.id, Date.now()])).rows[0];
            if (!asset) return;
            try {
                await deleteObject(storage, asset.object_key, asset.generation);
                await client.query(`UPDATE video_agent_assets SET status='deleted' WHERE id=$1`, [asset.id]);
            } catch { await client.query(`UPDATE video_agent_assets SET cleanup_after=$2,cleanup_attempts=cleanup_attempts+1 WHERE id=$1`, [asset.id, Date.now() + Math.min(DAY, 60000 * 2 ** Math.min(asset.cleanup_attempts, 10))]); }
        });
    }
    return { cleaned };
};
