import assert from "node:assert/strict";
import test from "node:test";

import { extract, normalizeURL } from "./url.js";

const enabled = new Set(["wechat_channels"]);

test("recognizes a WeChat Channels sph share URL", () => {
    const result = extract(
        normalizeURL("https://weixin.qq.com/sph/AievImkslV"),
        enabled,
    );

    assert.equal(result.host, "wechat_channels");
    assert.equal(result.patternMatch.shortUri, "AievImkslV");
});

test("recognizes a Finder preview URL without stripping its id", () => {
    const result = extract(
        normalizeURL(
            "https://channels.weixin.qq.com/finder-preview/pages/sph?id=AievImkslV"
        ),
        enabled,
    );

    assert.equal(result.host, "wechat_channels");
    assert.equal(result.patternMatch.shortUri, "AievImkslV");
});

test("recognizes a WeChat public article URL", () => {
    const result = extract(
        normalizeURL("https://mp.weixin.qq.com/s/igocr2eDxLdknggDAXkSyg"),
        enabled,
    );

    assert.equal(result.host, "wechat_channels");
    assert.equal(result.patternMatch.articleId, "igocr2eDxLdknggDAXkSyg");
});

test("preserves a valid WeChat article item selection", () => {
    const normalized = normalizeURL(
        "https://mp.weixin.qq.com/s/igocr2eDxLdknggDAXkSyg?fsv_item=8&ignored=1"
    );
    const result = extract(normalized, enabled);

    assert.equal(result.host, "wechat_channels");
    assert.equal(normalized.search, "?fsv_item=8");
});
