import assert from "node:assert/strict";
import test from "node:test";

import tencentVideo, {
    parseTencentResponse,
    resolveTencentVideo,
} from "./tencent-video.js";

const responseBody = {
    em: 0,
    vl: {
        vi: [{
            fn: "video.mp4",
            fvkey: "key",
            ti: "Public video title",
            fs: 16350516,
            vw: 1280,
            vh: 720,
            td: "197.313",
            drm: 0,
            ul: { ui: [{ url: "http://203.0.113.10/path/" }] },
        }],
    },
};

const createFetch = (body = responseBody) => async () => new Response(
    `QZOutputJson=${JSON.stringify(body)};`,
    { status: 200 },
);

test("parses Tencent JSONP responses", () => {
    assert.deepEqual(
        parseTencentResponse(`QZOutputJson=${JSON.stringify({ em: 0 })};`),
        { em: 0 },
    );
});

test("resolves Tencent Video metadata and HTTPS CDN candidates", async () => {
    const result = await resolveTencentVideo({
        id: "a35151vt3pb",
        kind: "tencent_video",
    }, createFetch());

    assert.equal(result.title, "Public video title");
    assert.equal(result.width, 1280);
    assert.equal(result.height, 720);
    assert.equal(result.duration, 197.313);
    assert.equal(result.filesize, 16350516);
    assert.deepEqual(result.urls, [
        "https://ugcws.video.gtimg.com/path/video.mp4?vkey=key",
        "https://apd-vlive.apdcdn.tc.qq.com/path/video.mp4?vkey=key",
    ]);
});

test("builds a Tencent Video Direct Bridge result", async () => {
    const result = await tencentVideo({
        videoId: "a35151vt3pb",
        fetchImpl: createFetch(),
    });

    assert.equal(result.service, "tencent_video");
    assert.equal(result.directClientDownload, true);
    assert.equal(result.urls, "https://ugcws.video.gtimg.com/path/video.mp4?vkey=key");
    assert.deepEqual(result.urlCandidates, [
        "https://apd-vlive.apdcdn.tc.qq.com/path/video.mp4?vkey=key",
    ]);
    assert.equal(result.filenameAttributes.title, "Public video title");
    assert.equal(result.filenameAttributes.resolution, "1280x720");
});

test("rejects DRM-protected Tencent Video responses", async () => {
    const drmBody = structuredClone(responseBody);
    drmBody.vl.vi[0].drm = 1;

    const result = await tencentVideo({
        videoId: "a35151vt3pb",
        fetchImpl: createFetch(drmBody),
    });

    assert.deepEqual(result, { error: "fetch.empty" });
});
