import assert from "node:assert/strict";
import test from "node:test";

import { extract, identifyService, normalizeURL } from "./url.js";

const enabled = new Set(["iqiyi"]);

test("recognizes mobile, short and share iQIYI URLs", () => {
    for (const [input, expected] of [
        ["https://m.iqiyi.com/v_1caim8qhnw0.html", { pageId: "1caim8qhnw0" }],
        ["https://qy.net/31JZyRo-f8", { shortLink: "31JZyRo-f8" }],
        ["https://m.iqiyi.com/mp/sharePlay.html?tvid=4813496443243100&p1=2_22_222", { tvid: "4813496443243100" }],
        ["https://www.iqiyi.com/playShare.html?tvid=4813496443243100&shareUser=", { tvid: "4813496443243100" }],
    ]) {
        const result = extract(normalizeURL(input), enabled);
        assert.equal(result.host, "iqiyi");
        assert.deepEqual(result.patternMatch, expected);
    }
    assert.equal(identifyService("https://qy.net/31JZyRo-f8", enabled).service, "iqiyi");
    assert.ok(extract(normalizeURL("https://m.iqiyi.com.evil.example/v_1caim8qhnw0.html"), enabled).error);
});

test("recognizes short and canonical iQIYI international play URLs", () => {
    for (const input of [
        "https://www.iq.com/play/q7bb47bdnc",
        "https://www.iq.com/play/beauty-of-resilience-episode-1-q7bb47bdnc?lang=en_us",
        "https://iq.com/play/q7bb47bdnc/",
    ]) {
        const normalized = normalizeURL(input);
        const result = extract(normalized, enabled);
        assert.equal(normalized.toString(), "https://iqiyi.com/_intl/q7bb47bdnc");
        assert.equal(result.host, "iqiyi");
        assert.deepEqual(result.patternMatch, { intlPageId: "q7bb47bdnc" });
    }

    assert.deepEqual(identifyService("https://www.iq.com/play/q7bb47bdnc", enabled), {
        service: "iqiyi",
        domain: "iq.com",
        enabled: true,
    });
    assert.ok(extract(normalizeURL("https://www.iq.com/channel/q7bb47bdnc"), enabled).error);
    assert.ok(extract(normalizeURL("https://www.iq.com.evil.example/play/q7bb47bdnc"), enabled).error);
});

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
