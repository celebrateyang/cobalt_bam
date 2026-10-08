import assert from "node:assert/strict";
import test from "node:test";

import { isBrowserQueuedDownload } from "./browser-queue.js";

test("treats WeChat batch redirects as browser queued downloads", () => {
    assert.equal(isBrowserQueuedDownload({
        request: { batch: true, localProcessing: "forced" },
        response: { status: "redirect", service: "wechat_channels" },
    }), true);
});

test("keeps single WeChat redirects as immediate direct downloads", () => {
    assert.equal(isBrowserQueuedDownload({
        request: { batch: false },
        response: { status: "redirect", service: "wechat_channels" },
    }), false);
});

test("preserves existing local-processing and forced tunnel behavior", () => {
    assert.equal(isBrowserQueuedDownload({
        request: {},
        response: { status: "local-processing", service: "youtube" },
    }), true);
    assert.equal(isBrowserQueuedDownload({
        request: { localProcessing: "forced" },
        response: { status: "tunnel", service: "youtube" },
    }), true);
});

test("defers server processing tunnels with local processing disabled", () => {
    for (const type of ["merge", "remux", "mute", "audio", "gif"]) {
        assert.equal(isBrowserQueuedDownload({
            request: { localProcessing: "disabled" },
            response: { status: "tunnel", service: "youtube", type },
        }), true);
    }
    for (const type of [undefined, "proxy"]) {
        assert.equal(isBrowserQueuedDownload({
            request: { localProcessing: "disabled" },
            response: { status: "tunnel", type },
        }), false);
    }
});
