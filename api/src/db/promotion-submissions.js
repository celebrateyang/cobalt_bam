import { getClient, query } from "./pg-client.js";

const PROMOTION_TYPES = Object.freeze({
    post: {
        key: "post",
        requestedPoints: 50,
    },
    video: {
        key: "video",
        requestedPoints: 100,
    },
});

const REVIEW_STATUS = Object.freeze({
    pending: "PENDING",
    approved: "APPROVED",
    rejected: "REJECTED",
});

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

const mapSubmissionRow = (row) => ({
    id: row.id,
    user_id: row.user_id,
    clerk_user_id: row.clerk_user_id,
    promotion_type: row.promotion_type,
    access_method: row.access_method,
    requested_points: row.requested_points,
    status: row.status,
    awarded_points: row.awarded_points,
    admin_note: row.admin_note,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    user: {
        primary_email: row.primary_email ?? null,
        full_name: row.full_name ?? null,
        avatar_url: row.avatar_url ?? null,
    },
});

export const getPromotionTypeConfig = (rawType) => {
    const key = typeof rawType === "string" ? rawType.trim().toLowerCase() : "";
    return PROMOTION_TYPES[key] ?? null;
};

export const initPromotionSubmissionsDatabase = async () => {
    await query(`
        CREATE TABLE IF NOT EXISTS user_promotion_submissions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            clerk_user_id TEXT NOT NULL,
            promotion_type TEXT NOT NULL, -- post | video
            access_method TEXT NOT NULL,
            requested_points INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | APPROVED | REJECTED
            awarded_points INTEGER NOT NULL DEFAULT 0,
            admin_note TEXT,
            reviewed_by TEXT,
            reviewed_at BIGINT,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_promotion_submissions_user_created
         ON user_promotion_submissions(user_id, created_at DESC);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_promotion_submissions_status_created
         ON user_promotion_submissions(status, created_at DESC);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_promotion_submissions_clerk
         ON user_promotion_submissions(clerk_user_id);`,
    );
};

export const createPromotionSubmission = async ({
    userId,
    clerkUserId,
    promotionType,
    accessMethod,
}) => {
    const config = getPromotionTypeConfig(promotionType);
    if (!config) {
        return { ok: false, code: "INVALID_TYPE" };
    }

    const now = Date.now();
    const result = await query(
        `
        INSERT INTO user_promotion_submissions (
            user_id,
            clerk_user_id,
            promotion_type,
            access_method,
            requested_points,
            created_at,
            updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        `,
        [
            userId,
            clerkUserId,
            config.key,
            accessMethod,
            config.requestedPoints,
            now,
            now,
        ],
    );

    return { ok: true, submission: result.rows?.[0] ?? null };
};

export const listPromotionSubmissions = async ({
    page = 1,
    limit = 20,
    search = "",
    status = "",
} = {}) => {
    const pagination = normalizePagination({ page, limit });
    const normalizedSearch = typeof search === "string" ? search.trim() : "";
    const normalizedStatus = typeof status === "string" ? status.trim().toUpperCase() : "";
    const offset = (pagination.page - 1) * pagination.limit;

    const params = [];
    const where = [];

    if (normalizedSearch) {
        params.push(`%${normalizedSearch}%`);
        const searchParam = `$${params.length}`;
        where.push(`(
            s.access_method ILIKE ${searchParam}
            OR s.clerk_user_id ILIKE ${searchParam}
            OR COALESCE(u.primary_email, '') ILIKE ${searchParam}
            OR COALESCE(u.full_name, '') ILIKE ${searchParam}
        )`);
    }

    if (
        normalizedStatus === REVIEW_STATUS.pending ||
        normalizedStatus === REVIEW_STATUS.approved ||
        normalizedStatus === REVIEW_STATUS.rejected
    ) {
        params.push(normalizedStatus);
        where.push(`s.status = $${params.length}`);
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countRes = await query(
        `
        SELECT COUNT(*)::bigint AS total
        FROM user_promotion_submissions s
        JOIN users u ON u.id = s.user_id
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
            s.*,
            u.primary_email,
            u.full_name,
            u.avatar_url
        FROM user_promotion_submissions s
        JOIN users u ON u.id = s.user_id
        ${whereClause}
        ORDER BY s.created_at DESC
        LIMIT ${limitParam}
        OFFSET ${offsetParam}
        `,
        listParams,
    );

    const submissions = (rowsRes.rows || []).map(mapSubmissionRow);
    const pages = pagination.limit ? Math.ceil(total / pagination.limit) : 0;

    return {
        submissions,
        pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total,
            pages,
        },
    };
};

export const reviewPromotionSubmission = async ({
    submissionId,
    reviewer,
    action,
    awardedPoints,
    adminNote,
}) => {
    const normalizedAction = typeof action === "string" ? action.trim().toLowerCase() : "";
    if (normalizedAction !== "approve" && normalizedAction !== "reject") {
        return { ok: false, code: "INVALID_ACTION" };
    }

    const nextStatus =
        normalizedAction === "approve"
            ? REVIEW_STATUS.approved
            : REVIEW_STATUS.rejected;
    let pointsToAward = 0;

    const client = await getClient();

    try {
        await client.query("BEGIN");

        const currentRes = await client.query(
            `
            SELECT *
            FROM user_promotion_submissions
            WHERE id = $1
            FOR UPDATE
            `,
            [submissionId],
        );

        const current = currentRes.rows?.[0];
        if (!current) {
            await client.query("ROLLBACK");
            return { ok: false, code: "NOT_FOUND" };
        }

        if (current.status !== REVIEW_STATUS.pending) {
            await client.query("ROLLBACK");
            return { ok: false, code: "ALREADY_REVIEWED", submission: current };
        }

        if (nextStatus === REVIEW_STATUS.approved) {
            pointsToAward =
                awardedPoints === undefined || awardedPoints === null
                    ? Number(current.requested_points ?? 0)
                    : Number(awardedPoints);

            if (
                !Number.isFinite(pointsToAward) ||
                !Number.isInteger(pointsToAward) ||
                pointsToAward < 0
            ) {
                await client.query("ROLLBACK");
                return { ok: false, code: "INVALID_POINTS" };
            }
        }

        const now = Date.now();
        const updateRes = await client.query(
            `
            UPDATE user_promotion_submissions
            SET
                status = $2,
                awarded_points = $3,
                admin_note = $4,
                reviewed_by = $5,
                reviewed_at = $6,
                updated_at = $6
            WHERE id = $1
            RETURNING *
            `,
            [
                submissionId,
                nextStatus,
                pointsToAward,
                adminNote ?? null,
                reviewer ?? null,
                now,
            ],
        );

        let userPointsAfter = null;
        if (nextStatus === REVIEW_STATUS.approved && pointsToAward > 0) {
            const userRes = await client.query(
                `
                UPDATE users
                SET
                    points = points + $2,
                    updated_at = $3
                WHERE id = $1
                RETURNING points
                `,
                [current.user_id, pointsToAward, now],
            );
            userPointsAfter = userRes.rows?.[0]?.points ?? null;
        }

        await client.query("COMMIT");
        return {
            ok: true,
            submission: updateRes.rows?.[0] ?? null,
            userPointsAfter,
        };
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {}
        throw error;
    } finally {
        client.release();
    }
};
