import { getClient, query } from "./pg-client.js";

export const CREDIT_ORDER_STATUS = Object.freeze({
    created: "CREATED",
    paid: "PAID",
    closed: "CLOSED",
    failed: "FAILED",
});

export const createCreditOrder = async ({
    userId,
    clerkUserId,
    provider,
    productKey,
    points,
    amountFen,
    currency = "CNY",
    outTradeNo,
    providerData = null,
}) => {
    const now = Date.now();

    const result = await query(
        `
        INSERT INTO credit_orders (
            user_id,
            clerk_user_id,
            provider,
            product_key,
            points,
            amount_fen,
            currency,
            out_trade_no,
            status,
            provider_data,
            created_at,
            updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *;
        `,
        [
            userId,
            clerkUserId,
            provider,
            productKey,
            points,
            amountFen,
            currency,
            outTradeNo,
            CREDIT_ORDER_STATUS.created,
            providerData,
            now,
            now,
        ],
    );

    return result.rows[0] || null;
};

export const getCreditOrderById = async (id) => {
    const result = await query(`SELECT * FROM credit_orders WHERE id = $1`, [
        id,
    ]);
    return result.rows[0] || null;
};

export const getCreditOrderByOutTradeNo = async (outTradeNo) => {
    const result = await query(
        `SELECT * FROM credit_orders WHERE out_trade_no = $1`,
        [outTradeNo],
    );
    return result.rows[0] || null;
};

export const updateCreditOrderProviderData = async (id, providerData) => {
    const now = Date.now();
    const result = await query(
        `
        UPDATE credit_orders
        SET provider_data = $2,
            updated_at = $3
        WHERE id = $1
        RETURNING *;
        `,
        [id, providerData, now],
    );
    return result.rows[0] || null;
};

export const markCreditOrderPaid = async ({
    outTradeNo,
    providerTransactionId,
    paidAt,
    rawNotify,
    totalFen,
}) => {
    const client = await getClient();
    const now = Date.now();

    try {
        await client.query("BEGIN");

        const orderResult = await client.query(
            `SELECT * FROM credit_orders WHERE out_trade_no = $1 FOR UPDATE`,
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

        if (order.status === CREDIT_ORDER_STATUS.paid) {
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
                UPDATE credit_orders
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
                    CREDIT_ORDER_STATUS.failed,
                    providerTransactionId || null,
                    paidAt || null,
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

        const updatedOrderResult = await client.query(
            `
            UPDATE credit_orders
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
                CREDIT_ORDER_STATUS.paid,
                providerTransactionId || null,
                paidAt || now,
                rawNotify || null,
                now,
            ],
        );

        await client.query(
            `
            UPDATE users
            SET points = points + $1,
                updated_at = $2
            WHERE id = $3;
            `,
            [order.points, now, order.user_id],
        );

        await client.query("COMMIT");
        return {
            ok: true,
            code: "PAID",
            order: updatedOrderResult.rows[0] || null,
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

