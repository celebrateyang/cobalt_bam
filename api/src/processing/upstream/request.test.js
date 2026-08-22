import assert from "node:assert/strict";
import test from "node:test";

import {
    buildUpstreamDownloadBody,
    isStructuredUpstreamError,
    resolveRegionPlan,
} from "./request.js";

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

test("routes Tencent Video to the domestic upstream first", () => {
    assert.deepEqual(
        resolveRegionPlan({
            service: "v.qq.com",
            targetHost: "v.qq.com",
            path: "/x/page/a35151vt3pb.html",
        }),
        {
            name: "cn-first",
            groups: [["cn"], ["global"]],
        },
    );
});

test("fails over after a structured 4xx business error", () => {
    assert.equal(
        isStructuredUpstreamError({
            responseOk: false,
            body: {
                status: "error",
                error: { code: "error.api.fetch.fail" },
            },
        }),
        true,
    );

    assert.equal(
        isStructuredUpstreamError({
            responseOk: false,
            body: { message: "unauthorized" },
        }),
        false,
    );
});
