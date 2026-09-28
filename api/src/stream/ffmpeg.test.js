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

test("keeps the system ffmpeg workaround for iQIYI on Linux", () => {
    assert.equal(
        selectFfmpegExecutable({ service: "iqiyi" }, "linux"),
        "/usr/bin/ffmpeg",
    );
});

test("uses the static ffmpeg for other services", () => {
    assert.equal(
        selectFfmpegExecutable({ service: "youtube" }, "linux"),
        ffmpeg,
    );
});

test("does not select the Linux system ffmpeg on Windows", () => {
    assert.equal(
        selectFfmpegExecutable({ service: "amazon" }, "win32"),
        ffmpeg,
    );
});
