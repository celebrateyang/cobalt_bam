import assert from "node:assert/strict";
import test from "node:test";

import matchAction from "./match-action.js";

const baseArgs = {
    host: "youtube",
    isBatchRequest: false,
    audioFormat: "best",
    isAudioOnly: false,
    isAudioMuted: false,
    disableMetadata: false,
    filenameStyle: "basic",
    convertGif: false,
    requestIP: "127.0.0.1",
    audioBitrate: "128",
    alwaysProxy: false,
    localProcessing: "disabled",
};

const youtubeResult = {
    type: "proxy",
    forceRedirect: true,
    urls: "https://video.example/media.mp4",
    filename: "video.mp4",
    duration: 60,
};

test("keeps ordinary YouTube direct downloads on the redirect path", () => {
    const response = matchAction({
        ...baseArgs,
        r: youtubeResult,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "redirect");
    assert.equal(response.body.url, youtubeResult.urls);
});

test("keeps forced YouTube batch downloads in the processing queue", () => {
    const response = matchAction({
        ...baseArgs,
        r: youtubeResult,
        isBatchRequest: true,
        alwaysProxy: true,
        localProcessing: "forced",
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "local-processing");
    assert.equal(response.body.type, "proxy");
    assert.equal(response.body.output.filename, youtubeResult.filename);
    assert.equal(Array.isArray(response.body.tunnel), true);
    assert.equal(response.body.tunnel.length, 1);
});

test("returns a Bilibili progressive MP4 as a Direct Bridge redirect", () => {
    const directUrl = "https://cdn.example/bilibili-progressive.mp4";
    const response = matchAction({
        ...baseArgs,
        host: "bilibili",
        r: {
            urls: directUrl,
            urlCandidates: [directUrl, "https://backup.example/video.mp4"],
            directClientDownload: true,
            filename: "video.mp4",
            duration: 120,
        },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "redirect");
    assert.equal(response.body.url, directUrl);
    assert.equal(response.body.directUrl, directUrl);
    assert.deepEqual(response.body.directUrlCandidates, [
        directUrl,
        "https://backup.example/video.mp4",
    ]);
});
