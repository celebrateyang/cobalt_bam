import assert from "node:assert/strict";
import test from "node:test";

import iqiyi, {
    buildIqiyiDirectUrl,
    decodeIqiyiPlayerData,
    decodeIqiyiTvid,
    selectIqiyiVideo,
    resolveIqiyiShortLink,
} from "./iqiyi.js";

const tvid = "1532638125497600";
const segment = (start, end) =>
    `https://pcw-data.video.iqiyi.com/videos/v1ts/video.ts?start=${start}&end=${end}` +
    "&contentlength=100&qd_index=vod&qd_tvid=1532638125497600&qd_sc=signed";
const manifest = [
    "#EXTM3U",
    "#EXT-X-TARGETDURATION:3",
    "#EXTINF:3.0,",
    segment(0, 99),
    "#EXTINF:3.0,",
    segment(100, 199),
    "#EXT-X-ENDLIST",
].join("\n");

const encodePlayerData = (value) => JSON.stringify(value)
    .split("")
    .map((character) => String.fromCharCode(character.charCodeAt(0) ^ 90))
    .join("");

test("resolves the shared qy.net URL and rejects external redirects", async () => {
    const redirect = (location) => async (_, options) => {
        assert.equal(options.redirect, "manual");
        return new Response(null, { status: 302, headers: { location } });
    };
    assert.deepEqual(await resolveIqiyiShortLink("31JZyRo-f8", redirect(
        "https://m.iqiyi.com/mp/sharePlay.html?tvid=4813496443243100&p1=2_22_222",
    )), {
        tvid: "4813496443243100",
        url: "https://m.iqiyi.com/mp/sharePlay.html?tvid=4813496443243100&p1=2_22_222",
    });
    assert.equal(await resolveIqiyiShortLink("31JZyRo-f8", redirect("https://evil.example/video")), null);
    assert.equal(await resolveIqiyiShortLink("31JZyRo-f8", redirect("https://qy.net/loop")), null);
});

test("decodes the page slug into the target tvid", () => {
    assert.equal(decodeIqiyiTvid("dwo67tu164"), tvid);
    assert.equal(decodeIqiyiTvid("not-valid!"), null);
});

test("builds a full CORS-friendly CDN object URL from byte-range HLS", () => {
    const directUrl = new URL(buildIqiyiDirectUrl(manifest, 6));

    assert.equal(directUrl.hostname, "pcw-data.video.iqiyi.com");
    assert.equal(directUrl.pathname, "/videos/v1ts/video.ts");
    assert.equal(directUrl.searchParams.has("start"), false);
    assert.equal(directUrl.searchParams.has("end"), false);
    assert.equal(directUrl.searchParams.has("contentlength"), false);
    assert.equal(directUrl.searchParams.get("qd_index"), "vod");
    assert.equal(directUrl.searchParams.get("qd_sc"), "signed");
});

test("rejects mixed-CDN manifests and duration mismatches", () => {
    assert.equal(
        buildIqiyiDirectUrl(manifest.replace(
            segment(100, 199),
            "https://ads.example/ad.ts?start=100&end=199",
        ), 6),
        null,
    );
    assert.equal(buildIqiyiDirectUrl(manifest, 60), null);
});

test("selects only the target non-preview program video", () => {
    const selected = selectIqiyiVideo({
        tvid,
        quality: 720,
        playerData: {
            data: {
                tvid,
                program: {
                    video: [
                        { vid: "preview", bid: 600, duration: 6, isPreview: 1, m3u8: manifest },
                        { vid: "main", bid: 500, duration: 6, isPreview: 0, m3u8: manifest },
                    ],
                },
            },
        },
    });

    assert.equal(selected.video.vid, "main");
});

test("returns the complete main-program TS as the server remux source", async () => {
    const playerData = {
        code: "A00000",
        data: {
            tvid,
            program: {
                video: [{ vid: "main", bid: 500, duration: 6, isPreview: 0, m3u8: manifest }],
            },
        },
    };
    const fetchImpl = async () => ({
        ok: true,
        json: async () => ({
            videoInfo: {
                tvId: tvid,
                title: "Main program",
                effective: true,
                downloadAllowed: true,
            },
            adp: { material: "must-not-be-selected" },
            ev: encodePlayerData(playerData),
        }),
    });

    assert.deepEqual(decodeIqiyiPlayerData(encodePlayerData(playerData)), playerData);
    const result = await iqiyi({
        pageId: "dwo67tu164",
        quality: 720,
        url: "https://www.iqiyi.com/v_dwo67tu164.html",
        fetchImpl,
    });

    assert.equal(result.service, "iqiyi");
    assert.equal(result.directClientDownload, undefined);
    assert.equal(result.filenameAttributes.extension, "mp4");
    assert.equal(new URL(result.urls).pathname.endsWith(".ts"), true);
    assert.equal(result.urls.includes("ads.example"), false);
    for (const input of [
        { tvid, url: `https://m.iqiyi.com/mp/sharePlay.html?tvid=${tvid}` },
        { shortLink: "31JZyRo-f8", url: "https://qy.net/31JZyRo-f8" },
    ]) {
        const shared = await iqiyi({
            ...input,
            quality: 720,
            fetchImpl: async (target, options) => {
                if (new URL(target).hostname === "qy.net") {
                    return new Response(null, { status: 302, headers: {
                        location: `https://m.iqiyi.com/mp/sharePlay.html?tvid=${tvid}`,
                    } });
                }
                assert.equal(new URL(target).searchParams.get("tvid"), tvid);
                return fetchImpl(target, options);
            },
        });
        assert.equal(shared.urls, result.urls);
    }
});
