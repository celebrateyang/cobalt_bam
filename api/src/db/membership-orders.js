import { getClient, query } from "./pg-client.js";

export const MEMBERSHIP_ORDER_STATUS = Object.freeze({
    created: "CREATED",
    paid: "PAID",
    closed: "CLOSED",
    failed: "FAILED",
});

export const ensureMembershipOrdersSchema = async () => {
    await query(`
        CREATE TABLE IF NOT EXISTS membership_orders (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            clerk_user_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            product_key TEXT NOT NULL,
            plan_key TEXT NOT NULL,
            duration_days INTEGER NOT NULL,
            amount_fen INTEGER NOT NULL,
            currency TEXT NOT NULL DEFAULT 'CNY',
            out_trade_no TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL,
            provider_transaction_id TEXT,
            provider_data JSONB,
            raw_notify JSONB,
            paid_at BIGINT,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_membership_orders_user_id ON membership_orders(user_id, created_at DESC);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_membership_orders_out_trade_no ON membership_orders(out_trade_no);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_membership_orders_status ON membership_orders(status);`,
    );
};

export const createMembershipOrder = async ({
    userId,
    clerkUserId,
    provider,
    productKey,
    planKey,
    durationDays,
    amountFen,
    currency = "CNY",
    outTradeNo,
    providerData = null,
}) => {
    const now = Date.now();

    const result = await query(
        `
        INSERT INTO membership_orders (
            user_id,
            clerk_user_id,
            provider,
            product_key,
            plan_key,
            duration_days,
            amount_fen,
            currency,
            out_trade_no,
            status,
            provider_data,
            created_at,
            updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *;
        `,
        [
            userId,
            clerkUserId,
            provider,
            productKey,
            planKey,
            durationDays,
            amountFen,
            currency,
            outTradeNo,
            MEMBERSHIP_ORDER_STATUS.created,
            providerData,
            now,
            now,
        ],
    );

    return result.rows[0] || null;
};

export const getMembershipOrderById = async (id) => {
    const result = await query(`SELECT * FROM membership_orders WHERE id = $1`, [
        id,
    ]);
    return result.rows[0] || null;
};

export const updateMembershipOrderProviderData = async (id, providerData) => {
    const now = Date.now();
    const result = await query(
        `
        UPDATE membership_orders
        SET provider_data = $2,
            updated_at = $3
        WHERE id = $1
        RETURNING *;
        `,
        [id, providerData, now],
    );
    return result.rows[0] || null;
};

