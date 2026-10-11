import assert from "node:assert/strict";
import test from "node:test";

import ffmpeg from "ffmpeg-static";

import { selectFfmpegExecutable } from "./ffmpeg.js";

test("uses the system ffmpeg for Amazon HLS on Linux", () => {
    assert.equal(
        selectFfmpegExecutable({ service: "amazon" }, "linux"),
        "/usr/bin/ffmpeg",
    );
});

test("uses the system ffmpeg for CCTV HLS on Linux", () => {
    assert.equal(
        selectFfmpegExecutable({ service: "cctv" }, "linux"),
        "/usr/bin/ffmpeg",
    );
});

test("keeps the system ffmpeg workaround for iQIYI on Linux", () => {
    assert.equal(
        selectFfmpegExecutable({ service: "iqiyi" }, "linux"),
        "/usr/bin/ffmpeg",
    );
});

test("avoids the static ffmpeg SOOP crash on Linux", () => {
    assert.equal(
        selectFfmpegExecutable({ service: "sooplive", isHLS: true }, "linux"),
        "/usr/bin/ffmpeg",
    );
    assert.equal(
        selectFfmpegExecutable({ service: "sooplive", isHLS: true }, "win32"),
        ffmpeg,
    );
});

test("avoids the static ffmpeg Dailymotion HLS crash on Linux", () => {
    for (const type of ['merge', 'mute', 'audio']) {
        const info = { service: 'dailymotion', isHLS: true, type };
        assert.equal(selectFfmpegExecutable(info, 'linux'), '/usr/bin/ffmpeg');
        assert.equal(selectFfmpegExecutable(info, 'win32'), ffmpeg);
    }
});

test("uses the static ffmpeg for other services", () => {
    assert.equal(
        selectFfmpegExecutable({ service: "youtube" }, "linux"),
        ffmpeg,
    );
});

test("avoids the static FFmpeg crash for generic Youku HLS", () => {
    assert.equal(selectFfmpegExecutable({ service: 'v.youku.com', isHLS: true }, 'linux'), '/usr/bin/ffmpeg');
    assert.equal(selectFfmpegExecutable({ service: 'v.youku.com', isHLS: true }, 'win32'), ffmpeg);
});

test("uses system ffmpeg for HLS regardless of platform adapter or output mode", () => {
    const services = ['bjnews', 'niconico', 'weibo', 'vimeo', 'rutube', 'bsky', 'pinterest', 'soundcloud', 'new-hls-service'];
    for (const service of services) {
        for (const type of ['merge', 'remux', 'mute', 'audio', 'gif']) {
            const info = { service, type, isHLS: true };
            assert.equal(selectFfmpegExecutable(info, 'linux'), '/usr/bin/ffmpeg');
            assert.equal(selectFfmpegExecutable(info, 'win32'), ffmpeg);
        }
    }
});

test("keeps packaged ffmpeg for non-HLS inputs without a service workaround", () => {
    for (const service of ['weibo', 'vimeo', 'soundcloud', 'example.com']) {
        assert.equal(selectFfmpegExecutable({ service, isHLS: false }, 'linux'), ffmpeg);
    }
});

test("does not select the Linux system ffmpeg on Windows", () => {
    assert.equal(
        selectFfmpegExecutable({ service: "amazon" }, "win32"),
        ffmpeg,
    );
});
