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

test("keeps a forced Bilibili batch progressive MP4 off the server tunnel", () => {
    const directUrl = "https://upos-sz-mirrorcos.bilivideo.com/video.mp4";
    const response = matchAction({
        ...baseArgs,
        host: "bilibili",
        isBatchRequest: true,
        alwaysProxy: true,
        localProcessing: "forced",
        r: {
            urls: directUrl,
            urlCandidates: [directUrl, "https://upos-sz-mirrorali.bilivideo.com/video.mp4"],
            directClientDownload: true,
            filename: "video.mp4",
            duration: 120,
        },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "redirect");
    assert.equal(response.body.directUrl, directUrl);
    assert.equal(response.body.tunnelUrl, undefined);
});

const soundcloudResult = {
    urls: "https://cf-media.sndcdn.com/track.128.mp3?Policy=signed",
    bestAudio: "mp3",
    isHLS: false,
    directClientDownload: true,
    filenameAttributes: {
        service: "soundcloud",
        id: 123,
        title: "Track",
        artist: "Artist",
    },
    duration: 240,
};

test("returns a SoundCloud progressive MP3 as a Direct Bridge redirect", () => {
    const response = matchAction({
        ...baseArgs,
        host: "soundcloud",
        isAudioOnly: true,
        localProcessing: "preferred",
        r: soundcloudResult,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "redirect");
    assert.equal(response.body.url, soundcloudResult.urls);
    assert.equal(response.body.directUrl, soundcloudResult.urls);
    assert.deepEqual(response.body.directUrlCandidates, [soundcloudResult.urls]);
    assert.match(response.body.filename, /\.mp3$/);
    assert.equal(response.body.tunnelUrl, undefined);
});

test("keeps a forced SoundCloud progressive MP3 off the server tunnel", () => {
    const response = matchAction({
        ...baseArgs,
        host: "soundcloud",
        isAudioOnly: true,
        alwaysProxy: true,
        localProcessing: "forced",
        r: soundcloudResult,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "redirect");
    assert.equal(response.body.directUrl, soundcloudResult.urls);
    assert.equal(response.body.tunnelUrl, undefined);
});

test("keeps SoundCloud MP3 conversion on the processing path when source is HLS", () => {
    const response = matchAction({
        ...baseArgs,
        host: "soundcloud",
        isAudioOnly: true,
        audioFormat: "mp3",
        localProcessing: "preferred",
        r: {
            ...soundcloudResult,
            urls: "https://cf-hls-media.sndcdn.com/playlist.m3u8",
            bestAudio: "opus",
            isHLS: true,
            directClientDownload: false,
        },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "tunnel");
    assert.equal(response.body.directUrl, undefined);
});
