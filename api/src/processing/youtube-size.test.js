import test from "node:test";
import assert from "node:assert/strict";
import { estimateYoutubeSize } from "./youtube-size.js";

const candidate = (format, tbr = 0) => ({ format, tbr, rangeDownloadable: true });
test("estimates only selected streams and sums video and audio", () => {
    assert.deepEqual(estimateYoutubeSize([candidate({ filesize: 623600000 }), candidate({ filesize: 157100000 })], 300), {
        estimatedSizeBytes: 780700000, estimatedSizeSource: "metadata",
    });
});
test("falls back to approximate sizes then bitrate without hiding missing audio", () => {
    assert.deepEqual(estimateYoutubeSize([candidate({ filesize_approx: 1000 }), candidate({}, 128)], 10), {
        estimatedSizeBytes: 161000, estimatedSizeSource: "bitrate",
    });
    assert.deepEqual(estimateYoutubeSize([candidate({ filesize: 1000 }), candidate({})], 10), {});
    assert.deepEqual(estimateYoutubeSize([{ ...candidate({ filesize: 1000 }), rangeDownloadable: false }], 10), {});
    assert.deepEqual(estimateYoutubeSize([candidate({}, 128)], Infinity), {});
});
