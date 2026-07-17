import { getClient, query } from "./pg-client.js";

const STATUSES = new Set(["pending", "planned", "supported", "rejected"]);

const mapRequest = (row) => row ? ({
    id: Number(row.id),
    domain: row.domain,
    homepageUrl: row.homepage_url,
    status: row.status,
    voteCount: Number(row.vote_count || 0),
    votedByMe: row.voted_by_me === true,
    source: row.source,
    adminNote: row.admin_note ?? null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    supportedAt: row.supported_at == null ? null : Number(row.supported_at),
}) : null;

export const initPlatformRequestsDatabase = async () => {
    await query(`
        CREATE TABLE IF NOT EXISTS platform_requests (
            id BIGSERIAL PRIMARY KEY,
            domain TEXT NOT NULL UNIQUE,
            homepage_url TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'planned', 'supported', 'rejected')),
            vote_count INTEGER NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
            submitted_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            submitted_by_clerk_user_id TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'request_page'
                CHECK (source IN ('request_page', 'unsupported_download')),
            admin_note TEXT,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            supported_at BIGINT
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS platform_request_votes (
            request_id BIGINT NOT NULL REFERENCES platform_requests(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            clerk_user_id TEXT NOT NULL,
            created_at BIGINT NOT NULL,
            PRIMARY KEY (request_id, user_id)
        );
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_platform_requests_ranking ON platform_requests(status, vote_count DESC, created_at DESC);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_platform_requests_created_at ON platform_requests(created_at DESC);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_platform_request_votes_user ON platform_request_votes(user_id, created_at DESC);`);
};

export const findPlatformRequestByDomain = async (domain, clerkUserId = null) => {
    const result = await query(
        `SELECT pr.*,
                CASE WHEN $2::text IS NULL THEN false ELSE EXISTS (
                    SELECT 1 FROM platform_request_votes prv
                    WHERE prv.request_id = pr.id AND prv.clerk_user_id = $2
                ) END AS voted_by_me
         FROM platform_requests pr
         WHERE pr.domain = $1
         LIMIT 1`,
        [domain, clerkUserId],
    );
    return mapRequest(result.rows[0]);
};

export const getPlatformRequest = async (id, clerkUserId = null) => {
    const result = await query(
        `SELECT pr.*,
                CASE WHEN $2::text IS NULL THEN false ELSE EXISTS (
                    SELECT 1 FROM platform_request_votes prv
                    WHERE prv.request_id = pr.id AND prv.clerk_user_id = $2
                ) END AS voted_by_me
         FROM platform_requests pr
         WHERE pr.id = $1
         LIMIT 1`,
        [id, clerkUserId],
    );
    return mapRequest(result.rows[0]);
};

export const listPlatformRequests = async ({
    page = 1,
    limit = 20,
    sort = "votes",
    status = null,
    search = "",
    clerkUserId = null,
} = {}) => {
    const safePage = Math.max(1, Number.parseInt(String(page), 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 20));
    const params = [];
    const where = [];

    if (status && STATUSES.has(status)) {
        params.push(status);
        where.push(`pr.status = $${params.length}`);
    }
    const normalizedSearch = typeof search === "string" ? search.trim().slice(0, 200) : "";
    if (normalizedSearch) {
        params.push(`%${normalizedSearch}%`);
        where.push(`(pr.domain ILIKE $${params.length} OR COALESCE(pr.admin_note, '') ILIKE $${params.length})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const countResult = await query(`SELECT COUNT(*)::bigint AS total FROM platform_requests pr ${whereSql}`, params);
    const total = Number(countResult.rows[0]?.total || 0);

    params.push(clerkUserId);
    const clerkParam = `$${params.length}`;
    params.push(safeLimit, (safePage - 1) * safeLimit);
    const limitParam = `$${params.length - 1}`;
    const offsetParam = `$${params.length}`;
    const orderBy = sort === "newest"
        ? "pr.created_at DESC, pr.id DESC"
        : "pr.vote_count DESC, pr.created_at DESC, pr.id DESC";

    const result = await query(
        `SELECT pr.*,
                CASE WHEN ${clerkParam}::text IS NULL THEN false ELSE EXISTS (
                    SELECT 1 FROM platform_request_votes prv
                    WHERE prv.request_id = pr.id AND prv.clerk_user_id = ${clerkParam}
                ) END AS voted_by_me
         FROM platform_requests pr
         ${whereSql}
         ORDER BY ${orderBy}
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
        params,
    );

    return {
        requests: result.rows.map(mapRequest),
        pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            pages: Math.ceil(total / safeLimit),
        },
    };
};

