import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

// Exercise the registered handlers without starting the API or contacting Clerk/DB.
const source = readFileSync(new URL("./user.js", import.meta.url), "utf8");
const paths = ["/points/consume", "/points/hold/finalize", "/points/hold/release"];
const fixture = (path, { userId = "authenticated_user", user = { id: 17 }, result } = {}) => {
    let handler;
    const reads = [], mutations = [];
    const start = source.indexOf(`        router.post("${path}", async`);
    assert.ok(start >= 0);
    const end = source.indexOf("\n        router.", start + 1);
    assert.ok(end > start);
    const forbidden = () => { throw new Error("Clerk profile sync must not run during points settlement"); };
    vm.runInNewContext(source.slice(start, end), {
        router: { post(route, fn) { assert.equal(route, path); handler = fn; } },
        getAuth: () => ({ userId }),
        getUserByClerkId: async id => { reads.push(id); return user; },
        clerkClient: { users: { getUser: forbidden } },
        upsertUserFromClerk: forbidden, mapClerkUser: forbidden,
        jsonError: (res, status, code, message) => res.status(status).json({ status: "error", error: { code, message } }),
        buildHoldLogContext: () => ({}), console: { log() {}, error() {} },
        consumeUserPoints: async (...args) => { mutations.push(args); return result === undefined ? { id: 17, points: 10 } : result; },
        finalizePointsHold: async args => { mutations.push(args); return result ?? { ok: true, status: "charged", charged: 10, pointsBefore: 20, pointsAfter: 10 }; },
        releasePointsHold: async args => { mutations.push(args); return result ?? { ok: true, status: "released" }; },
    });
    const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
    return { handler, res, reads, mutations };
};
const validBody = path => path === "/points/consume" ? { points: 10 } : { holdId: "hold_1", reason: "queue_done" };

for (const path of paths) {
    test(`${path}: uses local authenticated identity and never synchronizes Clerk profile`, async () => {
        const f = fixture(path);
        await f.handler({ body: { ...validBody(path), userId: 999 } }, f.res);
        assert.equal(f.res.statusCode, 200);
        assert.equal(f.res.body.status, "success");
        assert.deepEqual(f.reads, ["authenticated_user"]);
        assert.equal(f.mutations.length, 1);
        if (path === "/points/consume") assert.deepEqual(f.mutations[0], [17, 10]);
        else {
            assert.equal(f.mutations[0].userId, 17);
            assert.equal(f.mutations[0].holdId, "hold_1");
            assert.equal(f.mutations[0].reason, "queue_done");
        }
    });
    test(`${path}: unauthenticated requests cannot read or mutate points`, async () => {
        const f = fixture(path, { userId: null });
        await f.handler({ body: validBody(path) }, f.res);
        assert.equal(f.res.statusCode, 401);
        assert.equal(f.reads.length, 0);
        assert.equal(f.mutations.length, 0);
    });
    test(`${path}: missing local user is not created and no points are mutated`, async () => {
        const f = fixture(path, { user: null });
        await f.handler({ body: validBody(path) }, f.res);
        assert.equal(f.res.statusCode, 404);
        assert.equal(f.res.body.error.code, "USER_NOT_SYNCED");
        assert.equal(f.mutations.length, 0);
    });
    test(`${path}: invalid input fails before accessing user or points`, async () => {
        const f = fixture(path);
        await f.handler({ body: {} }, f.res);
        assert.equal(f.res.statusCode, 400);
        assert.equal(f.reads.length, 0);
        assert.equal(f.mutations.length, 0);
    });
}

test("consume retains insufficient balance response", async () => {
    const f = fixture(paths[0], { result: null });
    await f.handler({ body: validBody(paths[0]) }, f.res);
    assert.equal(f.res.statusCode, 409);
    assert.equal(f.res.body.error.code, "INSUFFICIENT_POINTS");
});

for (const [code, status] of [["HOLD_NOT_FOUND", 404], ["HOLD_EXPIRED", 410], ["INSUFFICIENT_POINTS", 409]]) {
    test(`finalize retains ${code} response`, async () => {
        const f = fixture(paths[1], { result: { ok: false, code } });
        await f.handler({ body: validBody(paths[1]) }, f.res);
        assert.equal(f.res.statusCode, status);
        assert.equal(f.res.body.error.code, code);
    });
}

test("repeat finalize returns the transaction's already charged result without another sync", async () => {
    const f = fixture(paths[1], { result: { ok: true, status: "charged", charged: 0, pointsBefore: 10, pointsAfter: 10 } });
    await f.handler({ body: validBody(paths[1]) }, f.res);
    assert.equal(f.res.body.data.charged, 0);
    assert.equal(f.res.body.data.after, 10);
    assert.equal(f.mutations[0].markDownloadSuccess, true);
});

test("release retains hold ownership failure response", async () => {
    const f = fixture(paths[2], { result: { ok: false, code: "HOLD_NOT_FOUND" } });
    await f.handler({ body: validBody(paths[2]) }, f.res);
    assert.equal(f.res.statusCode, 404);
    assert.equal(f.res.body.error.code, "HOLD_NOT_FOUND");
});

test("disabled users can still release their existing holds", async () => {
    const f = fixture(paths[2], { user: { id: 17, is_disabled: true } });
    await f.handler({ body: validBody(paths[2]) }, f.res);
    assert.equal(f.res.statusCode, 200);
    assert.equal(f.res.body.data.status, "released");
});
