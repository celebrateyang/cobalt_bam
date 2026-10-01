import assert from "node:assert/strict";
import test from "node:test";

import sooplive, { selectSoopQuality } from "./sooplive.js";

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
