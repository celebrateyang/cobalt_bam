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
    globalThis.fetch = async () => ({ json: async () => response });
    try {
        return await callback();
    } finally {
        globalThis.fetch = originalFetch;
    }
};

test("an explicit Bilibili p parameter downloads only the selected page", async () => {
    const result = await withMockedFetch(
        bilibiliViewResponse,
        () => expandURL(
            "https://www.bilibili.com/video/BV1zy4y1L7Xd?vd_source=test&p=3",
        ),
    );

    assert.equal(result.kind, "single");
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].url, "https://www.bilibili.com/video/BV1zy4y1L7Xd?p=3");
    assert.equal(result.items[0].duration, 240);
});

test("a Bilibili video URL without p stays single even when it belongs to a long collection", async () => {
    const result = await withMockedFetch(
        bilibiliViewResponse,
        () => expandURL("https://www.bilibili.com/video/BV1zy4y1L7Xd"),
    );

    assert.equal(result.kind, "single");
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].url, "https://www.bilibili.com/video/BV1zy4y1L7Xd?p=1");
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
