import assert from "node:assert/strict";
import test from "node:test";
import { env } from "../config.js";
import { refreshUpstreamPool } from "./upstream/pool.js";

test("YouTube upstream errors reach the client without changing their meaning", async (t) => {
    const previousRole = process.env.IS_UPSTREAM_SERVER;
    process.env.IS_UPSTREAM_SERVER = "false";
    const { default: match } = await import("./match.js");
    const keys = ["apiURL", "upstreamURLs", "upstreamGlobalURLs", "upstreamCnURLs"];
    const previous = Object.fromEntries(keys.map((key) => [key, env[key]]));
    const originalFetch = globalThis.fetch;
    t.after(() => {
        if (previousRole === undefined) delete process.env.IS_UPSTREAM_SERVER;
        else process.env.IS_UPSTREAM_SERVER = previousRole;
        Object.assign(env, previous);
        globalThis.fetch = originalFetch;
        refreshUpstreamPool();
    });
    env.apiURL = "http://localhost:9000/";
    env.upstreamURLs = env.upstreamCnURLs = [];
    env.upstreamGlobalURLs = ["https://api3.example.com"];
    refreshUpstreamPool();

    for (const error of [
        { code: "error.api.fetch.fail", context: { service: "youtube" } },
        { code: "error.api.youtube.login" },
        { code: "error.api.content.too_long", context: { limit: 180 } },
    ]) {
        globalThis.fetch = async () => Response.json({ status: "error", error }, { status: 400 });
        const result = await match({
            host: "youtube",
            patternMatch: { id: "abcdefghijk" },
            params: { url: new URL("https://www.youtube.com/watch?v=abcdefghijk") },
        });
        assert.deepEqual(result.body, { status: "error", error });
    }
});
