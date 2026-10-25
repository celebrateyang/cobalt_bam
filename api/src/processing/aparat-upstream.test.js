import test from "node:test";
import assert from "node:assert/strict";
import { isAparatDirectResponse, isAparatPlaylistResponse, requestAparatUpstream } from "./aparat-upstream.js";
import { resolveRegionPlan } from "./upstream/request.js";

const url = "https://edge.cdn.asset.aparat.com/aparat-video/test.mp4?sig=keep";
const direct = { status: "redirect", service: "aparat", url, directUrl: url, directUrlCandidates: [url] };
test("accepts only direct Aparat resources, refusing tunnel and fallback responses", () => {
    assert.equal(isAparatDirectResponse(direct), true);
    for (const patch of [{ status: "tunnel" }, { url: "https://api.test/tunnel?id=1" },
        { directUrl: "https://evil.test/file.mp4" }, { tunnelUrl: "https://api.test/tunnel" },
        { fallback: { url: "https://api.test/tunnel" } }, { directUrlCandidates: ["https://evil.test/file.mp4"] }]) {
        assert.equal(isAparatDirectResponse({ ...direct, ...patch }), false);
    }
    const local = { service: "aparat", status: "local-processing", tunnel: [], source: { kind: "direct", urls: [url] } };
    assert.equal(isAparatDirectResponse(local), true);
    assert.equal(isAparatDirectResponse({ ...local, tunnel: ["https://api.test/tunnel"] }), false);
    assert.equal(isAparatDirectResponse({ ...local, source: { kind: "direct", urls: ["https://evil.test/video.mp4"] } }), false);
});
test("playlist relay accepts only public Aparat page references", () => {
    const body = { status: "ok", service: "aparat", kind: "aparat-playlist", items: [{ url: "https://www.aparat.com/v/7R9YB" }] };
    assert.equal(isAparatPlaylistResponse(body), true);
    assert.equal(isAparatPlaylistResponse({ ...body, items: [{ url }] }), false);
    assert.equal(isAparatPlaylistResponse({ ...body, items: [] }), false);
});
test("Aparat extraction routes only to home nodes, including playlists and Shorts", () => {
    for (const host of ["aparat.com", "www.aparat.com", "shorts.aparat.com"]) {
        assert.deepEqual(resolveRegionPlan({ service: "aparat", targetHost: host }), { name: "cn-only", groups: [["cn"]] });
    }
});
test("upstream role never forwards Aparat back to another node", async () => {
    const old = process.env.IS_UPSTREAM_SERVER;
    process.env.IS_UPSTREAM_SERVER = "true";
    try { assert.equal(await requestAparatUpstream({ url: "https://www.aparat.com/playlist/531891" }, { expand: true }), null); }
    finally { if (old === undefined) delete process.env.IS_UPSTREAM_SERVER; else process.env.IS_UPSTREAM_SERVER = old; }
});
