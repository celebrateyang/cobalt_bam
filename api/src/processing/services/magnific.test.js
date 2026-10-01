import assert from "node:assert/strict";
import test from "node:test";

import magnific, { safeMagnificMediaUrl } from "./magnific.js";

const response = (html, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => html,
});

test("accepts direct Magnific media URLs without fetching", async () => {
    const result = await magnific({
        url: new URL("https://img.magnific.com/free-photo/sample_123.jpg?w=1600"),
        fetchImpl: () => assert.fail("direct media must not fetch"),
    });
    assert.equal(result.urls, "https://img.magnific.com/free-photo/sample_123.jpg?w=1600");
    assert.equal(result.isPhoto, true);
    assert.equal(result.directClientDownload, true);
});

test("extracts image and video metadata from public free pages", async () => {
    const image = await magnific({
        url: new URL("https://www.magnific.com/free-ai-image/bird_123.htm"),
        fetchImpl: async () => response('<meta property="og:title" content="Bird | Magnific"><meta property="og:image" content="https://img.magnific.com/free-photo/bird_23-1.jpg?w=2000">'),
    });
    assert.equal(image.urls, "https://img.magnific.com/free-photo/bird_23-1.jpg?w=2000");
    assert.equal(image.filename, "Bird.jpg");

    const video = await magnific({
        url: new URL("https://www.magnific.com/free-video/waves_456"),
        fetchImpl: async () => response('<meta property="og:video" content="https://media.magnific.com/previews/waves.mp4?token=abc"><meta property="og:image" content="https://img.magnific.com/waves.jpg">'),
    });
    assert.equal(video.urls, "https://media.magnific.com/previews/waves.mp4?token=abc");
    assert.equal(video.isPhoto, false);
});

test("rejects premium and private app pages", async () => {
    for (const pathname of ["/premium-video/example_1", "/app/projects/123", "/ai/video-generator"]) {
        const result = await magnific({
            url: new URL(`https://www.magnific.com${pathname}`),
            fetchImpl: () => assert.fail("restricted page must not fetch"),
        });
        assert.equal(result.error, "content.platform_restricted");
    }
});

test("requires browser fallback when Magnific blocks the server", async () => {
    const result = await magnific({
        url: new URL("https://www.magnific.com/free-video/waves_456"),
        fetchImpl: async () => response("blocked", 403),
    });
    assert.equal(result.error, "magnific.browser_required");
});

test("media URL allowlist rejects other hosts and non-media files", () => {
    assert.equal(safeMagnificMediaUrl("https://example.com/file.mp4"), undefined);
    assert.equal(safeMagnificMediaUrl("https://www.magnific.com/pricing"), undefined);
});
