import assert from "node:assert/strict";
import test from "node:test";
import { env } from "../../config.js";
import { getUpstreamNodes, refreshUpstreamPool } from "./pool.js";
import { requestInstagramUpstream } from "./instagram.js";

const setup = (t) => {
    const keys = ["apiURL", "upstreamURLs", "upstreamGlobalURLs", "upstreamCnURLs"];
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
    env.upstreamGlobalURLs = [3, 5, 7].map((n) => `https://api${n}.freesavevideo.online`);
    env.upstreamCnURLs = ["https://api2.freesavevideo.online"];
    refreshUpstreamPool();
    return env.upstreamGlobalURLs;
};
const payload = { url: "https://www.instagram.com/reel/example/" };

test("a working session wins without waiting for slow nodes; cancellations preserve health", async (t) => {
    const nodes = setup(t);
    const called = [];
    const cancelled = [];
    globalThis.fetch = async (url, { signal }) => {
        const origin = new URL(url).origin;
        called.push(origin);
        if (origin === nodes[2]) {
            assert.deepEqual(called, nodes);
            return Response.json({ status: "redirect", url: "https://cdn.example/video.mp4" });
        }
        return new Promise((resolve, reject) => {
            signal.addEventListener("abort", () => {
                cancelled.push(origin);
                reject(signal.reason);
            }, { once: true });
        });
    };
    const result = await requestInstagramUpstream({ payload, timeoutMs: 1000 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(result.upstreamOrigin, nodes[2]);
    assert.deepEqual(cancelled, nodes.slice(0, 2));
    for (const node of getUpstreamNodes()) {
        assert.equal(node.inFlight, 0);
        assert.equal(node.consecutiveFailures, 0);
    }
});

test("another node can win after a business error and a malformed redirect", async (t) => {
    const nodes = setup(t);
    globalThis.fetch = async (url) => {
        const origin = new URL(url).origin;
        if (origin === nodes[0]) return Response.json({ status: "redirect" });
        if (origin === nodes[2]) return Response.json({ status: "error", error: { code: "error.api.fetch.empty" } }, { status: 400 });
        return Response.json({ status: "redirect", url: "https://cdn.example/other.mp4" });
    };
    const result = await requestInstagramUpstream({ payload });
    assert.equal(result.upstreamOrigin, nodes[1]);
});

test("parallel fallback finishes when all nodes time out", async (t) => {
    const nodes = setup(t);
    const called = [];
    globalThis.fetch = async (url, { signal }) => {
        called.push(new URL(url).origin);
        return new Promise((resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
    };
    assert.equal(await requestInstagramUpstream({ payload, timeoutMs: 10 }), null);
    assert.deepEqual(called, nodes);
    assert.ok(getUpstreamNodes().every((node) => node.inFlight === 0));
});

test("circuit-open nodes are skipped and an empty eligible pool returns null", async (t) => {
    const nodes = setup(t);
    getUpstreamNodes().find((node) => node.origin === nodes[0]).circuitOpenUntil = Date.now() + 60000;
    const called = [];
    globalThis.fetch = async (url) => {
        called.push(new URL(url).origin);
        return Response.json({ status: "error", error: { code: "error.api.fetch.empty" } }, { status: 400 });
    };
    assert.equal(await requestInstagramUpstream({ payload }), null);
    assert.deepEqual(called, nodes.slice(1));
    for (const node of getUpstreamNodes()) node.circuitOpenUntil = Date.now() + 60000;
    called.length = 0;
    assert.equal(await requestInstagramUpstream({ payload }), null);
    assert.deepEqual(called, []);
});
