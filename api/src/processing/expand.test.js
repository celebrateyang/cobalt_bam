import assert from "node:assert/strict";
import test from "node:test";

import { expandURL } from "./expand.js";

const bilibiliViewResponse = {
    code: 0,
    data: {
        bvid: "BV1zy4y1L7Xd",
        title: "Selected multi-page video",
        pages: [
            { page: 1, cid: 101, duration: 120, part: "Part 1" },
            { page: 2, cid: 102, duration: 180, part: "Part 2" },
            { page: 3, cid: 103, duration: 240, part: "Part 3" },
        ],
        ugc_season: {
            id: 99,
            sections: [
                {
                    episodes: [
                        {
                            bvid: "BV1zy4y1L7Xd",
                            title: "Selected video",
                            page: { duration: 120 },
                        },
                        {
                            bvid: "BV1LongSibling",
                            title: "Long sibling",
                            page: { duration: 60 * 60 },
                        },
                    ],
                },
            ],
        },
    },
};

const withMockedFetch = async (response, callback) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (...args) => ({
        json: async () => typeof response === "function" ? response(...args) : response,
    });
    try {
        return await callback();
    } finally {
        globalThis.fetch = originalFetch;
    }
};

const tiktokPlaylistResponse = {
    status_code: 0,
    has_more: 0,
    item_list: [
        {
            item_basic: {
                id: "7531234567890123456",
                desc: "First playlist video",
                creator: { base: { unique_id: "creator" } },
                video: { video_play_info: { duration: 12 } },
            },
        },
        {
            item_basic: {
                id: "7531234567890123457",
                desc: "Second playlist video",
                creator: { base: { unique_id: "creator" } },
                video: { video_play_info: { duration: 15 } },
            },
        },
    ],
};

