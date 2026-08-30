import assert from "node:assert/strict";
import test from "node:test";

import {
    extractShortUri,
    normalizeFeed,
    resolveWechatChannel,
} from "./resolve-wechat-channel.js";

test("extractShortUri accepts sph and finder-preview URLs", async () => {
    assert.equal(
        await extractShortUri("https://weixin.qq.com/sph/AievImkslV"),
        "AievImkslV"
    );
    assert.equal(
        await extractShortUri(
            "https://channels.weixin.qq.com/finder-preview/pages/sph?id=AievImkslV"
        ),
        "AievImkslV"
    );
});

test("normalizeFeed returns complete CDN URLs without generating signatures", () => {
    const result = normalizeFeed({
        authorInfo: { nickname: "author" },
        feedInfo: {
            description: "title\nbody",
            h264VideoInfo: {
                videoUrl: "https://finder.video.qq.com/251/20302/stodownload?a=1",
                width: 1328,
                height: 720,
            },
            h265VideoInfo: {
                url: "https://finder.video.qq.com/251/20302/stodownload?a=2",
                url_token: "&token=server-returned",
            },
        },
    });

    assert.equal(result.title, "title");
    assert.equal(result.author, "author");
    assert.equal(result.videos.length, 2);
    assert.equal(result.videos[0].codec, "h264");
    assert.equal(result.videos[1].url.endsWith("&token=server-returned"), true);
});

test("authenticated resolver maps Yuanbao playable_url into Finder request", async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];

    globalThis.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), options });
        if (String(url).includes("yuanbao.tencent.com")) {
            return new Response(
                JSON.stringify({
                    data: {
                        wx_export_id: "fallback-export-id",
                        playable_url:
                            "https://channels.weixin.qq.com/finder-preview/pages/feed" +
                            "?token=general-token&eid=export%2Fverified-id",
                    },
                }),
                { status: 200, headers: { "content-type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({
                errCode: 0,
                data: {
                    authorInfo: { nickname: "author" },
                    feedInfo: {
                        description: "verified title",
                        h264VideoInfo: {
                            videoUrl:
                                "https://finder.video.qq.com/251/20302/stodownload?sign=server",
                        },
                    },
                },
            }),
            { status: 201, headers: { "content-type": "application/json" } }
        );
    };

    try {
        const result = await resolveWechatChannel(
            "https://weixin.qq.com/sph/AievImkslV",
            { yuanbaoCookie: "session=legitimate-test-cookie" }
        );

        assert.equal(result.exportId, "export/verified-id");
        assert.equal(result.videos[0].url.endsWith("sign=server"), true);
        assert.equal(calls.length, 2);

        const finderBody = JSON.parse(calls[1].options.body);
        assert.equal(finderBody.exportId, "export/verified-id");
        assert.equal(finderBody.baseReq.generalToken, "general-token");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("authenticated resolver identifies videos limited to the WeChat app", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (url) => {
        if (String(url).includes("yuanbao.tencent.com")) {
            return new Response(
                JSON.stringify({
                    code: 0,
                    msg: "success",
                    data: { wx_export_id: "", playable_url: "" },
                }),
                { status: 200, headers: { "content-type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({
                errCode: 0,
                data: {
                    errMsg: { type: 4, title: "Open this content in WeChat" },
                    sceneInfo: { dynamicExportId: "export/app-only" },
                },
            }),
            { status: 201, headers: { "content-type": "application/json" } }
        );
    };

    try {
        await assert.rejects(
            resolveWechatChannel("https://weixin.qq.com/sph/AppOnly123", {
                yuanbaoCookie: "session=legitimate-test-cookie",
            }),
            { code: "WECHAT_CHANNELS_APP_ONLY" }
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});
