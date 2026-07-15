import assert from "node:assert/strict";
import test from "node:test";

import { deterministicHighlights, maxHighlightClipsForDuration, normalizeHighlightClips } from "./highlights.js";

test("normalizes highlight boundaries to the 15-90 second product limits", () => {
    const clips = normalizeHighlightClips({
        durationMs: 120_000,
        clips: [
            { startMs: -100, endMs: 4_000, title: "short" },
            { startMs: 20_000, endMs: 119_000, title: "long" },
            { startMs: 110_000, endMs: 200_000, title: "tail" },
        ],
    });
    assert.equal(clips.length, 3);
    for (const clip of clips) {
        assert.ok(clip.startMs >= 0);
        assert.ok(clip.endMs <= 120_000);
        assert.ok(clip.endMs - clip.startMs >= 15_000);
        assert.ok(clip.endMs - clip.startMs <= 90_000);
    }
});

test("short videos may return a single deterministic highlight", () => {
    const clips = deterministicHighlights({
        durationMs: 60_000,
        maxClips: maxHighlightClipsForDuration(60_000),
        segments: [{ startMs: 5_000, endMs: 55_000, sourceText: "A single long explanation with useful information." }],
    });
    assert.equal(clips.length, 1);
    assert.ok(clips.every((clip) => clip.endMs - clip.startMs >= 15_000));
});

test("overlapping highlight candidates are deduplicated by score", () => {
    const clips = normalizeHighlightClips({
        durationMs: 120_000,
        clips: [
            { startMs: 0, endMs: 60_000, title: "lower", score: 0.6 },
            { startMs: 2_000, endMs: 61_000, title: "higher", score: 0.9 },
            { startMs: 70_000, endMs: 100_000, title: "distinct", score: 0.7 },
        ],
    });
    assert.deepEqual(clips.map((clip) => clip.title), ["higher", "distinct"]);
});

test("highlight count scales with source duration", () => {
    assert.equal(maxHighlightClipsForDuration(36_500), 1);
    assert.equal(maxHighlightClipsForDuration(120_000), 2);
    assert.equal(maxHighlightClipsForDuration(300_000), 3);
    assert.equal(maxHighlightClipsForDuration(900_000), 5);
});

test("invalid candidates are discarded", () => {
    const clips = normalizeHighlightClips({
        durationMs: 10_000,
        clips: [{ startMs: "bad", endMs: 5_000 }, { startMs: 0, endMs: 9_000 }],
    });
    assert.deepEqual(clips, []);
});
