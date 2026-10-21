import assert from "node:assert/strict";
import test from "node:test";

import { extract, normalizeURL } from "./url.js";

const enabled = new Set(["wechat_channels"]);

test("recognizes an HTTP standalone MP video and preserves its identity parameters", () => {
    const normalized = normalizeURL(
        "http://mp.weixin.qq.com/mp/video?__biz=MzkwNjUwMjk1Nw==&mid=100000004&sn=7288dc591d2acd19b3cb084e935cd289&vid=wxv_2975948159468437516&idx=1&vidsn=2b9612b2df498b8452fe18a73cfd63b1&scene=1&forceh5=1"
    );
    const result = extract(normalized, enabled);
    assert.equal(result.host, "wechat_channels");
    assert.equal(result.patternMatch.mpVideoId, "wxv_2975948159468437516");
    assert.equal(normalized.protocol, "https:");
    assert.equal(normalized.searchParams.get("__biz"), "MzkwNjUwMjk1Nw==");
    assert.equal(normalized.searchParams.get("vidsn"), "2b9612b2df498b8452fe18a73cfd63b1");
    assert.equal(normalized.searchParams.has("scene"), false);
});

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
