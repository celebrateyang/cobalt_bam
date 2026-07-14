import assert from "node:assert/strict";
import test from "node:test";

import { createMediaImportToken, getMediaImportCandidate, readMediaImportToken } from "./media-import-token.js";

test.before(() => { process.env.AI_VIDEO_MEDIA_IMPORT_TOKEN_KEY = "test-only-media-import-key-32-characters"; });

test("media import token is encrypted, user-bound, expiring, and authenticated", () => {
    const token = createMediaImportToken({ userId: 7, url: "https://cdn.example/video.mp4?secret=yes", service: "test", filename: "video.mp4", now: 1000, ttlMs: 5000 });
    assert.equal(token.includes("cdn.example"), false);
    const payload = readMediaImportToken(token, { expectedUserId: 7, now: 2000 });
    assert.equal(payload.url, "https://cdn.example/video.mp4?secret=yes");
    assert.throws(() => readMediaImportToken(token, { expectedUserId: 8, now: 2000 }), { code: "AI_VIDEO_IMPORT_TOKEN_USER_MISMATCH" });
    assert.throws(() => readMediaImportToken(token, { expectedUserId: 7, now: 7000 }), { code: "AI_VIDEO_IMPORT_TOKEN_EXPIRED" });
    assert.throws(() => readMediaImportToken(`${token}x`, { expectedUserId: 7, now: 2000 }), { code: "AI_VIDEO_IMPORT_TOKEN_INVALID" });
});

test("only single downloadable video responses become import candidates", () => {
    assert.deepEqual(getMediaImportCandidate({ status: "redirect", directUrl: "https://cdn.example/v.mp4", url: "https://fallback.example/v.mp4", filename: "v.mp4", service: "demo" }), {
        url: "https://cdn.example/v.mp4", service: "demo", filename: "v.mp4", mime: "video/mp4",
    });
    assert.equal(getMediaImportCandidate({ status: "picker", filename: "v.mp4" }), null);
    assert.equal(getMediaImportCandidate({ status: "redirect", url: "https://cdn.example/a.mp3", filename: "a.mp3" }), null);
});
