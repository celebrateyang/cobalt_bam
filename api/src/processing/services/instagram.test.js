import assert from "node:assert/strict";
import test from "node:test";
import { env } from "../../config.js";
import { refreshUpstreamPool } from "../upstream/pool.js";

const setup = async (t, upstream = false) => {
    const keys = ["apiURL", "upstreamURLs", "upstreamGlobalURLs", "upstreamCnURLs"];
    const previous = Object.fromEntries(keys.map((key) => [key, env[key]]));
    const role = process.env.IS_UPSTREAM_SERVER;
    const originalFetch = globalThis.fetch;
    t.after(() => {
        Object.assign(env, previous);
        if (role === undefined) delete process.env.IS_UPSTREAM_SERVER;
        else process.env.IS_UPSTREAM_SERVER = role;
        globalThis.fetch = originalFetch;
        refreshUpstreamPool();
    });
    env.apiURL = "http://localhost:9000/";
    env.upstreamURLs = env.upstreamGlobalURLs = env.upstreamCnURLs = [];
    refreshUpstreamPool();
    env.upstreamGlobalURLs = ["https://api7.example.com"];
    refreshUpstreamPool();
    process.env.IS_UPSTREAM_SERVER = String(upstream);
    return (await import(`./instagram.js?test=${upstream}-${Date.now()}`)).default;
};

test("main API delegates after anonymous GraphQL failure before slow local fallbacks", async (t) => {
    const instagram = await setup(t);
    const called = [];
    globalThis.fetch = async (url) => {
        called.push(String(url));
        if (new URL(url).hostname === "api7.example.com") {
            return Response.json({ status: "redirect", url: "https://cdn.example/video.mp4" });
        }
        assert.equal(new URL(url).pathname, "/graphql/query");
        return Response.json({ data: null });
    };
    const result = await instagram({ postId: "example" });
    assert.equal(result.urls, "https://cdn.example/video.mp4");
    assert.equal(called.length, 2);
});

test("public Instagram posts retain the local fast path", async (t) => {
    const instagram = await setup(t);
    let calls = 0;
    globalThis.fetch = async (url) => {
        calls++;
        assert.equal(new URL(url).hostname, "www.instagram.com");
        return Response.json({ data: { xdt_api__v1__media__shortcode__web_info: { items: [{
            video_versions: [{ width: 720, height: 1280, url: "https://cdn.example/public.mp4" }],
        }] } } });
    };
    assert.equal((await instagram({ postId: "example" })).urls, "https://cdn.example/public.mp4");
    assert.equal(calls, 1);
});

test("upstream servers retain local mobile extraction before consulting other nodes", async (t) => {
    const instagram = await setup(t, true);
    const called = [];
    globalThis.fetch = async (url) => {
        const parsed = new URL(url);
        called.push(parsed.pathname);
        assert.notEqual(parsed.hostname, "api7.example.com");
        if (parsed.pathname === "/graphql/query") return Response.json({ data: null });
        if (parsed.pathname === "/api/v1/oembed/") return Response.json({ media_id: "123" });
        assert.equal(parsed.pathname, "/api/v1/media/123/info/");
        return Response.json({ items: [{ video_versions: [
            { width: 720, height: 1280, url: "https://cdn.example/mobile.mp4" },
        ] }] });
    };
    assert.equal((await instagram({ postId: "example" })).urls, "https://cdn.example/mobile.mp4");
    assert.deepEqual(called, ["/graphql/query", "/api/v1/oembed/", "/api/v1/media/123/info/"]);
});

test("all upstream failures retain local fallback without querying the pool twice", async (t) => {
    const instagram = await setup(t);
    let upstreamCalls = 0;
    let localFallbackCalls = 0;
    globalThis.fetch = async (url) => {
        const parsed = new URL(url);
        if (parsed.hostname === "api7.example.com") {
            upstreamCalls++;
            return Response.json({ status: "error", error: { code: "error.api.fetch.empty" } }, { status: 400 });
        }
        if (parsed.pathname === "/graphql/query") return Response.json({ data: null });
        localFallbackCalls++;
        return new Response("");
    };
    assert.ok((await instagram({ postId: "example" })).error);
    assert.equal(upstreamCalls, 1);
    assert.ok(localFallbackCalls > 0);
});
