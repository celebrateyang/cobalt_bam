import assert from "node:assert/strict";
import test from "node:test";

import { buildProgressiveDirectCandidates } from "./bilibili.js";

test("prioritizes browser-friendly Bilibili mirrors for progressive MP4", () => {
    const source = "https://upos-hz-mirrorakam.akamaized.net/upgcxcode/87/41/video.mp4?os=akam&upsig=signed";
    const candidates = buildProgressiveDirectCandidates([source]);

    assert.deepEqual(candidates.map((value) => new URL(value).hostname), [
        "upos-sz-mirrorcos.bilivideo.com",
        "upos-sz-mirrorali.bilivideo.com",
        "upos-sz-mirrorhw.bilivideo.com",
        "upos-hz-mirrorakam.akamaized.net",
    ]);
    assert.equal(new URL(candidates[0]).searchParams.get("upsig"), "signed");
    assert.equal(new URL(candidates[0]).searchParams.get("os"), "akam");
});

test("keeps non-Bilibili progressive URLs unchanged", () => {
    const source = "https://cdn.example/video.mp4?token=signed";
    assert.deepEqual(buildProgressiveDirectCandidates([source]), [source]);
});

test("builds the same mirror fallback chain for DASH tracks", () => {
    const source = "https://upos-hz-mirrorakam.akamaized.net/upgcxcode/00/11/video.m4s?deadline=1&upsig=signed";
    const candidates = buildProgressiveDirectCandidates([source]);

    assert.equal(new URL(candidates[0]).hostname, "upos-sz-mirrorcos.bilivideo.com");
    assert.equal(new URL(candidates[1]).hostname, "upos-sz-mirrorali.bilivideo.com");
    assert.equal(new URL(candidates[2]).hostname, "upos-sz-mirrorhw.bilivideo.com");
    assert.equal(candidates[3], source);
});
