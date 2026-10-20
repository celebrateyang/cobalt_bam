import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { normalizeBuyMeACoffeeFeedback, recordBuyMeACoffeeFeedback } from './buymeacoffee-feedback.js';

test('feedback validates reasons, issue combinations and bounded text', () => {
    for (const input of [null, {}, { reason: 'PAID' }, { reason: 'trust', note: {} },
        { reason: 'trust', note: 'a'.repeat(501) }, { reason: 'trust', issue: 'page' },
        { reason: 'payment_issue' }, { reason: 'payment_issue', issue: 'unknown' }]) {
        assert.equal(normalizeBuyMeACoffeeFeedback(input), null);
    }
    assert.equal(normalizeBuyMeACoffeeFeedback({ reason: 'trust', note: '  note  ' }).note, 'note');
    assert.equal(normalizeBuyMeACoffeeFeedback({ reason: 'payment_issue', issue: 'page' }).issue, 'page');
});

test('feedback is idempotent, owner scoped, bounded per order and cannot change financial state', async () => {
    const db = new PGlite({ initialMemory: 128 * 1024 * 1024 });
    const query = (sql, params) => db.query(sql, params);
    try {
        await db.exec(`CREATE TABLE credit_orders (id int PRIMARY KEY, clerk_user_id text, provider text,
            status text, points int, amount_fen int, updated_at bigint, provider_data jsonb);
            CREATE TABLE membership_orders (LIKE credit_orders INCLUDING ALL);
            INSERT INTO credit_orders VALUES
            (1,'user_a','buymeacoffee','CREATED',1200,199,123,'{"checkout_url":"url"}'),
            (2,'user_b','buymeacoffee','CREATED',1200,199,123,NULL),
            (3,'user_a','wechat','CREATED',1200,199,123,NULL),
            (4,'user_a','buymeacoffee','PAID',1200,199,123,NULL),
            (5,'user_a','buymeacoffee','CANCELLED',1200,199,123,NULL);
            INSERT INTO membership_orders VALUES (1,'user_a','buymeacoffee','CREATED',0,199,123,NULL);`);
        const save = (id, kind = 'credit', reason = 'trust') => recordBuyMeACoffeeFeedback({
            id, kind, clerkUserId: 'user_a', feedback: { reason, note: 'test' },
        }, query);
        const first = await save(1);
        assert.equal(first.feedback.reason, 'trust');
        assert.deepEqual(await save(1, 'credit', 'not_now'), first);
        assert.equal(await save(2), null);
        assert.equal(await save(3), null);
        assert.equal((await save(4)).feedback, null);
        assert.equal((await save(5)).feedback, null);
        assert.equal((await save(1, 'membership', 'paid_not_received')).feedback.reason, 'paid_not_received');
        const row = (await query('SELECT * FROM credit_orders WHERE id=1')).rows[0];
        assert.equal(row.provider_data.checkout_url, 'url');
        assert.equal(row.status, 'CREATED');
        assert.equal(row.points, 1200);
        assert.equal(row.amount_fen, 199);
        assert.equal(Number(row.updated_at), 123);
        await query("UPDATE credit_orders SET status='PAID' WHERE id=1");
        assert.equal((await save(1)).feedback.reason, 'trust');
        assert.equal((await save(1)).status, 'PAID');
    } finally { await db.close(); }
});

test('HTTP feedback requires authentication and delegates owner enforcement to the atomic database write', async () => {
    const source = readFileSync(new URL('../routes/payments.js', import.meta.url), 'utf8');
    const route = source.match(/    userPaymentRoute\("post", \["\/credits\/orders\/:id\/payment-feedback"[\s\S]*?\n    \}\);/)[0];
    for (const scenario of [
        { userId: null, status: 401 }, { userId: 'a', id: '1.5', status: 400 },
        { userId: 'a', body: { reason: 'unknown' }, status: 400 },
        { userId: 'a', missing: true, status: 404 },
        { userId: 'a', status: 200 }, { userId: 'a', kind: 'membership', status: 200 },
    ]) {
        let handler, status, request;
        vm.runInNewContext(route, {
            userPaymentRoute: (_m, _p, fn) => { handler = fn; }, paymentAuth: () => ({ userId: scenario.userId }),
            normalizeBuyMeACoffeeFeedback,
            recordBuyMeACoffeeFeedback: async (args) => { request = args; return scenario.missing ? null : { status: 'CREATED' }; },
            jsonError: (res, code) => res.status(code).json({}), console,
        });
        const res = { status: value => { status = value; return res; }, json: () => { status ||= 200; } };
        await handler({ params: { id: scenario.id || '1' }, body: scenario.body || { reason: 'trust' },
            path: `/${scenario.kind === 'membership' ? 'memberships' : 'credits'}/orders/1/payment-feedback` }, res);
        assert.equal(status, scenario.status);
        if (request) { assert.equal(request.clerkUserId, 'a'); assert.equal(request.kind, scenario.kind || 'credit'); }
    }
});
