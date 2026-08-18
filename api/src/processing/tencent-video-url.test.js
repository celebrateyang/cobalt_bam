import assert from "node:assert/strict";
import test from "node:test";

import { extract, identifyService, normalizeURL } from "./url.js";

const enabled = new Set(["tencent_video"]);

test("recognizes a Tencent Video cover URL", () => {
    const result = extract(
        normalizeURL(
            "https://v.qq.com/x/cover/mzc003vi3k45wzy/a35151vt3pb.html"
        ),
        enabled,
    );

    assert.equal(result.host, "tencent_video");
    assert.equal(result.patternMatch.coverId, "mzc003vi3k45wzy");
    assert.equal(result.patternMatch.videoId, "a35151vt3pb");
});

test("recognizes a Tencent Video page URL", () => {
    const result = extract(
        normalizeURL("https://v.qq.com/x/page/a35151vt3pb.html"),
        enabled,
    );

    assert.equal(result.host, "tencent_video");
    assert.equal(result.patternMatch.videoId, "a35151vt3pb");
});

test("does not classify unrelated qq.com pages as Tencent Video", () => {
    assert.notEqual(
        identifyService("https://www.qq.com/", enabled)?.service,
        "tencent_video",
    );
});
