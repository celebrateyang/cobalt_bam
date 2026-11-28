import test from 'node:test';
import assert from 'node:assert/strict';
import { createClipMembershipSettlementHandler } from './user-clip-settlement.js';

const response = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
});

test('membership settlement authenticates, validates, and scopes the transition to the local user', async () => {
    const calls = [];
    let auth = {};
    const handler = createClipMembershipSettlementHandler({
        getAuth: () => auth,
        getUserByClerkId: async () => ({ id: 42 }),
        settleYoutubeClipMembership: async args => { calls.push(args); return { ok: true, status: 'success' }; },
    });
    let res = response();
    await handler({ body: { usageEventId: 2, success: true } }, res);
    assert.equal(res.statusCode, 401);
    auth = { userId: 'user' };
    res = response();
    await handler({ body: { usageEventId: 2, success: 'true' } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(calls.length, 0);
    res = response();
    await handler({ body: { usageEventId: 2, success: true } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, [{ userId: 42, usageEventId: 2, success: true }]);
});

test('membership settlement fails closed when reservation cannot be finalized', async () => {
    const handler = createClipMembershipSettlementHandler({
        getAuth: () => ({ userId: 'user' }),
        getUserByClerkId: async () => ({ id: 42 }),
        settleYoutubeClipMembership: async () => ({ ok: false }),
    });
    const res = response();
    await handler({ body: { usageEventId: 2, success: false } }, res);
    assert.equal(res.statusCode, 409);
});
