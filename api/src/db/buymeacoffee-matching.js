import { nanoid } from "nanoid";
import { getClient, query } from "./pg-client.js";

export const setBuyMeACoffeeReviewReason = (transactionId, reason) => query(
    "UPDATE buymeacoffee_receipts SET review_reason = $2 WHERE transaction_id = $1", [transactionId, reason]);

// Persist the assignment before fulfillment. Retries resume the same order,
// even if the provider later supplies another code or changes the email.
export const bindBuyMeACoffeeOrder = async ({ parsed, user, manual = false, note = "", clientFactory = getClient }) => {
    const client = await clientFactory();
    try {
        await client.query("BEGIN");
        const receipt = (await client.query(`SELECT * FROM buymeacoffee_receipts
            WHERE transaction_id = $1 FOR UPDATE`, [parsed.transactionId])).rows[0];
        if (!receipt || receipt.refunded) { await client.query("ROLLBACK"); return { ok: false, code: "RECEIPT_NOT_PAYABLE" }; }
        const used = await client.query(`SELECT out_trade_no FROM credit_orders WHERE provider='buymeacoffee'
            AND provider_transaction_id=$1 AND status='PAID'
            UNION ALL SELECT out_trade_no FROM membership_orders WHERE provider='buymeacoffee'
            AND provider_transaction_id=$1 AND status='PAID'`, [parsed.transactionId]);
        if (receipt.fulfilled_manually || used.rows.length) {
            await client.query("COMMIT"); return { ok: true, code: "ALREADY_PAID" };
        }
        if (user) {
            const target = (await client.query("SELECT id,is_disabled FROM users WHERE id=$1", [user.id])).rows[0];
            if (!target || target.is_disabled) { await client.query("ROLLBACK"); return { ok: false, code: "ACCOUNT_DISABLED" }; }
            if (receipt.bound_order_code) {
                const table = parsed.product.kind === "membership" ? "membership_orders" : "credit_orders";
                const assigned = (await client.query(`SELECT user_id FROM ${table} WHERE out_trade_no=$1`, [receipt.bound_order_code])).rows[0];
                if (assigned?.user_id !== user.id) { await client.query("ROLLBACK"); return { ok: false, code: "BOUND_ACCOUNT_MISMATCH" }; }
            }
        }
        if (manual && !user) throw new Error("Manual fulfillment requires a user");
        if (receipt.bound_order_code) {
            const table = parsed.product.kind === "membership" ? "membership_orders" : "credit_orders";
            const assigned = (await client.query(`SELECT product_key,amount_fen,currency FROM ${table} WHERE out_trade_no=$1`, [receipt.bound_order_code])).rows[0];
            if (!assigned || assigned.product_key !== parsed.product.key || assigned.amount_fen !== parsed.amountFen || assigned.currency !== parsed.product.currency) {
                await client.query("ROLLBACK"); return { ok: false, code: "ORDER_PRODUCT_MISMATCH" };
            }
            if (!manual) { await client.query("COMMIT"); return { ok: true, outTradeNo: receipt.bound_order_code }; }
        }
        const membership = parsed.product.kind === "membership";
        const table = membership ? "membership_orders" : "credit_orders";
        let order;
        if (receipt.bound_order_code || parsed.outTradeNo) {
            order = (await client.query(`SELECT * FROM ${table} WHERE out_trade_no=$1 FOR UPDATE`, [receipt.bound_order_code || parsed.outTradeNo])).rows[0];
            if (!order) { await client.query("ROLLBACK"); return { ok: false, code: "ORDER_NOT_FOUND" }; }
        } else {
            if (!user) throw new Error("Email fulfillment requires a verified account");
            order = (await client.query(`SELECT * FROM ${table} WHERE user_id=$1
                AND provider='buymeacoffee' AND product_key=$2 AND status='CREATED'
                AND provider_transaction_id IS NULL AND amount_fen=$3 AND currency=$4
                AND created_at <= $5 ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE SKIP LOCKED`,
            [user.id, parsed.product.key, parsed.amountFen, parsed.product.currency, parsed.paidAt])).rows[0];
            if (!order) {
                const code = `${membership ? "mbr" : "cpt"}_${nanoid(20)}`;
                const now = Date.now();
                const columns = membership ? "plan_key,duration_days" : "points";
                const values = membership ? "$8,$9" : "$8";
                order = (await client.query(`INSERT INTO ${table}
                    (user_id,clerk_user_id,provider,product_key,amount_fen,currency,out_trade_no,status,created_at,updated_at,${columns})
                    VALUES ($1,$2,'buymeacoffee',$3,$4,$5,$6,'CREATED',$7,$7,${values}) RETURNING *`,
                [user.id, user.clerk_user_id, parsed.product.key, parsed.amountFen, parsed.product.currency, code, now,
                    ...(membership ? [parsed.product.planKey, parsed.product.durationDays] : [parsed.product.points])])).rows[0];
            }
        }
        if (order.provider !== "buymeacoffee" || order.product_key !== parsed.product.key ||
            order.amount_fen !== parsed.amountFen || order.currency !== parsed.product.currency ||
            (order.provider_transaction_id && order.provider_transaction_id !== parsed.transactionId)) {
            await client.query("ROLLBACK"); return { ok: false, code: "ORDER_PRODUCT_MISMATCH" };
        }
        await client.query(`UPDATE ${table} SET provider_transaction_id=$2,
            provider_data=COALESCE(provider_data,'{}'::jsonb) || $3::jsonb WHERE id=$1`,
        [order.id, parsed.transactionId, JSON.stringify({ supporter_email: parsed.supporterEmail,
            buymeacoffee_product_id: parsed.product.productId, fulfillment_match: user ? "email_or_admin" : "legacy_code" })]);
        await client.query(`UPDATE buymeacoffee_receipts SET bound_order_code=$2, review_reason=NULL,
            resolution_note=COALESCE(NULLIF($3,''),resolution_note)
            WHERE transaction_id=$1`, [parsed.transactionId, order.out_trade_no, note]);
        if (manual) {
            const now = Date.now();
            await client.query(`UPDATE buymeacoffee_receipts SET fulfilled_manually=TRUE,
                manual_user_id=$2, resolution_note=$3, updated_at=$4 WHERE transaction_id=$1`,
            [parsed.transactionId, user.id, note, now]);
            // Reconcile the order without changing the already granted balance or subscription.
            await client.query(`UPDATE ${table} SET status='PAID',paid_at=$2,updated_at=$3,
                raw_notify=$4 WHERE id=$1`, [order.id, parsed.paidAt, now,
                { source: "buymeacoffee_manual_already_granted", note }]);
        }
        await client.query("COMMIT");
        return manual ? { ok: true, code: "MANUAL_RECORDED" } : { ok: true, outTradeNo: order.out_trade_no };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
};
