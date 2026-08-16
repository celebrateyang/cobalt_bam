import assert from "node:assert/strict";
import test from "node:test";

import tiktok, {
    buildTikTokShortLinkUrl,
    getTikTokOriginalShareUrl,
    isTikTokCollectionUrl,
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

test("recognizes TikTok collection URLs", () => {
    assert.equal(
        isTikTokCollectionUrl("https://www.tiktok.com/@creator/collection/asmr-7407927138970110726?share=1"),
        true,
    );
    assert.equal(
        isTikTokCollectionUrl("https://www.tiktok.com/@creator/video/7531234567890123456"),
        false,
    );
});

test("returns a friendly error when a short link resolves to a collection", async (t) => {
    const requests = [];
    t.mock.method(globalThis, "fetch", async (input) => {
        requests.push(String(input));
        return {
            headers: new Headers({
                location: "https://www.tiktok.com/@creator/collection/asmr-7407927138970110726?share=1",
            }),
            text: async () => "",
        };
    });

    const result = await tiktok({
        url: "https://vt.tiktok.com/example",
        shortLink: "example",
    });

    assert.deepEqual(result, { error: "tiktok.collection.unsupported" });
    assert.equal(requests.length, 1);
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
                code: 0,
                data: {
                    status: 2,
                    detail: {
                        id: "7531234567890123456",
                        play_url: "https://v16.tokcdn.com/hash/time/7531234567890123456_original.mp4",
                        author: { unique_id: "creator" },
                    },
                },
            }),
        };
    });

    const result = await tiktok({
        url: "https://vm.tiktok.com/ZG9hWhf2CwnqE-ytsZH",
        shortLink: "ZG9hWhf2CwnqE-ytsZH",
    });

    assert.equal(requests[0].url, "https://vm.tiktok.com/ZG9hWhf2CwnqE-ytsZH");
    assert.match(requests[1].url, /\/api\/video\/task\/result\?task_id=/);
    assert.equal(
        result.urls,
        "https://v16.tokcdn.com/hash/time/7531234567890123456_original.mp4",
    );
    assert.equal(result.tiktokVideoSource, "tikwm-original");
    assert.equal(result.tiktokOriginalQuality, true);
    assert.equal(result.tiktokUsedDirectProvider, true);
});
