import { query } from "./pg-client.js";

const clampInteger = (value, fallback, min, max) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
};

const normalizeTimestamp = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
};

const buildFilters = ({
    search,
    kind,
    jobStatus,
    cleanupStatus,
    userId,
    createdFrom,
    createdTo,
} = {}) => {
    const where = ["a.deleted_at IS NULL"];
    const params = [];
    let paramIndex = 1;

    const addExactFilter = (column, value) => {
        const normalized = String(value || "").trim();
        if (!normalized) return;
        where.push(`${column} = $${paramIndex}`);
        params.push(normalized);
        paramIndex += 1;
    };

    addExactFilter("a.kind", kind);
    addExactFilter("j.status", jobStatus);
    addExactFilter("a.cleanup_status", cleanupStatus);

    const normalizedUserId = Number.parseInt(userId, 10);
    if (Number.isInteger(normalizedUserId) && normalizedUserId > 0) {
        where.push(`j.user_id = $${paramIndex}`);
        params.push(normalizedUserId);
        paramIndex += 1;
    }

    const from = normalizeTimestamp(createdFrom);
    if (from) {
        where.push(`a.created_at >= $${paramIndex}`);
        params.push(from);
        paramIndex += 1;
    }

    const to = normalizeTimestamp(createdTo);
    if (to) {
        where.push(`a.created_at <= $${paramIndex}`);
        params.push(to);
        paramIndex += 1;
    }

    const normalizedSearch = String(search || "").trim();
    if (normalizedSearch) {
        const term = `%${normalizedSearch}%`;
        where.push(`(
            u.primary_email ILIKE $${paramIndex}
            OR u.full_name ILIKE $${paramIndex}
            OR u.clerk_user_id ILIKE $${paramIndex}
            OR j.source_filename ILIKE $${paramIndex}
            OR a.object_key ILIKE $${paramIndex}
            OR a.id::text ILIKE $${paramIndex}
            OR j.id::text ILIKE $${paramIndex}
            OR j.user_id::text = $${paramIndex + 1}
        )`);
        params.push(term, normalizedSearch);
        paramIndex += 2;
    }

    return {
        whereSql: `WHERE ${where.join(" AND ")}`,
        params,
        nextParamIndex: paramIndex,
    };
};

const mapAsset = (row) => ({
    id: row.id,
    jobId: row.job_id,
    userId: row.user_id,
    kind: row.kind,
    objectKey: row.object_key,
    objectGeneration: row.object_generation,
    mime: row.mime,
    sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
    checksumSha256: row.checksum_sha256,
    revision: row.revision,
    expiresAt: row.expires_at == null ? null : Number(row.expires_at),
    cleanupStatus: row.cleanup_status,
    cleanupAttempts: row.cleanup_attempts,
    cleanupAfter: row.cleanup_after == null ? null : Number(row.cleanup_after),
    createdAt: Number(row.created_at),
    sourceFilename: row.source_filename,
    sourceKind: row.source_kind,
    sourceDurationMs: row.source_duration_ms == null ? null : Number(row.source_duration_ms),
    sourceWidth: row.source_width,
    sourceHeight: row.source_height,
    jobStatus: row.job_status,
    jobCreatedAt: Number(row.job_created_at),
    jobCompletedAt: row.job_completed_at == null ? null : Number(row.job_completed_at),
    user: {
        id: row.user_id,
        clerkUserId: row.clerk_user_id,
        primaryEmail: row.primary_email,
        fullName: row.full_name,
        avatarUrl: row.avatar_url,
    },
});

