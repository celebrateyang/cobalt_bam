import assert from "node:assert/strict";
import test from "node:test";

import { extract, identifyService, normalizeURL } from "./url.js";

const enabled = new Set(["sooplive"]);

test("recognizes current and legacy SOOP VOD URLs", () => {
    for (const input of [
        "https://vod.sooplive.com/player/201688145/catch",
        "https://vod.sooplive.co.kr/player/201688145",
        "https://vod.afreecatv.com/PLAYER/STATION/201688145",
    ]) {
        const result = extract(normalizeURL(input), enabled);
        assert.equal(result.host, "sooplive");
        assert.equal(result.patternMatch.id, "201688145");
    }
});

test("identifies SOOP and rejects unsupported SOOP page types", () => {
    assert.equal(
        identifyService("https://vod.sooplive.com/player/201688145", enabled)?.service,
        "sooplive",
    );
    assert.ok(extract(
        normalizeURL("https://vod.sooplive.com/player/201688145/unknown/more"),
        enabled,
    ).error);
});
