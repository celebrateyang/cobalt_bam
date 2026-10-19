import assert from "node:assert/strict";
import test from "node:test";

import soundcloud from "./soundcloud.js";

const transcoding = (preset, protocol = "hls", extra = {}) => ({
    preset,
    format: { protocol },
    url: `https://api-v2.soundcloud.com/media/${preset}/${protocol}`,
    ...extra,
});

async function extract(t, transcodings, format = "mp3") {
    const calls = [];
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        calls.push(url);
        if (url.hostname === "soundcloud.com") {
            return new Response('<script>window.__sc_version="1792400581"</script>'
                + '<script src="https://a-v2.sndcdn.com/assets/test.js"></script>');
        }
        if (url.hostname === "a-v2.sndcdn.com") {
            return new Response('client_id:"0123456789abcdef0123456789abcdef"');
        }
        if (url.pathname === "/resolve") {
            return Response.json({
                id: 2356096607,
                title: "Regression track",
                duration: 378508,
                policy: "ALLOW",
                track_authorization: "test-authorization",
                media: { transcodings },
            });
        }
        assert.equal(url.searchParams.get("track_authorization"), "test-authorization");
        return Response.json({ url: "https://cf-hls-media.sndcdn.com/playlist?token=test" });
    });
    const result = await soundcloud({
        author: "disco-hits-remix",
        song: "5up3r5t1t10n-safetyjac-re-edit",
        format,
    });
    return { result, calls };
}

test("AAC-only tracks select the highest bitrate and retain HLS processing", async (t) => {
    const { result, calls } = await extract(t, [
        transcoding("aac_160k"),
        transcoding("aac_96k"),
        transcoding("abr_sq"),
    ]);
    assert.equal(calls.at(-1).pathname, "/media/aac_160k/hls");
    assert.equal(result.bestAudio, "m4a");
    assert.equal(result.isHLS, true);
    assert.equal(result.directClientDownload, false);
    assert.equal(result.duration, 379);
});

test("MP3 preference still takes precedence over AAC and Opus", async (t) => {
    const { result, calls } = await extract(t, [
        transcoding("aac_160k"),
        transcoding("opus_0_0"),
        transcoding("mp3_0_1", "progressive"),
    ]);
    assert.equal(calls.at(-1).pathname, "/media/mp3_0_1/progressive");
    assert.equal(result.bestAudio, "mp3");
    assert.equal(result.isHLS, false);
    assert.equal(result.directClientDownload, true);
});

test("best quality keeps the existing Opus preference", async (t) => {
    const { result } = await extract(t, [
        transcoding("aac_160k"),
        transcoding("opus_0_0"),
        transcoding("mp3_0_1", "progressive"),
    ], "best");
    assert.equal(result.bestAudio, "opus");
});

test("AAC fallback skips previews and encrypted streams", async (t) => {
    const { result, calls } = await extract(t, [
        transcoding("aac_256k", "hls", { snipped: true }),
        transcoding("aac_256k", "hls_encrypted"),
        transcoding("aac_96k"),
    ]);
    assert.equal(calls.at(-1).pathname, "/media/aac_96k/hls");
    assert.equal(result.bestAudio, "m4a");
});

test("empty or absent transcodings return a structured error", async (t) => {
    for (const transcodings of [[], undefined]) {
        const { result } = await extract(t, transcodings);
        assert.deepEqual(result, { error: "fetch.empty" });
        t.mock.restoreAll();
    }
});
