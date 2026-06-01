import { env } from "../config.js";
import { query } from "./pg-client.js";

export const DOWNLOAD_ATTEMPT_STATUS = Object.freeze({
    pending: "pending",
    success: "success",
    failed: "failed",
    exception: "exception",
});

const isPostgresEnabled = () => env.dbType === "postgresql";

const clampLimit = (value, fallback = 20) => {
    const parsed = Number.parseInt(String(value), 10);
    const safe = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    return Math.min(Math.max(safe, 1), 200);
};

const normalizePage = (value) => {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const normalizeTimestamp = (value) => {
    if (value == null || value === "") return null;
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const initDownloadAttemptsDatabase = async () => {
    if (!isPostgresEnabled()) return;

    await query(`
        CREATE TABLE IF NOT EXISTS download_attempts (
            id SERIAL PRIMARY KEY,
            request_id TEXT NOT NULL UNIQUE,
            user_id INTEGER,
            clerk_user_id TEXT,
            email TEXT,
            source_url TEXT NOT NULL,
            source_host TEXT,
            service TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            http_status INTEGER,
            body_status TEXT,
            error_code TEXT,
            error_message TEXT,
            points_outcome TEXT,
            points_required INTEGER,
            points_before INTEGER,
            points_after INTEGER,
            submitted_at BIGINT NOT NULL,
            completed_at BIGINT,
            elapsed_ms INTEGER,
            metadata JSONB,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );
    `);

    await query(`
        CREATE INDEX IF NOT EXISTS idx_download_attempts_submitted_at
        ON download_attempts(submitted_at DESC);
    `);
    await query(`
        CREATE INDEX IF NOT EXISTS idx_download_attempts_email_submitted_at
        ON download_attempts(email, submitted_at DESC);
    `);
    await query(`
        CREATE INDEX IF NOT EXISTS idx_download_attempts_status_submitted_at
        ON download_attempts(status, submitted_at DESC);
    `);
    await query(`
        CREATE INDEX IF NOT EXISTS idx_download_attempts_source_host_submitted_at
        ON download_attempts(source_host, submitted_at DESC);
    `);
};

export const createDownloadAttempt = async ({
    requestId,
    userId = null,
    clerkUserId = null,
    email = "unknown",
    sourceUrl,
    sourceHost = null,
    submittedAt = Date.now(),
    metadata = null,
}) => {
    if (!isPostgresEnabled() || !requestId || !sourceUrl) return null;

    const now = Date.now();
    const result = await query(
        `
        INSERT INTO download_attempts (
            request_id,
            user_id,
            clerk_user_id,
            email,
            source_url,
            source_host,
            status,
            submitted_at,
            metadata,
            created_at,
            updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
        ON CONFLICT (request_id) DO NOTHING
        RETURNING *;
        `,
        [
            requestId,
            userId,
            clerkUserId,
            email || "unknown",
            sourceUrl,
            sourceHost,
            DOWNLOAD_ATTEMPT_STATUS.pending,
            submittedAt,
            metadata,
            now,
        ],
    );

    return result.rows[0] || null;
};

export const completeDownloadAttempt = async ({
    requestId,
    status,
    service = null,
    httpStatus = null,
    bodyStatus = null,
    errorCode = null,
    errorMessage = null,
    pointsOutcome = null,
    pointsRequired = null,
    pointsBefore = null,
    pointsAfter = null,
    completedAt = Date.now(),
    elapsedMs = null,
    metadata = null,
}) => {
    if (!isPostgresEnabled() || !requestId) return null;

    const result = await query(
        `
        UPDATE download_attempts
        SET status = $2,
            service = $3,
            http_status = $4,
            body_status = $5,
            error_code = $6,
            error_message = $7,
            points_outcome = $8,
            points_required = $9,
            points_before = $10,
            points_after = $11,
            completed_at = $12,
            elapsed_ms = $13,
            metadata = COALESCE($14, metadata),
            updated_at = $12
        WHERE request_id = $1
        RETURNING *;
        `,
        [
            requestId,
            status,
            service,
            httpStatus,
            bodyStatus,
            errorCode,
            errorMessage,
            pointsOutcome,
            pointsRequired,
            pointsBefore,
            pointsAfter,
            completedAt,
            elapsedMs,
            metadata,
        ],
    );

    return result.rows[0] || null;
};

export const getDownloadAttemptById = async (id) => {
    if (!isPostgresEnabled()) return null;

    const parsedId = Number.parseInt(String(id), 10);
    if (!Number.isFinite(parsedId) || parsedId <= 0) return null;

    const result = await query(
        `
        SELECT *
        FROM download_attempts
        WHERE id = $1
        LIMIT 1;
        `,
        [parsedId],
    );

    return result.rows[0] || null;
};

export const cleanupOldDownloadAttempts = async ({ retentionDays = 2 } = {}) => {
    if (!isPostgresEnabled()) return { deleted: 0, cutoff: null };

    const safeRetentionDays =
        Number.isFinite(Number(retentionDays)) && Number(retentionDays) > 0
            ? Number(retentionDays)
            : 2;
    const cutoff = Date.now() - safeRetentionDays * 24 * 60 * 60 * 1000;
    const result = await query(
        `
        DELETE FROM download_attempts
        WHERE submitted_at < $1;
        `,
        [cutoff],
    );

    return {
        deleted: result.rowCount ?? 0,
        cutoff,
    };
};

export const listDownloadAttempts = async ({
    page = 1,
    limit = 20,
    status = "",
    search = "",
    host = "",
    from,
    to,
    sort = "submitted_at",
    order = "desc",
} = {}) => {
    const safePage = normalizePage(page);
    const safeLimit = clampLimit(limit);
    const offset = (safePage - 1) * safeLimit;

    const allowedSort = {
        submitted_at: "d.submitted_at",
        completed_at: "d.completed_at",
        status: `CASE d.status
            WHEN 'pending' THEN 1
            WHEN 'success' THEN 2
            WHEN 'failed' THEN 3
            WHEN 'exception' THEN 4
            ELSE 99
        END`,
        elapsed_ms: "d.elapsed_ms",
    };
    const sortColumn = allowedSort[String(sort)] || allowedSort.submitted_at;
    const orderDir = String(order).toLowerCase() === "asc" ? "ASC" : "DESC";

    const where = [];
    const params = [];
    let paramIndex = 1;

    const normalizedStatus = String(status || "").trim().toLowerCase();
    if (normalizedStatus) {
        const statuses = normalizedStatus
            .split(",")
            .map((item) => item.trim())
            .filter((item) =>
                Object.values(DOWNLOAD_ATTEMPT_STATUS).includes(item),
            );
        if (statuses.length === 1) {
            where.push(`d.status = $${paramIndex}`);
            params.push(statuses[0]);
            paramIndex += 1;
        } else if (statuses.length > 1) {
            where.push(`d.status = ANY($${paramIndex}::text[])`);
            params.push(statuses);
            paramIndex += 1;
        }
    }

    const normalizedHost = String(host || "").trim();
    if (normalizedHost) {
        where.push(`d.source_host ILIKE $${paramIndex}`);
        params.push(`%${normalizedHost}%`);
        paramIndex += 1;
    }

    const fromTs = normalizeTimestamp(from);
    if (fromTs) {
        where.push(`d.submitted_at >= $${paramIndex}`);
        params.push(fromTs);
        paramIndex += 1;
    }

    const toTs = normalizeTimestamp(to);
    if (toTs) {
        where.push(`d.submitted_at <= $${paramIndex}`);
        params.push(toTs);
        paramIndex += 1;
    }

    const normalizedSearch = String(search || "").trim();
    if (normalizedSearch) {
        const term = `%${normalizedSearch}%`;
        where.push(
            `(d.email ILIKE $${paramIndex}
              OR d.source_url ILIKE $${paramIndex}
              OR d.source_host ILIKE $${paramIndex}
              OR d.service ILIKE $${paramIndex}
              OR d.error_code ILIKE $${paramIndex}
              OR d.error_message ILIKE $${paramIndex}
              OR u.primary_email ILIKE $${paramIndex}
              OR u.full_name ILIKE $${paramIndex})`,
        );
        params.push(term);
        paramIndex += 1;
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countResult = await query(
        `
        SELECT COUNT(*) as total
        FROM download_attempts d
        LEFT JOIN users u ON u.id = d.user_id
        ${whereSql};
        `,
        params,
    );
    const total = Number.parseInt(countResult.rows[0]?.total ?? "0", 10) || 0;

    const listResult = await query(
        `
        SELECT
            d.id,
            d.request_id,
            d.user_id,
            d.clerk_user_id,
            d.email,
            d.source_url,
            d.source_host,
            d.service,
            d.status,
            d.http_status,
            d.body_status,
            d.error_code,
            d.error_message,
            d.points_outcome,
            d.points_required,
            d.points_before,
            d.points_after,
            d.submitted_at,
            d.completed_at,
            d.elapsed_ms,
            d.metadata,
            json_build_object(
                'primary_email', u.primary_email,
                'full_name', u.full_name,
                'avatar_url', u.avatar_url
            ) AS user
        FROM download_attempts d
        LEFT JOIN users u ON u.id = d.user_id
        ${whereSql}
        ORDER BY ${sortColumn} ${orderDir} NULLS LAST, d.id DESC
        LIMIT $${paramIndex}
        OFFSET $${paramIndex + 1};
        `,
        [...params, safeLimit, offset],
    );

    return {
        attempts: listResult.rows,
        pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            pages: Math.ceil(total / safeLimit),
        },
    };
};
