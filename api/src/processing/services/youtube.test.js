import test from "node:test";
import assert from "node:assert/strict";

import createFilename from "../create-filename.js";
import { buildYoutubeResult, parseYtDlpError } from "./youtube.js";
import { env } from "../../config.js";

const mediaUrl = (itag) =>
    `https://rr.example.googlevideo.com/videoplayback?itag=${itag}&c=VISIONOS`;

const hlsUrl = (itag) =>
    `https://manifest.googlevideo.com/api/manifest/hls_playlist/itag/${itag}/playlist/index.m3u8`;

test("recognizes explicit YouTube regional restrictions before generic unavailability", () => {
    for (const message of [
        "ERROR: [youtube] trSabcA4How: The uploader has not made this video available in your country\nThis video is available in Turkey.",
        "ERROR: Video unavailable. This video is not available in your country",
        "Video unavailable. This video is blocked in your region",
        "This video is geo-restricted",
        "This video is region locked",
    ]) {
        assert.equal(parseYtDlpError(message), "content.video.region");
    }
});

test("does not guess regional restrictions from ambiguous YouTube failures", () => {
    for (const [message, expected] of [
        ["Video unavailable", "content.video.unavailable"],
        ["This video is unavailable", "content.video.unavailable"],
        ["Private video", "content.video.private"],
        ["Sign in to confirm your age", "content.video.age"],
        ["Sign in to confirm you're not a bot", "youtube.login"],
        ["HTTP Error 403: Forbidden", "fetch.fail"],
        ["Unable to download webpage: timeout", "fetch.fail"],
        ["This video is not available", "fetch.fail"],
        ["", "fetch.fail"],
    ]) {
        assert.equal(parseYtDlpError(message), expected);
    }
});

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

const dubbedAudio = (id, language, preference, overrides = {}) => ({
    format_id: id, ext: "m4a", tbr: 129.472,
    vcodec: "none", acodec: "mp4a.40.2", url: mediaUrl(id),
    language, language_preference: preference, ...overrides,
});

const h264Video = {
    format_id: "137", ext: "mp4", width: 1920, height: 1080, tbr: 2000,
    vcodec: "avc1.640028", acodec: "none", url: mediaUrl("137"),
};

test("preserves the Spanish original in tJn2Xg21zik instead of the first equal-bitrate English dub", () => {
    for (const isAudioOnly of [false, true]) {
        const result = buildResult([
            h264Video,
            dubbedAudio("140-0", "en-US", -1),
            dubbedAudio("140-1", "pt-BR", -1),
            dubbedAudio("140-2", "es-US", 10),
        ], { codec: "h264", isAudioOnly });
        assert.equal(result.error, undefined);
        assert.equal(result.originalRequest.itag.audio, "140-2");
        assert.equal(result.type, isAudioOnly ? "proxy" : "merge");
    }
});

test("original audio takes precedence over a higher-bitrate default dub", () => {
    const result = buildResult([
        h264Video,
        dubbedAudio("english-default", "en", 5, { tbr: 320 }),
        dubbedAudio("spanish-original", "es", 10, { tbr: 64 }),
    ], { codec: "h264" });
    assert.equal(result.originalRequest.itag.audio, "spanish-original");
});

test("does not promote audio description in the original language", () => {
    const result = buildResult([
        h264Video,
        dubbedAudio("es-description", "es", -10, { tbr: 320 }),
        dubbedAudio("es-original", "es", 10, { tbr: 64 }),
    ], { codec: "h264" });
    assert.equal(result.originalRequest.itag.audio, "es-original");
});

test("recognizes original notes and propagates original language across codec variants", () => {
    const result = buildResult([
        h264Video,
        dubbedAudio("english", "en-US", 5),
        dubbedAudio("spanish-opus", "es-US", -1, {
            ext: "webm", acodec: "opus", format_note: "Spanish (US) original (default)",
        }),
        dubbedAudio("spanish-aac", "es-US", -1),
    ], { codec: "h264" });
    assert.equal(result.originalRequest.itag.audio, "spanish-aac");
});

test("uses extracted media language when per-format original markers are absent", () => {
    const result = buildYoutubeResult({
        info: { language: "es-US", formats: [
            h264Video, dubbedAudio("english", "en-US", -1), dubbedAudio("spanish", "es-US", -1),
        ] },
        o: { id: "video-id", codec: "h264", container: "auto" },
        requestClientIp: "", targetQuality: 1080,
    });
    assert.equal(result.originalRequest.itag.audio, "spanish");
});

test("low-resolution downloads merge original audio instead of returning a muxed dub", () => {
    const result = buildResult([
        { ...h264Video, height: 360, width: 640 },
        {
            ...dubbedAudio("18-english", "en", 5), ext: "mp4",
            vcodec: "avc1.42001E", height: 360, width: 640,
        },
        dubbedAudio("140-spanish", "es", 10),
    ], { codec: "h264" }, 360);
    assert.equal(result.type, "merge");
    assert.equal(result.originalRequest.itag.audio, "140-spanish");
});

test("audio-only muxed fallback preserves the original track", () => {
    const result = buildResult([
        { ...dubbedAudio("en-muxed", "en", 5), ext: "mp4", vcodec: "avc1.42001E" },
        { ...dubbedAudio("es-muxed", "es", 10), ext: "mp4", vcodec: "avc1.42001E" },
    ], { codec: "h264", isAudioOnly: true });
    assert.equal(result.originalRequest.itag.audio, "es-muxed");
});

