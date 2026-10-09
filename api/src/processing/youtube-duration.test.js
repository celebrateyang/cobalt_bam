import test from "node:test";
import assert from "node:assert/strict";

import { env } from "../config.js";
import { exceedsYoutubeDurationLimit, getYoutubeUpstreamDurationError } from "./youtube-duration.js";

test("uses DURATION_LIMIT and rejects nine hours with the three-hour policy", () => {
    const previous = env.durationLimit;
    try {
        env.durationLimit = 10800;
        assert.equal(exceedsYoutubeDurationLimit(9 * 3600), true);
        assert.equal(exceedsYoutubeDurationLimit(10801), true);
        assert.equal(exceedsYoutubeDurationLimit(10800), false);
        env.durationLimit = 3600;
        assert.equal(exceedsYoutubeDurationLimit(3601), true);
        assert.equal(exceedsYoutubeDurationLimit(3600), false);
    } finally {
        env.durationLimit = previous;
    }
});

test("rejects upstream download modes without forwarding their links", () => {
    for (const status of ["redirect", "tunnel", "local-processing", "picker"]) {
        assert.deepEqual(getYoutubeUpstreamDurationError({
            status,
            duration: String(env.durationLimit + 1),
            url: "https://upstream.example/tunnel?id=long",
            tunnel: ["https://upstream.example/tunnel?id=video"],
            fallback: { url: "https://upstream.example/tunnel?id=fallback" },
        }), {
            code: "error.api.content.too_long",
            context: { limit: parseFloat((env.durationLimit / 60).toFixed(2)) },
        });
    }
});

test("keeps upstream errors and unknown-duration responses compatible", () => {
    assert.equal(getYoutubeUpstreamDurationError({ status: "error", duration: env.durationLimit + 1 }), null);
    assert.equal(getYoutubeUpstreamDurationError({ status: "tunnel", duration: env.durationLimit }), null);
    for (const duration of [undefined, null, "", "unknown", NaN, Infinity]) {
        assert.equal(getYoutubeUpstreamDurationError({ status: "tunnel", duration }), null);
    }
});
