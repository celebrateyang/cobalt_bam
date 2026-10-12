import assert from "node:assert/strict";
import test from "node:test";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { getRedirectingURL } from "./utils.js";

test("reads fetch redirect headers when undici cannot resolve a Reddit share", async (t) => {
    const previous = getGlobalDispatcher();
    const agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
    t.after(async () => {
        setGlobalDispatcher(previous);
        await agent.close();
    });
    const calls = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
        calls.push(options.method);
        assert.equal(options.redirect, "manual");
        return new Response(null, {
            status: options.method === "HEAD" ? 403 : 302,
            headers: options.method === "HEAD" ? {} : {
                location: "/r/mssinn/comments/1lnz1eh/so_thicc_and_hot/",
            },
        });
    });
    assert.equal(
        await getRedirectingURL("https://www.reddit.com/r/mssinn/s/Ghsp0Vzu2j"),
        "https://www.reddit.com/r/mssinn/comments/1lnz1eh/so_thicc_and_hot/",
    );
    assert.deepEqual(calls, ["HEAD", "GET"]);
});

test("keeps undici redirects and rejects non-redirect location headers", async (t) => {
    const previous = getGlobalDispatcher();
    const agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
    t.after(async () => {
        setGlobalDispatcher(previous);
        await agent.close();
    });
    agent.get("https://www.reddit.com").intercept({ path: "/share", method: "HEAD" })
        .reply(301, "", { headers: { location: "/comments/1lnz1eh" } });
    assert.equal(await getRedirectingURL("https://www.reddit.com/share"),
        "https://www.reddit.com/comments/1lnz1eh");
    t.mock.method(globalThis, "fetch", async () => new Response(null, {
        status: 403, headers: { location: "/comments/other" },
    }));
    assert.equal(await getRedirectingURL("https://www.reddit.com/blocked"), undefined);
});
