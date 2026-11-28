import test from "node:test";
import assert from "node:assert/strict";
import { validateYoutubeClipRange } from "./youtube-clip-range.js";

test("validates YouTube clip boundaries against source and maximum duration", () => {
    const validate = (start, end, duration = 15000, limit = 10800) =>
        validateYoutubeClipRange({ start, end }, duration, limit);
    assert.deepEqual(validate(4000, 14800), { start: 4000, end: 14800, duration: 10800 });
    assert.deepEqual(validate(14900, 15000), { start: 14900, end: 15000, duration: 100 });
    for (const range of [[-1, 3], [3, 3], [4, 3], [0, 10801], [0, 15001], [0.5, 5], [0, Infinity]]) {
        assert.equal(validate(...range), null);
    }
    assert.equal(validate(0, 1, undefined, 0), null);
    assert.equal(validate(0, 1, NaN), null);
    assert.equal(validateYoutubeClipRange(null, 20, 10), null);
    assert.equal(validateYoutubeClipRange(undefined, 20, 10), null);
    assert.equal(validateYoutubeClipRange([], 20, 10), null);
    assert.equal(validate(Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 2, Number.MAX_VALUE, 10), null);
});
