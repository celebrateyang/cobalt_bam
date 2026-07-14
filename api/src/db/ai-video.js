import { randomUUID } from "node:crypto";

import { getClient, query } from "./pg-client.js";

export const AI_VIDEO_ACTIVE_STATUSES = Object.freeze([
    "uploading",
    "queued_ingest",
    "ingesting",
    "probing",
    "transcribing",
    "translating",
    "analyzing",
    "draft_ready",
    "queued_render",
    "rendering",
    "cancel_requested",
]);

const activeStatusesSql = AI_VIDEO_ACTIVE_STATUSES.map((status) => `'${status}'`).join(", ");
let schemaPromise = null;

export const ensureAiVideoSchema = async () => {
    if (schemaPromise) return schemaPromise;

    schemaPromise = (async () => {
        await query(`
            CREATE TABLE IF NOT EXISTS ai_video_jobs (
                id UUID PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                status TEXT NOT NULL,
                source_kind TEXT NOT NULL CHECK (source_kind IN ('upload', 'download_import')),
                source_object_key TEXT,
                source_filename TEXT,
                source_mime TEXT,
                source_size_bytes BIGINT,
                source_duration_ms BIGINT,
                source_width INTEGER,
                source_height INTEGER,
                source_language TEXT,
                target_language TEXT NOT NULL,
                subtitle_mode TEXT NOT NULL CHECK (subtitle_mode IN ('translated', 'bilingual')),
                progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
                current_stage TEXT,
                error_code TEXT,
                error_detail JSONB,
                draft_revision INTEGER NOT NULL DEFAULT 0,
                render_revision INTEGER,
                attempt_count INTEGER NOT NULL DEFAULT 0,
                available_at BIGINT NOT NULL,
                lease_owner TEXT,
                lease_expires_at BIGINT,
                heartbeat_at BIGINT,
                started_at BIGINT,
                completed_at BIGINT,
                expires_at BIGINT,
                deleted_at BIGINT,
                created_at BIGINT NOT NULL,
                updated_at BIGINT NOT NULL
            );
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_video_jobs_user_created ON ai_video_jobs(user_id, created_at DESC);`);
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_video_jobs_queue ON ai_video_jobs(status, available_at, created_at);`);
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_video_jobs_lease ON ai_video_jobs(status, lease_expires_at);`);
        await query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_video_jobs_one_active_user
            ON ai_video_jobs(user_id)
            WHERE deleted_at IS NULL AND status IN (${activeStatusesSql});
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS ai_video_assets (
                id UUID PRIMARY KEY,
                job_id UUID NOT NULL REFERENCES ai_video_jobs(id) ON DELETE CASCADE,
                kind TEXT NOT NULL,
                clip_id UUID,
                object_key TEXT NOT NULL,
                object_generation TEXT NOT NULL,
                mime TEXT,
                size_bytes BIGINT,
                checksum_sha256 TEXT,
                revision INTEGER NOT NULL DEFAULT 0,
                expires_at BIGINT,
                cleanup_status TEXT NOT NULL DEFAULT 'active',
                cleanup_attempts INTEGER NOT NULL DEFAULT 0,
                cleanup_after BIGINT,
                deleted_at BIGINT,
                created_at BIGINT NOT NULL,
                UNIQUE (job_id, kind, clip_id, revision)
            );
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_video_assets_cleanup ON ai_video_assets(cleanup_status, cleanup_after);`);

        await query(`
            CREATE TABLE IF NOT EXISTS ai_video_upload_sessions (
                id UUID PRIMARY KEY,
                job_id UUID NOT NULL UNIQUE REFERENCES ai_video_jobs(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                object_key TEXT NOT NULL,
                storage_session_encrypted TEXT NOT NULL,
                total_bytes BIGINT NOT NULL CHECK (total_bytes > 0),
                committed_bytes BIGINT NOT NULL DEFAULT 0,
                chunk_size_bytes INTEGER NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'aborted', 'expired')),
                file_fingerprint TEXT NOT NULL,
                last_chunk_sha256 TEXT,
                expires_at BIGINT NOT NULL,
                created_at BIGINT NOT NULL,
                updated_at BIGINT NOT NULL
            );
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_video_upload_sessions_active ON ai_video_upload_sessions(status, expires_at);`);
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_video_upload_sessions_user ON ai_video_upload_sessions(user_id, status);`);

        await query(`
            CREATE TABLE IF NOT EXISTS ai_video_usage_reservations (
                id UUID PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                job_id UUID NOT NULL UNIQUE REFERENCES ai_video_jobs(id) ON DELETE CASCADE,
                period_key TEXT NOT NULL,
                reserved_seconds INTEGER NOT NULL CHECK (reserved_seconds > 0),
                consumed_seconds INTEGER NOT NULL DEFAULT 0 CHECK (consumed_seconds >= 0),
                status TEXT NOT NULL CHECK (status IN ('reserved', 'committed', 'released')),
                created_at BIGINT NOT NULL,
                updated_at BIGINT NOT NULL
            );
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_video_usage_period ON ai_video_usage_reservations(user_id, period_key, status);`);

        await query(`
            CREATE TABLE IF NOT EXISTS ai_video_workers (
                worker_id TEXT PRIMARY KEY,
                product_label TEXT NOT NULL,
                started_at BIGINT NOT NULL,
                heartbeat_at BIGINT NOT NULL,
                metadata JSONB
            );
        `);
    })().catch((error) => {
        schemaPromise = null;
        throw error;
    });

    return schemaPromise;
};