export const listMembershipOrders = async ({
    page = 1,
    limit = 20,
    userId,
    status,
    provider,
    search = "",
    sort = "created_at",
    order = "desc",
} = {}) => {
    const parsedPage = Number.parseInt(String(page), 10);
    const safePage =
        Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    const parsedLimit = Number.parseInt(String(limit), 10);
    const safeLimitRaw =
        Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;
    const safeLimit = Math.min(Math.max(safeLimitRaw, 1), 200);
    const offset = (safePage - 1) * safeLimit;

    const allowedSort = {
        id: "o.id",
        created_at: "o.created_at",
        updated_at: "o.updated_at",
        paid_at: "o.paid_at",
        amount_fen: "o.amount_fen",
        duration_days: "o.duration_days",
        status: `CASE o.status
            WHEN 'CREATED' THEN 1
            WHEN 'PAID' THEN 2
            WHEN 'FAILED' THEN 3
            WHEN 'CLOSED' THEN 4
            ELSE 99
        END`,
    };

    const sortColumn = allowedSort[String(sort)] || allowedSort.created_at;
    const orderDir = String(order).toLowerCase() === "asc" ? "ASC" : "DESC";

    const where = [];
    const params = [];
    let paramIndex = 1;

    const parsedUserId = Number.parseInt(String(userId), 10);
    if (Number.isFinite(parsedUserId) && parsedUserId > 0) {
        where.push(`o.user_id = $${paramIndex}`);
        params.push(parsedUserId);
        paramIndex += 1;
    }

    const normalizedStatus = typeof status === "string" ? status.trim() : "";
    if (normalizedStatus) {
        const statuses = normalizedStatus
            .split(",")
            .map((value) => value.trim().toUpperCase())
            .filter(Boolean);

        if (statuses.length === 1) {
            where.push(`o.status = $${paramIndex}`);
            params.push(statuses[0]);
            paramIndex += 1;
        } else if (statuses.length > 1) {
            where.push(`o.status = ANY($${paramIndex}::text[])`);
            params.push(statuses);
            paramIndex += 1;
        }
    }

    const normalizedProvider =
        typeof provider === "string" ? provider.trim() : "";
    if (normalizedProvider) {
        where.push(`o.provider = $${paramIndex}`);
        params.push(normalizedProvider);
        paramIndex += 1;
    }

    const normalizedSearch = String(search || "").trim();
    if (normalizedSearch) {
        const term = `%${normalizedSearch}%`;
        where.push(
            `(
                o.out_trade_no ILIKE $${paramIndex}
                OR COALESCE(o.provider_transaction_id, '') ILIKE $${paramIndex}
                OR o.product_key ILIKE $${paramIndex}
                OR o.plan_key ILIKE $${paramIndex}
                OR o.clerk_user_id ILIKE $${paramIndex}
                OR COALESCE(u.primary_email, '') ILIKE $${paramIndex}
                OR COALESCE(u.full_name, '') ILIKE $${paramIndex}
            )`,
        );
        params.push(term);
        paramIndex += 1;
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countResult = await query(
        `
        SELECT COUNT(*)::bigint AS total
        FROM membership_orders o
        JOIN users u ON u.id = o.user_id
        ${whereSql}
        `,
        params,
    );
    const totalRaw = countResult.rows?.[0]?.total ?? 0;
    const total =
        typeof totalRaw === "string" ? Number.parseInt(totalRaw, 10) : Number(totalRaw);

    const listResult = await query(
        `
        SELECT
            o.id,
            o.user_id,
            o.clerk_user_id,
            o.provider,
            o.product_key,
            o.plan_key,
            o.duration_days,
            o.amount_fen,
            o.currency,
            o.out_trade_no,
            o.status,
            o.provider_transaction_id,
            o.paid_at,
            o.created_at,
            o.updated_at,
            u.primary_email,
            u.full_name,
            u.avatar_url
        FROM membership_orders o
        JOIN users u ON u.id = o.user_id
        ${whereSql}
        ORDER BY ${sortColumn} ${orderDir} NULLS LAST, o.id DESC
        LIMIT $${paramIndex}
        OFFSET $${paramIndex + 1};
        `,
        [...params, safeLimit, offset],
    );

    return {
        orders: (listResult.rows || []).map((row) => ({
            id: row.id,
            user_id: row.user_id,
            clerk_user_id: row.clerk_user_id,
            provider: row.provider,
            product_key: row.product_key,
            plan_key: row.plan_key,
            duration_days: row.duration_days,
            amount_fen: row.amount_fen,
            currency: row.currency,
            out_trade_no: row.out_trade_no,
            status: row.status,
            provider_transaction_id: row.provider_transaction_id ?? null,
            paid_at: row.paid_at ?? null,
            created_at: row.created_at,
            updated_at: row.updated_at,
            user: {
                primary_email: row.primary_email ?? null,
                full_name: row.full_name ?? null,
                avatar_url: row.avatar_url ?? null,
            },
        })),
        pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            pages: safeLimit ? Math.ceil(total / safeLimit) : 0,
        },
    };
};

const getPlanByKeyForUpdate = async (client, planKey) => {
    const result = await client.query(
        `SELECT * FROM plans WHERE key = $1 AND is_active = true FOR UPDATE`,
        [planKey],
    );
    return result.rows[0] || null;
};

