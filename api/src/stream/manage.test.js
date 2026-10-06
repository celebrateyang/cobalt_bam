import assert from "node:assert/strict";
import test from "node:test";

import { env } from "../config.js";
import { createStream, verifyStream } from "./manage.js";

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
