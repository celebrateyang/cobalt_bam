import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
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

test("discarding a rejected playlist consumes a later Undici abort error", async () => {
    const body = new EventEmitter();
    body.destroyed = false;
    body.destroy = () => {
        body.destroyed = true;
        queueMicrotask(() => {
            const error = new Error("Request aborted");
            error.code = "UND_ERR_ABORTED";
            body.emit("error", error);
        });
    };

    discardProxyResponseBody(body);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(body.destroyed, true);
});
