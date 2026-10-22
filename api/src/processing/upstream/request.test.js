import assert from "node:assert/strict";
import test from "node:test";

import {
    buildUpstreamDownloadBody,
    isStructuredUpstreamError,
    resolveRegionPlan,
    requestUpstream,
} from "./request.js";
import { env } from "../../config.js";
import { refreshUpstreamPool } from "./pool.js";

const setupInstagramPool = (t) => {
    const keys = ["upstreamURLs", "upstreamCnURLs", "upstreamGlobalURLs",
        "upstreamMaxAttempts", "apiURL"];
    const previous = Object.fromEntries(keys.map((key) => [key, env[key]]));
    const originalFetch = globalThis.fetch;
    t.after(() => {
        Object.assign(env, previous);
        globalThis.fetch = originalFetch;
        refreshUpstreamPool();
    });
    // Reset the cursor and circuit state for deterministic node selection.
    env.upstreamURLs = env.upstreamCnURLs = env.upstreamGlobalURLs = [];
    refreshUpstreamPool();
    env.apiURL = "http://localhost:9000/";
    env.upstreamMaxAttempts = 2;
    env.upstreamCnURLs = ["https://api2.freesavevideo.online"];
    env.upstreamGlobalURLs = [3, 5, 7].map((n) => `https://api${n}.freesavevideo.online`);
    refreshUpstreamPool();
    return env.upstreamGlobalURLs;
};

test("Instagram reaches the third global node after timeout and missing-session errors", async (t) => {
    const nodes = setupInstagramPool(t);
    const called = [];
    globalThis.fetch = async (url, { signal }) => {
        called.push(new URL(url).origin);
        if (called.length === 1) {
            return new Promise((resolve, reject) => {
                signal.addEventListener("abort", () => reject(signal.reason), { once: true });
            });
        }
        if (called.length === 2) {
            return Response.json({ status: "error", error: { code: "error.api.fetch.empty" } }, { status: 400 });
        }
        return Response.json({ status: "redirect", url: "https://cdn.example/video.mp4" });
    };
    const result = await requestUpstream({
        service: "instagram", payload: { url: "https://www.instagram.com/reel/example/" },
        timeoutMs: 10,
        acceptResponse: ({ body }) => body.status === "redirect",
    });
    assert.deepEqual(called, nodes);
    assert.equal(result.upstreamOrigin, nodes[2]);
    assert.equal(result.body.status, "redirect");
});

test("Instagram stops when an earlier node gains a working session", async (t) => {
    const nodes = setupInstagramPool(t);
    const called = [];
    globalThis.fetch = async (url) => {
        called.push(new URL(url).origin);
        return called.length === 1
            ? Response.json({ status: "error", error: { code: "error.api.fetch.empty" } }, { status: 400 })
            : Response.json({ status: "redirect", url: "https://cdn.example/video.mp4" });
    };
    const result = await requestUpstream({ service: "instagram", payload: { url: "https://www.instagram.com/p/example/" } });
    assert.deepEqual(called, nodes.slice(0, 2));
    assert.equal(result.upstreamOrigin, nodes[1]);
});

test("Instagram tries each node once when all sessions fail", async (t) => {
    const nodes = setupInstagramPool(t);
    const called = [];
    globalThis.fetch = async (url) => {
        called.push(new URL(url).origin);
        return Response.json({ status: "error", error: { code: "error.api.fetch.empty" } }, { status: 400 });
    };
    const result = await requestUpstream({ service: "instagram", payload: { url: "https://www.instagram.com/p/example/" } });
    assert.deepEqual(called, nodes);
    assert.equal(result.body.error.code, "error.api.fetch.empty");
});

