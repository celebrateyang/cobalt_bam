import assert from "node:assert/strict";
import test from "node:test";
import ok from "./ok.js";
import { env } from "../../config.js";

const video = {
    provider: "UPLOADED_ODKL",
    movie: { title: " Example ", duration: 90 },
    videos: [
        { name: "low", url: "https://cdn.example/low.mp4" },
        { name: "hd", url: "https://cdn.example/hd.mp4" },
        { name: "full", url: "https://cdn.example/blocked.mp4", disallowed: true },
    ],
};

const run = async (t, metadata, quality = "720") => {
    const originalFetch = globalThis.fetch;
    const limit = env.durationLimit;
    t.after(() => { globalThis.fetch = originalFetch; env.durationLimit = limit; });
    env.durationLimit = 3600;
    const options = JSON.stringify({ flashvars: { metadata } }).replaceAll('"', "&quot;");
    globalThis.fetch = async () => new Response(`<div data-module="OKVideo" class="player" data-options="${options}" >`);
    return ok({ id: "123", quality });
};

for (const format of ["object", "string"]) {
    test(`extracts progressive media from ${format} metadata`, async (t) => {
        const result = await run(t, format === "object" ? video : JSON.stringify(video));
        assert.equal(result.urls, "https://cdn.example/hd.mp4");
        assert.equal(result.filenameAttributes.title, "Example");
        assert.equal(result.filenameAttributes.resolution, "720p");
    });
}
for (const [name, metadata] of [["malformed JSON", "{"], ["missing metadata", null],
    ["missing movie", {}], ["missing renditions", { ...video, videos: null }]]) {
    test(`${name} returns fetch.empty without throwing`, async (t) => {
        assert.deepEqual(await run(t, metadata), { error: "fetch.empty" });
    });
}
test("preserves unsupported provider rejection", async (t) => {
    assert.deepEqual(await run(t, { ...video, provider: "OTHER" }), { error: "link.unsupported" });
});
test("preserves live and duration restrictions", async (t) => {
    assert.deepEqual(await run(t, { ...video, movie: { ...video.movie, is_live: true } }), { error: "content.video.live" });
    assert.deepEqual(await run(t, { ...video, movie: { ...video.movie, duration: 4000 } }), { error: "content.too_long" });
});
test("maximum quality ignores disallowed renditions", async (t) => {
    assert.equal((await run(t, video, "max")).urls, "https://cdn.example/hd.mp4");
});
