import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import { discardProxyResponseBody, getProxyCandidateUrls } from "./proxy.js";

test("uses all Bilibili media candidates in priority order", () => {
    assert.deepEqual(getProxyCandidateUrls({
        service: "bilibili",
        urls: "https://cos.example/video.m4s",
        urlCandidates: [
            "https://cos.example/video.m4s",
            "https://ali.example/video.m4s",
            "https://origin.example/video.m4s",
        ],
    }), [
        "https://cos.example/video.m4s",
        "https://ali.example/video.m4s",
        "https://origin.example/video.m4s",
    ]);
});

test("does not change proxy behavior for other services", () => {
    assert.deepEqual(getProxyCandidateUrls({
        service: "youtube",
        urls: "https://primary.example/video.mp4",
        urlCandidates: ["https://backup.example/video.mp4"],
    }), ["https://primary.example/video.mp4"]);
});

test("discarding a failed CDN response consumes the asynchronous stream error", async () => {
    const body = new PassThrough();
    discardProxyResponseBody(body);

    await new Promise((resolve) => body.once("close", resolve));
    assert.equal(body.destroyed, true);
});
