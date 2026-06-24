import assert from "node:assert/strict";
import test from "node:test";

import { collectCandidates } from "./yt-dlp.js";

const sohuFormat = {
    url: "https://video.example.test/video.mp4",
    ext: "mp4",
    video_ext: "mp4",
    audio_ext: "none",
    protocol: "https",
    height: 720,
};

test("treats Sohu progressive MP4 as a muxed audio/video candidate", () => {
    const [candidate] = collectCandidates([sohuFormat], {
        extractor_key: "Sohu",
    });

    assert.equal(candidate.hasVideo, true);
    assert.equal(candidate.hasAudio, true);
});

test("does not change audio detection for other extractors", () => {
    const [candidate] = collectCandidates([sohuFormat], {
        extractor_key: "Generic",
    });

    assert.equal(candidate.hasVideo, true);
    assert.equal(candidate.hasAudio, false);
});

test("does not assume Sohu HLS video-only formats contain audio", () => {
    const [candidate] = collectCandidates([{
        ...sohuFormat,
        url: "https://video.example.test/video.m3u8",
        ext: "mp4",
        protocol: "m3u8_native",
    }], {
        extractor: "sohu",
    });

    assert.equal(candidate.hasVideo, true);
    assert.equal(candidate.hasAudio, false);
});
