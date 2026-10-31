import test from "node:test";
import assert from "node:assert/strict";
import { normalizeURL, extract } from "./url.js";

const enabled = new Set(["bilibili"]);
const comId = "BV1m2p562Ei5";

for (const prefix of ["", "zh-Hant/", "zh-Hans/"]) {
    test(`Bilibili ${prefix || "canonical"} video uses the native extractor`, () => {
        const result = extract(normalizeURL(`https://www.bilibili.com/${prefix}video/${comId}`), enabled);
        assert.equal(result.host, "bilibili");
        assert.deepEqual(result.patternMatch, { comId });
    });
    test(`Bilibili ${prefix || "canonical"} video preserves the requested part`, () => {
        const result = extract(normalizeURL(`https://www.bilibili.com/${prefix}video/${comId}/?p=2`), enabled);
        assert.equal(result.host, "bilibili");
        assert.deepEqual(result.patternMatch, { comId, partId: "2" });
    });
}
test("a translated non-video page remains unsupported", () => {
    assert.equal(extract(normalizeURL("https://www.bilibili.com/zh-Hant/account/settings"), enabled).error, "link.unsupported");
});
