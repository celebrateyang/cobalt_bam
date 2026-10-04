import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { markCreditOrderPaid } from "./credit-orders.js";
import { markMembershipOrderPaid } from "./membership-orders.js";
import { recordBuyMeACoffeeReceipt, listUnmatchedBuyMeACoffeeReceipts } from "./buymeacoffee-receipts.js";

test("BMC fulfillment links each transaction once and extends passes without losing paid days", async () => {
    const db = new PGlite({ initialMemory: 128 * 1024 * 1024 });
    const query = (sql, params) => db.query(sql, params);
    const clientFactory = async () => ({ query, release() {} });
    const now = Date.now();
    const day = 86400000;
    const paidAt = now - 2 * day;
    try {
        await db.exec(`
            CREATE TABLE users (id int PRIMARY KEY, points int, updated_at bigint);
            INSERT INTO users VALUES (1,0,0);
            CREATE TABLE plans (id int PRIMARY KEY, key text, is_active boolean DEFAULT TRUE);
            INSERT INTO plans (id,key) VALUES (1,'member_monthly_crypto'),(2,'member_full');
            CREATE TABLE plan_entitlements (plan_id int, entitlement_key text);
            INSERT INTO plan_entitlements VALUES (1,'member_download'),(1,'video_recording'),(2,'ai_video_studio');
            CREATE TABLE credit_orders (id serial PRIMARY KEY, user_id int, provider text,
                out_trade_no text, status text, amount_fen int, points int,
                provider_transaction_id text, paid_at bigint, raw_notify jsonb, updated_at bigint);
            CREATE TABLE membership_orders (id serial PRIMARY KEY, user_id int, clerk_user_id text,
                provider text, plan_key text, out_trade_no text, status text, amount_fen int,
                duration_days int, provider_transaction_id text, paid_at bigint, raw_notify jsonb, updated_at bigint);
            CREATE TABLE subscriptions (id serial PRIMARY KEY, user_id int, plan_id int, provider text,
                provider_customer_id text, provider_subscription_id text, status text,
                current_period_start bigint, current_period_end bigint, cancel_at_period_end boolean,
                created_at bigint, updated_at bigint);`);
        const receipt = async (txn, code, refunded = false) => recordBuyMeACoffeeReceipt({
            type: refunded ? "extra_purchase.refunded" : "extra_purchase.updated", live_mode: true,
            data: { status: "succeeded", transaction_id: txn, amount: 4.99, currency: "USD" },
        }, { ok: !refunded, outTradeNo: code }, query);
        const member = async (code) => db.query(`INSERT INTO membership_orders
            (user_id,clerk_user_id,provider,plan_key,out_trade_no,status,amount_fen,duration_days)
            VALUES (1,'user_test','buymeacoffee','member_monthly_crypto',$1,'CREATED',499,30)`, [code]);
        const fulfill = (code, txn) => markMembershipOrderPaid({
            outTradeNo: code, providerTransactionId: txn, paidAt, totalFen: 499, clientFactory,
        });
        await member('mbr_first');
        await receipt('pi_first','mbr_first');
        const first = await fulfill('mbr_first','pi_first');
        assert.equal(first.code, 'PAID');
        const expiry = Number(first.subscription.current_period_end);
        assert.ok(expiry >= now + 30 * day, 'delayed code submission must not shorten the pass');
        assert.equal(Number(first.order.paid_at), paidAt, 'retain actual provider payment time');
        assert.equal((await fulfill('mbr_first','pi_first')).code, 'ALREADY_PAID');
        assert.equal((await listUnmatchedBuyMeACoffeeReceipts({}, query)).pagination.total, 0);
        await member('mbr_reuse');
        assert.equal((await fulfill('mbr_reuse','pi_first')).code, 'TRANSACTION_ALREADY_USED');
        await member('mbr_extend');
        await receipt('pi_extend','mbr_extend');
        const extended = await fulfill('mbr_extend','pi_extend');
        assert.equal(Number(extended.subscription.current_period_end), expiry + 30 * day);
        assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM subscriptions')).rows[0].n, 1);
        await member('mbr_refund');
        await receipt('pi_refund','mbr_refund',true);
        await receipt('pi_refund','mbr_refund');
        assert.equal((await fulfill('mbr_refund','pi_refund')).code, 'RECEIPT_NOT_PAYABLE');
        await db.query(`INSERT INTO credit_orders
            (user_id,provider,out_trade_no,status,amount_fen,points)
            VALUES (1,'buymeacoffee','cpt_reuse','CREATED',499,2000)`);
        assert.equal((await markCreditOrderPaid({outTradeNo:'cpt_reuse',providerTransactionId:'pi_first',totalFen:499,clientFactory})).code,'TRANSACTION_ALREADY_USED');
        await receipt('pi_credit','cpt_reuse');
        assert.equal((await markCreditOrderPaid({outTradeNo:'cpt_reuse',providerTransactionId:'pi_credit',totalFen:499,clientFactory})).code,'PAID');
        assert.equal((await markCreditOrderPaid({outTradeNo:'cpt_reuse',providerTransactionId:'pi_credit',totalFen:499,clientFactory})).code,'ALREADY_PAID');
        assert.equal((await db.query('SELECT points FROM users')).rows[0].points,2000);
        await db.query(`INSERT INTO subscriptions (user_id,plan_id,provider,status,current_period_end)
            VALUES (1,2,'wechat','active',$1)`, [now + 60 * day]);
        await member('mbr_full');
        await receipt('pi_full','mbr_full');
        assert.equal((await fulfill('mbr_full','pi_full')).code,'MEMBERSHIP_INCOMPATIBLE');
        assert.equal((await fulfill('mbr_first','pi_first')).code,'ALREADY_PAID');
        await db.query("INSERT INTO plans (id,key) VALUES (3,'member_monthly')");
        await db.query(`INSERT INTO plan_entitlements VALUES
            (3,'member_download'),(3,'video_recording'),(3,'ai_video_studio'),(3,'random_chat')`);
        await member('mbr_complete');
        await db.query("UPDATE membership_orders SET plan_key='member_monthly' WHERE out_trade_no='mbr_complete'");
        await receipt('pi_complete','mbr_complete');
        const complete = await fulfill('mbr_complete','pi_complete');
        assert.equal(complete.code,'PAID','full BMC membership can extend an active full membership');
        assert.equal(complete.subscription.plan_id,3);
        assert.equal(Number(complete.subscription.current_period_end),Number(extended.subscription.current_period_end)+30*day);
    } finally { await db.close(); }
});
