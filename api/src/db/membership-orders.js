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