const utcPeriod = (now = Date.now()) => {
    const date = new Date(now);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    return {
        periodKey: `${year}-${String(month + 1).padStart(2, "0")}`,
        resetsAt: Date.UTC(year, month + 1, 1),
    };
};

const normalizeJob = (row) => row && ({
    id: row.id,
    status: row.status,
    sourceKind: row.source_kind,
    sourceFilename: row.source_filename,
    sourceMime: row.source_mime,
    sourceSizeBytes: row.source_size_bytes == null ? null : Number(row.source_size_bytes),
    sourceDurationMs: row.source_duration_ms == null ? null : Number(row.source_duration_ms),
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    subtitleMode: row.subtitle_mode,
    progress: row.progress,
    currentStage: row.current_stage,
    errorCode: row.error_code,
    draftRevision: row.draft_revision,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    completedAt: row.completed_at == null ? null : Number(row.completed_at),
    expiresAt: row.expires_at == null ? null : Number(row.expires_at),
});

export const getAiVideoUsage = async ({ userId, limitSeconds, now = Date.now(), client = null }) => {
    await ensureAiVideoSchema();
    const db = client || { query };
    const { periodKey, resetsAt } = utcPeriod(now);
    const result = await db.query(
        `SELECT
            COALESCE(SUM(consumed_seconds) FILTER (WHERE status = 'committed'), 0)::int AS used_seconds,
            COALESCE(SUM(reserved_seconds) FILTER (WHERE status = 'reserved'), 0)::int AS reserved_seconds
         FROM ai_video_usage_reservations
         WHERE user_id = $1 AND period_key = $2`,
        [userId, periodKey],
    );
    const usedSeconds = result.rows[0]?.used_seconds || 0;
    const reservedSeconds = result.rows[0]?.reserved_seconds || 0;
    return {
        limitSeconds,
        usedSeconds,
        reservedSeconds,
        remainingSeconds: Math.max(0, limitSeconds - usedSeconds - reservedSeconds),
        periodKey,
        resetsAt,
    };
};

