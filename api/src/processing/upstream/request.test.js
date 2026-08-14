import assert from "node:assert/strict";
import test from "node:test";

import { buildUpstreamDownloadBody, resolveRegionPlan } from "./request.js";

test("forwards the Bilibili Direct Bridge intent to a regional upstream", () => {
    assert.deepEqual(
        buildUpstreamDownloadBody({
            url: new URL("https://www.bilibili.com/video/BV1HpEG6DEa7/"),
            bilibiliDirectBridge: true,
            ignored: "value",
        }),
        {
            url: "https://www.bilibili.com/video/BV1HpEG6DEa7/",
            bilibiliDirectBridge: true,
        },
    );
});

test("routes WeChat Channels only to the domestic upstream", () => {
    assert.deepEqual(
        resolveRegionPlan({
            service: "weixin.qq.com",
            targetHost: "weixin.qq.com",
            path: "/",
        }),
        {
            name: "cn-only",
            groups: [["cn"]],
        },
    );
});
