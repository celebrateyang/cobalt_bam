import test from "node:test";
import assert from "node:assert/strict";

import { buildYoutubeResult } from "./youtube.js";

const mediaUrl = (itag) =>
    `https://rr.example.googlevideo.com/videoplayback?itag=${itag}&c=VISIONOS`;

const buildResult = (formats) => buildYoutubeResult({
    info: {
        id: "video-id",
        title: "Codec fallback",
        duration: 30,
        formats,
    },
    o: {
        id: "video-id",
        codec: "av1",
        container: "auto",
        isAudioOnly: false,
        isAudioMuted: false,
    },
    requestClientIp: "",
    targetQuality: 1080,
});

test("falls back from unavailable AV1 to VP9", () => {
    const result = buildResult([
        {
            format_id: "248",
            ext: "webm",
            width: 1920,
            height: 1080,
            tbr: 2500,
            vcodec: "vp9",
            acodec: "none",
            url: mediaUrl("248"),
        },
        {
            format_id: "251",
            ext: "webm",
            tbr: 130,
            vcodec: "none",
            acodec: "opus",
            url: mediaUrl("251"),
        },
    ]);

    assert.equal(result.error, undefined);
    assert.equal(result.type, "merge");
    assert.deepEqual(result.originalRequest.itag, {
        video: "248",
        audio: "251",
    });
    assert.equal(result.filenameAttributes.extension, "webm");
    assert.equal(result.filenameAttributes.youtubeFormat, "vp9");
});

test("keeps AV1 when the requested codec is available", () => {
    const result = buildResult([
        {
            format_id: "399",
            ext: "mp4",
            width: 1920,
            height: 1080,
            tbr: 2200,
            vcodec: "av01.0.08M.08",
            acodec: "none",
            url: mediaUrl("399"),
        },
        {
            format_id: "140",
            ext: "m4a",
            tbr: 130,
            vcodec: "none",
            acodec: "mp4a.40.2",
            url: mediaUrl("140"),
        },
    ]);

    assert.equal(result.error, undefined);
    assert.equal(result.type, "merge");
    assert.equal(result.originalRequest.itag.video, "399");
    assert.equal(result.filenameAttributes.extension, "mp4");
    assert.equal(result.filenameAttributes.youtubeFormat, "av1");
});
