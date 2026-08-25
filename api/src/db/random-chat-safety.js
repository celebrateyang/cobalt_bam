import { getClient, query } from "./pg-client.js";

const REPORT_STATUSES = new Set(["pending", "reviewed", "actioned", "dismissed"]);
let safetySchemaPromise = null;

export const ensureRandomChatSafetySchema = async () => {
    if (!safetySchemaPromise) {
        safetySchemaPromise = (async () => {
            await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS random_chat_adult_confirmed_at BIGINT;`);
            await query(`
        CREATE TABLE IF NOT EXISTS random_chat_reports (
            id BIGSERIAL PRIMARY KEY,
            match_id TEXT NOT NULL,
            reporter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            reported_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            reason TEXT NOT NULL,
            details TEXT,
            phase TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            admin_note TEXT,
            reviewed_by TEXT,
            reviewed_at BIGINT,
            created_at BIGINT NOT NULL,
            UNIQUE(match_id, reporter_user_id)
        );
            `);
            await query(`CREATE INDEX IF NOT EXISTS idx_random_chat_reports_status_created ON random_chat_reports(status, created_at DESC);`);
            await query(`CREATE INDEX IF NOT EXISTS idx_random_chat_reports_reported_user ON random_chat_reports(reported_user_id, created_at DESC);`);
            await query(`
        CREATE TABLE IF NOT EXISTS random_chat_blocks (
            blocker_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            blocked_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            report_id BIGINT REFERENCES random_chat_reports(id) ON DELETE SET NULL,
            created_at BIGINT NOT NULL,
            PRIMARY KEY (blocker_user_id, blocked_user_id)
        );
            `);
        })().catch((error) => {
            safetySchemaPromise = null;
            throw error;
        });
    }
    return safetySchemaPromise;
};

export const getRandomChatAdultStatusByClerkId = async (clerkUserId) => {
    await ensureRandomChatSafetySchema();
    const result = await query(
        `SELECT random_chat_adult_confirmed_at FROM users WHERE clerk_user_id = $1 LIMIT 1;`,
        [clerkUserId],
    );
    const confirmedAt = Number(result.rows?.[0]?.random_chat_adult_confirmed_at) || null;
    return { confirmed: !!confirmedAt, confirmedAt };
};

export const confirmRandomChatAdultByClerkId = async (clerkUserId) => {
    await ensureRandomChatSafetySchema();
    const now = Date.now();
    const result = await query(
        `UPDATE users
         SET random_chat_adult_confirmed_at = COALESCE(random_chat_adult_confirmed_at, $2),
             updated_at = $2
         WHERE clerk_user_id = $1
         RETURNING random_chat_adult_confirmed_at;`,
        [clerkUserId, now],
    );
    if (!result.rowCount) return null;
    const confirmedAt = Number(result.rows[0].random_chat_adult_confirmed_at);
    return { confirmed: true, confirmedAt };
};

export const getRandomChatBlockedClerkIds = async (clerkUserId) => {
    await ensureRandomChatSafetySchema();
    const result = await query(
        `SELECT DISTINCT other.clerk_user_id
         FROM users self_user
         JOIN random_chat_blocks block
           ON block.blocker_user_id = self_user.id OR block.blocked_user_id = self_user.id
         JOIN users other
           ON other.id = CASE
               WHEN block.blocker_user_id = self_user.id THEN block.blocked_user_id
               ELSE block.blocker_user_id
           END
         WHERE self_user.clerk_user_id = $1;`,
        [clerkUserId],
    );
    return result.rows.map((row) => row.clerk_user_id).filter(Boolean);
};

export const createRandomChatReport = async ({
    matchId,
    reporterClerkUserId,
    reportedClerkUserId,
    reason,
    details = "",
    phase = "",
}) => {
    await ensureRandomChatSafetySchema();
    const client = await getClient();
    const now = Date.now();
    try {
        await client.query("BEGIN");
        const users = await client.query(
            `SELECT id, clerk_user_id FROM users WHERE clerk_user_id = ANY($1::text[]);`,
            [[reporterClerkUserId, reportedClerkUserId]],
        );
        const byClerkId = new Map(users.rows.map((row) => [row.clerk_user_id, row.id]));
        const reporterUserId = byClerkId.get(reporterClerkUserId);
        const reportedUserId = byClerkId.get(reportedClerkUserId);
        if (!reporterUserId || !reportedUserId || reporterUserId === reportedUserId) {
            throw new Error("Invalid random chat report users");
        }

        const inserted = await client.query(
            `INSERT INTO random_chat_reports (
                match_id, reporter_user_id, reported_user_id, reason, details,
                phase, status, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
             ON CONFLICT (match_id, reporter_user_id) DO NOTHING
             RETURNING *;`,
            [matchId, reporterUserId, reportedUserId, reason, details || null, phase || null, now],
        );
        const report = inserted.rows[0] || null;
        if (report) {
            await client.query(
                `INSERT INTO random_chat_blocks (blocker_user_id, blocked_user_id, report_id, created_at)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (blocker_user_id, blocked_user_id) DO NOTHING;`,
                [reporterUserId, reportedUserId, report.id, now],
            );
        }
        await client.query("COMMIT");
        return report;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

export const listRandomChatReports = async ({ page = 1, limit = 30, status = "" } = {}) => {
    await ensureRandomChatSafetySchema();
    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedLimit = Math.min(100, Math.max(1, Number(limit) || 30));
    const offset = (normalizedPage - 1) * normalizedLimit;
    const statusFilter = REPORT_STATUSES.has(status) ? status : "";
    const params = statusFilter
        ? [statusFilter, normalizedLimit, offset]
        : [normalizedLimit, offset];
    const where = statusFilter ? "WHERE report.status = $1" : "";
    const limitIndex = statusFilter ? 2 : 1;
    const offsetIndex = statusFilter ? 3 : 2;
    const [rows, count] = await Promise.all([
        query(
            `SELECT report.*,
                    reporter.primary_email AS reporter_email,
                    reporter.full_name AS reporter_name,
                    reported.primary_email AS reported_email,
                    reported.full_name AS reported_name
             FROM random_chat_reports report
             JOIN users reporter ON reporter.id = report.reporter_user_id
             JOIN users reported ON reported.id = report.reported_user_id
             ${where}
             ORDER BY report.created_at DESC
             LIMIT $${limitIndex} OFFSET $${offsetIndex};`,
            params,
        ),
        query(
            `SELECT COUNT(*)::integer AS total FROM random_chat_reports report ${where};`,
            statusFilter ? [statusFilter] : [],
        ),
    ]);
    const total = Number(count.rows[0]?.total) || 0;
    return {
        reports: rows.rows,
        pagination: {
            page: normalizedPage,
            limit: normalizedLimit,
            total,
            pages: Math.ceil(total / normalizedLimit),
        },
    };
};

export const reviewRandomChatReport = async ({ id, status, adminNote = "", reviewedBy = "" }) => {
    await ensureRandomChatSafetySchema();
    if (!REPORT_STATUSES.has(status) || status === "pending") return null;
    const result = await query(
        `UPDATE random_chat_reports
         SET status = $2, admin_note = $3, reviewed_by = $4, reviewed_at = $5
         WHERE id = $1
         RETURNING *;`,
        [id, status, adminNote || null, reviewedBy || null, Date.now()],
    );
    return result.rows[0] || null;
};

export const countPendingRandomChatReports = async () => {
    await ensureRandomChatSafetySchema();
    const result = await query(`SELECT COUNT(*)::integer AS total FROM random_chat_reports WHERE status = 'pending';`);
    return Number(result.rows[0]?.total) || 0;
};
