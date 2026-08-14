import assert from "node:assert/strict";
import test from "node:test";

import { buildWechatChannelResult } from "./wechat-channels.js";

test("prefers H.264 and retains H.265 as a Direct Bridge fallback", () => {
    const h264 = "https://finder.video.qq.com/251/h264.mp4";
    const h265 = "https://finder.video.qq.com/251/h265.mp4";
    const result = buildWechatChannelResult({
        title: "A video",
        author: "Creator",
        duration: 743_713,
        cover: "https://example.com/cover.jpg",
        videos: [
            { codec: "h265", url: h265, width: 1328, height: 720 },
            { codec: "h264", url: h264, width: 1328, height: 720 },
        ],
    }, "AievImkslV");

    assert.equal(result.urls, h264);
    assert.deepEqual(result.urlCandidates, [h265]);
    assert.equal(result.directClientDownload, true);
    assert.equal(result.duration, 744);
    assert.equal(result.filenameAttributes.extension, "mp4");
    assert.equal(result.filenameAttributes.resolution, "1328x720");
});

test("fails cleanly when Finder returns no downloadable video", () => {
    assert.deepEqual(
        buildWechatChannelResult({ videos: [] }, "AievImkslV"),
        { error: "fetch.fail" },
    );
});