export const listAdminAiVideoAssets = async ({
    page = 1,
    limit = 20,
    sort = "created_at",
    order = "desc",
    ...filters
} = {}) => {
    const safePage = clampInteger(page, 1, 1, 1_000_000);
    const safeLimit = clampInteger(limit, 20, 1, 100);
    const offset = (safePage - 1) * safeLimit;
    const sortColumns = {
        created_at: "a.created_at",
        size_bytes: "a.size_bytes",
        expires_at: "a.expires_at",
        kind: "a.kind",
        job_status: "j.status",
        cleanup_status: "a.cleanup_status",
    };
    const sortColumn = sortColumns[sort] || sortColumns.created_at;
    const orderDirection = String(order).toLowerCase() === "asc" ? "ASC" : "DESC";
    const { whereSql, params, nextParamIndex } = buildFilters(filters);

    const countResult = await query(
        `SELECT COUNT(*) AS total
         FROM ai_video_assets a
         JOIN ai_video_jobs j ON j.id = a.job_id
         JOIN users u ON u.id = j.user_id
         ${whereSql}`,
        params,
    );
    const total = Number.parseInt(countResult.rows[0]?.total ?? "0", 10) || 0;

    const result = await query(
        `SELECT
            a.*,
            j.user_id,
            j.status AS job_status,
            j.source_kind,
            j.source_filename,
            j.source_duration_ms,
            j.source_width,
            j.source_height,
            j.created_at AS job_created_at,
            j.completed_at AS job_completed_at,
            u.clerk_user_id,
            u.primary_email,
            u.full_name,
            u.avatar_url
         FROM ai_video_assets a
         JOIN ai_video_jobs j ON j.id = a.job_id
         JOIN users u ON u.id = j.user_id
         ${whereSql}
         ORDER BY ${sortColumn} ${orderDirection} NULLS LAST, a.id DESC
         LIMIT $${nextParamIndex}
         OFFSET $${nextParamIndex + 1}`,
        [...params, safeLimit, offset],
    );

    return {
        assets: result.rows.map(mapAsset),
        pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            pages: Math.ceil(total / safeLimit),
        },
    };
};

export const getAdminAiVideoStorageSummary = async () => {
    const result = await query(
        `SELECT
            COUNT(*)::int AS object_count,
            COUNT(DISTINCT j.id)::int AS job_count,
            COUNT(DISTINCT j.user_id)::int AS user_count,
            COALESCE(SUM(a.size_bytes), 0) AS total_size_bytes,
            COALESCE(SUM(a.size_bytes) FILTER (WHERE a.kind = 'source'), 0) AS source_size_bytes,
            COALESCE(SUM(a.size_bytes) FILTER (WHERE a.kind = 'output'), 0) AS output_size_bytes,
            COALESCE(SUM(a.size_bytes) FILTER (WHERE a.kind IN ('srt', 'vtt')), 0) AS subtitle_size_bytes,
            COALESCE(SUM(a.size_bytes) FILTER (
                WHERE a.cleanup_status IN ('pending', 'retry')
                   OR (a.cleanup_after IS NOT NULL AND a.cleanup_after <= $1)
            ), 0) AS pending_cleanup_size_bytes,
            COUNT(*) FILTER (
                WHERE a.cleanup_status IN ('pending', 'retry')
                   OR (a.cleanup_after IS NOT NULL AND a.cleanup_after <= $1)
            )::int AS pending_cleanup_count
         FROM ai_video_assets a
         JOIN ai_video_jobs j ON j.id = a.job_id
         WHERE a.deleted_at IS NULL`,
        [Date.now()],
    );
    const row = result.rows[0] || {};
    return {
        objectCount: Number(row.object_count || 0),
        jobCount: Number(row.job_count || 0),
        userCount: Number(row.user_count || 0),
        totalSizeBytes: Number(row.total_size_bytes || 0),
        sourceSizeBytes: Number(row.source_size_bytes || 0),
        outputSizeBytes: Number(row.output_size_bytes || 0),
        subtitleSizeBytes: Number(row.subtitle_size_bytes || 0),
        pendingCleanupSizeBytes: Number(row.pending_cleanup_size_bytes || 0),
        pendingCleanupCount: Number(row.pending_cleanup_count || 0),
    };
};

export const getAdminAiVideoAsset = async (assetId) => {
    const result = await query(
        `SELECT
            a.*,
            j.user_id,
            j.status AS job_status,
            j.source_kind,
            j.source_filename,
            j.source_duration_ms,
            j.source_width,
            j.source_height,
            j.created_at AS job_created_at,
            j.completed_at AS job_completed_at,
            u.clerk_user_id,
            u.primary_email,
            u.full_name,
            u.avatar_url
         FROM ai_video_assets a
         JOIN ai_video_jobs j ON j.id = a.job_id
         JOIN users u ON u.id = j.user_id
         WHERE a.id = $1 AND a.deleted_at IS NULL`,
        [assetId],
    );
    return result.rowCount ? mapAsset(result.rows[0]) : null;
};
