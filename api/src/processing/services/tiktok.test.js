import assert from "node:assert/strict";
import test from "node:test";

import tiktok, {
    buildTikTokShortLinkUrl,
    getTikTokOriginalShareUrl,
} from "./tiktok.js";

test("preserves the original TikTok short-link domain", () => {
    assert.equal(
        buildTikTokShortLinkUrl({
            url: "https://vm.tiktok.com/ZG9hWhf2CwnqE-ytsZH",
            shortLink: "ZG9hWhf2CwnqE-ytsZH",
        }),
        "https://vm.tiktok.com/ZG9hWhf2CwnqE-ytsZH",
    );
});

test("falls back to the legacy vt domain without a valid source URL", () => {
    assert.equal(
        buildTikTokShortLinkUrl({
            url: "https://example.com/not-tiktok",
            shortLink: "abc123",
        }),
        "https://vt.tiktok.com/abc123",
    );
});

test("preserves a parameterized TikTok share URL for yt-dlp", () => {
    const url = "https://www.tiktok.com/@creator/video/7667533730919009569?checksum=abc&sec_user_id=user123";
    assert.equal(getTikTokOriginalShareUrl(url), url);
});

test("does not enable the yt-dlp fast path for ordinary canonical URLs", () => {
    assert.equal(
        getTikTokOriginalShareUrl(
            "https://www.tiktok.com/@creator/video/7667533730919009569",
        ),
        "",
    );
    assert.equal(
        getTikTokOriginalShareUrl(
            "https://example.com/@creator/video/7667533730919009569?checksum=abc",
        ),
        "",
    );
});

test("resolves a vm short link from its Location header", async (t) => {
    const requests = [];
    t.mock.method(globalThis, "fetch", async (input, init) => {
        requests.push({ url: String(input), init });

        if (requests.length === 1) {
            return {
                headers: new Headers({
                    location: "https://www.tiktok.com/@creator/video/7531234567890123456?share=1",
                }),
                text: async () => "",
            };
        }

        return {
            ok: true,
            status: 200,
            json: async () => ({
                id: "7531234567890123456",
                medias: [{
                    media_type: "video",
                    resource_url: "https://media.tokcdn.com/video.mp4",
                }],
            }),
        };
    });

    const result = await tiktok({
        url: "https://vm.tiktok.com/ZG9hWhf2CwnqE-ytsZH",
        shortLink: "ZG9hWhf2CwnqE-ytsZH",
    });

    assert.equal(requests[0].url, "https://vm.tiktok.com/ZG9hWhf2CwnqE-ytsZH");
    assert.equal(
        JSON.parse(requests[1].init.body).link,
        "https://www.tiktok.com/@creator/video/7531234567890123456",
    );
    assert.equal(result.urls, "https://media.tokcdn.com/video.mp4");
    assert.equal(result.tiktokUsedDirectProvider, true);
});
