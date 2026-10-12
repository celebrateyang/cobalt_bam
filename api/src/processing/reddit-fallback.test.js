import assert from "node:assert/strict";
import test from "node:test";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";

process.env.IS_UPSTREAM_SERVER = "false";
const { default: match } = await import("./match.js");
const { env } = await import("../config.js");
const { refreshUpstreamPool } = await import("./upstream/pool.js");

test("blocked Reddit shares and posts fall back globally with download options", async (t) => {
    const previous = getGlobalDispatcher();
    const agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
    const saved = [env.upstreamURLs, env.upstreamGlobalURLs, env.upstreamCnURLs];
    env.upstreamURLs = [];
    env.upstreamGlobalURLs = ["https://reddit-upstream.example"];
    env.upstreamCnURLs = ["https://domestic.example"];
    refreshUpstreamPool();
    t.after(async () => {
        [env.upstreamURLs, env.upstreamGlobalURLs, env.upstreamCnURLs] = saved;
        refreshUpstreamPool();
        setGlobalDispatcher(previous);
        await agent.close();
    });
    let upstreamOk = true;
    const forwarded = [];
    t.mock.method(globalThis, "fetch", async (input, options) => {
        if (String(input).startsWith("https://www.reddit.com/")) {
            return new Response("blocked", { status: 403 });
        }
        assert.equal(String(input), "https://reddit-upstream.example/");
        forwarded.push(JSON.parse(options.body));
        return Response.json(upstreamOk ? {
            status: "tunnel", url: "https://reddit-upstream.example/tunnel?id=test", service: "reddit",
            filename: "reddit_mssinn_1lnz1eh.mp4", duration: 15,
        } : { status: "error", error: { code: "error.api.fetch.fail" } }, {
            status: upstreamOk ? 200 : 400,
        });
    });
    for (const [path, patternMatch] of [
        ["/r/mssinn/s/Ghsp0Vzu2j", { sub: "mssinn", shareId: "Ghsp0Vzu2j" }],
        ["/r/mssinn/comments/1lnz1eh/so_thicc_and_hot", { sub: "mssinn", id: "1lnz1eh", title: "so_thicc_and_hot" }],
    ]) {
        const url = new URL(path, "https://www.reddit.com");
        const result = await match({ host: "reddit", patternMatch,
            params: { url, downloadMode: "audio", videoQuality: "720" } });
        assert.equal(result.body.status, "tunnel");
        assert.equal(result.body.url, "https://reddit-upstream.example/tunnel?id=test");
        assert.equal(result.body.duration, 15);
        assert.equal(forwarded.at(-1).url, url.toString());
        assert.equal(forwarded.at(-1).downloadMode, "audio");
        assert.equal(forwarded.at(-1).videoQuality, "720");
    }
    upstreamOk = false;
    const result = await match({ host: "reddit",
        patternMatch: { sub: "mssinn", shareId: "Ghsp0Vzu2j" },
        params: { url: new URL("https://www.reddit.com/r/mssinn/s/Ghsp0Vzu2j") } });
    assert.equal(result.body.error.code, "error.api.fetch.short_link");
});
