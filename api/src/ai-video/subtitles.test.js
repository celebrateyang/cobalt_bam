import assert from "node:assert/strict";
import test from "node:test";

import { buildClipCues, escapeAssText, renderAss, renderSrt, renderVtt, sanitizeOutputFilename } from "./subtitles.js";

test("clip subtitles are trimmed, made relative, and bilingual", () => {
    const cues = buildClipCues({
        clip: { startMs: 10_000, endMs: 30_000 },
        subtitleMode: "bilingual",
        segments: [
            { startMs: 9_000, endMs: 12_000, sourceText: "Hello", translatedText: "Bonjour" },
            { startMs: 29_000, endMs: 31_000, sourceText: "Bye", translatedText: "Salut" },
        ],
    });
    assert.deepEqual(cues, [
        { startMs: 0, endMs: 2000, text: "Hello\nBonjour" },
        { startMs: 19000, endMs: 20000, text: "Bye\nSalut" },
    ]);
    assert.match(renderSrt(cues), /00:00:00,000 --> 00:00:02,000/);
    assert.match(renderVtt(cues), /^WEBVTT/);
    const ass = renderAss(cues, { bilingual: true });
    assert.match(ass, /PlayResX: 1080/);
    assert.match(ass, /Style: Default,Noto Sans,/);
});

test("ASS and filenames escape user-controlled syntax", () => {
    assert.equal(escapeAssText("{tag}\\x\nnext"), "\\{tag\\}\\\\x\\Nnext");
    assert.equal(sanitizeOutputFilename("../bad:name?.mp4"), "-bad-name-.mp4");
});

test("long bilingual segments are split into readable timed cues", () => {
    const cues = buildClipCues({
        clip: { startMs: 0, endMs: 12_000 },
        subtitleMode: "bilingual",
        segments: [{
            startMs: 0,
            endMs: 12_000,
            sourceText: "从今天开始我会更加成熟，也会更加勇敢地面对生活中的变化和新的挑战。",
            translatedText: "From today onward I will become more mature and face every change and new challenge in life with greater courage.",
        }],
    });
    assert.ok(cues.length >= 3);
    assert.equal(cues[0].startMs, 0);
    assert.equal(cues.at(-1).endMs, 12_000);
    assert.ok(cues.every((cue) => cue.endMs - cue.startMs <= 4500));
    assert.ok(cues.every((cue) => cue.text.length < 100));
});

test("a longer translation does not split away from its normalized source segment", () => {
    const cues = buildClipCues({
        clip: { startMs: 0, endMs: 4000 },
        subtitleMode: "bilingual",
        segments: [{
            startMs: 0,
            endMs: 4000,
            sourceText: "保持真实。",
            translatedText: "Stay honest with yourself even when the translated sentence needs more words to express the same complete idea.",
        }],
    });
    assert.equal(cues.length, 1);
    assert.match(cues[0].text, /^保持真实。\nStay honest/);
});
