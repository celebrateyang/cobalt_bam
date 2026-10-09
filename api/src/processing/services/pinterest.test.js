import assert from "node:assert/strict";
import test from "node:test";

import pinterest from "./pinterest.js";

const pinId = "1129136937861945132";
const mediaBase = "https://v1.pinimg.com/videos/iht";
const hlsUrl = `${mediaBase}/hls/62/48/ad/6248addb8d9da69aa19aad6e3acda1de.m3u8`;
const mp4Url = `${mediaBase}/expMp4/62/48/ad/6248addb8d9da69aa19aad6e3acda1de_720w.mp4`;

test("extracts HLS-only Story Pins instead of reporting empty media", async (t) => {
    t.mock.method(globalThis, "fetch", async () => ({
        text: async () => JSON.stringify({
            storyPinData: { pages: [{ blocks: [{
                __typename: "StoryPinVideoBlock",
                videoDataV2: {
                    videoList720P: { v720P: { duration: 30000 } },
                    videoList: { vHLSV3MOBILE: { url: hlsUrl } },
                },
            }] }] },
        }),
    }));

    assert.deepEqual(await pinterest({ id: pinId }), {
        urls: hlsUrl,
        isHLS: true,
        filename: `pinterest_${pinId}.mp4`,
        audioFilename: `pinterest_${pinId}_audio`,
    });
});

test("prefers MP4 over HLS when both are available", async (t) => {
    t.mock.method(globalThis, "fetch", async () => ({
        text: async () => JSON.stringify([{ url: hlsUrl }, { url: mp4Url }]),
    }));

    const result = await pinterest({ id: pinId });
    assert.equal(result.urls, mp4Url);
    assert.equal(result.isHLS, undefined);
});

test("returns fetch.empty instead of throwing when Pinterest has no media", async (t) => {
    t.mock.method(globalThis, "fetch", async () => ({
        text: async () => "<html></html>"
    }));

    await assert.doesNotReject(() => pinterest({ id: "710935491197723081" }));
    assert.deepEqual(
        await pinterest({ id: "710935491197723081" }),
        { error: "fetch.empty" }
    );
});

test("returns fetch.fail when a short link cannot be resolved", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
        throw new Error("network failure");
    });

    assert.deepEqual(
        await pinterest({ shortLink: "unresolved" }),
        { error: "fetch.fail" }
    );
});
