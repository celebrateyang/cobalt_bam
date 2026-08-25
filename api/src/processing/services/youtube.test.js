import test from "node:test";
import assert from "node:assert/strict";

import createFilename from "../create-filename.js";
import { buildYoutubeResult } from "./youtube.js";

const mediaUrl = (itag) =>
    `https://rr.example.googlevideo.com/videoplayback?itag=${itag}&c=VISIONOS`;

const buildResult = (formats, overrides = {}, targetQuality = 1080) => buildYoutubeResult({
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
        ...overrides,
    },
    requestClientIp: "",
    targetQuality,
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
    assert.equal(
        createFilename(result.filenameAttributes, "classic", false, false),
        "Codec fallback_youtube_video-id_1920x1080_vp9.webm",
    );
});

test("writes AV1 with Opus as WebM instead of an AV1 MP4", () => {
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
        video: "399",
        audio: "251",
    });
    assert.equal(result.filenameAttributes.extension, "webm");
    assert.equal(result.filenameAttributes.youtubeFormat, "av1");
});

test("treats an explicit MP4 request as H.264 plus AAC", () => {
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
            format_id: "137",
            ext: "mp4",
            width: 1920,
            height: 1080,
            tbr: 4000,
            vcodec: "avc1.640028",
            acodec: "none",
            url: mediaUrl("137"),
        },
        {
            format_id: "140",
            ext: "m4a",
            tbr: 130,
            vcodec: "none",
            acodec: "mp4a.40.2",
            url: mediaUrl("140"),
        },
    ], {
        codec: "av1",
        container: "mp4",
    });

    assert.equal(result.error, undefined);
    assert.equal(result.type, "merge");
    assert.deepEqual(result.originalRequest.itag, {
        video: "137",
        audio: "140",
    });
    assert.equal(result.filenameAttributes.extension, "mp4");
    assert.equal(result.filenameAttributes.youtubeFormat, "h264");
});

test("does not silently fall back from H.264 to VP9", () => {
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
    ], {
        codec: "h264",
    });

    assert.equal(result.error, "youtube.no_matching_format");
});

test("caps compatible H.264 MP4 output at 1080p", () => {
    const result = buildResult([
        {
            format_id: "h264-2160",
            ext: "mp4",
            width: 3840,
            height: 2160,
            tbr: 9000,
            vcodec: "avc1.640033",
            acodec: "none",
            url: mediaUrl("h264-2160"),
        },
        {
            format_id: "137",
            ext: "mp4",
            width: 1920,
            height: 1080,
            tbr: 4000,
            vcodec: "avc1.640028",
            acodec: "none",
            url: mediaUrl("137"),
        },
        {
            format_id: "140",
            ext: "m4a",
            tbr: 130,
            vcodec: "none",
            acodec: "mp4a.40.2",
            url: mediaUrl("140"),
        },
    ], {
        codec: "h264",
    }, 2160);

    assert.equal(result.error, undefined);
    assert.equal(result.originalRequest.itag.video, "137");
    assert.equal(result.filenameAttributes.resolution, "1920x1080");
    assert.equal(result.filenameAttributes.extension, "mp4");
    assert.equal(result.filenameAttributes.youtubeFormat, "h264");
});
