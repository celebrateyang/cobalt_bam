import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { recordBuyMeACoffeeReceipt, listUnmatchedBuyMeACoffeeReceipts } from "./buymeacoffee-receipts.js";
import { bindBuyMeACoffeeOrder } from "./buymeacoffee-matching.js";
import { markCreditOrderPaid } from "./credit-orders.js";
import { markMembershipOrderPaid } from "./membership-orders.js";
import { parseBuyMeACoffeePurchaseEvent } from "../payments/buymeacoffee.js";
import { recordManualBuyMeACoffeeFulfillment } from "../util/record-bmc-manual-fulfillment.js";

test("email payments bind pending orders, create missing orders, and never grant a transaction twice", async () => {
    const db = new PGlite({ initialMemory: 128 * 1024 * 1024 });
    const query = (sql, params) => db.query(sql, params);
    const clientFactory = async () => ({ query, release() {} });
    const user = { id: 1, clerk_user_id: "user_test" };
    const now = Date.now();
    try {
        await db.exec(`CREATE TABLE users (id int PRIMARY KEY,clerk_user_id text,primary_email text,points int,is_disabled boolean DEFAULT FALSE,updated_at bigint);
            INSERT INTO users(id,clerk_user_id,points) VALUES (1,'user_test',0);
            CREATE TABLE credit_orders(id serial PRIMARY KEY,user_id int,clerk_user_id text,provider text,product_key text,
                points int,amount_fen int,currency text,out_trade_no text UNIQUE,status text,provider_transaction_id text,
                created_at bigint,updated_at bigint,paid_at bigint,raw_notify jsonb,provider_data jsonb);
            CREATE TABLE membership_orders(id serial PRIMARY KEY,user_id int,clerk_user_id text,provider text,product_key text,
                plan_key text,duration_days int,amount_fen int,currency text,out_trade_no text UNIQUE,status text,
                provider_transaction_id text,created_at bigint,updated_at bigint,paid_at bigint,raw_notify jsonb,provider_data jsonb);
            CREATE TABLE plans(id int PRIMARY KEY,key text,is_active boolean DEFAULT TRUE);
            INSERT INTO plans VALUES (1,'member_monthly',TRUE);
            CREATE TABLE plan_entitlements(plan_id int,entitlement_key text);
            INSERT INTO plan_entitlements VALUES (1,'member_download');
            CREATE TABLE subscriptions(id serial PRIMARY KEY,user_id int,plan_id int,provider text,
                provider_customer_id text,provider_subscription_id text,status text,current_period_start bigint,
                current_period_end bigint,cancel_at_period_end boolean,created_at bigint,updated_at bigint);`);
        const purchase = async (txn, membership = false) => {
            const event = { type: "extra_purchase.created", live_mode: true, data: {
                transaction_id: txn, supporter_email: "buyer@example.com", status: "succeeded", refunded: false,
                amount: membership ? 7.99 : 1.99, currency: "USD", created_at: now / 1000,
                extras: [{ id: membership ? 583009 : 581332, quantity: 1, question_answers: [] }],
            } };
            const parsed = parseBuyMeACoffeePurchaseEvent(event);
            assert.equal(parsed.ok, true);
            await recordBuyMeACoffeeReceipt(event, parsed, query);
            return parsed;
        };
        const bind = parsed => bindBuyMeACoffeeOrder({ parsed, user, clientFactory });
        await db.query(`INSERT INTO credit_orders(user_id,clerk_user_id,provider,product_key,points,amount_fen,currency,out_trade_no,status,created_at)
            VALUES (1,'user_test','buymeacoffee','buymeacoffee_usd_199',1200,199,'USD','cpt_pending','CREATED',$1)`, [now-1000]);
        const credit = await purchase("pi_credit");
        const bound = await bind(credit);
        assert.equal(bound.outTradeNo, "cpt_pending");
        assert.equal((await bind({ ...credit, outTradeNo: "cpt_other" })).outTradeNo, "cpt_pending");
        const payCredit = (parsed, code) => markCreditOrderPaid({ outTradeNo: code,
            providerTransactionId: parsed.transactionId, totalFen: parsed.amountFen, clientFactory });
        assert.equal((await payCredit(credit, bound.outTradeNo)).code, "PAID");
        assert.equal((await payCredit(credit, bound.outTradeNo)).code, "ALREADY_PAID");
        assert.equal((await bind(credit)).code, "ALREADY_PAID");
        const credit2 = await purchase("pi_second");
        const bound2 = await bind(credit2);
        assert.notEqual(bound2.outTradeNo, bound.outTradeNo);
        assert.equal((await payCredit(credit2, bound2.outTradeNo)).code, "PAID");
        assert.equal((await query("SELECT points FROM users WHERE id=1")).rows[0].points, 2400);
        const member = await purchase("pi_member", true);
        const memberOrder = await bind(member);
        const payMember = parsed => markMembershipOrderPaid({ outTradeNo: memberOrder.outTradeNo,
            providerTransactionId: parsed.transactionId, totalFen: parsed.amountFen, clientFactory });
        const first = await payMember(member);
        assert.equal(first.code, "PAID");
        assert.equal((await payMember(member)).code, "ALREADY_PAID");
        const renewal = await purchase("pi_renewal", true);
        const renewalOrder = await bind(renewal);
        const renewed = await markMembershipOrderPaid({ outTradeNo: renewalOrder.outTradeNo,
            providerTransactionId: renewal.transactionId, totalFen: renewal.amountFen, clientFactory });
        assert.equal(Number(renewed.subscription.current_period_end), Number(first.subscription.current_period_end) + 30*86400000);
        assert.equal((await payCredit(member, bound2.outTradeNo)).code, "TRANSACTION_ALREADY_USED");
        assert.equal((await listUnmatchedBuyMeACoffeeReceipts({}, query)).pagination.total, 0);

        const manual = await purchase("pi_manual");
        assert.equal((await bindBuyMeACoffeeOrder({ parsed: manual, user, manual: true, note: "Already granted", clientFactory })).code, "MANUAL_RECORDED");
        await recordBuyMeACoffeeReceipt({ type: "extra_purchase.updated", live_mode: true,
            data: { transaction_id: manual.transactionId, status: "succeeded", amount: 1.99, currency: "USD" } }, manual, query);
        assert.equal((await bind(manual)).code, "ALREADY_PAID");
        assert.equal((await payCredit(manual, bound2.outTradeNo)).code, "ALREADY_FULFILLED_MANUALLY");
        assert.equal((await query("SELECT points FROM users WHERE id=1")).rows[0].points, 2400);
        assert.equal((await listUnmatchedBuyMeACoffeeReceipts({}, query)).pagination.total, 0);
        const refunded = await purchase("pi_refund");
        await query("UPDATE buymeacoffee_receipts SET refunded=TRUE WHERE transaction_id=$1", [refunded.transactionId]);
        assert.equal((await bind(refunded)).code, "RECEIPT_NOT_PAYABLE");

        const rollout = await purchase("pi_rollout");
        const pending = (await query(`INSERT INTO credit_orders(user_id,clerk_user_id,provider,product_key,points,amount_fen,currency,out_trade_no,status,created_at)
            VALUES (1,'user_test','buymeacoffee','buymeacoffee_usd_199',1200,199,'USD','cpt_abcdefghijklmnopqrst','CREATED',$1) RETURNING id`, [now])).rows[0];
        const reconcile = confirm => recordManualBuyMeACoffeeFulfillment({ transactionId: rollout.transactionId, orderId: pending.id, confirm, clientFactory });
        assert.equal((await reconcile(false)).status, "DRY_RUN");
        assert.equal((await query("SELECT status FROM credit_orders WHERE id=$1", [pending.id])).rows[0].status, "CREATED");
        assert.equal((await reconcile(true)).status, "MANUAL_RECORDED");
        assert.equal((await reconcile(true)).status, "ALREADY_RECORDED");
        assert.equal((await query("SELECT points FROM users WHERE id=1")).rows[0].points, 2400);
    } finally { await db.close(); }
});
