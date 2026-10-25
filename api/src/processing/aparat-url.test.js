import assert from "node:assert/strict";
import test from "node:test";
import { extract, normalizeURL } from "./url.js";
import { testers } from "./service-patterns.js";
import { canAttemptGenericURL } from "./generic/index.js";
import { expandURL } from "./expand.js";

test("Aparat video, Shorts and embed routes use the dedicated adapter", () => {
    for (const [url, key, id] of [
        ["https://www.aparat.com/shorts/2112380547795222528?ref=share", "shortId", "2112380547795222528"],
        ["https://aparat.com/v/wP8On", "id", "wP8On"],
        ["https://www.aparat.com/video/video/embed/videohash/wP8On/vt/frame", "id", "wP8On"],
        ["https://shorts.aparat.com/shorts/2112380547795222528", "shortId", "2112380547795222528"],
    ]) {
        const result = extract(normalizeURL(url), new Set(["aparat"]));
        assert.equal(result.host, "aparat");
        assert.equal(result.patternMatch[key], id);
        assert.equal(testers.aparat(result.patternMatch), true);
    }
    assert.equal(testers.aparat({ shortId: "not-a-number" }), false);
    assert.ok(extract(normalizeURL("https://evil.aparat.com/v/test"), new Set(["aparat"])).error);
});

test("Aparat links cannot fall through to generic server tunnels", () => {
    for (const url of ["https://www.aparat.com/playlist/531891", "https://aparat.com/unknown/path", "https://evil.aparat.com/v/test"]) {
        assert.equal(canAttemptGenericURL(url), false);
    }
    assert.equal(canAttemptGenericURL("https://example.com/video"), true);
});

test("the public expansion router recognizes Aparat playlists", async (t) => {
    t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
        data: { attributes: { title: "Public playlist", cnt: 1 }, relationships: { video: { data: [{ type: "Video", id: "relationship-id" }] } } },
        included: [{ type: "Video", id: "relationship-id", attributes: { id: "different-id", uid: "wP8On", title: "Video" } }],
    })));
    const result = await expandURL("https://www.aparat.com/playlist/531891");
    assert.equal(result.kind, "aparat-playlist");
    assert.equal(result.items[0].url, "https://www.aparat.com/v/wP8On");
});
