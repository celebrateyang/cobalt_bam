import { query } from "./pg-client.js";

const SCHEMA = `CREATE TABLE IF NOT EXISTS buymeacoffee_receipts (
    transaction_id TEXT PRIMARY KEY,
    supporter_email TEXT NOT NULL DEFAULT '',
    amount TEXT NOT NULL,
    currency TEXT NOT NULL,
    order_code TEXT,
    review_reason TEXT,
    refunded BOOLEAN NOT NULL DEFAULT FALSE,
    raw_notify JSONB NOT NULL,
    first_received_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);`;
let schemaReady;
const ensureSchema = async (queryFn) => {
    if (queryFn !== query) return queryFn(SCHEMA);
    if (!schemaReady) {
        schemaReady = query(SCHEMA).catch((error) => {
            schemaReady = undefined;
            throw error;
        });
    }
    return schemaReady;
};

// A provider receipt is independent of a site order: payment may precede the code.
export const recordBuyMeACoffeeReceipt = async (payload, parsed, queryFn = query) => {
    const data = payload?.data || {};
    const transactionId = String(data.transaction_id || "").trim();
    if (!transactionId || payload.live_mode !== true ||
        !["extra_purchase.created", "extra_purchase.updated", "extra_purchase.refunded"].includes(payload.type) ||
        (data.status !== "succeeded" && payload.type !== "extra_purchase.refunded")) return;
    const now = Date.now();
    const refunded = payload.type === "extra_purchase.refunded" || String(data.refunded) === "true";
    await ensureSchema(queryFn);
    await queryFn(`
        INSERT INTO buymeacoffee_receipts (
            transaction_id, supporter_email, amount, currency, order_code,
            review_reason, refunded, raw_notify, first_received_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
        ON CONFLICT (transaction_id) DO UPDATE SET
            supporter_email = COALESCE(NULLIF(EXCLUDED.supporter_email, ''), buymeacoffee_receipts.supporter_email),
            order_code = COALESCE(EXCLUDED.order_code, buymeacoffee_receipts.order_code),
            review_reason = CASE
                WHEN EXCLUDED.review_reason = 'ORDER_CODE_MISSING' AND buymeacoffee_receipts.order_code IS NOT NULL
                THEN buymeacoffee_receipts.review_reason
                ELSE EXCLUDED.review_reason END,
            refunded = buymeacoffee_receipts.refunded OR EXCLUDED.refunded,
            raw_notify = EXCLUDED.raw_notify,
            updated_at = EXCLUDED.updated_at;
    `, [transactionId, String(data.supporter_email || ""), String(data.amount ?? ""),
        String(data.currency || "").toUpperCase(), parsed?.outTradeNo || null,
        parsed?.ok ? null : parsed?.code || "REFUND_REVIEW", refunded, payload, now]);
};

export const listUnmatchedBuyMeACoffeeReceipts = async ({ page = 1, limit = 20 } = {}, queryFn = query) => {
    await ensureSchema(queryFn);
    const safePage = Math.max(1, Number.parseInt(String(page), 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 20));
    const filter = `FROM buymeacoffee_receipts r
        LEFT JOIN credit_orders o ON o.provider = 'buymeacoffee'
            AND o.provider_transaction_id = r.transaction_id AND o.status = 'PAID'
        LEFT JOIN membership_orders m ON m.provider = 'buymeacoffee'
            AND m.provider_transaction_id = r.transaction_id AND m.status = 'PAID'
        WHERE (o.id IS NULL AND m.id IS NULL) OR r.refunded = TRUE`;
    const count = await queryFn(`SELECT COUNT(*)::int AS total ${filter}`);
    const result = await queryFn(`SELECT r.transaction_id, r.supporter_email,
        r.amount, r.currency, r.order_code, r.review_reason, r.refunded,
        r.first_received_at, r.updated_at, o.id AS credited_order_id, m.id AS membership_order_id
        ${filter} ORDER BY r.updated_at DESC, r.transaction_id LIMIT $1 OFFSET $2`,
    [safeLimit, (safePage - 1) * safeLimit]);
    const total = Number(count.rows[0]?.total || 0);
    return { receipts: result.rows, pagination: {
        page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit),
    } };
};

// Called within fulfillment's transaction. The receipt row serializes reuse of
// the same provider transaction, including callbacks with a changed order code.
export const validateBuyMeACoffeeFulfillment = async (client, transactionId, outTradeNo) => {
    const receipt = await client.query(
        "SELECT refunded FROM buymeacoffee_receipts WHERE transaction_id = $1 FOR UPDATE", [transactionId]);
    if (!receipt.rows[0] || receipt.rows[0].refunded) return "RECEIPT_NOT_PAYABLE";
    const used = await client.query(`
        SELECT out_trade_no FROM credit_orders WHERE provider = 'buymeacoffee'
          AND provider_transaction_id = $1 AND status = 'PAID'
        UNION ALL
        SELECT out_trade_no FROM membership_orders WHERE provider = 'buymeacoffee'
          AND provider_transaction_id = $1 AND status = 'PAID'`, [transactionId]);
    return used.rows.some((row) => row.out_trade_no !== outTradeNo) ? "TRANSACTION_ALREADY_USED" : null;
};
