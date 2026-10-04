import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { recordBuyMeACoffeeReceipt, listUnmatchedBuyMeACoffeeReceipts } from "./buymeacoffee-receipts.js";
import { parseBuyMeACoffeePurchaseEvent } from "../payments/buymeacoffee.js";

const purchase = (answers = []) => ({
    type: answers.length ? "extra_purchase.updated" : "extra_purchase.created",
    live_mode: true,
    data: { status: "succeeded", transaction_id: "pi_receipt_test", amount: 1.99,
        currency: "USD", supporter_email: "buyer@example.com",
        extras: [{ id: 581332, quantity: 1, question_answers: answers }] },
});

test("retains unmatched payments, deduplicates retries, and handles late answers and refunds", async () => {
    const db = new PGlite();
    const query = (sql, params) => db.query(sql, params);
    try {
        await db.exec(`CREATE TABLE credit_orders (id integer PRIMARY KEY,
            provider text, provider_transaction_id text, status text);`);
        const event = purchase();
        await recordBuyMeACoffeeReceipt(event, parseBuyMeACoffeePurchaseEvent(event), query);
        await recordBuyMeACoffeeReceipt(event, parseBuyMeACoffeePurchaseEvent(event), query);
        let result = await listUnmatchedBuyMeACoffeeReceipts({}, query);
        assert.equal(result.pagination.total, 1);
        assert.equal(result.receipts[0].review_reason, "ORDER_CODE_MISSING");
        assert.equal(result.receipts[0].supporter_email, "buyer@example.com");

        const answered = purchase(["cpt_abcdefghijklmnopqrst"]);
        await recordBuyMeACoffeeReceipt(answered, parseBuyMeACoffeePurchaseEvent(answered), query);
        // A delayed original callback must not discard the code or restore a missing-code reason.
        await recordBuyMeACoffeeReceipt(event, parseBuyMeACoffeePurchaseEvent(event), query);
        result = await listUnmatchedBuyMeACoffeeReceipts({}, query);
        assert.equal(result.receipts[0].order_code, "cpt_abcdefghijklmnopqrst");
        assert.equal(result.receipts[0].review_reason, null);

        await db.exec(`INSERT INTO credit_orders VALUES (1,'buymeacoffee','pi_receipt_test','PAID');`);
        result = await listUnmatchedBuyMeACoffeeReceipts({}, query);
        assert.equal(result.pagination.total, 0);
        const refund = { ...event, type: "extra_purchase.refunded" };
        await recordBuyMeACoffeeReceipt(refund, { ok: false, code: "REFUND_REVIEW" }, query);
        await recordBuyMeACoffeeReceipt(answered, parseBuyMeACoffeePurchaseEvent(answered), query);
        result = await listUnmatchedBuyMeACoffeeReceipts({}, query);
        assert.equal(result.pagination.total, 1);
        assert.equal(result.receipts[0].refunded, true);
        assert.equal(result.receipts[0].credited_order_id, 1);
        assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM credit_orders")).rows[0].total, 1);
    } finally {
        await db.close();
    }
});

test("does not store test, pending, or unsupported events", async () => {
    const query = () => { throw new Error("Unexpected database write"); };
    for (const patch of [{ live_mode: false }, { type: "support.created" },
        { data: { status: "pending", transaction_id: "pi_pending" } },
        { data: { status: "succeeded", transaction_id: "" } }]) {
        await recordBuyMeACoffeeReceipt({ ...purchase(), ...patch }, { ok: false }, query);
    }
});
