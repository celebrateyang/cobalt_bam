import assert from "node:assert/strict";
import test from "node:test";

import { extract, identifyService, normalizeURL } from "./url.js";

const enabled = new Set(["iqiyi"]);

test("recognizes an iQIYI video URL", () => {
    const url = normalizeURL("https://www.iqiyi.com/v_dwo67tu164.html?utm_source=test");
    const result = extract(url, enabled);

    assert.equal(url.toString(), "https://www.iqiyi.com/v_dwo67tu164.html");
    assert.equal(result.host, "iqiyi");
    assert.equal(result.patternMatch.pageId, "dwo67tu164");
});

test("identifies the iQIYI platform", () => {
    assert.deepEqual(
        identifyService("https://www.iqiyi.com/v_dwo67tu164.html", enabled),
        { service: "iqiyi", domain: "iqiyi.com", enabled: true },
    );
});
