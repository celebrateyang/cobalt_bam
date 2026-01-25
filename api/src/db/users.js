import { getClient, query, initPool } from "./pg-client.js";
import { env } from "../config.js";
import { initFeedbackDatabase } from "./feedback.js";
import { initReferralDatabase } from "./referrals.js";
import { nanoid } from "nanoid";

const generateReferralCode = () => nanoid(10);
const isUniqueViolation = (error) =>
    error && typeof error === "object" && error.code === "23505";

export const initUserDatabase = async () => {
    if (env.dbType && env.dbType !== "postgresql") {
        throw new Error(
            `User database requires PostgreSQL (DB_TYPE=postgresql). Received DB_TYPE=${env.dbType}`,
        );
    }

    initPool();

    // Core users table (Clerk is the source of truth for authentication)
    await query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            clerk_user_id TEXT NOT NULL UNIQUE,
            primary_email TEXT,
            full_name TEXT,
            avatar_url TEXT,
            last_seen_at BIGINT,
            points INTEGER NOT NULL DEFAULT 20,
            referral_code TEXT,
            is_disabled BOOLEAN DEFAULT false,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        );
    `);

    // Migration: ensure points column exists for older databases
    await query(
        `ALTER TABLE users
            ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 20;`,
    );

    // Migration: ensure default points for new users is correct
    await query(`ALTER TABLE users ALTER COLUMN points SET DEFAULT 20;`);

    // Migration: referral codes (invite links)
    await query(
        `ALTER TABLE users
            ADD COLUMN IF NOT EXISTS referral_code TEXT;`,
    );
    await query(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);`,
    );

    await query(
        `CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_users_primary_email ON users(primary_email);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_users_last_seen_at ON users(last_seen_at DESC);`,
    );

    await initFeedbackDatabase();
    await initReferralDatabase();

    // ==================== Collection download memory ====================
    await query(`
        CREATE TABLE IF NOT EXISTS user_collection_memories (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            collection_key TEXT NOT NULL,
            service TEXT NOT NULL,
            kind TEXT NOT NULL,
            collection_id TEXT NOT NULL,
            title TEXT,
            source_url TEXT,
            first_seen_at BIGINT NOT NULL,
            last_opened_at BIGINT NOT NULL,
            last_marked_at BIGINT,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE (user_id, collection_key)
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_collection_memories_user_last_opened
         ON user_collection_memories(user_id, last_opened_at DESC);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_collection_memories_user_collection
         ON user_collection_memories(user_id, service, kind, collection_id);`,
    );

    await query(`
        CREATE TABLE IF NOT EXISTS user_collection_memory_items (
            id SERIAL PRIMARY KEY,
            memory_id INTEGER NOT NULL,
            item_key TEXT NOT NULL,
            item_url TEXT,
            item_title TEXT,
            downloaded_at BIGINT NOT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            FOREIGN KEY (memory_id) REFERENCES user_collection_memories(id) ON DELETE CASCADE,
            UNIQUE (memory_id, item_key)
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_collection_memory_items_memory_downloaded
         ON user_collection_memory_items(memory_id, downloaded_at DESC);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_collection_memory_items_memory_item_key
         ON user_collection_memory_items(memory_id, item_key);`,
    );

    // ==================== Points holds (batch downloads) ====================
    await query(`
        CREATE TABLE IF NOT EXISTS user_points_holds (
            id SERIAL PRIMARY KEY,
            hold_id TEXT NOT NULL UNIQUE,
            user_id INTEGER NOT NULL,
            points INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'held', -- held | finalized | released | expired
            reason TEXT,
            source_url TEXT,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            expires_at BIGINT NOT NULL,
            finalized_at BIGINT,
            released_at BIGINT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_points_holds_user_status
         ON user_points_holds(user_id, status);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_points_holds_expires_at
         ON user_points_holds(expires_at);`,
    );

    // Credit orders (top-ups for points/credits)
    await query(`
        CREATE TABLE IF NOT EXISTS credit_orders (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            clerk_user_id TEXT NOT NULL,
            provider TEXT NOT NULL, -- wechat | polar
            product_key TEXT NOT NULL,
            points INTEGER NOT NULL,
            amount_fen INTEGER NOT NULL,
            currency TEXT NOT NULL DEFAULT 'CNY',
            out_trade_no TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'CREATED', -- CREATED | PAID | CLOSED | FAILED
            provider_transaction_id TEXT,
            provider_data JSONB,
            paid_at BIGINT,
            raw_notify JSONB,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    await query(
        `ALTER TABLE credit_orders ADD COLUMN IF NOT EXISTS provider_data JSONB;`,
    );
    await query(
        `ALTER TABLE credit_orders ADD COLUMN IF NOT EXISTS raw_notify JSONB;`,
    );

    await query(
        `CREATE INDEX IF NOT EXISTS idx_credit_orders_user_id ON credit_orders(user_id, created_at DESC);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_credit_orders_out_trade_no ON credit_orders(out_trade_no);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_credit_orders_status ON credit_orders(status);`,
    );

    // Roles (RBAC) - optional, for future admin / internal permissions
    await query(`
        CREATE TABLE IF NOT EXISTS roles (
            key TEXT PRIMARY KEY,
            description TEXT
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS user_roles (
            user_id INTEGER NOT NULL,
            role_key TEXT NOT NULL,
            created_at BIGINT NOT NULL,
            PRIMARY KEY (user_id, role_key),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (role_key) REFERENCES roles(key) ON DELETE CASCADE
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);`,
    );

    // Entitlements (feature flags) used for gating features like batch download
    await query(`
        CREATE TABLE IF NOT EXISTS entitlements (
            key TEXT PRIMARY KEY,
            description TEXT
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS user_entitlements (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            entitlement_key TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'manual', -- manual | subscription | webhook | admin
            granted_at BIGINT NOT NULL,
            expires_at BIGINT,
            revoked_at BIGINT,
            metadata JSONB,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (entitlement_key) REFERENCES entitlements(key) ON DELETE CASCADE
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_entitlements_user_id ON user_entitlements(user_id);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_entitlements_key ON user_entitlements(entitlement_key);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_entitlements_active ON user_entitlements(user_id, entitlement_key, expires_at, revoked_at);`,
    );

    // Plans + subscriptions (future billing integration). A plan grants entitlements.
    await query(`
        CREATE TABLE IF NOT EXISTS plans (
            id SERIAL PRIMARY KEY,
            key TEXT NOT NULL UNIQUE, -- e.g. free | pro | enterprise
            name TEXT NOT NULL,
            description TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS plan_entitlements (
            plan_id INTEGER NOT NULL,
            entitlement_key TEXT NOT NULL,
            PRIMARY KEY (plan_id, entitlement_key),
            FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
            FOREIGN KEY (entitlement_key) REFERENCES entitlements(key) ON DELETE CASCADE
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_plan_entitlements_plan_id ON plan_entitlements(plan_id);`,
    );

    await query(`
        CREATE TABLE IF NOT EXISTS subscriptions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            plan_id INTEGER,
            provider TEXT NOT NULL DEFAULT 'clerk', -- clerk | stripe | manual
            provider_customer_id TEXT,
            provider_subscription_id TEXT,
            status TEXT NOT NULL, -- active | trialing | past_due | canceled | incomplete | unpaid
            current_period_start BIGINT,
            current_period_end BIGINT,
            cancel_at_period_end BOOLEAN DEFAULT false,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL,
            UNIQUE (provider, provider_subscription_id)
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);`,
    );

    // Seed: core entitlement for future gating
    await query(
        `INSERT INTO entitlements (key, description)
         VALUES ('batch_download', 'Allows using the batch download feature')
         ON CONFLICT (key) DO NOTHING;`,
    );

    console.log("✅ User database initialized");
};

export const upsertUserFromClerk = async ({
    clerkUserId,
    primaryEmail,
    fullName,
    avatarUrl,
}) => {
    const now = Date.now();
    const referralCode = generateReferralCode();

    const normalizedPrimaryEmail = primaryEmail || null;
    const normalizedFullName = fullName || null;
    const normalizedAvatarUrl = avatarUrl || null;

    const updateSql = `
        UPDATE users
        SET primary_email = $2,
            full_name = $3,
            avatar_url = $4,
            last_seen_at = $5,
            referral_code = COALESCE(referral_code, $6),
            updated_at = $7
        WHERE clerk_user_id = $1
        RETURNING *;
    `;

    const updateParamsBase = [
        clerkUserId,
        normalizedPrimaryEmail,
        normalizedFullName,
        normalizedAvatarUrl,
        now,
    ];

    let updateResult;
    try {
        updateResult = await query(updateSql, [...updateParamsBase, referralCode, now]);
    } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        updateResult = await query(updateSql, [
            ...updateParamsBase,
            generateReferralCode(),
            now,
        ]);
    }

    if (updateResult.rows[0]) {
        return updateResult.rows[0];
    }

    const insertSql = `
        INSERT INTO users (
            clerk_user_id,
            primary_email,
            full_name,
            avatar_url,
            last_seen_at,
            referral_code,
            created_at,
            updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *;
    `;

    let lastError;
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const attemptReferralCode = attempt === 0 ? referralCode : generateReferralCode();

        try {
            const insertResult = await query(insertSql, [
                clerkUserId,
                normalizedPrimaryEmail,
                normalizedFullName,
                normalizedAvatarUrl,
                now,
                attemptReferralCode,
                now,
                now,
            ]);

            return insertResult.rows[0];
        } catch (error) {
            lastError = error;
            if (!isUniqueViolation(error)) throw error;

            // Either: a race on clerk_user_id, or an extremely rare referral_code collision.
            try {
                const retryUpdate = await query(updateSql, [
                    ...updateParamsBase,
                    generateReferralCode(),
                    now,
                ]);
                if (retryUpdate.rows[0]) return retryUpdate.rows[0];
            } catch (retryError) {
                if (!isUniqueViolation(retryError)) throw retryError;
            }
        }
    }

    throw lastError;
};

export const getUserByClerkId = async (clerkUserId) => {
    const result = await query(`SELECT * FROM users WHERE clerk_user_id = $1`, [
        clerkUserId,
    ]);
    return result.rows[0] || null;
};

export const listUsers = async ({
    page = 1,
    limit = 20,
    search = "",
    sort = "created_at",
    order = "desc",
} = {}) => {
    const parsedPage = Number.parseInt(String(page), 10);
    const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    const parsedLimit = Number.parseInt(String(limit), 10);
    const safeLimitRaw =
        Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;
    const safeLimit = Math.min(Math.max(safeLimitRaw, 1), 200);

    const offset = (safePage - 1) * safeLimit;

    const allowedSort = {
        id: "id",
        created_at: "created_at",
        updated_at: "updated_at",
        last_seen_at: "last_seen_at",
        points: "points",
        primary_email: "primary_email",
        full_name: "full_name",
    };

    const sortKey = String(sort);
    const sortColumn = allowedSort[sortKey] || allowedSort.created_at;

    const orderDir = String(order).toLowerCase() === "asc" ? "ASC" : "DESC";

    const where = [];
    const params = [];
    let paramIndex = 1;

    const normalizedSearch = String(search || "").trim();
    if (normalizedSearch) {
        const term = `%${normalizedSearch}%`;
        where.push(
            `(primary_email ILIKE $${paramIndex} OR full_name ILIKE $${paramIndex} OR clerk_user_id ILIKE $${paramIndex})`,
        );
        params.push(term);
        paramIndex += 1;
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countResult = await query(
        `SELECT COUNT(*) as total FROM users ${whereSql}`,
        params,
    );
    const total = Number.parseInt(countResult.rows[0]?.total ?? "0", 10) || 0;

    const listResult = await query(
        `
        SELECT *
        FROM users
        ${whereSql}
        ORDER BY ${sortColumn} ${orderDir} NULLS LAST, id DESC
        LIMIT $${paramIndex}
        OFFSET $${paramIndex + 1};
        `,
        [...params, safeLimit, offset],
    );

    return {
        users: listResult.rows,
        pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            pages: Math.ceil(total / safeLimit),
        },
    };
};

export const updateUserPoints = async (id, points) => {
    const now = Date.now();
    const result = await query(
        `
        UPDATE users
        SET points = $2,
            updated_at = $3
        WHERE id = $1
        RETURNING *;
        `,
        [id, points, now],
    );

    return result.rows[0] || null;
};

const expireUserPointsHolds = async (client, userId, now) => {
    await client.query(
        `
        UPDATE user_points_holds
        SET status = 'released',
            updated_at = $3,
            released_at = $3
        WHERE user_id = $1
          AND status = 'held'
          AND expires_at <= $2;
        `,
        [userId, now, now],
    );
};

const getActiveHoldPoints = async (client, userId, now) => {
    const result = await client.query(
        `
        SELECT COALESCE(SUM(points), 0) AS held
        FROM user_points_holds
        WHERE user_id = $1
          AND status = 'held'
          AND expires_at > $2;
        `,
        [userId, now],
    );

    const held = Number.parseInt(result.rows?.[0]?.held ?? "0", 10);
    return Number.isFinite(held) ? held : 0;
};

export const createPointsHold = async ({
    userId,
    points,
    expiresAt,
    reason = null,
    sourceUrl = null,
} = {}) => {
    const client = await getClient();
    const now = Date.now();

    try {
        await client.query("BEGIN");
        await expireUserPointsHolds(client, userId, now);

        const userRes = await client.query(
            `SELECT points FROM users WHERE id = $1 FOR UPDATE;`,
            [userId],
        );
        if (!userRes.rowCount) {
            await client.query("ROLLBACK");
            return { ok: false, code: "USER_NOT_FOUND" };
        }

        const userPoints = Number(userRes.rows[0]?.points ?? 0);
        const heldPoints = await getActiveHoldPoints(client, userId, now);
        const available = userPoints - heldPoints;

        if (!Number.isFinite(available) || available < points) {
            await client.query("ROLLBACK");
            return {
                ok: false,
                code: "INSUFFICIENT_POINTS",
                current: Number.isFinite(available) ? available : userPoints,
                required: points,
            };
        }

        const holdId = nanoid(16);
        await client.query(
            `
            INSERT INTO user_points_holds (
                hold_id,
                user_id,
                points,
                status,
                reason,
                source_url,
                created_at,
                updated_at,
                expires_at
            ) VALUES ($1, $2, $3, 'held', $4, $5, $6, $6, $7);
            `,
            [holdId, userId, points, reason, sourceUrl, now, expiresAt],
        );

        await client.query("COMMIT");

        return {
            ok: true,
            holdId,
            pointsBefore: userPoints,
            pointsHeld: points,
            expiresAt,
        };
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {
            // ignore
        }
        throw error;
    } finally {
        client.release();
    }
};

export const finalizePointsHold = async ({
    userId,
    holdId,
    reason = null,
} = {}) => {
    const client = await getClient();
    const now = Date.now();

    try {
        await client.query("BEGIN");
        await expireUserPointsHolds(client, userId, now);

        const holdRes = await client.query(
            `
            SELECT *
            FROM user_points_holds
            WHERE hold_id = $1 AND user_id = $2
            FOR UPDATE;
            `,
            [holdId, userId],
        );

        if (!holdRes.rowCount) {
            await client.query("ROLLBACK");
            return { ok: false, code: "HOLD_NOT_FOUND" };
        }

        const hold = holdRes.rows[0];

        if (hold.status !== "held") {
            await client.query("COMMIT");
            return {
                ok: true,
                status: hold.status,
                charged: 0,
            };
        }

        if (hold.expires_at <= now) {
            await client.query(
                `
                UPDATE user_points_holds
                SET status = 'released',
                    updated_at = $2,
                    released_at = $2,
                    reason = COALESCE(reason, $3)
                WHERE id = $1;
                `,
                [hold.id, now, reason || 'hold_expired'],
            );
            await client.query("COMMIT");
            return { ok: false, code: "HOLD_EXPIRED", status: "released" };
        }

        const userRes = await client.query(
            `SELECT points FROM users WHERE id = $1 FOR UPDATE;`,
            [userId],
        );
        const userPoints = Number(userRes.rows?.[0]?.points ?? 0);

        if (!Number.isFinite(userPoints) || userPoints < hold.points) {
            await client.query(
                `
                UPDATE user_points_holds
                SET status = 'released',
                    updated_at = $2,
                    released_at = $2,
                    reason = COALESCE(reason, $3)
                WHERE id = $1;
                `,
                [hold.id, now, reason || "insufficient_points"],
            );
            await client.query("COMMIT");
            return { ok: false, code: "INSUFFICIENT_POINTS", status: "released" };
        }

        const updated = await client.query(
            `
            UPDATE users
            SET points = points - $2,
                updated_at = $3
            WHERE id = $1
            RETURNING *;
            `,
            [userId, hold.points, now],
        );

        await client.query(
            `
            UPDATE user_points_holds
            SET status = 'finalized',
                updated_at = $2,
                finalized_at = $2,
                reason = COALESCE(reason, $3)
            WHERE id = $1;
            `,
            [hold.id, now, reason],
        );

        await client.query("COMMIT");

        return {
            ok: true,
            status: "finalized",
            charged: hold.points,
            pointsBefore: userPoints,
            pointsAfter: updated.rows?.[0]?.points ?? null,
        };
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {
            // ignore
        }
        throw error;
    } finally {
        client.release();
    }
};

export const releasePointsHold = async ({
    userId,
    holdId,
    reason = null,
} = {}) => {
    const client = await getClient();
    const now = Date.now();

    try {
        await client.query("BEGIN");
        await expireUserPointsHolds(client, userId, now);

        const holdRes = await client.query(
            `
            SELECT *
            FROM user_points_holds
            WHERE hold_id = $1 AND user_id = $2
            FOR UPDATE;
            `,
            [holdId, userId],
        );

        if (!holdRes.rowCount) {
            await client.query("ROLLBACK");
            return { ok: false, code: "HOLD_NOT_FOUND" };
        }

        const hold = holdRes.rows[0];

        if (hold.status !== "held") {
            await client.query("COMMIT");
            return {
                ok: true,
                status: hold.status,
            };
        }

        const nextStatus = "released";
        await client.query(
            `
            UPDATE user_points_holds
            SET status = $2,
                updated_at = $3,
                released_at = $3,
                reason = COALESCE(reason, $4)
            WHERE id = $1;
            `,
            [hold.id, nextStatus, now, reason],
        );

        await client.query("COMMIT");

        return {
            ok: true,
            status: nextStatus,
        };
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {
            // ignore
        }
        throw error;
    } finally {
        client.release();
    }
};

export const consumeUserPoints = async (id, points) => {
    const client = await getClient();
    const now = Date.now();

    try {
        await client.query("BEGIN");
        await expireUserPointsHolds(client, id, now);

        const userRes = await client.query(
            `SELECT points FROM users WHERE id = $1 FOR UPDATE;`,
            [id],
        );
        if (!userRes.rowCount) {
            await client.query("ROLLBACK");
            return null;
        }

        const userPoints = Number(userRes.rows?.[0]?.points ?? 0);
        const heldPoints = await getActiveHoldPoints(client, id, now);
        const available = userPoints - heldPoints;

        if (!Number.isFinite(available) || available < points) {
            await client.query("ROLLBACK");
            return null;
        }

        const result = await client.query(
            `
            UPDATE users
            SET points = points - $2,
                updated_at = $3
            WHERE id = $1
            RETURNING *;
            `,
            [id, points, now],
        );

        await client.query("COMMIT");
        return result.rows[0] || null;
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {
            // ignore
        }
        throw error;
    } finally {
        client.release();
    }
};
