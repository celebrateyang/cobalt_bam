// Compatible with the previous production image: record an already granted
// payment before deploying automatic email fulfillment. Never adds benefits.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getClient, closePool } from "../db/pg-client.js";
import { getBuyMeACoffeeProductById, parseBuyMeACoffeePurchaseEvent } from "../payments/buymeacoffee.js";

export const recordManualBuyMeACoffeeFulfillment = async ({ transactionId, orderId, confirm = false, clientFactory = getClient }) => {
    const client = await clientFactory();
    try {
        if (confirm) await client.query(`ALTER TABLE buymeacoffee_receipts
            ADD COLUMN IF NOT EXISTS bound_order_code TEXT,
            ADD COLUMN IF NOT EXISTS fulfilled_manually BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS manual_user_id INTEGER,
            ADD COLUMN IF NOT EXISTS resolution_note TEXT`);
        await client.query("BEGIN");
        const receipt = (await client.query(`SELECT * FROM buymeacoffee_receipts WHERE transaction_id=$1 FOR UPDATE`, [transactionId])).rows[0];
        if (!receipt || receipt.refunded) throw new Error("Receipt missing or refunded");
        const product = getBuyMeACoffeeProductById(receipt.raw_notify?.data?.extras?.[0]?.id);
        if (!product) throw new Error("Unknown product");
        const table = product.kind === "membership" ? "membership_orders" : "credit_orders";
        const order = (await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [orderId])).rows[0];
        if (!order || order.provider !== "buymeacoffee" || order.product_key !== product.key ||
            order.amount_fen !== product.amountFen || order.currency !== product.currency ||
            (order.provider_transaction_id && order.provider_transaction_id !== transactionId) ||
            (receipt.bound_order_code && receipt.bound_order_code !== order.out_trade_no) ||
            (product.kind === "credit" && order.points !== product.points) ||
            (product.kind === "membership" && (order.plan_key !== product.planKey || order.duration_days !== product.durationDays))) {
            throw new Error("Order/product/transaction mismatch");
        }
        const user = (await client.query("SELECT id,primary_email,is_disabled FROM users WHERE id=$1", [order.user_id])).rows[0];
        if (!user || user.is_disabled) throw new Error("Target account missing or disabled");
        const payload = structuredClone(receipt.raw_notify);
        // Supply only the already validated local code for compatibility with
        // the old parser; this does not change the stored provider notification.
        payload.data.extras[0].question_answers = [order.out_trade_no];
        const parsed = parseBuyMeACoffeePurchaseEvent(payload);
        if (!parsed.ok || parsed.test || parsed.transactionId !== transactionId) throw new Error("Invalid paid receipt");
        const used = (await client.query(`SELECT out_trade_no FROM credit_orders WHERE provider='buymeacoffee'
            AND provider_transaction_id=$1 AND status='PAID'
            UNION ALL SELECT out_trade_no FROM membership_orders WHERE provider='buymeacoffee'
            AND provider_transaction_id=$1 AND status='PAID'`, [transactionId])).rows;
        if (used.some(row => row.out_trade_no !== order.out_trade_no)) throw new Error("Transaction already used by another order");
        const summary = { transactionId, orderId, userId: user.id, accountEmail: user.primary_email,
            paymentEmail: receipt.supporter_email, product: product.key, points: product.points, days: product.durationDays };
        if (receipt.fulfilled_manually || used.length) {
            await client.query("COMMIT"); return { ...summary, status: "ALREADY_RECORDED" };
        }
        if (order.status !== "CREATED") throw new Error("Order is not pending");
        if (!confirm) { await client.query("ROLLBACK"); return { ...summary, status: "DRY_RUN" }; }
        const now = Date.now();
        const note = "Benefits already granted manually; reconciliation does not add benefits";
        await client.query(`UPDATE buymeacoffee_receipts SET fulfilled_manually=TRUE,manual_user_id=$2,
            bound_order_code=$3,resolution_note=$4,review_reason=NULL,updated_at=$5 WHERE transaction_id=$1`,
        [transactionId, user.id, order.out_trade_no, note, now]);
        await client.query(`UPDATE ${table} SET status='PAID',provider_transaction_id=$2,
            paid_at=$3,updated_at=$4,raw_notify=$5 WHERE id=$1`,
        [order.id, transactionId, parsed.paidAt, now, { source: "buymeacoffee_manual_already_granted", note }]);
        await client.query("COMMIT");
        return { ...summary, status: "MANUAL_RECORDED" };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [transactionId, orderId, flag] = process.argv.slice(2);
    try {
        if (!transactionId || !Number.isSafeInteger(Number(orderId)) || Number(orderId) <= 0 || (flag && flag !== "--confirm")) {
            throw new Error("Usage: node src/util/record-bmc-manual-fulfillment.js TRANSACTION_ID ORDER_ID [--confirm]");
        }
        console.log(JSON.stringify(await recordManualBuyMeACoffeeFulfillment({ transactionId, orderId: Number(orderId), confirm: flag === "--confirm" })));
    } catch (error) { console.error(error.message); process.exitCode = 1; }
    finally { await closePool(); }
}
