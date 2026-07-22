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