export const markMembershipOrderPaid = async ({
    outTradeNo,
    providerTransactionId,
    paidAt,
    rawNotify,
    totalFen,
}) => {
    const client = await getClient();
    const now = Date.now();
    const resolvedPaidAt = Number.isFinite(Number(paidAt)) ? Number(paidAt) : now;

    try {
        await client.query("BEGIN");

        const orderResult = await client.query(
            `SELECT * FROM membership_orders WHERE out_trade_no = $1 FOR UPDATE`,
            [outTradeNo],
        );
        const order = orderResult.rows[0] || null;
        if (!order) {
            await client.query("ROLLBACK");
            return {
                ok: false,
                code: "ORDER_NOT_FOUND",
            };
        }

        if (order.status === MEMBERSHIP_ORDER_STATUS.paid) {
            await client.query("COMMIT");
            return {
                ok: true,
                code: "ALREADY_PAID",
                order,
            };
        }

        if (
            typeof totalFen === "number" &&
            Number.isFinite(totalFen) &&
            totalFen !== order.amount_fen
        ) {
            const failed = await client.query(
                `
                UPDATE membership_orders
                SET status = $2,
                    provider_transaction_id = $3,
                    paid_at = $4,
                    raw_notify = $5,
                    updated_at = $6
                WHERE id = $1
                RETURNING *;
                `,
                [
                    order.id,
                    MEMBERSHIP_ORDER_STATUS.failed,
                    providerTransactionId || null,
                    resolvedPaidAt,
                    rawNotify || null,
                    now,
                ],
            );

            await client.query("COMMIT");
            return {
                ok: false,
                code: "AMOUNT_MISMATCH",
                order: failed.rows[0] || null,
            };
        }

        const plan = await getPlanByKeyForUpdate(client, order.plan_key);
        if (!plan) {
            await client.query("ROLLBACK");
            return {
                ok: false,
                code: "PLAN_NOT_FOUND",
                order,
            };
        }

        const durationMs = Math.max(1, Number(order.duration_days) || 1) * 86400000;
        const currentResult = await client.query(
            `
            SELECT *
            FROM subscriptions
            WHERE user_id = $1
              AND provider = $2
              AND status = 'active'
              AND current_period_end > $3
            ORDER BY current_period_end DESC, id DESC
            LIMIT 1
            FOR UPDATE;
            `,
            [order.user_id, order.provider, resolvedPaidAt],
        );

        const current = currentResult.rows[0] || null;
        const periodStart = current?.current_period_end || resolvedPaidAt;
        const periodEnd = periodStart + durationMs;
        let subscription = null;

        if (current) {
            const updated = await client.query(
                `
                UPDATE subscriptions
                SET plan_id = $2,
                    provider_subscription_id = $3,
                    status = 'active',
                    current_period_end = $4,
                    updated_at = $5
                WHERE id = $1
                RETURNING *;
                `,
                [
                    current.id,
                    plan.id,
                    order.out_trade_no,
                    periodEnd,
                    now,
                ],
            );
            subscription = updated.rows[0] || null;
        } else {
            const inserted = await client.query(
                `
                INSERT INTO subscriptions (
                    user_id,
                    plan_id,
                    provider,
                    provider_customer_id,
                    provider_subscription_id,
                    status,
                    current_period_start,
                    current_period_end,
                    cancel_at_period_end,
                    created_at,
                    updated_at
                ) VALUES ($1,$2,$3,$4,$5,'active',$6,$7,false,$8,$8)
                RETURNING *;
                `,
                [
                    order.user_id,
                    plan.id,
                    order.provider,
                    order.clerk_user_id,
                    order.out_trade_no,
                    periodStart,
                    periodEnd,
                    now,
                ],
            );
            subscription = inserted.rows[0] || null;
        }

        const updatedOrderResult = await client.query(
            `
            UPDATE membership_orders
            SET status = $2,
                provider_transaction_id = $3,
                paid_at = $4,
                raw_notify = $5,
                updated_at = $6
            WHERE id = $1
            RETURNING *;
            `,
            [
                order.id,
                MEMBERSHIP_ORDER_STATUS.paid,
                providerTransactionId || null,
                resolvedPaidAt,
                rawNotify || null,
                now,
            ],
        );

        await client.query("COMMIT");
        return {
            ok: true,
            code: "PAID",
            order: updatedOrderResult.rows[0] || null,
            subscription,
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
