import assert from "node:assert/strict";
import test from "node:test";
import { env } from "../../config.js";
import { getUpstreamNodes, refreshUpstreamPool } from "./pool.js";
import { requestYoutubeUpstream } from "./youtube.js";

const setup = (t, count = 3) => {
    const keys = ["apiURL", "upstreamURLs", "upstreamGlobalURLs", "upstreamCnURLs", "upstreamMaxAttempts"];
    const previous = Object.fromEntries(keys.map((key) => [key, env[key]]));
    const originalFetch = globalThis.fetch;
    t.after(() => {
        Object.assign(env, previous);
        globalThis.fetch = originalFetch;
        refreshUpstreamPool();
    });
    env.upstreamURLs = env.upstreamGlobalURLs = env.upstreamCnURLs = [];
    refreshUpstreamPool();
    env.apiURL = "http://localhost:9000/";
    env.upstreamMaxAttempts = 2;
    env.upstreamGlobalURLs = Array.from({ length: count }, (_, i) => `https://api${i * 2 + 3}.example.com`);
    env.upstreamCnURLs = ["https://api2.example.com"];
    refreshUpstreamPool();
    return env.upstreamGlobalURLs;
};
const payload = { url: new URL("https://www.youtube.com/watch?v=abcdefghijk"), videoQuality: "1080" };
const download = { status: "tunnel", url: "https://cdn.example/video.mp4" };
const pendingFetch = (signal, onAbort = () => {}) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => {
        onAbort();
        reject(signal.reason);
    }, { once: true });
});

