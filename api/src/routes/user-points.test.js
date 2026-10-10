import assert from "node:assert/strict";
import test from "node:test";
import { createUserPointsHandler } from "./user-points.js";

const fixture = ({ userId = "clerk_user", user = null } = {}) => {
    const reads = [];
    const membership = { active: true };
    const handler = createUserPointsHandler({
        getAuth: () => ({ userId }),
        getUserByClerkId: async id => { reads.push(id); return user; },
        getActiveMembershipForUser: async id => { reads.push(id); return membership; },
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
