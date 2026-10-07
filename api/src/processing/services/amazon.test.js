import assert from "node:assert/strict";
import test from "node:test";

import amazon, {
    extractAmazonLiveMetadata,
    selectAmazonLiveVariant,
} from "./amazon.js";

test("extracts Amazon Live metadata from JSON-LD", () => {
    const html = `
        <script type="application/ld+json">
        {
            "@context": "https://schema.org",
            "@type": "VideoObject",
            "name": "Example &amp; demo",
            "contentUrl": "https://m.media-amazon.com/path/master.m3u8",
            "duration": "PT2M14S",
            "author": {"@type": "Person", "name": "Creator"}
        }
        </script>
    `;

    assert.deepEqual(extractAmazonLiveMetadata(html), {
        manifestUrl: "https://m.media-amazon.com/path/master.m3u8",
        title: "Example & demo",
        uploader: "Creator",
        duration: "PT2M14S",
    });
});

const replayHtml = `<script type="application/ld+json">${JSON.stringify({
    "@type": "VideoObject",
    name: "Public replay",
    contentUrl: "https://m.media-amazon.com/replay/master.m3u8",
    duration: "PT43S",
})}</script>`;
const masterPlaylist = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1900000,RESOLUTION=720x1280\n720.m3u8\n";

test("falls back to VDP when the Live route returns 503", async (t) => {
    const calls = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
        calls.push({ url, options });
        return new Response(calls.length === 1 ? "Unavailable" : calls.length === 2 ? replayHtml : masterPlaylist, {
            status: calls.length === 1 ? 503 : 200,
        });
    });
    const result = await amazon({ id: "example", quality: "max", url: new URL("https://www.amazon.com/live/video/example?ref=test") });
    assert.equal(calls[1].url, "https://www.amazon.com/vdp/example?ref=test");
    assert.equal(result.urls, "https://m.media-amazon.com/replay/720.m3u8");
    assert.equal(result.headers.referer, calls[1].url);
    assert.equal(result.duration, 43);
    assert.ok(calls.every(({ options }) => options.signal instanceof AbortSignal));
});

test("falls back to Live when VDP returns a page without media", async (t) => {
    const calls = [];
    t.mock.method(globalThis, "fetch", async (url) => {
        calls.push(url);
        return new Response(calls.length === 1 ? "<title>Sorry!</title>" : calls.length === 2 ? replayHtml : masterPlaylist);
    });
    const result = await amazon({ id: "example", quality: "max", url: new URL("https://www.amazon.com/vdp/example") });
    assert.equal(calls[1], "https://www.amazon.com/live/video/example");
    assert.equal(result.service, "amazon");
});

test("does not request an alias for a working replay", async (t) => {
    const calls = [];
    t.mock.method(globalThis, "fetch", async (url) => {
        calls.push(url);
        return new Response(calls.length === 1 ? replayHtml : masterPlaylist);
    });
    assert.equal((await amazon({ id: "example", quality: "max" })).service, "amazon");
    assert.equal(calls.length, 2);
});

test("uses the alias after a timed out page request", async (t) => {
    let requests = 0;
    t.mock.method(globalThis, "fetch", async () => {
        requests++;
        if (requests === 1) throw new DOMException("Timed out", "TimeoutError");
        return new Response(requests === 2 ? replayHtml : masterPlaylist);
    });
    const result = await amazon({ id: "example", quality: "max" });
    assert.equal(result.service, "amazon");
    assert.equal(requests, 3);
});

test("bounds failed route attempts and preserves unavailable/empty errors", async (t) => {
    const mock = t.mock.method(globalThis, "fetch", async () => new Response("Unavailable", { status: 503 }));
    assert.deepEqual(await amazon({ id: "example" }), { error: "fetch.fail" });
    assert.equal(mock.mock.callCount(), 2);
    mock.mock.mockImplementation(async () => new Response("<title>No media</title>"));
    assert.deepEqual(await amazon({ id: "example" }), { error: "fetch.empty" });
    assert.equal(mock.mock.callCount(), 4);
});

test("selects the closest requested Amazon Live quality", () => {
    const variants = [
        { uri: "360.m3u8", resolution: { height: 360 }, bandwidth: 600000 },
        { uri: "720.m3u8", resolution: { height: 720 }, bandwidth: 1900000 },
        { uri: "1080.m3u8", resolution: { height: 1080 }, bandwidth: 3500000 },
    ];

    assert.equal(selectAmazonLiveVariant(variants, "720").uri, "720.m3u8");
    assert.equal(selectAmazonLiveVariant(variants, "480").uri, "360.m3u8");
    assert.equal(selectAmazonLiveVariant(variants, "max").uri, "1080.m3u8");
});
