import assert from "node:assert/strict";
import test from "node:test";

import iqiyi, {
    buildIqiyiDirectUrl,
    buildIqiyiInternationalUrls,
    decodeIqiyiPlayerData,
    decodeIqiyiTvid,
    getIqiyiFragmentPaths,
    parseIqiyiInternationalPage,
    resolveIqiyiFragments,
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

const internationalPageId = "q7bb47bdnc";
const internationalTvid = "2534543267915700";
const internationalSegment = (object, start, end) =>
    `https://pcw-data.video.iqiyi.com/videos/vts/${object}.ts?start=${start}&end=${end}` +
    `&contentlength=${end - start}&qd_index=vod&qd_tvid=${internationalTvid}&qd_sc=signed`;
const internationalManifest = [
    "#EXTM3U",
    "#EXT-X-TARGETDURATION:3",
    "#EXTINF:3.0,",
    internationalSegment("first", 0, 100),
    "#EXTINF:3.0,",
    internationalSegment("first", 100, 220),
    "#EXTINF:3.0,",
    internationalSegment("second", 0, 80),
    "#EXTINF:3.0,",
    internationalSegment("second", 80, 200),
    "#EXT-X-ENDLIST",
].join("\n");

const internationalHtml = ({ vip = false, manifest = internationalManifest } = {}) => {
    const data = {
        props: {
            initialState: {
                play: {
                    curVideoInfo: {
                        qipuIdStr: internationalPageId,
                        tvId: Number(internationalTvid),
                        name: "International program",
                        vipInfo: vip ? { isVip: 1, payMark: "VIP_MARK" } : {},
                    },
                    cachePlayList: {
                        1: [{
                            qipuIdStr: internationalPageId,
                            payMark: vip ? "VIP_MARK" : "",
                        }],
                    },
                },
            },
            initialProps: {
                pageProps: {
                    prePlayerData: {
                        dash: {
                            code: "A00000",
                            data: {
                                tvid: Number(internationalTvid),
                                content: { bossStatus: 0 },
                                program: {
                                    video: [{
                                        vid: "international-main",
                                        bid: 200,
                                        duration: 12,
                                        m3u8: manifest,
                                    }],
                                },
                            },
                        },
                    },
                },
            },
        },
    };
    return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
};

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

test("groups a complete international byte-range manifest into TS objects", () => {
    const urls = buildIqiyiInternationalUrls(internationalManifest, 12);
    assert.equal(urls.length, 2);
    assert.deepEqual(urls.map((value) => new URL(value).pathname), [
        "/videos/vts/first.ts",
        "/videos/vts/second.ts",
    ]);
    for (const value of urls) {
        const parsed = new URL(value);
        assert.equal(parsed.searchParams.has("start"), false);
        assert.equal(parsed.searchParams.has("end"), false);
        assert.equal(parsed.searchParams.has("contentlength"), false);
        assert.equal(parsed.searchParams.get("qd_sc"), "signed");
    }
});

test("rejects incomplete, encrypted, and untrusted international manifests", () => {
    assert.equal(buildIqiyiInternationalUrls(
        internationalManifest.replace("start=100", "start=101"),
        12,
    ), null);
    assert.equal(buildIqiyiInternationalUrls(
        internationalManifest.replace("#EXT-X-TARGETDURATION:3", "#EXT-X-KEY:METHOD=AES-128,URI=\"key\""),
        12,
    ), null);
    assert.equal(buildIqiyiInternationalUrls(
        internationalManifest.replace("pcw-data.video.iqiyi.com", "media.example.com"),
        12,
    ), null);
    assert.equal(buildIqiyiInternationalUrls(internationalManifest, 120), null);
});

test("extracts only complete free iQIYI international programs", async () => {
    const pageUrl = `https://www.iq.com/play/${internationalPageId}?lang=en_us`;
    const parsed = parseIqiyiInternationalPage({
        html: internationalHtml(),
        pageId: internationalPageId,
        quality: 720,
        pageUrl,
    });
    assert.equal(parsed.service, "iqiyi");
    assert.equal(parsed.iqiyiTsConcat, true);
    assert.equal(parsed.urls.length, 2);
    assert.equal(parsed.duration, 12);
    assert.equal(parsed.filenameAttributes.resolution, "360p");
    assert.equal(parsed.headers.referer, pageUrl);

    const result = await iqiyi({
        intlPageId: internationalPageId,
        quality: 720,
        fetchImpl: async (target, options) => {
            assert.equal(target.origin, "https://www.iq.com");
            assert.equal(target.pathname, `/play/${internationalPageId}`);
            assert.equal(target.searchParams.get("lang"), "en_us");
            assert.match(target.searchParams.get("fsv_ts"), /^\d+$/);
            assert.equal(options.redirect, "follow");
            return new Response(internationalHtml(), { status: 200 });
        },
    });
    assert.equal(result.service, "iqiyi");
    assert.equal(result.filenameAttributes.title, "International program");

    assert.equal(parseIqiyiInternationalPage({
        html: internationalHtml({ vip: true }),
        pageId: internationalPageId,
        quality: 360,
        pageUrl,
    }), null);
    assert.equal(parseIqiyiInternationalPage({
        html: internationalHtml({ manifest: internationalManifest.replace("#EXT-X-ENDLIST", "") }),
        pageId: internationalPageId,
        quality: 360,
        pageUrl,
    }), null);
});

test("validates and resolves legacy iQIYI F4V fragments", async () => {
    const files = [
        { d: 3000, l: "/v0/20180601/aa/bb/first.f4v?qd_sc=one" },
        { d: 3000, l: "/v0/20180601/aa/bb/second.f4v?qd_sc=two" },
    ];
    const paths = getIqiyiFragmentPaths({ duration: 6, fs: files });
    assert.deepEqual(paths, files.map((file) => file.l));
    assert.equal(getIqiyiFragmentPaths({ duration: 60, fs: files }), null);
    assert.equal(getIqiyiFragmentPaths({ duration: 6, fs: [{ d: 6000, l: "https://evil.example/a.f4v" }] }), null);

    const seen = [];
    const urls = await resolveIqiyiFragments(paths, "https://www.iqiyi.com/v_example.html", async (target) => {
        seen.push(target);
        const path = new URL(target).pathname.replace(/^\/videos/, "");
        return new Response(JSON.stringify({
            l: `https://cdn.example.com/videos${path}?signed=yes`,
        }), { status: 200 });
    });
    assert.equal(seen.length, 2);
    assert.deepEqual(urls.map((value) => new URL(value).pathname), [
        "/videos/v0/20180601/aa/bb/first.f4v",
        "/videos/v0/20180601/aa/bb/second.f4v",
    ]);
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

test("returns resolved legacy F4V fragments in playback order", async () => {
    const files = [
        { d: 3000, l: "/v0/20180601/aa/bb/first.f4v?qd_sc=one" },
        { d: 3000, l: "/v0/20180601/aa/bb/second.f4v?qd_sc=two" },
    ];
    const playerData = {
        code: "A00000",
        data: {
            tvid,
            program: {
                video: [{ vid: "legacy", bid: 500, duration: 6, isPreview: 0, m3u8Url: "", fs: files }],
            },
        },
    };
    const result = await iqiyi({
        pageId: "dwo67tu164",
        quality: 720,
        url: "https://www.iqiyi.com/v_dwo67tu164.html",
        fetchImpl: async (target) => {
            const parsed = new URL(target);
            if (parsed.hostname === "mesh.if.iqiyi.com") {
                return new Response(JSON.stringify({
                    videoInfo: { tvId: tvid, title: "Legacy program", effective: true, downloadAllowed: true },
                    ev: encodePlayerData(playerData),
                }), { status: 200 });
            }
            const path = parsed.pathname.replace(/^\/videos/, "");
            return new Response(JSON.stringify({
                l: `https://cdn.example.com/videos${path}?signed=yes`,
            }), { status: 200 });
        },
    });

    assert.equal(result.service, "iqiyi");
    assert.equal(result.urls.length, 2);
    assert.equal(new URL(result.urls[0]).pathname.endsWith("/first.f4v"), true);
    assert.equal(new URL(result.urls[1]).pathname.endsWith("/second.f4v"), true);
});