export const createAiVideoJob = async ({ userId, sourceKind, filename, contentType, sizeBytes, sourceLanguage, targetLanguage, subtitleMode, monthlySeconds, now = Date.now() }) => {
    await ensureAiVideoSchema();
    const client = await getClient();
    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(2147483000)");
        await client.query("SELECT pg_advisory_xact_lock($1)", [userId]);
        const membership = await client.query(
            `SELECT 1
             FROM subscriptions s
             JOIN plans p ON p.id = s.plan_id
             JOIN plan_entitlements pe ON pe.plan_id = p.id
             WHERE s.user_id = $1 AND s.status = 'active' AND p.is_active = true
               AND pe.entitlement_key = 'ai_video_studio'
               AND (s.current_period_end IS NULL OR s.current_period_end > $2)
             LIMIT 1`,
            [userId, now],
        );
        if (!membership.rowCount) {
            const error = new Error("Active AI video membership is required");
            error.code = "MEMBERSHIP_REQUIRED";
            throw error;
        }
        const active = await client.query(
            `SELECT id FROM ai_video_jobs WHERE user_id = $1 AND deleted_at IS NULL AND status = ANY($2::text[]) LIMIT 1`,
            [userId, AI_VIDEO_ACTIVE_STATUSES],
        );
        if (active.rowCount) {
            const error = new Error("Only one AI video job may be active");
            error.code = "AI_VIDEO_CONCURRENCY_LIMIT";
            throw error;
        }
        if (sourceKind === "upload") {
            const globalUploads = await client.query(
                `SELECT COUNT(*)::int AS count FROM ai_video_jobs WHERE status='uploading' AND deleted_at IS NULL`,
            );
            const globalLimit = Number(process.env.AI_VIDEO_UPLOAD_GLOBAL_CONCURRENCY || 3);
            if ((globalUploads.rows[0]?.count || 0) >= globalLimit) {
                const error = new Error("AI video upload capacity is temporarily full");
                error.code = "AI_VIDEO_UPLOAD_CAPACITY";
                throw error;
            }
        }
        const usage = await getAiVideoUsage({ userId, limitSeconds: monthlySeconds, now, client });
        if (usage.remainingSeconds <= 0) {
            const error = new Error("Monthly AI video quota is exhausted");
            error.code = "AI_VIDEO_QUOTA_EXCEEDED";
            error.usage = usage;
            throw error;
        }
        const id = randomUUID();
        const status = sourceKind === "upload" ? "uploading" : "queued_ingest";
        const result = await client.query(
            `INSERT INTO ai_video_jobs (
                id, user_id, status, source_kind, source_filename, source_mime,
                source_size_bytes, source_language, target_language, subtitle_mode,
                current_stage, available_at, created_at, updated_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$12)
             RETURNING *`,
            [id, userId, status, sourceKind, filename, contentType, sizeBytes, sourceLanguage, targetLanguage, subtitleMode, status, now],
        );
        await client.query("COMMIT");
        return { job: normalizeJob(result.rows[0]), usage };
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

export const failAiVideoJob = ({ jobId, userId, errorCode, errorDetail = null, now = Date.now() }) =>
    query(
        `UPDATE ai_video_jobs SET status='failed', current_stage='failed', error_code=$3,
            error_detail=$4, updated_at=$5, lease_owner=NULL, lease_expires_at=NULL
         WHERE id=$1 AND user_id=$2 RETURNING id`,
        [jobId, userId, errorCode, errorDetail, now],
    );

export const attachAiVideoUploadSession = async ({ jobId, userId, objectKey, encryptedSession, totalBytes, chunkSizeBytes, fileFingerprint, expiresAt, now = Date.now() }) => {
    const id = randomUUID();
    const result = await query(
        `INSERT INTO ai_video_upload_sessions (
            id, job_id, user_id, object_key, storage_session_encrypted, total_bytes,
            chunk_size_bytes, status, file_fingerprint, expires_at, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,$9,$10,$10)
         RETURNING *`,
        [id, jobId, userId, objectKey, encryptedSession, totalBytes, chunkSizeBytes, fileFingerprint, expiresAt, now],
    );
    return result.rows[0];
};

export const getAiVideoUploadSession = async ({ jobId, userId, forUpdate = false, client = null }) => {
    await ensureAiVideoSchema();
    const db = client || { query };
    const result = await db.query(
        `SELECT s.*, j.status AS job_status
         FROM ai_video_upload_sessions s
         JOIN ai_video_jobs j ON j.id = s.job_id
         WHERE s.job_id = $1 AND s.user_id = $2 AND j.deleted_at IS NULL
         ${forUpdate ? "FOR UPDATE OF s" : ""}`,
        [jobId, userId],
    );
    return result.rows[0] || null;
};

export const updateAiVideoUploadProgress = async ({ sessionId, committedBytes, chunkSha256, now = Date.now() }) => {
    const result = await query(
        `UPDATE ai_video_upload_sessions
         SET committed_bytes = GREATEST(committed_bytes, $2), last_chunk_sha256 = $3, updated_at = $4
         WHERE id = $1 AND status = 'active'
         RETURNING *`,
        [sessionId, committedBytes, chunkSha256, now],
    );
    return result.rows[0] || null;
};

export const completeAiVideoUpload = async ({ jobId, userId, generation, sizeBytes, checksumSha256 = null, now = Date.now() }) => {
    const client = await getClient();
    try {
        await client.query("BEGIN");
        const session = await getAiVideoUploadSession({ jobId, userId, forUpdate: true, client });
        if (!session) {
            await client.query("ROLLBACK");
            return null;
        }
        if (session.status === "completed") {
            const asset = await client.query(`SELECT * FROM ai_video_assets WHERE job_id = $1 AND kind = 'source' LIMIT 1`, [jobId]);
            await client.query("COMMIT");
            return asset.rows[0] || null;
        }
        if (Number(session.total_bytes) !== Number(sizeBytes)) {
            const error = new Error("Stored object size does not match upload");
            error.code = "AI_VIDEO_UPLOAD_SIZE_MISMATCH";
            throw error;
        }
        const assetId = randomUUID();
        const asset = await client.query(
            `INSERT INTO ai_video_assets (
                id, job_id, kind, object_key, object_generation, mime, size_bytes,
                checksum_sha256, revision, expires_at, cleanup_after, created_at
             ) SELECT $1, j.id, 'source', $2, $3, j.source_mime, $4, $5, 0, $6, $6, $7
               FROM ai_video_jobs j WHERE j.id = $8 AND j.user_id = $9
             RETURNING *`,
            [assetId, session.object_key, generation, sizeBytes, checksumSha256, now + 6 * 60 * 60 * 1000, now, jobId, userId],
        );
        await client.query(`UPDATE ai_video_upload_sessions SET status='completed', committed_bytes=total_bytes, updated_at=$2 WHERE id=$1`, [session.id, now]);
        await client.query(
            `UPDATE ai_video_jobs SET status='queued_ingest', current_stage='queued_ingest', source_object_key=$3, available_at=$2, updated_at=$2
             WHERE id=$1 AND user_id=$4 AND status='uploading'`,
            [jobId, now, session.object_key, userId],
        );
        await client.query("COMMIT");
        return asset.rows[0] || null;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

export const listAiVideoJobs = async ({ userId, limit = 20, before = null }) => {
    await ensureAiVideoSchema();
    const result = await query(
        `SELECT * FROM ai_video_jobs
         WHERE user_id=$1 AND deleted_at IS NULL AND ($2::bigint IS NULL OR created_at < $2)
         ORDER BY created_at DESC LIMIT $3`,
        [userId, before, limit],
    );
    return result.rows.map(normalizeJob);
};

export const getAiVideoJob = async ({ jobId, userId }) => {
    await ensureAiVideoSchema();
    const result = await query(`SELECT * FROM ai_video_jobs WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL`, [jobId, userId]);
    return normalizeJob(result.rows[0] || null);
};

export const cancelAiVideoJob = async ({ jobId, userId, now = Date.now() }) => {
    const result = await query(
        `UPDATE ai_video_jobs SET
            status = CASE WHEN status IN ('uploading','queued_ingest','draft_ready','queued_render') THEN 'cancelled' ELSE 'cancel_requested' END,
            current_stage = CASE WHEN status IN ('uploading','queued_ingest','draft_ready','queued_render') THEN 'cancelled' ELSE 'cancel_requested' END,
            updated_at=$3
         WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL AND status = ANY($4::text[])
         RETURNING *`,
        [jobId, userId, now, AI_VIDEO_ACTIVE_STATUSES],
    );
    return normalizeJob(result.rows[0] || null);
};

export const softDeleteAiVideoJob = async ({ jobId, userId, now = Date.now() }) => {
    const result = await query(
        `UPDATE ai_video_jobs SET deleted_at=$3, updated_at=$3
         WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL AND status NOT IN ('ingesting','probing','transcribing','translating','analyzing','rendering','cancel_requested')
         RETURNING id`,
        [jobId, userId, now],
    );
    if (result.rowCount) {
        await query(`UPDATE ai_video_assets SET cleanup_after=$2, cleanup_status='pending' WHERE job_id=$1 AND deleted_at IS NULL`, [jobId, now]);
    }
    return result.rowCount > 0;
};

export const claimAiVideoJob = async ({ workerId, leaseMs, now = Date.now() }) => {
    await ensureAiVideoSchema();
    const result = await query(
        `WITH candidate AS (
            SELECT id FROM ai_video_jobs
            WHERE status IN ('queued_ingest','ingesting') AND available_at <= $1
              AND (status = 'queued_ingest' OR lease_expires_at < $1)
              AND attempt_count < 3
              AND deleted_at IS NULL
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE ai_video_jobs j SET status='ingesting', current_stage='ingesting',
             lease_owner=$2, lease_expires_at=$3, heartbeat_at=$1,
             started_at=COALESCE(started_at,$1), attempt_count=attempt_count+1, updated_at=$1
         FROM candidate WHERE j.id=candidate.id RETURNING j.*`,
        [now, workerId, now + leaseMs],
    );
    return normalizeJob(result.rows[0] || null);
};

export const heartbeatAiVideoJob = async ({ jobId, workerId, leaseMs, now = Date.now() }) => {
    const result = await query(
        `UPDATE ai_video_jobs SET heartbeat_at=$3, lease_expires_at=$4, updated_at=$3
         WHERE id=$1 AND lease_owner=$2 AND lease_expires_at >= $3 RETURNING id`,
        [jobId, workerId, now, now + leaseMs],
    );
    return result.rowCount > 0;
};

export const reserveAiVideoUsage = async ({ jobId, userId, durationSeconds, limitSeconds, now = Date.now() }) => {
    await ensureAiVideoSchema();
    const seconds = Math.ceil(durationSeconds / 60) * 60;
    const client = await getClient();
    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock($1)", [userId]);
        const existing = await client.query(`SELECT * FROM ai_video_usage_reservations WHERE job_id=$1`, [jobId]);
        if (existing.rowCount) {
            await client.query("COMMIT");
            return existing.rows[0];
        }
        const usage = await getAiVideoUsage({ userId, limitSeconds, now, client });
        if (seconds > usage.remainingSeconds) {
            const error = new Error("Monthly AI video quota is exhausted");
            error.code = "AI_VIDEO_QUOTA_EXCEEDED";
            throw error;
        }
        const result = await client.query(
            `INSERT INTO ai_video_usage_reservations (id,user_id,job_id,period_key,reserved_seconds,status,created_at,updated_at)
             VALUES ($1,$2,$3,$4,$5,'reserved',$6,$6) RETURNING *`,
            [randomUUID(), userId, jobId, usage.periodKey, seconds, now],
        );
        await client.query("COMMIT");
        return result.rows[0];
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

export const claimExpiredAiVideoAssets = async ({ limit = 100, now = Date.now() }) => {
    await ensureAiVideoSchema();
    const result = await query(
        `WITH candidates AS (
            SELECT id FROM ai_video_assets
            WHERE deleted_at IS NULL AND cleanup_after IS NOT NULL AND cleanup_after <= $1
              AND cleanup_status IN ('active','pending','retry')
            ORDER BY cleanup_after FOR UPDATE SKIP LOCKED LIMIT $2
         )
         UPDATE ai_video_assets a SET cleanup_status='pending', cleanup_attempts=cleanup_attempts+1
         FROM candidates WHERE a.id=candidates.id RETURNING a.*`,
        [now, limit],
    );
    return result.rows;
};

export const markAiVideoAssetDeleted = ({ assetId, now = Date.now() }) =>
    query(`UPDATE ai_video_assets SET cleanup_status='deleted', deleted_at=$2 WHERE id=$1`, [assetId, now]);

export const markAiVideoAssetCleanupRetry = ({ assetId, delayMs, now = Date.now() }) =>
    query(`UPDATE ai_video_assets SET cleanup_status='retry', cleanup_after=$2 WHERE id=$1`, [assetId, now + delayMs]);

export const heartbeatAiVideoWorker = ({ workerId, metadata = {}, now = Date.now() }) =>
    query(
        `INSERT INTO ai_video_workers(worker_id,product_label,started_at,heartbeat_at,metadata)
         VALUES ($1,'argoCD',$2,$2,$3)
         ON CONFLICT (worker_id) DO UPDATE SET heartbeat_at=EXCLUDED.heartbeat_at, metadata=EXCLUDED.metadata`,
        [workerId, now, metadata],
    );

export const claimExpiredAiVideoUploadSessions = async ({ limit = 50, now = Date.now() }) => {
    await ensureAiVideoSchema();
    const result = await query(
        `WITH candidates AS (
            SELECT id FROM ai_video_upload_sessions
            WHERE status IN ('active','expired') AND expires_at <= $1
            ORDER BY expires_at FOR UPDATE SKIP LOCKED LIMIT $2
         )
         UPDATE ai_video_upload_sessions s SET status='expired', updated_at=$1
         FROM candidates WHERE s.id=candidates.id RETURNING s.*`,
        [now, limit],
    );
    return result.rows;
};

export const markAiVideoUploadSessionAborted = ({ sessionId, now = Date.now() }) =>
    query(`UPDATE ai_video_upload_sessions SET status='aborted', updated_at=$2 WHERE id=$1`, [sessionId, now]);
