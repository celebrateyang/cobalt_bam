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
