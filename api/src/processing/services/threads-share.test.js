import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveThreadsShare } from "./threads-share.js";
import { services } from "../service-config.js";
import threads from "./threads.js";

const redirect = location => new Response(null, { status: 302, headers: { location } });

test("share links match without changing canonical post patterns", () => {
    const match = path => services.threads.patterns.map(p => p.match(path)).find(Boolean);
    assert.deepEqual(match("share/test_token"), { shareId: "test_token" });
    assert.deepEqual(match("@example.name/post/Example123"), { username: "example.name", postId: "Example123" });
    assert.deepEqual(match("t/Example123"), { postId: "Example123" });
});

test("resolve tracked share redirect into canonical arguments without visiting post", async () => {
    let count = 0;
    const result = await resolveThreadsShare("share_token", async (url, options) => {
        count++;
        assert.equal(url.hostname, "www.threads.com");
        assert.equal(options.method, "HEAD");
        assert.equal(options.redirect, "manual");
        return redirect("/@example.name/post/Example123?tracking=ignored");
    });
    assert.deepEqual(result, { username: "example.name", postId: "Example123" });
    assert.equal(count, 1);
});

test("allow known Threads alias and compact post route", async () => {
    assert.deepEqual(await resolveThreadsShare("token", async () => redirect("https://www.threads.net/t/Example123/")), { postId: "Example123" });
});

for (const destination of ["https://example.com/@name/post/ID", "http://www.threads.com/@name/post/ID", "https://user:pass@www.threads.com/@name/post/ID", "https://www.threads.com:8443/@name/post/ID", "https://threads.com.example.com/@name/post/ID"]) {
    test(`reject unsafe redirect without following: ${new URL(destination).host}`, async () => {
        let count = 0;
        assert.equal(await resolveThreadsShare("token", async () => { count++; return redirect(destination); }), null);
        assert.equal(count, 1);
    });
}

test("bound redirect loops and do not invent a post from login page", async () => {
    let count = 0;
    assert.equal(await resolveThreadsShare("token", async () => { count++; return redirect("/share/next"); }), null);
    assert.equal(count, 3);
    assert.equal(await resolveThreadsShare("token", async () => new Response(null, { status: 200 })), null);
});

test("invalid tokens and failed requests cannot become undefined post requests", async () => {
    assert.equal(await resolveThreadsShare("../invalid", () => { throw new Error("must not fetch"); }), null);
    assert.equal(await resolveThreadsShare("token", async () => { throw new Error("timeout"); }), null);
});

test("extractor sends resolved share arguments to the existing post flow", async () => {
    const original = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (input) => {
        const url = new URL(input);
        calls.push(url.pathname);
        return calls.length === 1
            ? redirect("/@example.name/post/Example123?tracking=ignored")
            : new Response("<html>No post metadata</html>");
    };
    try {
        assert.deepEqual(await threads({ shareId: "token" }), { error: "fetch.empty" });
        assert.deepEqual(calls, ["/share/token", "/@example.name/post/Example123"]);
    } finally {
        globalThis.fetch = original;
    }
});

test("unresolved share returns before attempting a nonexistent post", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = () => { throw new Error("must not fetch invalid token"); };
    try {
        assert.deepEqual(await threads({ shareId: "../invalid" }), { error: "fetch.empty" });
    } finally {
        globalThis.fetch = original;
    }
});
