import test from "node:test";
import assert from "node:assert/strict";
import kuaishou from "./kuaishou.js";

const imageUrl = "https://cdn.example/image.jpg?clientCacheKey=keep&di=signature";
const withPage = async (photo, run) => {
    const original = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, options) => {
        calls.push({ url: String(url), method: options?.method });
        if (options?.method === "HEAD") {
            return new Response(null, { status: 302, headers: { location: "https://share.example/fw/photo/post123?shareObjectId=post123" } });
        }
        return new Response(`<script>window.INIT_STATE=${JSON.stringify({ page: { photo } })}</script>`);
    };
    try { await run(calls); } finally { globalThis.fetch = original; }
};

test("single-picture short share returns an image and preserves signed parameters", async () => {
    await withPage({ singlePicture: true, photoId: "post123", mainMvUrls: [], coverUrls: [{ url: imageUrl }] }, async (calls) => {
        const result = await kuaishou({ shortLink: "share", url: "https://kuaishou.com/_shortLink/share" });
        assert.equal(result.isPhoto, true);
        assert.equal(result.urls, imageUrl);
        assert.equal(result.filename, "kuaishou_post123.jpg");
        assert.equal(result.type, "proxy");
        assert.equal(result.audioFilename, undefined);
        assert.ok(calls.some(call => call.url === "https://v.kuaishou.com/fw/photo/post123"));
    });
});

test("SINGLE_PICTURE accepts a valid alternate cover and keeps its image extension", async () => {
    await withPage({ photoType: "SINGLE_PICTURE", photoId: "post123", coverUrls: [{ url: "javascript:bad" }, { url: "https://cdn.example/photo.webp?sig=keep" }] }, async () => {
        const result = await kuaishou({ id: "post123" });
        assert.equal(result.isPhoto, true);
        assert.equal(result.filename, "kuaishou_post123.webp");
        assert.equal(result.urls, "https://cdn.example/photo.webp?sig=keep");
    });
});

test("ordinary video still uses mainMvUrls rather than its cover", async () => {
    await withPage({ photoId: "post123", duration: 12000, mainMvUrls: [{ url: "https://cdn.example/video.mp4" }], coverUrls: [{ url: imageUrl }] }, async () => {
        const result = await kuaishou({ id: "post123" });
        assert.equal(result.isPhoto, undefined);
        assert.equal(result.urls, "https://cdn.example/video.mp4");
        assert.equal(result.duration, 12);
    });
});

test("a video with only a cover is not incorrectly returned as a photo", async () => {
    await withPage({ photoId: "post123", mainMvUrls: [], coverUrls: [{ url: imageUrl }] }, async () => {
        assert.equal((await kuaishou({ id: "post123" })).error, "fetch.fail");
    });
});

test("a single picture without a usable URL fails without inventing media", async () => {
    await withPage({ singlePicture: true, photoId: "post123", coverUrls: [{ url: null }] }, async () => {
        assert.equal((await kuaishou({ id: "post123" })).error, "fetch.fail");
    });
});
