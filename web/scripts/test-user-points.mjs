import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../src/lib/api/user-points.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const fixture = (responses, waitForSync = async () => "fresh-token") => {
    const calls = [];
    let waits = 0;
    const exports = {};
    vm.runInNewContext(code, {
        exports, AbortSignal,
        require(name) {
            if (name === "$lib/api/api-url") return { currentApiURL: () => "https://api.test" };
            assert.equal(name, "$lib/state/clerk");
            return { syncMissingUser: async () => { waits++; return await waitForSync(); } };
        },
        fetch: async (url, options) => { calls.push({ url, options }); return responses.shift(); },
    });
    return { fetch: exports.fetchUserPoints, recover: exports.fetchWithUserSync, calls, get waits() { return waits; } };
};

test("existing user's points return without waiting for a stalled profile sync", async () => {
    const response = new Response('{"status":"success"}');
    const f = fixture([response], () => new Promise(() => {}));
    assert.equal(await f.fetch("token"), response);
    assert.equal(f.waits, 0);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].url, "https://api.test/user/points");
    assert.equal(f.calls[0].options.headers.Authorization, "Bearer token");
});

test("new user retries once after pending registration sync finishes", async () => {
    let finishSync;
    const pending = new Promise(resolve => { finishSync = resolve; });
    const success = new Response('{"status":"success"}');
    const f = fixture([new Response('{"error":{"code":"USER_NOT_SYNCED"}}', { status: 404 }), success], async () => { await pending; return "fresh-token"; });
    const result = f.fetch("token");
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(f.waits, 1);
    assert.equal(f.calls.length, 1);
    finishSync();
    assert.equal(await result, success);
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1].options.headers.Authorization, "Bearer fresh-token");
});

test("failed profile recovery does not retry points requests", async () => {
    const missing = new Response('{"error":{"code":"USER_NOT_SYNCED"}}', { status: 404 });
    const f = fixture([missing], async () => null);
    assert.equal(await f.fetch("token"), missing);
    assert.equal(f.calls.length, 1);
});

test("Discover consumption retries only a definitive missing-user response", async () => {
    const f = fixture([]);
    const tokens = [];
    const result = await f.recover(async token => {
        tokens.push(token);
        return tokens.length === 1
            ? new Response('{"error":{"code":"USER_NOT_SYNCED"}}', { status: 404 })
            : new Response('{"status":"success"}');
    }, "token");
    assert.equal(result.status, 200);
    assert.deepEqual(tokens, ["token", "fresh-token"]);
});

test("consumption transport failures, including timeout, never retry", async () => {
    for (const error of [new TypeError("network error"), new DOMException("timeout", "TimeoutError")]) {
        const f = fixture([]);
        let calls = 0;
        await assert.rejects(f.recover(async () => { calls++; throw error; }, "token"), e => e === error);
        assert.equal(calls, 1);
        assert.equal(f.waits, 0);
    }
});

test("Discover caller recovers a newly registered user's missing record before marking video charged", async () => {
    const component = readFileSync(new URL("../src/routes/[lang]/discover/+page.svelte", import.meta.url), "utf8");
    const script = component.split('<script lang="ts">')[1].split('</script>')[0];
    const ast = ts.createSourceFile("discover.ts", script, ts.ScriptTarget.Latest, true);
    const declaration = ast.statements.find(s => ts.isVariableStatement(s) && s.declarationList.declarations.some(d => d.name.getText(ast) === "consumeViewPoint"));
    assert.ok(declaration);
    const compiled = ts.transpileModule(declaration.getText(ast), {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    let synced = false, calls = 0;
    const f = fixture([], async () => { synced = true; return "fresh-token"; });
    const context = vm.createContext({
        chargedVideoIds: new Set(), VIEW_POINT_COST: 1, AbortSignal,
        getViewAccessToken: async () => "token", currentApiURL: () => "https://api.test",
        fetchWithUserSync: f.recover,
        fetch: async (url, options) => {
            assert.equal(url, "https://api.test/user/points/consume");
            assert.equal(options.method, "POST");
            calls++;
            if (!synced) return new Response('{"error":{"code":"USER_NOT_SYNCED"}}', { status: 404 });
            assert.equal(options.headers.Authorization, "Bearer fresh-token");
            return new Response('{"status":"success"}');
        },
        showPointsCheckFailedDialog() { assert.fail("unexpected points failure"); },
        showDiscoverSignInDialog() { assert.fail("unexpected login prompt"); },
    });
    vm.runInContext(compiled, context);
    assert.equal(await vm.runInContext("consumeViewPoint(17)", context), true);
    assert.equal(calls, 2);
    assert.equal(f.waits, 1);
    assert.equal(await vm.runInContext("consumeViewPoint(17)", context), true);
    assert.equal(calls, 2);
});

test("persistent missing user stops after one retry", async () => {
    const missing = () => new Response('{"error":{"code":"USER_NOT_SYNCED"}}', { status: 404 });
    const f = fixture([missing(), missing()]);
    assert.equal((await f.fetch("token")).status, 404);
    assert.equal(f.calls.length, 2);
});

test("unauthorized, disabled and unrelated missing routes do not retry", async () => {
    for (const status of [401, 403, 404, 500]) {
        const response = new Response('{"error":{"code":"OTHER"}}', { status });
        const f = fixture([response]);
        assert.equal(await f.fetch("token"), response);
        assert.equal(f.waits, 0);
        assert.equal(f.calls.length, 1);
    }
});