test("a Douyin short link that redirects to a mix expands the collection", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
        const url = String(input);
        if (url.startsWith("https://v.douyin.com/")) {
            return {
                url: "https://www.iesdouyin.com/share/mix/detail/7591102261880457267/",
            };
        }
        if (url.includes("/aweme/v1/mix/detail/")) {
            return {
                json: async () => ({
                    status_code: 0,
                    mix_info: { mix_name: "Test mix" },
                }),
            };
        }
        if (url.includes("/aweme/v1/mix/aweme/")) {
            return {
                json: async () => ({
                    status_code: 0,
                    has_more: 0,
                    aweme_list: [
                        { aweme_id: "7590030343332318502", desc: "First" },
                        { aweme_id: "7590030343332318503", desc: "Second" },
                    ],
                }),
            };
        }
        throw new Error(`Unexpected fetch: ${url}`);
    };

    try {
        const result = await expandURL("https://v.douyin.com/atTMVEAQGN0/");
        assert.equal(result.kind, "douyin-mix");
        assert.equal(result.title, "Test mix");
        assert.deepEqual(
            result.items.map((item) => item.url),
            [
                "https://www.douyin.com/video/7590030343332318502",
                "https://www.douyin.com/video/7590030343332318503",
            ],
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("an explicit TikTok shared collection returns a specific error", async () => {
    const result = await expandURL(
        "https://www.tiktok.com/@creator/collection/asmr-7407927138970110726",
    );

    assert.equal(result.kind, "tiktok-shared-collection");
    assert.equal(result.error.code, "error.api.tiktok.collection.unsupported");
});

test("a TikTok short link that redirects to a shared collection returns a specific error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
        headers: new Headers({
            location: "https://www.tiktok.com/@creator/collection/asmr-7407927138970110726",
        }),
        text: async () => "",
    });

    try {
        const result = await expandURL("https://vt.tiktok.com/example/");
        assert.equal(result.kind, "tiktok-shared-collection");
        assert.equal(result.error.code, "error.api.tiktok.collection.unsupported");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("an explicit TikTok creator playlist expands into batch items", async () => {
    const result = await withMockedFetch(
        tiktokPlaylistResponse,
        () => expandURL(
            "https://www.tiktok.com/@creator/playlist/tutorials-7407927138970110726",
        ),
    );

    assert.equal(result.kind, "tiktok-playlist");
    assert.equal(result.collectionKey, "tiktok:playlist:7407927138970110726");
    assert.deepEqual(
        result.items.map((item) => item.url),
        [
            "https://www.tiktok.com/@creator/video/7531234567890123456",
            "https://www.tiktok.com/@creator/video/7531234567890123457",
        ],
    );
});

test("a TikTok short link that redirects to a creator playlist expands it", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
        const url = String(input);
        if (url.startsWith("https://vt.tiktok.com/")) {
            return {
                headers: new Headers({
                    location: "https://www.tiktok.com/@creator/playlist/tutorials-7407927138970110726",
                }),
                text: async () => "",
            };
        }
        if (url.includes("/api/reflow/playlist/item_list/")) {
            return { json: async () => tiktokPlaylistResponse };
        }
        throw new Error(`Unexpected fetch: ${url}`);
    };

    try {
        const result = await expandURL("https://vt.tiktok.com/playlist-example/");
        assert.equal(result.kind, "tiktok-playlist");
        assert.equal(result.items.length, 2);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("a TikTok video in a creator playlist expands the surrounding playlist", async () => {
    const originalFetch = globalThis.fetch;
    const hydration = {
        __DEFAULT_SCOPE__: {
            "webapp.video-detail": {
                itemInfo: {
                    itemStruct: {
                        id: "7531234567890123456",
                        desc: "Selected video",
                        playlistId: "7407927138970110726",
                        author: { uniqueId: "creator" },
                        video: { duration: 12 },
                    },
                },
            },
        },
    };
    globalThis.fetch = async (input) => {
        const url = String(input);
        if (url.includes("/@i/video/7531234567890123456")) {
            return {
                ok: true,
                text: async () =>
                    `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(hydration)}</script>`,
            };
        }
        if (url.includes("/api/reflow/playlist/item_list/")) {
            return { json: async () => tiktokPlaylistResponse };
        }
        throw new Error(`Unexpected fetch: ${url}`);
    };

    try {
        const result = await expandURL(
            "https://www.tiktok.com/@creator/video/7531234567890123456",
        );
        assert.equal(result.kind, "tiktok-playlist");
        assert.equal(result.items.length, 2);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("an explicit Bilibili p parameter expands the remaining pages from the selected page", async () => {
    const result = await withMockedFetch(
        bilibiliViewResponse,
        () => expandURL(
            "https://www.bilibili.com/video/BV1zy4y1L7Xd?vd_source=test&p=2",
        ),
    );

    assert.equal(result.kind, "bilibili-multi-page");
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].url, "https://www.bilibili.com/video/BV1zy4y1L7Xd?p=2");
    assert.equal(result.items[0].duration, 180);
    assert.equal(result.items[1].url, "https://www.bilibili.com/video/BV1zy4y1L7Xd?p=3");
});

test("a legacy Bilibili media-list URL expands its selected video", async () => {
    const result = await withMockedFetch(
        bilibiliViewResponse,
        () => expandURL(
            "https://www.bilibili.com/list/ml1747518848?oid=458824467&bvid=BV1zy4y1L7Xd&p=2",
        ),
    );

    assert.equal(result.kind, "bilibili-multi-page");
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].url, "https://www.bilibili.com/video/BV1zy4y1L7Xd?p=2");
    assert.equal(result.items[1].url, "https://www.bilibili.com/video/BV1zy4y1L7Xd?p=3");
});

test("a legacy Bilibili media-list URL can fall back to its selected aid", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.searchParams.get("aid"), "458824467");
        return { json: async () => bilibiliViewResponse };
    };

    try {
        const result = await expandURL(
            "https://www.bilibili.com/list/ml1747518848?oid=458824467",
        );
        assert.equal(result.kind, "bilibili-multi-page");
        assert.equal(result.items.length, 3);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("a plain legacy Bilibili media-list URL expands the favorites list", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, "/x/v3/fav/resource/list");
        assert.equal(url.searchParams.get("media_id"), "1747518848");
        const pageNum = Number(url.searchParams.get("pn"));

        return {
            json: async () => ({
                code: 0,
                data: {
                    info: {
                        title: "Test favorites",
                        media_count: 3,
                    },
                    medias: pageNum === 1
                        ? [
                            { bvid: "BV1First", title: "First", duration: 120 },
                            { bvid: "BV1Second", title: "Second", duration: 180 },
                        ]
                        : [
                            { bvid: "BV1Third", title: "Third", duration: 240 },
                        ],
                    has_more: pageNum === 1,
                },
            }),
        };
    };

    try {
        const result = await expandURL(
            "https://www.bilibili.com/list/ml1747518848",
        );
        assert.equal(result.kind, "bilibili-media-list");
        assert.equal(result.title, "Test favorites");
        assert.equal(result.collectionKey, "bilibili:media-list:1747518848");
        assert.equal(result.totalCount, 3);
        assert.equal(result.truncated, false);
        assert.deepEqual(
            result.items.map((item) => item.url),
            [
                "https://www.bilibili.com/video/BV1First",
                "https://www.bilibili.com/video/BV1Second",
                "https://www.bilibili.com/video/BV1Third",
            ],
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("a Bilibili mobile playlist URL expands as a media list", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, "/x/v3/fav/resource/list");
        assert.equal(url.searchParams.get("media_id"), "3996964820");

        return {
            json: async () => ({
                code: 0,
                data: {
                    info: { title: "VS Arashi", media_count: 1 },
                    medias: [
                        { bvid: "BV1Playlist", title: "Episode 1", duration: 120 },
                    ],
                    has_more: false,
                },
            }),
        };
    };

    try {
        const result = await expandURL(
            "https://m.bilibili.com/playlist/pl3996964820",
        );
        assert.equal(result.kind, "bilibili-media-list");
        assert.equal(result.collectionKey, "bilibili:media-list:3996964820");
        assert.deepEqual(result.items.map((item) => item.url), [
            "https://www.bilibili.com/video/BV1Playlist",
        ]);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("a Bilibili multi-page video still expands when its collection has a long item", async () => {
    const longSiblingResponse = {
        code: 0,
        data: {
            bvid: "BV1LongSibling",
            title: "Long sibling",
            pages: [{ page: 1, cid: 201, duration: 60 * 60, part: "Long" }],
        },
    };
    const result = await withMockedFetch(
        (input) => String(input).includes("BV1LongSibling")
            ? longSiblingResponse
            : bilibiliViewResponse,
        () => expandURL("https://www.bilibili.com/video/BV1zy4y1L7Xd"),
    );

    assert.equal(result.kind, "bilibili-multi-page");
    assert.equal(result.items.length, 3);
    assert.equal(result.items[0].url, "https://www.bilibili.com/video/BV1zy4y1L7Xd?p=1");
});

test("a Bilibili season uses the first page duration instead of the multi-page total", async () => {
    const multiPageSeasonView = {
        code: 0,
        data: {
            bvid: "BV1Current",
            title: "Current video",
            cid: 201,
            pages: [{ page: 1, cid: 201, duration: 120, part: "Current" }],
            ugc_season: {
                id: 100,
                title: "Multi-page collection",
                sections: [
                    {
                        episodes: [
                            {
                                bvid: "BV1Current",
                                title: "Current",
                                pages: [{ page: 1, duration: 120 }],
                                arc: { duration: 60 * 60 },
                            },
                            {
                                bvid: "BV1Sibling",
                                title: "Sibling",
                                pages: [{ page: 1, duration: 180 }],
                                arc: { duration: 2 * 60 * 60 },
                            },
                        ],
                    },
                ],
            },
        },
    };
    const result = await withMockedFetch(
        multiPageSeasonView,
        () => expandURL("https://www.bilibili.com/video/BV1Current"),
    );

    assert.equal(result.kind, "bilibili-ugc-season");
    assert.equal(result.items.length, 2);
    assert.equal(result.items[1].duration, 180);
});

test("a Bilibili video URL expands its collection when every item is within 50 minutes", async () => {
    const shortCollectionView = {
        code: 0,
        data: {
            bvid: "BV1Current",
            title: "Current video",
            cid: 201,
            pages: [{ page: 1, cid: 201, duration: 120, part: "Current" }],
            ugc_season: {
                id: 100,
                title: "Short collection",
                sections: [
                    {
                        episodes: [
                            { bvid: "BV1Current", title: "Current", page: { duration: 120 } },
                            { bvid: "BV1Sibling", title: "Sibling", page: { duration: 180 } },
                        ],
                    },
                ],
            },
        },
    };
    for (const url of [
        "https://www.bilibili.com/video/BV1Current",
        "https://www.bilibili.com/video/BV1Current?p=1",
    ]) {
        const result = await withMockedFetch(
            shortCollectionView,
            () => expandURL(url),
        );

        assert.equal(result.kind, "bilibili-ugc-season");
        assert.equal(result.items.length, 2);
    }
});

test("a Bilibili season starts at the submitted episode and marks preview-only items restricted", async () => {
    const episodes = [
        { bvid: "BV1First", title: "EP1", page: { cid: 301, duration: 600 } },
        { bvid: "BV1Current", title: "EP2", page: { cid: 302, duration: 600 } },
        { bvid: "BV1Next", title: "EP3", page: { cid: 303, duration: 600 } },
    ];
    const currentView = {
        code: 0,
        data: {
            bvid: "BV1Current",
            title: "EP2",
            cid: 302,
            pages: [{ page: 1, cid: 302, duration: 600, part: "EP2" }],
            ugc_season: {
                id: 101,
                title: "Paid season",
                sections: [{ episodes }],
            },
        },
    };
    const result = await withMockedFetch(
        (input) => {
            const url = new URL(String(input));
            if (url.pathname === "/x/player/playurl") {
                return url.searchParams.get("bvid") === "BV1Current"
                    ? {
                        code: 0,
                        data: {
                            timelength: 600_000,
                            durl: [{ length: 20_000 }],
                        },
                    }
                    : {
                        code: 0,
                        data: {
                            dash: { video: [{}], audio: [{}] },
                        },
                    };
            }

            const bvid = url.searchParams.get("bvid");
            const episode = episodes.find((item) => item.bvid === bvid);
            if (episode && bvid !== "BV1Current") {
                return {
                    code: 0,
                    data: {
                        bvid,
                        title: episode.title,
                        cid: episode.page.cid,
                        pages: [{
                            page: 1,
                            cid: episode.page.cid,
                            duration: episode.page.duration,
                            part: episode.title,
                        }],
                    },
                };
            }
            return currentView;
        },
        () => expandURL("https://www.bilibili.com/video/BV1Current"),
    );

    assert.equal(result.kind, "bilibili-ugc-season");
    assert.deepEqual(result.items.map((item) => item.title), ["EP2", "EP3"]);
    assert.equal(result.items[0].availability, "platform_restricted");
    assert.equal(result.items[1].availability, "available");
});

test("an explicit Bilibili collection URL is blocked when an item exceeds 50 minutes", async () => {
    const collectionResponse = {
        code: 0,
        data: {
            meta: { total: 2, name: "Long collection" },
            page: { total: 2 },
            archives: [
                { bvid: "BV1Short", title: "Short", duration: 120 },
                { bvid: "BV1Long", title: "Long", duration: 60 * 60 },
            ],
        },
    };
    const result = await withMockedFetch(
        collectionResponse,
        () => expandURL("https://space.bilibili.com/123/lists/99?type=season"),
    );

    assert.equal(result.error.code, "error.api.bilibili.collection_has_long_video");
    assert.equal(result.error.context.limit, 50);
});