test("three nodes start together; first complete download wins and cancels healthy losers", async (t) => {
    const nodes = setup(t);
    const called = [];
    const cancelled = [];
    const traces = [];
    globalThis.fetch = async (url, { signal, headers, body }) => {
        const origin = new URL(url).origin;
        called.push(origin);
        traces.push(headers["X-FSV-Trace-ID"]);
        assert.equal(JSON.parse(body).videoQuality, "1080");
        if (origin === nodes[2]) {
            assert.deepEqual(called, nodes);
            return Response.json(download);
        }
        return pendingFetch(signal, () => cancelled.push(origin));
    };
    const result = await requestYoutubeUpstream({ payload, timeoutMs: 1000 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(result.upstreamOrigin, nodes[2]);
    assert.deepEqual(cancelled, nodes.slice(0, 2));
    assert.equal(new Set(traces).size, 1);
    assert.ok(getUpstreamNodes().every((node) => node.inFlight === 0 && node.consecutiveFailures === 0));
});

test("fast business errors and malformed successes cannot beat a later download", async (t) => {
    const nodes = setup(t);
    globalThis.fetch = async (url) => {
        const origin = new URL(url).origin;
        if (origin === nodes[0]) return Response.json({ status: "error", error: { code: "error.api.youtube.timeout" } });
        if (origin === nodes[1]) return Response.json({ status: "tunnel" });
        await new Promise((resolve) => setImmediate(resolve));
        return Response.json(download);
    };
    assert.equal((await requestYoutubeUpstream({ payload })).upstreamOrigin, nodes[2]);
});

test("a node timing out does not cancel a peer still reading a valid response body", async (t) => {
    const nodes = setup(t, 2);
    globalThis.fetch = async (url, { signal }) => {
        if (new URL(url).origin === nodes[0]) return pendingFetch(signal);
        return {
            ok: true, status: 200, headers: new Headers(),
            json: async () => {
                await new Promise((resolve) => setTimeout(resolve, 30));
                assert.equal(signal.aborted, false);
                return download;
            },
        };
    };
    const result = await requestYoutubeUpstream({ payload, timeoutMs: 10, bodyTimeoutMs: 1000 });
    assert.equal(result.upstreamOrigin, nodes[1]);
});

test("all failures preserve a business error instead of a transport error", async (t) => {
    const nodes = setup(t);
    globalThis.fetch = async (url) => {
        const origin = new URL(url).origin;
        if (origin === nodes[0]) throw new TypeError("network failed");
        if (origin === nodes[1]) return Response.json({ status: "error", error: { code: "error.api.youtube.login" } }, { status: 400 });
        return Response.json({ status: "error", error: { code: "error.api.youtube.timeout" } });
    };
    const result = await requestYoutubeUpstream({ payload, returnFailureResponse: true });
    assert.equal(result.status, 400);
    assert.equal(result.body.error.code, "error.api.youtube.login");
});

test("all timeouts finish and release in-flight counters", async (t) => {
    const nodes = setup(t);
    const called = [];
    globalThis.fetch = async (url, { signal }) => {
        called.push(new URL(url).origin);
        return pendingFetch(signal);
    };
    const result = await requestYoutubeUpstream({ payload, timeoutMs: 10 });
    assert.deepEqual(called, nodes);
    assert.equal(result.body.error.code, "error.api.upstream.timeout");
    assert.ok(getUpstreamNodes().every((node) => node.inFlight === 0));
});

test("at most three global nodes are used even if configured attempts is two", async (t) => {
    const nodes = setup(t, 4);
    const called = [];
    globalThis.fetch = async (url) => {
        called.push(new URL(url).origin);
        return Response.json(download);
    };
    await requestYoutubeUpstream({ payload });
    assert.deepEqual(called, nodes.slice(0, 3));
    called.length = 0;
    await requestYoutubeUpstream({ payload });
    assert.deepEqual(called, [nodes[3], nodes[0], nodes[1]]);
});

test("circuit-open and self nodes are skipped; no available nodes preserves circuit error", async (t) => {
    const nodes = setup(t);
    getUpstreamNodes()[0].circuitOpenUntil = Date.now() + 60000;
    env.apiURL = nodes[1];
    const called = [];
    globalThis.fetch = async (url) => {
        called.push(new URL(url).origin);
        return Response.json(download);
    };
    assert.equal((await requestYoutubeUpstream({ payload })).upstreamOrigin, nodes[2]);
    assert.deepEqual(called, [nodes[2]]);
    getUpstreamNodes()[2].circuitOpenUntil = Date.now() + 60000;
    called.length = 0;
    const result = await requestYoutubeUpstream({ payload, returnFailureResponse: true });
    assert.equal(result.body.error.code, "error.api.upstream.circuit_open");
    assert.deepEqual(called, []);
});

test("redirect and local processing downloads are supported", async (t) => {
    setup(t, 1);
    for (const body of [
        { status: "redirect", url: "https://cdn.example/audio.mp3" },
        { status: "local-processing", tunnel: ["https://cdn.example/video", "https://cdn.example/audio"] },
    ]) {
        globalThis.fetch = async () => Response.json(body);
        assert.deepEqual((await requestYoutubeUpstream({ payload })).body, body);
    }
});

test("an empty global pool returns unavailable without calling domestic nodes", async (t) => {
    setup(t, 0);
    globalThis.fetch = async () => assert.fail("domestic node must not be called");
    const result = await requestYoutubeUpstream({ payload, returnFailureResponse: true });
    assert.equal(result.body.error.code, "error.api.upstream.unavailable");
});

test("YouTube API entry races three nodes while retaining duration checks", async (t) => {
    const nodes = setup(t);
    const previousRole = process.env.IS_UPSTREAM_SERVER;
    process.env.IS_UPSTREAM_SERVER = "false";
    t.after(() => {
        if (previousRole === undefined) delete process.env.IS_UPSTREAM_SERVER;
        else process.env.IS_UPSTREAM_SERVER = previousRole;
    });
    const { default: match } = await import("../match.js");
    let duration = 15;
    const called = [];
    globalThis.fetch = async (url, { signal }) => {
        const origin = new URL(url).origin;
        called.push(origin);
        if (origin !== nodes[2]) return pendingFetch(signal);
        assert.equal(called.length, 3);
        return Response.json({ status: "redirect", url: download.url, duration });
    };
    const request = { host: "youtube", patternMatch: { id: "abcdefghijk" }, params: payload };
    assert.equal((await match(request)).body.url, download.url);
    await new Promise((resolve) => setImmediate(resolve));
    called.length = 0;
    duration = env.durationLimit + 1;
    assert.equal((await match(request)).body.error.code, "error.api.content.too_long");
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(getUpstreamNodes().every((node) => node.inFlight === 0));
});
