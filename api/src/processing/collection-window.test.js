import assert from "node:assert/strict";
import test from "node:test";

import { sliceCollectionFromItemKey } from "./collection-window.js";

const items = Array.from({ length: 80 }, (_, index) => ({
    itemKey: `douyin:video:${index + 1}`,
    url: `https://www.douyin.com/video/${index + 1}`,
}));

test("starts a collection at the copied video", () => {
    const result = sliceCollectionFromItemKey(items, "douyin:video:30");

    assert.equal(result.length, 51);
    assert.equal(result[0].itemKey, "douyin:video:30");
    assert.equal(result.at(-1).itemKey, "douyin:video:80");
});

test("keeps the full collection when the current video is first or unknown", () => {
    assert.equal(sliceCollectionFromItemKey(items, "douyin:video:1"), items);
    assert.equal(sliceCollectionFromItemKey(items, "douyin:video:999"), items);
});

test("guarantees the copied video is first when collection metadata omits it", () => {
    const fallbackItem = {
        itemKey: "douyin:video:999",
        url: "https://www.douyin.com/video/999",
    };
    const result = sliceCollectionFromItemKey(
        items,
        fallbackItem.itemKey,
        fallbackItem,
    );

    assert.equal(result[0], fallbackItem);
    assert.equal(result[1], items[0]);
});
