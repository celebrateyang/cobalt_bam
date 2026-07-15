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

export const AI_VIDEO_CONCURRENT_STATUSES = Object.freeze(
    AI_VIDEO_ACTIVE_STATUSES.filter((status) => status !== "draft_ready"),
);
const concurrentStatusesSql = AI_VIDEO_CONCURRENT_STATUSES.map((status) => `'${status}'`).join(", ");
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
                source_import_token TEXT,
                source_language TEXT,
                target_language TEXT NOT NULL,
                subtitle_mode TEXT NOT NULL CHECK (subtitle_mode IN ('translated', 'bilingual')),
                progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
                current_stage TEXT,
                error_code TEXT,
                error_detail JSONB,
                failed_stage TEXT,
                draft_revision INTEGER NOT NULL DEFAULT 0,
                render_revision INTEGER,
                render_snapshot JSONB,
                attempt_count INTEGER NOT NULL DEFAULT 0,
                render_attempt_count INTEGER NOT NULL DEFAULT 0,
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
        await query(`ALTER TABLE ai_video_jobs ADD COLUMN IF NOT EXISTS failed_stage TEXT;`);
        await query(`ALTER TABLE ai_video_jobs ADD COLUMN IF NOT EXISTS source_import_token TEXT;`);
        await query(`ALTER TABLE ai_video_jobs ADD COLUMN IF NOT EXISTS render_snapshot JSONB;`);
        await query(`ALTER TABLE ai_video_jobs ADD COLUMN IF NOT EXISTS render_attempt_count INTEGER NOT NULL DEFAULT 0;`);
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_video_jobs_user_created ON ai_video_jobs(user_id, created_at DESC);`);
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_video_jobs_queue ON ai_video_jobs(status, available_at, created_at);`);
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_video_jobs_lease ON ai_video_jobs(status, lease_expires_at);`);
        await query(`DROP INDEX IF EXISTS idx_ai_video_jobs_one_active_user;`);
        await query(`
            CREATE UNIQUE INDEX idx_ai_video_jobs_one_active_user
            ON ai_video_jobs(user_id)
            WHERE deleted_at IS NULL AND status IN (${concurrentStatusesSql});
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
            CREATE TABLE IF NOT EXISTS ai_video_transcript_segments (
                id UUID PRIMARY KEY,
                job_id UUID NOT NULL REFERENCES ai_video_jobs(id) ON DELETE CASCADE,
                segment_index INTEGER NOT NULL,
                start_ms BIGINT NOT NULL,
                end_ms BIGINT NOT NULL,
                source_text TEXT NOT NULL,
                translated_text TEXT,
                speaker TEXT,
                confidence REAL,
                words JSONB,
                revision INTEGER NOT NULL DEFAULT 0,
                UNIQUE (job_id, segment_index),
                CHECK (end_ms > start_ms)
            );
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_video_transcript_job_time ON ai_video_transcript_segments(job_id, start_ms);`);

        await query(`
            CREATE TABLE IF NOT EXISTS ai_video_clips (
                id UUID PRIMARY KEY,
                job_id UUID NOT NULL REFERENCES ai_video_jobs(id) ON DELETE CASCADE,
                sort_order INTEGER NOT NULL,
                start_ms BIGINT NOT NULL,
                end_ms BIGINT NOT NULL,
                title TEXT,
                reason TEXT,
                score REAL,
                enabled BOOLEAN NOT NULL DEFAULT true,
                crop_mode TEXT NOT NULL DEFAULT 'center',
                focus_x REAL NOT NULL DEFAULT 0.5,
                subtitle_style JSONB,
                revision INTEGER NOT NULL DEFAULT 0,
                created_at BIGINT NOT NULL,
                updated_at BIGINT NOT NULL,
                UNIQUE (job_id, sort_order),
                CHECK (end_ms > start_ms),
                CHECK (focus_x >= 0 AND focus_x <= 1)
            );
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_video_clips_job ON ai_video_clips(job_id, sort_order);`);

        await query(`
            CREATE TABLE IF NOT EXISTS ai_video_import_nonces (
                nonce TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at BIGINT NOT NULL,
                used_at BIGINT NOT NULL
            );
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_video_import_nonces_expiry ON ai_video_import_nonces(expires_at);`);

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
    userId: row.user_id,
    status: row.status,
    sourceKind: row.source_kind,
    sourceObjectKey: row.source_object_key,
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
    errorRetryable: row.error_detail?.retryable === true,
    failedStage: row.failed_stage,
    draftRevision: row.draft_revision,
    sourceWidth: row.source_width,
    sourceHeight: row.source_height,
    renderRevision: row.render_revision,
    renderAttemptCount: row.render_attempt_count,
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

export const createAiVideoJob = async ({ userId, sourceKind, filename, contentType, sizeBytes, sourceLanguage, targetLanguage, subtitleMode, monthlySeconds, importToken = null, importPayload = null, now = Date.now() }) => {
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
            [userId, AI_VIDEO_CONCURRENT_STATUSES],
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
        if (sourceKind === "download_import") {
            const nonce = await client.query(
                `INSERT INTO ai_video_import_nonces (nonce,user_id,expires_at,used_at)
                 VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING nonce`,
                [importPayload?.nonce, userId, importPayload?.expiresAt, now],
            );
            if (!nonce.rowCount) {
                const error = new Error("Media import token was already used");
                error.code = "AI_VIDEO_IMPORT_TOKEN_USED";
                throw error;
            }
        }
        const result = await client.query(
            `INSERT INTO ai_video_jobs (
                id, user_id, status, source_kind, source_filename, source_mime,
                source_size_bytes, source_language, target_language, subtitle_mode,
                current_stage, available_at, created_at, updated_at, source_import_token
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$12,$13)
             RETURNING *`,
            [id, userId, status, sourceKind, filename, contentType, sizeBytes, sourceLanguage, targetLanguage, subtitleMode, status, now, importToken],
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

export const getAiVideoWorkerImport = async ({ jobId, workerId }) => {
    const result = await query(
        `SELECT source_import_token FROM ai_video_jobs
         WHERE id=$1 AND lease_owner=$2 AND source_kind='download_import' AND source_object_key IS NULL`,
        [jobId, workerId],
    );
    return result.rows[0]?.source_import_token || null;
};

export const prepareAiVideoImport = async ({ jobId, workerId, objectKey, mime, sizeBytes, now = Date.now() }) => {
    const existing = await query(
        `SELECT a.* FROM ai_video_assets a JOIN ai_video_jobs j ON j.id=a.job_id
         WHERE a.job_id=$1 AND a.kind='source' AND j.lease_owner=$2 AND a.deleted_at IS NULL LIMIT 1`,
        [jobId, workerId],
    );
    if (existing.rowCount) return existing.rows[0];
    const result = await query(
        `INSERT INTO ai_video_assets (
            id,job_id,kind,object_key,object_generation,mime,size_bytes,revision,
            expires_at,cleanup_status,cleanup_after,created_at
         ) SELECT $1,j.id,'source',$3,'pending',$4,$5,0,$6,'pending',$7,$8
           FROM ai_video_jobs j WHERE j.id=$2 AND j.lease_owner=$9 AND j.source_object_key IS NULL
         RETURNING *`,
        [randomUUID(), jobId, objectKey, mime, sizeBytes, now + 6 * 60 * 60 * 1000, now + 6 * 60 * 60 * 1000, now, workerId],
    );
    return result.rows[0] || null;
};

export const completeAiVideoImport = async ({ jobId, workerId, assetId, objectKey, generation, sizeBytes, mime, now = Date.now() }) => {
    const client = await getClient();
    try {
        await client.query("BEGIN");
        const job = await client.query(
            `SELECT * FROM ai_video_jobs WHERE id=$1 AND lease_owner=$2 FOR UPDATE`,
            [jobId, workerId],
        );
        if (!job.rowCount) {
            await client.query("ROLLBACK");
            return null;
        }
        if (!job.rows[0].source_object_key) {
            await client.query(
                `UPDATE ai_video_assets SET object_generation=$4,size_bytes=$5,mime=$6,
                    cleanup_status='active',cleanup_after=expires_at
                 WHERE id=$1 AND job_id=$2 AND object_key=$3`,
                [assetId, jobId, objectKey, generation, sizeBytes, mime],
            );
            await client.query(
                `UPDATE ai_video_jobs SET source_object_key=$3,source_size_bytes=$4,source_mime=$5,
                    source_import_token=NULL,updated_at=$6 WHERE id=$1 AND lease_owner=$2`,
                [jobId, workerId, objectKey, sizeBytes, mime, now],
            );
        }
        await client.query("COMMIT");
        return { objectKey, generation, sizeBytes, mime };
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
    if (result.rows[0]?.status === "cancelled") {
        await query(`UPDATE ai_video_assets SET cleanup_after=$2,cleanup_status='pending' WHERE job_id=$1 AND deleted_at IS NULL`, [jobId, now]);
    }
    return normalizeJob(result.rows[0] || null);
};

export const softDeleteAiVideoJob = async ({ jobId, userId, now = Date.now() }) => {
    const client = await getClient();
    try {
        await client.query("BEGIN");
        const result = await client.query(
            `UPDATE ai_video_jobs SET deleted_at=$3, updated_at=$3
             WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL
               AND status IN ('draft_ready','completed','failed','cancelled')
             RETURNING id`,
            [jobId, userId, now],
        );
        if (!result.rowCount) {
            await client.query("ROLLBACK");
            return { deleted: false, uploadSessions: [] };
        }
        await client.query(
            `UPDATE ai_video_assets SET cleanup_after=$2, cleanup_status='pending'
             WHERE job_id=$1 AND deleted_at IS NULL`,
            [jobId, now],
        );
        const sessions = await client.query(
            `UPDATE ai_video_upload_sessions SET status='expired',expires_at=$2,updated_at=$2
             WHERE job_id=$1 AND status IN ('active','expired') RETURNING *`,
            [jobId, now],
        );
        await client.query("COMMIT");
        return { deleted: true, uploadSessions: sessions.rows };
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

export const claimAiVideoJob = async ({ workerId, leaseMs, now = Date.now() }) => {
    await ensureAiVideoSchema();
    const result = await query(
        `WITH candidate AS (
            SELECT id FROM ai_video_jobs
            WHERE status IN ('queued_ingest','ingesting','probing','transcribing','translating','analyzing','queued_render','rendering','cancel_requested') AND available_at <= $1
              AND (status IN ('queued_ingest','queued_render') OR lease_expires_at < $1)
              AND (status='cancel_requested'
                   OR (status IN ('queued_render','rendering') AND render_attempt_count < 3)
                   OR (status NOT IN ('queued_render','rendering') AND attempt_count < 3))
              AND deleted_at IS NULL
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE ai_video_jobs j SET
             status=CASE WHEN j.status='queued_ingest' THEN 'ingesting' WHEN j.status='queued_render' THEN 'rendering' ELSE j.status END,
             current_stage=CASE WHEN j.status='queued_ingest' THEN 'ingesting' WHEN j.status='queued_render' THEN 'rendering' ELSE j.current_stage END,
             lease_owner=$2, lease_expires_at=$3, heartbeat_at=$1,
             started_at=COALESCE(started_at,$1),
             attempt_count=attempt_count + CASE WHEN j.status IN ('queued_render','rendering','cancel_requested') THEN 0 ELSE 1 END,
             render_attempt_count=render_attempt_count + CASE WHEN j.status IN ('queued_render','rendering') THEN 1 ELSE 0 END,
             updated_at=$1
         FROM candidate WHERE j.id=candidate.id RETURNING j.*`,
        [now, workerId, now + leaseMs],
    );
    return normalizeJob(result.rows[0] || null);
};

export const getAiVideoWorkerJob = async ({ jobId, workerId }) => {
    const result = await query(
        `SELECT * FROM ai_video_jobs WHERE id=$1 AND lease_owner=$2 AND deleted_at IS NULL`,
        [jobId, workerId],
    );
    return normalizeJob(result.rows[0] || null);
};

export const getAiVideoWorkerTranscript = async ({ jobId, workerId }) => {
    const result = await query(
        `SELECT s.* FROM ai_video_transcript_segments s
         JOIN ai_video_jobs j ON j.id=s.job_id
         WHERE s.job_id=$1 AND j.lease_owner=$2 AND j.deleted_at IS NULL
         ORDER BY s.segment_index`,
        [jobId, workerId],
    );
    return result.rows.map((row) => ({
        id: row.id,
        segmentIndex: row.segment_index,
        startMs: Number(row.start_ms),
        endMs: Number(row.end_ms),
        sourceText: row.source_text,
        translatedText: row.translated_text,
        speaker: row.speaker,
        confidence: row.confidence,
        words: row.words || null,
    }));
};

export const updateAiVideoJobStage = async ({ jobId, workerId, status, progress, now = Date.now() }) => {
    const result = await query(
        `UPDATE ai_video_jobs SET status=$3, current_stage=$3, progress=$4,
             error_code=NULL, error_detail=NULL, failed_stage=NULL, updated_at=$5
         WHERE id=$1 AND lease_owner=$2 AND status <> 'cancel_requested'
         RETURNING *`,
        [jobId, workerId, status, progress, now],
    );
    return normalizeJob(result.rows[0] || null);
};

export const updateAiVideoProbe = async ({ jobId, workerId, durationMs, width, height, now = Date.now() }) => {
    const result = await query(
        `UPDATE ai_video_jobs SET source_duration_ms=$3, source_width=$4, source_height=$5,
             progress=15, updated_at=$6
         WHERE id=$1 AND lease_owner=$2 AND status <> 'cancel_requested' RETURNING *`,
        [jobId, workerId, durationMs, width, height, now],
    );
    return normalizeJob(result.rows[0] || null);
};

export const commitAiVideoUsage = async ({ jobId, now = Date.now() }) => {
    const result = await query(
        `UPDATE ai_video_usage_reservations SET status='committed', consumed_seconds=reserved_seconds, updated_at=$2
         WHERE job_id=$1 AND status='reserved' RETURNING *`,
        [jobId, now],
    );
    return result.rows[0] || null;
};

export const releaseAiVideoUsage = ({ jobId, now = Date.now() }) =>
    query(
        `UPDATE ai_video_usage_reservations SET status='released', updated_at=$2
         WHERE job_id=$1 AND status='reserved'`,
        [jobId, now],
    );

export const replaceAiVideoTranscript = async ({ jobId, segments }) => {
    const client = await getClient();
    try {
        await client.query("BEGIN");
        await client.query(`DELETE FROM ai_video_transcript_segments WHERE job_id=$1`, [jobId]);
        for (let index = 0; index < segments.length; index += 1) {
            const segment = segments[index];
            await client.query(
                `INSERT INTO ai_video_transcript_segments (
                    id,job_id,segment_index,start_ms,end_ms,source_text,translated_text,speaker,confidence,words,revision
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0)`,
                [randomUUID(), jobId, index, segment.startMs, segment.endMs, segment.sourceText, segment.translatedText || null, segment.speaker || null, segment.confidence ?? null, segment.words || null],
            );
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

export const applyAiVideoTranslations = async ({ jobId, translations }) => {
    const client = await getClient();
    try {
        await client.query("BEGIN");
        for (const item of translations) {
            await client.query(
                `UPDATE ai_video_transcript_segments SET translated_text=$3
                 WHERE job_id=$1 AND segment_index=$2`,
                [jobId, item.segmentIndex, item.translatedText],
            );
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

export const replaceAiVideoClips = async ({ jobId, clips, now = Date.now() }) => {
    const client = await getClient();
    try {
        await client.query("BEGIN");
        await client.query(`DELETE FROM ai_video_clips WHERE job_id=$1`, [jobId]);
        for (let index = 0; index < clips.length; index += 1) {
            const clip = clips[index];
            await client.query(
                `INSERT INTO ai_video_clips (
                    id,job_id,sort_order,start_ms,end_ms,title,reason,score,enabled,crop_mode,focus_x,subtitle_style,revision,created_at,updated_at
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,'center',0.5,$9,0,$10,$10)`,
                [randomUUID(), jobId, index, clip.startMs, clip.endMs, clip.title, clip.reason, clip.score, clip.subtitleStyle || {}, now],
            );
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

export const finishAiVideoDraft = async ({ jobId, workerId, now = Date.now() }) => {
    const result = await query(
        `UPDATE ai_video_jobs SET status='draft_ready', current_stage='draft_ready', progress=75,
             lease_owner=NULL, lease_expires_at=NULL, heartbeat_at=NULL, updated_at=$3,
             expires_at=COALESCE(expires_at,$3 + 2592000000)
         WHERE id=$1 AND lease_owner=$2 AND status <> 'cancel_requested' RETURNING *`,
        [jobId, workerId, now],
    );
    if (result.rowCount) {
        await query(
            `UPDATE ai_video_assets SET cleanup_after=$2,expires_at=$2
             WHERE job_id=$1 AND kind='source' AND deleted_at IS NULL`,
            [jobId, now + 30 * 24 * 60 * 60 * 1000],
        );
    }
    return normalizeJob(result.rows[0] || null);
};

export const failAiVideoProcessingJob = async ({ jobId, workerId, stage, errorCode, retryable, detail = null, now = Date.now() }) => {
    const result = await query(
        `UPDATE ai_video_jobs SET status='failed', failed_stage=$3, current_stage='failed', error_code=$4,
             error_detail=$5, lease_owner=NULL, lease_expires_at=NULL, heartbeat_at=NULL, updated_at=$6
         WHERE id=$1 AND lease_owner=$2 RETURNING *`,
        [jobId, workerId, stage, errorCode, { retryable, detail }, now],
    );
    if (result.rowCount) {
        await query(
            `UPDATE ai_video_assets SET cleanup_after=$2,expires_at=$2
             WHERE job_id=$1 AND kind='source' AND deleted_at IS NULL`,
            [jobId, now + 24 * 60 * 60 * 1000],
        );
        if (stage === "rendering") {
            await query(
                `UPDATE ai_video_assets SET cleanup_after=$2,expires_at=$2
                 WHERE job_id=$1 AND kind IN ('output','srt','vtt') AND deleted_at IS NULL`,
                [jobId, now + 24 * 60 * 60 * 1000],
            );
        }
    }
    return normalizeJob(result.rows[0] || null);
};

export const finishAiVideoCancellation = async ({ jobId, workerId, now = Date.now() }) => {
    await releaseAiVideoUsage({ jobId, now });
    const result = await query(
        `UPDATE ai_video_jobs SET status='cancelled', current_stage='cancelled',
             lease_owner=NULL, lease_expires_at=NULL, heartbeat_at=NULL, updated_at=$3
         WHERE id=$1 AND lease_owner=$2 AND status='cancel_requested' RETURNING *`,
        [jobId, workerId, now],
    );
    if (result.rowCount) {
        await query(`UPDATE ai_video_assets SET cleanup_after=$2,cleanup_status='pending' WHERE job_id=$1 AND deleted_at IS NULL`, [jobId, now]);
    }
    return normalizeJob(result.rows[0] || null);
};

export const getAiVideoDraft = async ({ jobId, userId }) => {
    await ensureAiVideoSchema();
    const jobResult = await query(
        `SELECT * FROM ai_video_jobs WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL`,
        [jobId, userId],
    );
    if (!jobResult.rowCount) return null;
    const [segments, clips] = await Promise.all([
        query(`SELECT * FROM ai_video_transcript_segments WHERE job_id=$1 ORDER BY segment_index`, [jobId]),
        query(`SELECT * FROM ai_video_clips WHERE job_id=$1 ORDER BY sort_order`, [jobId]),
    ]);
    return {
        job: normalizeJob(jobResult.rows[0]),
        segments: segments.rows.map((row) => ({ id: row.id, segmentIndex: row.segment_index, startMs: Number(row.start_ms), endMs: Number(row.end_ms), sourceText: row.source_text, translatedText: row.translated_text, speaker: row.speaker, confidence: row.confidence, words: row.words || null })),
        clips: clips.rows.map((row) => ({ id: row.id, sortOrder: row.sort_order, startMs: Number(row.start_ms), endMs: Number(row.end_ms), title: row.title, reason: row.reason, score: row.score, enabled: row.enabled, cropMode: row.crop_mode, focusX: row.focus_x, subtitleStyle: row.subtitle_style || {} })),
    };
};

export const updateAiVideoDraft = async ({ jobId, userId, expectedRevision, segments, clips, now = Date.now() }) => {
    const client = await getClient();
    try {
        await client.query("BEGIN");
        const jobResult = await client.query(
            `SELECT * FROM ai_video_jobs WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL FOR UPDATE`,
            [jobId, userId],
        );
        const job = jobResult.rows[0];
        if (!job) {
            await client.query("ROLLBACK");
            return { reason: "not_found" };
        }
        if (job.status !== "draft_ready") {
            await client.query("ROLLBACK");
            return { reason: "not_editable" };
        }
        if (job.draft_revision !== expectedRevision) {
            await client.query("ROLLBACK");
            return { reason: "revision_conflict", revision: job.draft_revision };
        }
        for (const segment of segments || []) {
            await client.query(
                `UPDATE ai_video_transcript_segments SET translated_text=$4, revision=revision+1
                 WHERE id=$1 AND job_id=$2 AND segment_index=$3`,
                [segment.id, jobId, segment.segmentIndex, segment.translatedText],
            );
        }
        for (const clip of clips || []) {
            await client.query(
                `UPDATE ai_video_clips SET start_ms=$3,end_ms=$4,title=$5,enabled=$6,focus_x=$7,
                    subtitle_style=$8,revision=revision+1,updated_at=$9
                 WHERE id=$1 AND job_id=$2`,
                [clip.id, jobId, clip.startMs, clip.endMs, clip.title, clip.enabled, clip.focusX, clip.subtitleStyle || {}, now],
            );
        }
        const updated = await client.query(
            `UPDATE ai_video_jobs SET draft_revision=draft_revision+1,updated_at=$3 WHERE id=$1 AND user_id=$2 RETURNING *`,
            [jobId, userId, now],
        );
        await client.query("COMMIT");
        return { job: normalizeJob(updated.rows[0]) };
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

export const queueAiVideoRender = async ({ jobId, userId, expectedRevision, now = Date.now() }) => {
    const client = await getClient();
    try {
        await client.query("BEGIN");
        const jobResult = await client.query(
            `SELECT * FROM ai_video_jobs WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL FOR UPDATE`,
            [jobId, userId],
        );
        const job = jobResult.rows[0];
        if (!job) {
            await client.query("ROLLBACK");
            return { reason: "not_found" };
        }
        if (job.render_revision === expectedRevision && new Set(["queued_render", "rendering", "completed"]).has(job.status)) {
            await client.query("COMMIT");
            return { job: normalizeJob(job), idempotent: true };
        }
        if (job.status !== "draft_ready") {
            await client.query("ROLLBACK");
            return { reason: "not_renderable" };
        }
        if (job.draft_revision !== expectedRevision) {
            await client.query("ROLLBACK");
            return { reason: "revision_conflict", revision: job.draft_revision };
        }
        const [clipsResult, segmentsResult] = await Promise.all([
            client.query(`SELECT * FROM ai_video_clips WHERE job_id=$1 AND enabled=true ORDER BY sort_order LIMIT 5`, [jobId]),
            client.query(`SELECT * FROM ai_video_transcript_segments WHERE job_id=$1 ORDER BY segment_index`, [jobId]),
        ]);
        if (!clipsResult.rowCount) {
            await client.query("ROLLBACK");
            return { reason: "no_clips" };
        }
        const snapshot = {
            revision: expectedRevision,
            createdAt: now,
            subtitleMode: job.subtitle_mode,
            targetLanguage: job.target_language,
            clips: clipsResult.rows.map((row) => ({
                id: row.id,
                sortOrder: row.sort_order,
                startMs: Number(row.start_ms),
                endMs: Number(row.end_ms),
                title: row.title || `clip-${row.sort_order + 1}`,
                cropMode: row.crop_mode,
                focusX: Number(row.focus_x),
                subtitleStyle: row.subtitle_style || {},
            })),
            segments: segmentsResult.rows.map((row) => ({
                segmentIndex: row.segment_index,
                startMs: Number(row.start_ms),
                endMs: Number(row.end_ms),
                sourceText: row.source_text,
                translatedText: row.translated_text || "",
                speaker: row.speaker,
            })),
        };
        const updated = await client.query(
            `UPDATE ai_video_jobs SET status='queued_render',current_stage='queued_render',progress=75,
                render_revision=$3,render_snapshot=$4,render_attempt_count=0,available_at=$5,
                error_code=NULL,error_detail=NULL,failed_stage=NULL,completed_at=NULL,updated_at=$5
             WHERE id=$1 AND user_id=$2 RETURNING *`,
            [jobId, userId, expectedRevision, snapshot, now],
        );
        await client.query(
            `UPDATE ai_video_assets SET cleanup_after=$2,expires_at=$2,cleanup_status='active'
             WHERE job_id=$1 AND kind='source' AND deleted_at IS NULL`,
            [jobId, now + 24 * 60 * 60 * 1000],
        );
        await query(
            `UPDATE ai_video_assets SET cleanup_after=$2,expires_at=$2,cleanup_status='active'
             WHERE job_id=$1 AND kind IN ('output','srt','vtt') AND deleted_at IS NULL`,
            [jobId, now + 7 * 24 * 60 * 60 * 1000],
        );
        await client.query("COMMIT");
        return { job: normalizeJob(updated.rows[0]), idempotent: false };
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

export const getAiVideoWorkerRenderSnapshot = async ({ jobId, workerId }) => {
    const result = await query(
        `SELECT render_snapshot,render_revision,source_object_key,source_filename,target_language,subtitle_mode
         FROM ai_video_jobs WHERE id=$1 AND lease_owner=$2 AND status='rendering'`,
        [jobId, workerId],
    );
    return result.rows[0] || null;
};

export const updateAiVideoRenderProgress = async ({ jobId, workerId, progress, now = Date.now() }) => {
    const result = await query(
        `UPDATE ai_video_jobs SET progress=$3,heartbeat_at=$4,updated_at=$4
         WHERE id=$1 AND lease_owner=$2 AND status='rendering' RETURNING *`,
        [jobId, workerId, Math.min(99, Math.max(76, Math.round(progress))), now],
    );
    return normalizeJob(result.rows[0] || null);
};

export const prepareAiVideoRenderedAsset = async ({ jobId, clipId, kind, objectKey, mime, revision, expiresAt, now = Date.now() }) => {
    const result = await query(
        `INSERT INTO ai_video_assets (
            id,job_id,kind,clip_id,object_key,object_generation,mime,size_bytes,revision,
            expires_at,cleanup_status,cleanup_after,created_at
         ) VALUES ($1,$2,$3,$4,$5,'pending',$6,NULL,$7,$8,'pending',$9,$10)
         ON CONFLICT (job_id,kind,clip_id,revision) DO UPDATE SET job_id=EXCLUDED.job_id
         RETURNING *`,
        [randomUUID(), jobId, kind, clipId, objectKey, mime, revision, expiresAt, now + 6 * 60 * 60 * 1000, now],
    );
    return result.rows[0];
};

export const finalizeAiVideoRenderedAsset = async ({ assetId, generation, sizeBytes }) => {
    const result = await query(
        `UPDATE ai_video_assets SET object_generation=$2,size_bytes=$3,cleanup_status='active',
            cleanup_after=expires_at,cleanup_attempts=0
         WHERE id=$1 AND deleted_at IS NULL RETURNING *`,
        [assetId, generation, sizeBytes],
    );
    return result.rows[0] || null;
};

export const getAiVideoWorkerRenderedAssets = async ({ jobId, workerId, revision }) => {
    const result = await query(
        `SELECT a.* FROM ai_video_assets a JOIN ai_video_jobs j ON j.id=a.job_id
         WHERE a.job_id=$1 AND j.lease_owner=$2 AND a.revision=$3
           AND a.kind IN ('output','srt','vtt') AND a.deleted_at IS NULL`,
        [jobId, workerId, revision],
    );
    return result.rows;
};

export const finishAiVideoRender = async ({ jobId, workerId, now = Date.now() }) => {
    const result = await query(
        `UPDATE ai_video_jobs SET status='completed',current_stage='completed',progress=100,
            lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,completed_at=$3,
            expires_at=$3 + 2592000000,updated_at=$3
         WHERE id=$1 AND lease_owner=$2 AND status='rendering' RETURNING *`,
        [jobId, workerId, now],
    );
    if (result.rowCount) {
        await query(
            `UPDATE ai_video_assets SET cleanup_after=$2,expires_at=$2
             WHERE job_id=$1 AND kind='source' AND deleted_at IS NULL`,
            [jobId, now + 24 * 60 * 60 * 1000],
        );
        await query(
            `UPDATE ai_video_assets SET cleanup_after=$2,expires_at=$2,cleanup_status='active'
             WHERE job_id=$1 AND kind IN ('output','srt','vtt') AND deleted_at IS NULL`,
            [jobId, now + 7 * 24 * 60 * 60 * 1000],
        );
    }
    return normalizeJob(result.rows[0] || null);
};

export const getAiVideoResults = async ({ jobId, userId, now = Date.now() }) => {
    const jobResult = await query(
        `SELECT * FROM ai_video_jobs WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL`,
        [jobId, userId],
    );
    if (!jobResult.rowCount) return null;
    const assets = await query(
        `SELECT a.*,c.sort_order,c.title,c.reason FROM ai_video_assets a
         LEFT JOIN ai_video_clips c ON c.id=a.clip_id
         WHERE a.job_id=$1 AND a.kind IN ('output','srt','vtt') AND a.deleted_at IS NULL
           AND a.cleanup_status='active' AND (a.expires_at IS NULL OR a.expires_at > $2)
         ORDER BY c.sort_order,a.kind`,
        [jobId, now],
    );
    return { job: normalizeJob(jobResult.rows[0]), assets: assets.rows };
};

export const getAiVideoAsset = async ({ jobId, assetId, userId, now = Date.now() }) => {
    const result = await query(
        `SELECT a.*,j.target_language,c.sort_order,c.title,c.reason
         FROM ai_video_assets a
         JOIN ai_video_jobs j ON j.id=a.job_id
         LEFT JOIN ai_video_clips c ON c.id=a.clip_id
         WHERE a.id=$1 AND a.job_id=$2 AND j.user_id=$3 AND j.deleted_at IS NULL
           AND a.kind IN ('output','srt','vtt') AND a.deleted_at IS NULL AND a.cleanup_status='active'
           AND (a.expires_at IS NULL OR a.expires_at > $4)`,
        [assetId, jobId, userId, now],
    );
    return result.rows[0] || null;
};

export const retryAiVideoJob = async ({ jobId, userId, now = Date.now() }) => {
    const result = await query(
        `UPDATE ai_video_jobs SET
             status=CASE WHEN failed_stage='rendering' AND render_snapshot IS NOT NULL THEN 'queued_render' ELSE 'queued_ingest' END,
             current_stage=CASE WHEN failed_stage='rendering' AND render_snapshot IS NOT NULL THEN 'queued_render' ELSE 'queued_ingest' END,
             available_at=$3,
             error_code=NULL,error_detail=NULL,updated_at=$3
         WHERE id=$1 AND user_id=$2 AND status='failed'
           AND ((failed_stage='rendering' AND render_attempt_count < 3)
                OR (failed_stage<>'rendering' AND attempt_count < 3))
           AND COALESCE((error_detail->>'retryable')::boolean,false)=true RETURNING *`,
        [jobId, userId, now],
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

export const cleanupExpiredAiVideoImportNonces = async ({ now = Date.now() }) => {
    await ensureAiVideoSchema();
    const result = await query(`DELETE FROM ai_video_import_nonces WHERE expires_at < $1`, [now - 24 * 60 * 60 * 1000]);
    return result.rowCount;
};