test("does not replace incompatible original audio with a compatible dub", () => {
    const result = buildResult([
        h264Video,
        dubbedAudio("en-aac", "en", 5),
        dubbedAudio("es-opus", "es", 10, { ext: "webm", acodec: "opus" }),
    ], { codec: "h264" });
    assert.equal(result.error, "youtube.no_matching_format");
});

test("unavailable HLS original does not suppress the usable default track", () => {
    const result = buildResult([
        dubbedAudio("es-hls", "es", 10, { url: hlsUrl("es"), protocol: "m3u8_native" }),
        dubbedAudio("english-default", "en", 5),
    ], { isAudioOnly: true });
    assert.equal(result.originalRequest.itag.audio, "english-default");
});

test("muted downloads do not discard muxed video based on its audio language", () => {
    const result = buildResult([
        { ...dubbedAudio("18-en", "en", 5), ext: "mp4", vcodec: "avc1.42001E", height: 360 },
        dubbedAudio("es-original", "es", 10),
    ], { codec: "h264", isAudioMuted: true }, 360);
    assert.equal(result.originalRequest.itag.video, "18-en");
});

test("exposes the selected audio size before downloading", () => {
    const result = buildResult([{
        format_id: "140", ext: "m4a", vcodec: "none", acodec: "mp4a.40.2",
        filesize: 157100000, url: mediaUrl("140"),
    }], { isAudioOnly: true });
    assert.equal(result.estimatedSizeBytes, 157100000);
    assert.equal(result.estimatedSizeSource, "metadata");
});

test("rejects over-limit YouTube media before selecting formats, including audio and mute", () => {
    for (const mode of [{}, { isAudioOnly: true }, { isAudioMuted: true }]) {
        const result = buildYoutubeResult({
            info: { duration: env.durationLimit + 1 },
            o: { id: "long-video", ...mode },
            requestClientIp: "",
            targetQuality: 720,
        });
        assert.deepEqual(result, { error: "content.too_long" });
    }
});

test("allows YouTube media exactly at the duration limit", () => {
    const result = buildYoutubeResult({
        info: {
            duration: env.durationLimit,
            formats: [{
                format_id: "18", ext: "mp4", width: 640, height: 360,
                vcodec: "avc1.42001E", acodec: "mp4a.40.2", url: mediaUrl("18"),
            }],
        },
        o: { id: "boundary-video", codec: "h264", container: "mp4" },
        requestClientIp: "",
        targetQuality: 360,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.duration, env.durationLimit);
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

test("prefers a range-downloadable MP4 over a higher-scoring HLS video format", () => {
    const result = buildResult([
        {
            format_id: "270",
            ext: "mp4",
            // Some extractor versions report an HTTPS protocol even though the
            // URL itself is still an HLS manifest.
            protocol: "https",
            width: 1920,
            height: 1080,
            tbr: 2509.399,
            vcodec: "avc1.640028",
            acodec: "none",
            url: hlsUrl("270"),
        },
        {
            format_id: "137",
            ext: "mp4",
            protocol: "https",
            width: 1920,
            height: 1080,
            tbr: 229.037,
            vcodec: "avc1.640028",
            acodec: "none",
            url: mediaUrl("137"),
        },
        {
            format_id: "140",
            ext: "m4a",
            protocol: "https",
            tbr: 129.474,
            vcodec: "none",
            acodec: "mp4a.40.2",
            url: mediaUrl("140"),
        },
    ], {
        codec: "h264",
    });

    assert.equal(result.error, undefined);
    assert.equal(result.type, "merge");
    assert.deepEqual(result.originalRequest.itag, {
        video: "137",
        audio: "140",
    });
});

test("does not use an HLS audio playlist as a local-processing input", () => {
    const result = buildResult([
        {
            format_id: "hls-audio",
            ext: "m4a",
            protocol: "m3u8_native",
            tbr: 256,
            vcodec: "none",
            acodec: "mp4a.40.2",
            url: hlsUrl("hls-audio"),
        },
        {
            format_id: "140",
            ext: "m4a",
            protocol: "https",
            tbr: 129.474,
            vcodec: "none",
            acodec: "mp4a.40.2",
            url: mediaUrl("140"),
        },
    ], {
        isAudioOnly: true,
        codec: "h264",
    });

    assert.equal(result.error, undefined);
    assert.equal(result.type, "proxy");
    assert.equal(result.originalRequest.itag.audio, "140");
});

test("rejects HLS-only inputs instead of downloading a playlist as media", () => {
    const result = buildResult([
        {
            format_id: "270",
            ext: "mp4",
            protocol: "m3u8_native",
            width: 1920,
            height: 1080,
            tbr: 2509.399,
            vcodec: "avc1.640028",
            acodec: "none",
            url: hlsUrl("270"),
        },
        {
            format_id: "hls-audio",
            ext: "m4a",
            protocol: "m3u8_native",
            tbr: 256,
            vcodec: "none",
            acodec: "mp4a.40.2",
            url: hlsUrl("hls-audio"),
        },
    ], {
        codec: "h264",
    });

    assert.equal(result.error, "youtube.no_matching_format");
});
