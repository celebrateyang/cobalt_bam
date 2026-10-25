import assert from "node:assert/strict";
import test from "node:test";
import aparat, { aparatShortsCandidates, expandAparat, isAparatMediaURL, probeAparatMP4 } from "./aparat.js";

const media = "https://edge.cdn.asset.aparat.com/aparat-short/2112380532416004096.mp4?sig=keep%26me";
const mp4 = Buffer.from("000000206674797069736f6d00", "hex");
const json = value => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });

test("Shorts preserves large IDs and signed query strings and probes a complete MP4", async () => {
    const calls = [];
    const fetcher = async (url, options) => {
        calls.push([url, options]);
        if (url.includes("/posts/")) return json({ status: "ok", data: { post: { type: "short-video", description: "Test",
            short_videos: [{ duration: 35.8 }], user: { username: "creator" } } } });
        if (url.includes("/hls/")) return new Response(`#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100,RESOLUTION=720x1280\n${media.replace('.mp4?', '.mp4/chunk.m3u8?')}\n`);
        assert.equal(url, media);
        assert.equal(options.headers.Range, "bytes=0-15");
        return new Response(mp4, { status: 206 });
    };
    const result = await aparat({ shortId: "2112380547795222528" }, fetcher);
    assert.equal(result.urls, media);
    assert.equal(result.filenameAttributes.id, "2112380547795222528");
    assert.equal(result.filenameAttributes.qualityLabel, "720p");
    assert.equal(result.directClientDownload, true);
    assert.equal(calls.length, 3);
    assert.ok(calls.every(([, options]) => options.redirect === "error"));
});

test("ordinary video selects requested quality and falls back only to verified CDN MP4 candidates", async () => {
    const urls = [1080, 720, 360].map(h => `https://edge.cdn.asset.aparat.com/aparat-video/test${h}.apt?sig=a`);
    const probes = [];
    const result = await aparat({ id: "abc12", quality: "720" }, async (url) => {
        if (url.includes("/etc/api/")) return json({ video: { title: "Video", duration: "12", can_download: true,
            file_link_all: urls.map((url, i) => ({ profile: [1080, 720, 360][i] + "p", urls: [url] })) } });
        probes.push(url);
        return new Response(url === urls[1] ? "not a video" : mp4, { status: 206 });
    });
    assert.deepEqual(probes, [urls[1], urls[2]]);
    assert.equal(result.urls, urls[2]);
});

test("untrusted media URLs, credentials, ports, HLS and arbitrary paths are rejected", () => {
    assert.equal(isAparatMediaURL(media), true);
    for (const url of [media.replace('aparat.com', 'aparat.com.evil.test'), media.replace('https:', 'http:'),
        media.replace('https://', 'https://user:pass@'), media.replace('.com/', '.com:8443/'),
        media.replace('/aparat-short/', '/other/'), media.replace('.mp4?', '.m3u8?')]) assert.equal(isAparatMediaURL(url), false, url);
    assert.deepEqual(aparatShortsCandidates('#EXT-X-STREAM-INF:RESOLUTION=720x1280\nhttps://evil.test/aparat-short/123.mp4/chunk.m3u8'), []);
});

test("MP4 probe cancels a server that ignores Range without buffering the whole media", async () => {
    let canceled = false;
    const stream = new ReadableStream({ start(controller) { controller.enqueue(mp4); }, cancel() { canceled = true; } });
    assert.equal(await probeAparatMP4(media, async () => new Response(stream)), true);
    assert.equal(canceled, true);
});

const page = (uids, total, next) => ({ data: { attributes: { title: "Playlist", cnt: total, list_videos_playlist: { link_next: next } },
    relationships: { video: { data: uids.map(uid => ({ type: "Video", id: `ref-${uid}` })) } } },
    included: [...uids].reverse().map(uid => ({ type: "Video", id: `ref-${uid}`, attributes: { id: "different", uid, title: uid, duration: "15" } })) });

test("playlist follows ordered references, deduplicates pages and ignores a next link once complete", async () => {
    const calls = [];
    const next = "/api/fa/v1/video/playlist/get_list_video/page/2/playlist_id/531891";
    const result = await expandAparat("https://www.aparat.com/playlist/531891", async url => {
        calls.push(url);
        return json(calls.length === 1 ? page(["first", "second"], 3, next) : page(["second", "third"], 3, next));
    });
    assert.equal(result.kind, "aparat-playlist");
    assert.equal(result.collectionKey, "aparat:playlist:531891");
    assert.deepEqual(result.items.map(item => item.url), ["first", "second", "third"].map(uid => `https://www.aparat.com/v/${uid}`));
    assert.equal(calls.length, 2);
    assert.ok(result.items.every(item => !item.url.includes("cdn") && item.itemKey.startsWith("aparat:video:")));
});

test("playlist rejects unsafe pagination, missing entries, no progress and oversized collections", async () => {
    for (const data of [page(["first"], 2, "https://evil.test/api/fa/v1/video/playlist/get_list_video/playlist_id/531891"),
        page(["first"], 2, null), page(["first"], 501, null),
        page(["first"], 2, "/api/fa/v1/video/playlist/get_list_video/page/1/playlist_id/531891")]) {
        const result = await expandAparat("https://www.aparat.com/playlist/531891", async () => json(data));
        assert.equal(result.kind, "error");
        assert.equal(result.items, undefined);
    }
});

test("playlist accepts the list-shaped pagination response", async () => {
    let calls = 0;
    const result = await expandAparat("https://www.aparat.com/playlist/531891", async () => {
        calls++;
        return json(calls === 1 ? page(["first"], 2, "/api/fa/v1/video/playlist/get_list_video/page/2/playlist_id/531891")
            : { data: [{ type: "Video", id: "ref-second", attributes: { uid: "second", title: "Second" } }] });
    });
    assert.equal(result.kind, "aparat-playlist");
    assert.equal(result.items.length, 2);
});

test("Aparat player links with a playlist parameter expand the collection", async () => {
    const result = await expandAparat("https://www.aparat.com/v/7R9YB?playlist=531891", async url => {
        assert.ok(url.endsWith("/playlist_id/531891"));
        return json(page(["first"], 1));
    });
    assert.equal(result.kind, "aparat-playlist");
    assert.equal(result.currentUrl, "https://www.aparat.com/playlist/531891");
});

test("blocked, private and missing direct media fail without an HLS or yt-dlp fallback", async () => {
    for (const video of [{ title: "Private", isHidden: true }, { title: "Paid", cost_type: { type: "paid" } },
        { title: "Disabled", can_download: false }, { title: "No file", file_link: "https://evil.test/video.mp4" }]) {
        let calls = 0;
        const result = await aparat({ id: "test" }, async () => { calls++; return json({ video }); });
        assert.ok(result.error);
        assert.equal(result.urls, undefined);
        assert.equal(calls, 1);
    }
});
