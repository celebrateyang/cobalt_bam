import assert from "node:assert/strict";
import test from "node:test";

import { env } from "../config.js";
import { createStream, verifyStream, getInternalTunnelFromURL, destroyInternalStream } from "./manage.js";

test("SOOP HLS tunnels preserve CDN inputs and headers for FFmpeg", async (t) => {
    const originalApiURL = env.apiURL;
    env.apiURL = "https://api.example.com/";
    t.after(() => { env.apiURL = originalApiURL; });

    const urls = [
        "https://vod-normal-global-cdn-z02.sooplive.com/video.m3u8",
        "https://vod-normal-global-cdn-z02.sooplive.com/audio.m3u8",
    ];
    const headers = { referer: "https://vod.sooplive.com/player/208652619/catch" };

    for (const type of ["remux", "mute", "merge"]) {
        const source = type === "merge" ? urls : urls[0];
        const tunnel = new URL(createStream({
            type, url: source, service: "sooplive", isHLS: true,
            filename: "SOOP.mp4", headers,
        }));
        const params = tunnel.searchParams;
        const info = await verifyStream(
            params.get("id"), params.get("sig"), params.get("exp"),
            params.get("sec"), params.get("iv"),
        );

        assert.equal(info.type, type);
        assert.deepEqual(info.urls, source);
        assert.deepEqual(info.headers, headers);
        assert.equal(info.isHLS, true);
    }
});

test("generic HLS uses localhost inputs and preserves headers for every track", async (t) => {
    const oldURL = env.apiURL;
    env.apiURL = 'https://api.example.com/';
    t.after(() => { env.apiURL = oldURL; });
    const headers = { Cookie: 'token=test', Referer: 'https://v.youku.com/' };
    const source = ['https://cdn.example.com/video.m3u8', 'https://cdn.example.com/audio.m3u8'];
    const genericDownload = { url: 'https://v.youku.com/v_show/id_test.html', videoQuality: '720' };
    const tunnel = new URL(createStream({
        type: 'merge', url: source, service: 'v.youku.com', isHLS: true,
        filename: 'test.mp4', headers, genericDownload,
    }));
    const p = tunnel.searchParams;
    const info = await verifyStream(p.get('id'), p.get('sig'), p.get('exp'), p.get('sec'), p.get('iv'));
    assert.deepEqual(info.genericDownload, genericDownload);
    info.urls.forEach((url, index) => {
        t.after(() => destroyInternalStream(url));
        assert.equal(new URL(url).hostname, '127.0.0.1');
        const input = getInternalTunnelFromURL(url);
        assert.equal(input.url, source[index]);
        assert.deepEqual(Object.fromEntries(input.headers), headers);
    });
});