export const createPlatformRequest = async ({ domain, homepageUrl, userId, clerkUserId, source }) => {
    const client = await getClient();
    const now = Date.now();
    try {
        await client.query("BEGIN");
        const inserted = await client.query(
            `INSERT INTO platform_requests (
                domain, homepage_url, submitted_by_user_id, submitted_by_clerk_user_id,
                source, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $6)
             ON CONFLICT (domain) DO NOTHING
             RETURNING *`,
            [domain, homepageUrl, userId, clerkUserId, source, now],
        );

        if (!inserted.rows[0]) {
            const existing = await client.query(
                `SELECT pr.*, EXISTS (
                    SELECT 1 FROM platform_request_votes prv
                    WHERE prv.request_id = pr.id AND prv.user_id = $2
                 ) AS voted_by_me
                 FROM platform_requests pr WHERE pr.domain = $1 LIMIT 1`,
                [domain, userId],
            );
            await client.query("COMMIT");
            return { created: false, request: mapRequest(existing.rows[0]) };
        }

        const request = inserted.rows[0];
        await client.query(
            `INSERT INTO platform_request_votes (request_id, user_id, clerk_user_id, created_at)
             VALUES ($1, $2, $3, $4)`,
            [request.id, userId, clerkUserId, now],
        );
        const updated = await client.query(
            `UPDATE platform_requests SET vote_count = 1, updated_at = $2 WHERE id = $1 RETURNING *, true AS voted_by_me`,
            [request.id, now],
        );
        await client.query("COMMIT");
        return { created: true, request: mapRequest(updated.rows[0]) };
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

export const setPlatformRequestVote = async ({ requestId, userId, clerkUserId, voted }) => {
    const client = await getClient();
    const now = Date.now();
    try {
        await client.query("BEGIN");
        const locked = await client.query(`SELECT id FROM platform_requests WHERE id = $1 FOR UPDATE`, [requestId]);
        if (!locked.rows[0]) {
            await client.query("ROLLBACK");
            return null;
        }

        let changed = false;
        if (voted) {
            const result = await client.query(
                `INSERT INTO platform_request_votes (request_id, user_id, clerk_user_id, created_at)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (request_id, user_id) DO NOTHING
                 RETURNING request_id`,
                [requestId, userId, clerkUserId, now],
            );
            changed = result.rowCount > 0;
        } else {
            const result = await client.query(
                `DELETE FROM platform_request_votes WHERE request_id = $1 AND user_id = $2 RETURNING request_id`,
                [requestId, userId],
            );
            changed = result.rowCount > 0;
        }

        if (changed) {
            await client.query(
                `UPDATE platform_requests
                 SET vote_count = GREATEST(0, vote_count + $2), updated_at = $3
                 WHERE id = $1`,
                [requestId, voted ? 1 : -1, now],
            );
        }

        const result = await client.query(
            `SELECT pr.*, $2::boolean AS voted_by_me FROM platform_requests pr WHERE pr.id = $1`,
            [requestId, voted],
        );
        await client.query("COMMIT");
        return mapRequest(result.rows[0]);
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

export const updatePlatformRequest = async ({ id, status, adminNote }) => {
    const now = Date.now();
    const result = await query(
        `UPDATE platform_requests
         SET status = $2,
             admin_note = $3,
             supported_at = CASE WHEN $2 = 'supported' THEN COALESCE(supported_at, $4) ELSE NULL END,
             updated_at = $4
         WHERE id = $1
         RETURNING *, false AS voted_by_me`,
        [id, status, adminNote, now],
    );
    return mapRequest(result.rows[0]);
};

export const platformRequestStatuses = STATUSES;
