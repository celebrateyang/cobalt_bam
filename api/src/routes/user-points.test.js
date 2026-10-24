import assert from "node:assert/strict";
import test from "node:test";
import { createUserPointsHandler } from "./user-points.js";

const fixture = ({ userId = "clerk_user", user = null, startDownloadProtection } = {}) => {
    const reads = [];
    const membership = { active: true };
    const handler = createUserPointsHandler({
        getAuth: () => ({ userId }),
        getUserByClerkId: async id => { reads.push(id); return user; },
        getActiveMembershipForUser: async id => { reads.push(id); return membership; },
        startDownloadProtection,
    });
    const res = {
        statusCode: 200, headers: {},
        set(key, value) { this.headers[key] = value; return this; },
        status(value) { this.statusCode = value; return this; },
        json(value) { this.body = value; return this; },
    };
    return { handler, res, reads, membership };
};

test("reads current balance for authenticated identity without changing the user", async () => {
    const user = Object.freeze({ id: 17, points: 843, referral_code: "abc", download_success_count: 2 });
    const f = fixture({ user });
    await f.handler({ query: { userId: "other_user" } }, f.res);
    assert.deepEqual(f.reads, ["clerk_user", 17]);
    assert.equal(f.res.body.data.user.points, 843);
    assert.equal(f.res.body.data.user.membership, f.membership);
    assert.equal(f.res.body.data.user.referral_code, "abc");
    assert.equal(f.res.headers["Cache-Control"], "no-store");
});

test("explicit download action activates before reading membership and returns real zero balance", async () => {
    let calls = 0;
    const f = fixture({ user: { id: 17, points: 0 }, startDownloadProtection: async user => {
        calls++;
        return { ...user, download_protection_eligible: true, download_protection_started_at: Date.now() };
    } });
    await f.handler({ body: { userId: "other", startedAt: 1 } }, f.res);
    assert.equal(calls, 1);
    assert.equal(f.res.body.data.user.points, 0);
    assert.equal(f.res.body.data.user.download_protection_active, true);
});

test("disabled download action cannot activate protection", async () => {
    const f = fixture({ user: { id: 17, is_disabled: true }, startDownloadProtection: () => assert.fail('must not activate') });
    await f.handler({}, f.res);
    assert.equal(f.res.statusCode, 403);
});

test("activation failure cannot become a successful or free response", async () => {
    const f = fixture({ user: { id: 17 }, startDownloadProtection: async () => { throw new Error('offline'); } });
    const original = console.error;
    console.error = () => {};
    try { await f.handler({}, f.res); } finally { console.error = original; }
    assert.equal(f.res.statusCode, 500);
    assert.equal(f.res.body.status, 'error');
    assert.deepEqual(f.reads, ['clerk_user']);
});

test("rejects unauthenticated queries without DB reads", async () => {
    const f = fixture({ userId: null });
    await f.handler({}, f.res);
    assert.equal(f.res.statusCode, 401);
    assert.deepEqual(f.reads, []);
});

test("missing local user requires registration sync and is not created by balance read", async () => {
    const f = fixture();
    await f.handler({}, f.res);
    assert.equal(f.res.statusCode, 404);
    assert.equal(f.res.body.error.code, "USER_NOT_SYNCED");
    assert.deepEqual(f.reads, ["clerk_user"]);
});

for (const [reason, code] of [[null, "ACCOUNT_DISABLED"], ["duplicate_normalized_email", "DUPLICATE_SIGNUP_BLOCKED"]]) {
    test(`rejects disabled user: ${code}`, async () => {
        const f = fixture({ user: { id: 17, is_disabled: true, signup_block_reason: reason } });
        await f.handler({}, f.res);
        assert.equal(f.res.statusCode, 403);
        assert.equal(f.res.body.error.code, code);
        assert.deepEqual(f.reads, ["clerk_user"]);
    });
}
