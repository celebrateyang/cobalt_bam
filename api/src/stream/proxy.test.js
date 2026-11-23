import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { createServer } from "node:http";
import { PassThrough } from "node:stream";
import test from "node:test";
import express from "express";

import proxy, { discardProxyResponseBody, getProxyCandidateUrls } from "./proxy.js";

test("YouTube proxy propagates upstream interruption after partial output", async t => {
    const source = createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'video/mp4' });
        res.write('partial');
        setTimeout(() => res.destroy(), 50);
    });
    source.listen(0, '127.0.0.1');
    await once(source, 'listening');
    const app = express();
    app.get('/', (req, res) => proxy({
        service: 'youtube', filename: 'video.mp4', urls: `http://127.0.0.1:${source.address().port}/video`,
    }, res));
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => { source.close(); server.close(); source.closeAllConnections(); server.closeAllConnections(); });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(response.status, 200);
    await assert.rejects(response.text());
});

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
