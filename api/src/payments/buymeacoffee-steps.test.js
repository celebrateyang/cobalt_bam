import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { recordBuyMeACoffeeStep, BUYMEACOFFEE_STEPS } from "./buymeacoffee-steps.js";

test("payment observations use fixed tables, owner filters and parameterized bounded keys", async () => {
    for (const kind of ["credit", "membership"]) {
        for (const step of BUYMEACOFFEE_STEPS) {
            let request;
            assert.equal(await recordBuyMeACoffeeStep({ id: 12, kind, clerkUserId: "user_a", step }, async (...args) => { request = args; }), true);
            assert.match(request[0], new RegExp(`UPDATE ${kind === "credit" ? "credit_orders" : "membership_orders"}`));
            assert.match(request[0], /clerk_user_id = \$2 AND provider = 'buymeacoffee'/);
            assert.match(request[0], /AND NOT/);
            assert.doesNotMatch(request[0], /SET status|paid_at|points|amount_fen|updated_at/);
            assert.deepEqual(request[1].slice(0, 3), [12, "user_a", `bmc_step_${step}`]);
        }
    }
});

test("observations preserve financial fields and provider metadata, deduplicate retries and isolate owners", async () => {
    const db = new PGlite({ initialMemory: 128 * 1024 * 1024 });
    const query = (sql, params) => db.query(sql, params);
    try {
        await db.exec(`CREATE TABLE credit_orders (id integer PRIMARY KEY, clerk_user_id text,
            provider text, status text, points integer, amount_fen integer, updated_at bigint, provider_data jsonb);
            CREATE TABLE membership_orders (LIKE credit_orders INCLUDING ALL);
            INSERT INTO credit_orders VALUES
                (1,'user_a','buymeacoffee','CREATED',1200,199,123,'{"checkout_url":"https://buymeacoffee.com/example/e/1"}'),
                (2,'user_b','buymeacoffee','CREATED',1200,199,123,NULL),
                (3,'user_a','wechat','CREATED',500,500,123,NULL);
            INSERT INTO membership_orders VALUES (1,'user_a','buymeacoffee','PAID',0,799,123,NULL);`);
        const observe = (id, step, kind = "credit") => recordBuyMeACoffeeStep({ id, step, kind, clerkUserId: "user_a" }, query);
        await observe(1, "checkout_opened");
        const original = (await query('SELECT * FROM credit_orders WHERE id=1')).rows[0];
        await observe(1, "checkout_opened");
        await observe(1, "code_copied");
        const current = (await query('SELECT * FROM credit_orders WHERE id=1')).rows[0];
        assert.equal(current.provider_data.bmc_step_checkout_opened, original.provider_data.bmc_step_checkout_opened);
        assert.equal(current.provider_data.checkout_url, original.provider_data.checkout_url);
        assert.ok(current.provider_data.bmc_step_code_copied);
        assert.equal(current.status, 'CREATED');
        assert.equal(current.points, 1200);
        assert.equal(current.amount_fen, 199);
        assert.equal(current.updated_at, 123);
        await observe(2, "checkout_opened");
        await observe(3, "checkout_opened");
        assert.ok((await query('SELECT provider_data FROM credit_orders WHERE id IN (2,3)')).rows.every(row => row.provider_data === null));
        await observe(1, "help_opened", "membership");
        const member = (await query('SELECT * FROM membership_orders WHERE id=1')).rows[0];
        assert.equal(member.status, 'PAID');
        assert.ok(member.provider_data.bmc_step_help_opened);
    } finally { await db.close(); }
});

test("invalid observations cannot execute SQL or add arbitrary metadata", async () => {
    const base = { id: 12, kind: "credit", clerkUserId: "user_a", step: "checkout_opened" };
    for (const patch of [{ id: -1 }, { id: "12" }, { kind: "credit_orders; DROP TABLE users" }, { clerkUserId: "" }, { step: "PAID" }, { step: {} }]) {
        assert.equal(await recordBuyMeACoffeeStep({ ...base, ...patch }, () => { throw new Error("SQL must not run"); }), false);
    }
});

test("HTTP observations require authentication, order ownership, a BMC provider and an allowlisted step", async () => {
    const source = readFileSync(new URL('../routes/payments.js', import.meta.url), 'utf8');
    const route = source.match(/    userPaymentRoute\("post", \["\/credits\/orders\/:id\/payment-step"[\s\S]*?\n    \}\);/)[0];
    for (const scenario of [
        { userId: null, status: 401 },
        { userId: 'user_a', step: 'PAID', status: 400 },
        { userId: 'user_a', id: '1.5', status: 400 },
        { userId: 'user_a', owner: 'user_b', status: 404 },
        { userId: 'user_a', provider: 'wechat', status: 404 },
        { userId: 'user_a', missing: true, status: 404 },
        { userId: 'user_a', status: 200 },
        { userId: 'user_a', kind: 'membership', status: 200 },
    ]) {
        let handler;
        let writes = 0;
        let resultStatus;
        const context = vm.createContext({
            userPaymentRoute: (_method, _paths, fn) => { handler = fn; },
            paymentAuth: () => ({ userId: scenario.userId }), BUYMEACOFFEE_STEPS,
            getCreditOrderById: async () => scenario.missing ? null : ({ clerk_user_id: scenario.owner || 'user_a', provider: scenario.provider || 'buymeacoffee' }),
            getMembershipOrderById: async () => ({ clerk_user_id: 'user_a', provider: 'buymeacoffee' }),
            recordBuyMeACoffeeStep: async () => { writes++; },
            jsonError: (res, status) => res.status(status).json({}), console,
        });
        vm.runInContext(route, context);
        const res = { status: value => { resultStatus = value; return res; }, json: () => {} };
        await handler({ params: { id: scenario.id || '1' }, body: { step: scenario.step || 'checkout_opened' }, path: `/${scenario.kind === 'membership' ? 'memberships' : 'credits'}/orders/1/payment-step` }, res);
        assert.equal(resultStatus, scenario.status);
        assert.equal(writes, scenario.status === 200 ? 1 : 0);
    }
});