test("other services retain their timeout stop behavior", async (t) => {
    const nodes = setupInstagramPool(t);
    const called = [];
    globalThis.fetch = async (url, { signal }) => {
        called.push(new URL(url).origin);
        return new Promise((resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
    };
    const result = await requestUpstream({ service: "twitter", payload: { url: "https://twitter.com/example/status/123" }, timeoutMs: 10 });
    assert.deepEqual(called, nodes.slice(0, 1));
    assert.equal(result.body.error.code, "error.api.upstream.timeout");
});

test("forwards the Bilibili Direct Bridge intent to a regional upstream", () => {
    assert.deepEqual(
        buildUpstreamDownloadBody({
            url: new URL("https://www.bilibili.com/video/BV1HpEG6DEa7/"),
            bilibiliDirectBridge: true,
            ignored: "value",
        }),
        {
            url: "https://www.bilibili.com/video/BV1HpEG6DEa7/",
            bilibiliDirectBridge: true,
        },
    );
});

test("routes WeChat Channels only to the domestic upstream", () => {
    assert.deepEqual(
        resolveRegionPlan({
            service: "weixin.qq.com",
            targetHost: "weixin.qq.com",
            path: "/",
        }),
        {
            name: "cn-only",
            groups: [["cn"]],
        },
    );
});

test("routes Tencent Video to the domestic upstream first", () => {
    assert.deepEqual(
        resolveRegionPlan({
            service: "v.qq.com",
            targetHost: "v.qq.com",
            path: "/x/page/a35151vt3pb.html",
        }),
        {
            name: "cn-first",
            groups: [["cn"], ["global"]],
        },
    );
});

test("routes SOOP and legacy domains only to the home session upstream", () => {
    for (const host of ["vod.sooplive.com", "vod.sooplive.co.kr", "vod.afreecatv.com"]) {
        assert.deepEqual(resolveRegionPlan({ service: host, targetHost: host, path: "/" }), {
            name: "cn-only", groups: [["cn"]],
        });
    }
    assert.deepEqual(resolveRegionPlan({ service: "sooplive", path: "/" }), {
        name: "cn-only", groups: [["cn"]],
    });
});

test("routes Reddit share fallback only to global upstreams", () => {
    assert.deepEqual(resolveRegionPlan({
        service: "www.reddit.com", targetHost: "www.reddit.com", path: "/",
    }), { name: "global-only", groups: [["global"]] });
});

test("fails over after a structured 4xx business error", () => {
    assert.equal(
        isStructuredUpstreamError({
            responseOk: false,
            body: {
                status: "error",
                error: { code: "error.api.fetch.fail" },
            },
        }),
        true,
    );

    assert.equal(
        isStructuredUpstreamError({
            responseOk: false,
            body: { message: "unauthorized" },
        }),
        false,
    );
});

test("never sends a pinned SOOP request to another domestic node", async (t) => {
    const previous = {
        upstreamURLs: env.upstreamURLs,
        upstreamCnURLs: env.upstreamCnURLs,
        upstreamGlobalURLs: env.upstreamGlobalURLs,
        apiURL: env.apiURL,
    };
    const originalFetch = globalThis.fetch;
    t.after(() => {
        Object.assign(env, previous);
        globalThis.fetch = originalFetch;
        refreshUpstreamPool();
    });
    env.apiURL = "http://localhost:9000/";
    env.upstreamURLs = [];
    env.upstreamCnURLs = ["https://api2.freesavevideo.online", "https://api4.freesavevideo.online"];
    env.upstreamGlobalURLs = ["https://api3.freesavevideo.online"];
    refreshUpstreamPool();
    const called = [];
    globalThis.fetch = async (url) => {
        called.push(new URL(url).origin);
        return Response.json({ status: "error", error: { code: "error.api.sooplive.age" } }, { status: 400 });
    };
    const result = await requestUpstream({
        service: "sooplive",
        payload: { url: "https://vod.sooplive.com/player/209840699/catch" },
        allowedUpstreamOrigins: [env.upstreamCnURLs[0]],
        maxAttempts: 3,
        returnFailureResponse: true,
    });
    assert.deepEqual(called, ["https://api2.freesavevideo.online"]);
    assert.equal(result.body.error.code, "error.api.sooplive.age");
    called.length = 0;
    await requestUpstream({
        service: "sooplive", payload: { url: "https://vod.sooplive.com/player/123" },
        allowedUpstreamOrigins: [], returnFailureResponse: true,
    });
    assert.deepEqual(called, []);
});
