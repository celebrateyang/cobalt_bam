import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./user.js", import.meta.url), "utf8");
const helperStart = source.indexOf("        const ensureLocalUserByClerkId =");
const helperEnd = source.indexOf("\n        };", helperStart) + "\n        };".length;
const mapStart = source.indexOf("const mapClerkUser =");
const mapEnd = source.indexOf("\nconst jsonError", mapStart);
const localUser = Object.freeze({ id: 17, clerk_user_id: "caller", points: 843 });
const profile = { id: "caller", emailAddresses: [{ id: "email", emailAddress: "user@example.com" }], primaryEmailAddressId: "email", firstName: "Test" };
const routes = [
    ["get", "/collection-memory", {}],
    ["post", "/collection-memory/mark", { items: [{ itemKey: "item" }] }],
    ["post", "/collection-memory/unmark", { itemKeys: ["item"] }],
    ["post", "/collection-memory/clear", {}],
    ["post", "/promotion-submissions", { promotionType: "post", accessMethod: "https://example.com/post" }],
    ["post", "/feedback", { videoUrl: "https://example.com/video", phenomenon: "Download failed" }],
];

const fixture = (method, path, { missing = false, userId = "caller" } = {}) => {
    const calls = { reads: [], profiles: [], upserts: [], operations: [] };
    let handler;
    const operation = async input => {
        calls.operations.push(input);
        return { ok: true, memory: null, itemKeys: [], submission: { id: 1 } };
    };
    const context = vm.createContext({
        router: { [method]: (route, fn) => { assert.equal(route, path); handler = fn; } },
        getAuth: () => ({ userId }),
        getUserByClerkId: async id => { calls.reads.push(id); return missing ? null : localUser; },
        clerkClient: { users: { getUser: async id => { calls.profiles.push(id); return profile; } } },
        upsertUserFromClerk: async input => { calls.upserts.push(input); return localUser; },
        jsonError: (res, status, code, message) => res.status(status).json({ status: "error", error: { code, message } }),
        getDownloadedItemKeysForCollection: operation,
        markDownloadedItemsForCollection: operation,
        unmarkDownloadedItemsForCollection: operation,
        clearCollectionMemoryForUser: operation,
        createPromotionSubmission: operation,
        createFeedback: operation,
        getPromotionTypeConfig: type => type === "post" ? { key: "post" } : null,
        console: { error() {} },
    });
    vm.runInContext(source.slice(mapStart, mapEnd) + source.slice(helperStart, helperEnd), context);
    const start = source.indexOf(`        router.${method}("${path}", async`);
    const end = source.indexOf("\n        });", start) + "\n        });".length;
    assert.ok(start >= 0 && end > start);
    vm.runInContext(source.slice(start, end), context);
    const res = {
        statusCode: 200,
        status(value) { this.statusCode = value; return this; },
        json(value) { this.body = value; return this; },
    };
    return { handler, res, calls };
};

for (const [method, path, body] of routes) {
    const request = { query: { collectionKey: "collection" }, body: { collectionKey: "collection", ...body } };
    test(`${path}: existing user uses local identity without Clerk fetch or upsert`, async () => {
        const f = fixture(method, path);
        await f.handler(request, f.res);
        assert.equal(f.res.statusCode, 200);
        assert.equal(f.res.body.status, "success");
        assert.deepEqual(f.calls.reads, ["caller"]);
        assert.deepEqual(f.calls.profiles, []);
        assert.deepEqual(f.calls.upserts, []);
        assert.equal(f.calls.operations[0].userId, 17);
        assert.equal(localUser.points, 843);
    });
    test(`${path}: missing user is created once before the business operation`, async () => {
        const f = fixture(method, path, { missing: true });
        await f.handler(request, f.res);
        assert.equal(f.res.statusCode, 200);
        assert.deepEqual(f.calls.profiles, ["caller"]);
        assert.equal(f.calls.upserts.length, 1);
        assert.equal(f.calls.upserts[0].primaryEmail, "user@example.com");
        assert.equal(f.calls.operations[0].userId, 17);
    });
    test(`${path}: unauthenticated input performs no user lookup or business write`, async () => {
        const f = fixture(method, path, { userId: null });
        await f.handler(request, f.res);
        assert.equal(f.res.statusCode, 401);
        assert.equal(f.calls.reads.length, 0);
        assert.equal(f.calls.operations.length, 0);
    });
    test(`${path}: invalid input is rejected before profile lookup`, async () => {
        const f = fixture(method, path);
        await f.handler({ query: {}, body: {} }, f.res);
        assert.equal(f.res.statusCode, 400);
        assert.equal(f.calls.reads.length, 0);
        assert.equal(f.calls.profiles.length, 0);
    });
}

const paymentFixture = ({ missing = false } = {}) => {
    const source = readFileSync(new URL("./payments.js", import.meta.url), "utf8");
    const start = source.indexOf("const paymentUser =");
    const end = source.indexOf("const userPaymentRoute =", start);
    const calls = { reads: [], profiles: [], upserts: [] };
    const internalUsers = new WeakMap();
    const context = vm.createContext({
        internalUsers, getAuth: () => ({ userId: "caller" }),
        getUserByClerkId: async id => { calls.reads.push(id); return missing ? null : localUser; },
        clerkClient: { users: { getUser: async id => { calls.profiles.push(id); return profile; } } },
        mapClerkUser: input => ({ clerkUserId: input.id }),
        upsertUserFromClerk: async input => { calls.upserts.push(input); return localUser; },
    });
    vm.runInContext(source.slice(start, end), context);
    return { resolve: vm.runInContext("paymentUser", context), internalUsers, calls };
};

test("payment orders reuse local user without fetching or upserting Clerk profile", async () => {
    const f = paymentFixture();
    assert.equal(await f.resolve({}), localUser);
    assert.deepEqual(f.calls.reads, ["caller"]);
    assert.equal(f.calls.profiles.length, 0);
    assert.equal(f.calls.upserts.length, 0);
});

test("payment orders preserve first-user creation fallback", async () => {
    const f = paymentFixture({ missing: true });
    assert.equal(await f.resolve({}), localUser);
    assert.deepEqual(f.calls.reads, ["caller"]);
    assert.deepEqual(f.calls.profiles, ["caller"]);
    assert.equal(f.calls.upserts.length, 1);
});

test("internal Agent checkout bypasses local lookup and Clerk synchronization", async () => {
    const f = paymentFixture();
    const req = {};
    f.internalUsers.set(req, localUser);
    assert.equal(await f.resolve(req), localUser);
    assert.equal(f.calls.reads.length, 0);
    assert.equal(f.calls.profiles.length, 0);
    assert.equal(f.calls.upserts.length, 0);
});
