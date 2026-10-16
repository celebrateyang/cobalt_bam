import assert from "node:assert/strict";
import test from "node:test";

import sooplive, { requestSoopVideo, selectSoopQuality } from "./sooplive.js";

const qualityInfo = [
    {
        label: "Auto",
        resolution: "",
        bitrate: "0k",
        file: "https://vod-normal-global-cdn-z02.sooplive.com/path/master.m3u8",
    },
    {
        label: "640p",
        resolution: "640x1080",
        bitrate: "1489k",
        file: "https://vod-normal-global-cdn-z02.sooplive.com/path/original.m3u8",
    },
    {
        label: "320p",
        resolution: "320x540",
        bitrate: "1000k",
        file: "https://vod-normal-global-cdn-z02.sooplive.com/path/540.m3u8",
    },
];

test("sends SOOP credentials only to the metadata endpoint and rejects redirects", async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    const cookie = "session=test-only";
    globalThis.fetch = async (url, options) => {
        assert.equal(url, "https://api.m.sooplive.com/station/video/a/view");
        assert.equal(options.headers.cookie, cookie);
        assert.equal(options.redirect, "error");
        assert.ok(options.signal instanceof AbortSignal);
        return Response.json({ data: { files: [{ quality_info: qualityInfo }] } });
    };
    const response = await requestSoopVideo("123", "https://vod.sooplive.com/player/123", cookie);
    assert.equal(response.data.files.length, 1);

    globalThis.fetch = async () => new Response("invalid JSON");
    assert.equal(await requestSoopVideo("123", "https://vod.sooplive.com/player/123", cookie), null);
});

test("selects SOOP quality using the largest video dimension", () => {
    assert.equal(selectSoopQuality(qualityInfo, "max").resolution, "640x1080");
    assert.equal(selectSoopQuality(qualityInfo, "480").resolution, "320x540");
    assert.equal(selectSoopQuality(qualityInfo, "144").resolution, "320x540");
});

test("rejects media URLs outside SOOP CDN domains", () => {
    assert.equal(selectSoopQuality([{
        resolution: "1920x1080",
        file: "https://example.com/video.m3u8",
    }], "max"), null);
});

test("extracts a public SOOP VOD", async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    globalThis.fetch = async (_url, options) => {
        assert.equal(options.method, "POST");
        assert.equal(options.body.get("nTitleNo"), "201688145");
        return new Response(JSON.stringify({
            data: {
                title: "Catch title",
                writer_nick: "Streamer",
                total_file_duration: 10000,
                thumb: "https://videoimg.sooplive.com/preview.jpg",
                files: [{
                    duration: 10000,
                    quality_info: qualityInfo,
                }],
            },
        }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const result = await sooplive({
        id: "201688145",
        quality: "max",
        url: new URL("https://vod.sooplive.com/player/201688145/catch"),
    });

    assert.equal(result.urls, qualityInfo[1].file);
    assert.equal(result.service, "sooplive");
    assert.equal(result.duration, 10);
    assert.equal(result.isHLS, true);
    assert.equal(result.filenameAttributes.title, "Catch title");
    assert.equal(result.filenameAttributes.author, "Streamer");
    assert.equal(result.filenameAttributes.qualityLabel, "1080p");
});

test("offers multi-part SOOP VODs as separate picker items", async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    globalThis.fetch = async () => new Response(JSON.stringify({
        data: {
            title: "Long replay",
            files: [
                { duration: 5000, quality_info: qualityInfo },
                { duration: 7000, quality_info: qualityInfo },
            ],
        },
    }), { status: 200, headers: { "content-type": "application/json" } });

    const result = await sooplive({
        id: "123456",
        quality: "720",
        url: new URL("https://vod.sooplive.com/player/123456"),
    });

    assert.equal(result.picker.length, 2);
    assert.deepEqual(result.picker.map((item) => item.label), ["Part 1", "Part 2"]);
    assert.ok(result.picker.every((item) => item.type === "video" && /^https?:/.test(item.url)));
});

test("identifies SOOP age gates without mislabeling other unavailable videos", async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });

    const cases = [
        [{ grade: 19, adult_status: "notLogin", files: [] }, "sooplive.age"],
        [{ adult_status: "notLogin", files: [] }, "sooplive.age"],
        [{ grade: "19", files: [] }, "sooplive.age"],
        [{ grade: 0, files: [] }, "fetch.empty"],
        [{ sub_upload_type: "restricted", files: [] }, "content.video.unavailable"],
        [{ code: -6221, grade: 19 }, "content.video.unavailable"],
        [{ code: -6205 }, "content.video.unavailable"],
    ];
    for (const [data, error] of cases) {
        globalThis.fetch = async () => Response.json({ result: 1, data });
        assert.deepEqual(await sooplive({ id: "209840699", quality: "max" }), { error });
    }

    globalThis.fetch = async () => Response.json({
        data: { grade: 19, adult_status: "verified", files: [{ quality_info: qualityInfo }] },
    });
    assert.equal((await sooplive({ id: "123456", quality: "max" })).urls, qualityInfo[1].file);
});
