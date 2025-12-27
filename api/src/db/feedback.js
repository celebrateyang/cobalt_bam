import { query } from "./pg-client.js";

const normalizePagination = ({ page = 1, limit = 20 } = {}) => {
    const normalizedPage = Number.parseInt(String(page), 10);
    const normalizedLimit = Number.parseInt(String(limit), 10);

    const safePage =
        Number.isFinite(normalizedPage) && normalizedPage > 0 ? normalizedPage : 1;

    const safeLimit =
        Number.isFinite(normalizedLimit) && normalizedLimit > 0
            ? Math.min(normalizedLimit, 100)
            : 20;

    return { page: safePage, limit: safeLimit };
};

export const initFeedbackDatabase = async () => {
    await query(`
        CREATE TABLE IF NOT EXISTS user_feedback (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            clerk_user_id TEXT NOT NULL,
            video_url TEXT NOT NULL,
            phenomenon TEXT NOT NULL,
            suggestion TEXT,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id ON user_feedback(user_id, created_at DESC);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_feedback_clerk_user_id ON user_feedback(clerk_user_id);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at ON user_feedback(created_at DESC);`,
    );

    console.log("✓ Feedback database initialized");
};

export const createFeedback = async ({
    userId,
    clerkUserId,
    videoUrl,
    phenomenon,
    suggestion,
}) => {
    const now = Date.now();

    const result = await query(
        `
        INSERT INTO user_feedback (
            user_id,
            clerk_user_id,
            video_url,
            phenomenon,
            suggestion,
            created_at,
            updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        `,
        [
            userId,
            clerkUserId,
            videoUrl,
            phenomenon,
            suggestion ?? null,
            now,
            now,
        ],
    );

    return result.rows[0] || null;
};

export const listFeedback = async ({
    page = 1,
    limit = 20,
    search = "",
} = {}) => {
    const pagination = normalizePagination({ page, limit });
    const normalizedSearch = typeof search === "string" ? search.trim() : "";

    const offset = (pagination.page - 1) * pagination.limit;

    const params = [];
    const where = [];

    if (normalizedSearch) {
        params.push(`%${normalizedSearch}%`);
        const searchParam = `$${params.length}`;
        where.push(`(
            f.video_url ILIKE ${searchParam}
            OR f.phenomenon ILIKE ${searchParam}
            OR COALESCE(f.suggestion, '') ILIKE ${searchParam}
            OR f.clerk_user_id ILIKE ${searchParam}
            OR COALESCE(u.primary_email, '') ILIKE ${searchParam}
            OR COALESCE(u.full_name, '') ILIKE ${searchParam}
        )`);
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countRes = await query(
        `
        SELECT COUNT(*)::bigint AS total
        FROM user_feedback f
        JOIN users u ON u.id = f.user_id
        ${whereClause}
        `,
        params,
    );

    const totalRaw = countRes.rows?.[0]?.total ?? 0;
    const total =
        typeof totalRaw === "string" ? Number.parseInt(totalRaw, 10) : Number(totalRaw);

    const listParams = [...params, pagination.limit, offset];
    const limitParam = `$${listParams.length - 1}`;
    const offsetParam = `$${listParams.length}`;

    const rowsRes = await query(
        `
        SELECT
            f.*,
            u.primary_email,
            u.full_name,
            u.avatar_url
        FROM user_feedback f
        JOIN users u ON u.id = f.user_id
        ${whereClause}
        ORDER BY f.created_at DESC
        LIMIT ${limitParam}
        OFFSET ${offsetParam}
        `,
        listParams,
    );

    const feedback = (rowsRes.rows || []).map((row) => ({
        id: row.id,
        user_id: row.user_id,
        clerk_user_id: row.clerk_user_id,
        video_url: row.video_url,
        phenomenon: row.phenomenon,
        suggestion: row.suggestion,
        created_at: row.created_at,
        updated_at: row.updated_at,
        user: {
            primary_email: row.primary_email ?? null,
            full_name: row.full_name ?? null,
            avatar_url: row.avatar_url ?? null,
        },
    }));

    const pages = pagination.limit ? Math.ceil(total / pagination.limit) : 0;

    return {
        feedback,
        pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total,
            pages,
        },
    };
};

