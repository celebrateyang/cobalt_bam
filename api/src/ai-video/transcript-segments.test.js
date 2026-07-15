import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTranscriptSegments } from "./transcript-segments.js";

test("long diarized utterances become readable draft segments", () => {
    const segments = normalizeTranscriptSegments([{
        startMs: 724,
        endMs: 23_774,
        sourceText: "从今天开始我会变得更加成熟也会更加勇敢地面对生活中的变化不再轻易哭泣也不会在别人面前装可爱",
        speaker: "A",
    }]);
    assert.ok(segments.length >= 6);
    assert.equal(segments[0].startMs, 724);
    assert.equal(segments.at(-1).endMs, 23_774);
    assert.ok(segments.every((segment) => segment.endMs - segment.startMs <= 4000));
    assert.deepEqual(segments.map((segment) => segment.segmentIndex), segments.map((_, index) => index));
    assert.equal(segments.map((segment) => segment.sourceText).join(""), "从今天开始我会变得更加成熟也会更加勇敢地面对生活中的变化不再轻易哭泣也不会在别人面前装可爱");
});

test("very short speaker noise is removed", () => {
    const segments = normalizeTranscriptSegments([
        { startMs: 1000, endMs: 3500, sourceText: "A complete sentence.", speaker: "A" },
        { startMs: 8400, endMs: 8500, sourceText: "Peace.", speaker: "B" },
    ]);
    assert.equal(segments.length, 1);
    assert.equal(segments[0].sourceText, "A complete sentence.");
});

test("natural punctuation is preferred as a split boundary", () => {
    const segments = normalizeTranscriptSegments([{
        startMs: 0,
        endMs: 8000,
        sourceText: "第一句话说清楚重点，第二句话给出完整结论。",
        speaker: "A",
    }]);
    assert.deepEqual(segments.map((segment) => segment.sourceText), [
        "第一句话说清楚重点，",
        "第二句话给出完整结论。",
    ]);
});

test("short utterances merge with a nearby segment from the same speaker", () => {
    const segments = normalizeTranscriptSegments([
        { startMs: 1000, endMs: 1500, sourceText: "Well", speaker: "A" },
        { startMs: 1700, endMs: 4200, sourceText: "this is the main point.", speaker: "A" },
    ]);
    assert.equal(segments.length, 1);
    assert.equal(segments[0].startMs, 1000);
    assert.equal(segments[0].endMs, 4200);
    assert.equal(segments[0].sourceText, "Well this is the main point.");
});

test("meaningful short utterances from another speaker are retained", () => {
    const segments = normalizeTranscriptSegments([
        { startMs: 1000, endMs: 3500, sourceText: "Do you agree?", speaker: "A" },
        { startMs: 3600, endMs: 4200, sourceText: "Absolutely.", speaker: "B" },
    ]);
    assert.equal(segments.length, 2);
    assert.equal(segments[1].sourceText, "Absolutely.");
});
