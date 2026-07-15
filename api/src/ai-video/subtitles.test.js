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
