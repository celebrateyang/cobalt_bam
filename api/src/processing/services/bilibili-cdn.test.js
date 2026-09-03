import assert from "node:assert/strict";
import test from "node:test";

import bilibiliCdn, { isBilibiliCdnHost } from "./bilibili-cdn.js";

const mediaResponse = ({ status = 206, contentType = "video/mp4" } = {}) => ({
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({ "content-type": contentType }),
    body: { cancel: async () => {} },
});

test("recognizes only the Bilibili CDN domain and its subdomains", () => {
    assert.equal(isBilibiliCdnHost("bilivideo.com"), true);
    assert.equal(isBilibiliCdnHost("upos-sz-mirrorcos.bilivideo.com"), true);
    assert.equal(isBilibiliCdnHost("bilivideo.com.example.com"), false);
    assert.equal(isBilibiliCdnHost("evilbilivideo.com"), false);
});

test("validates a signed CDN URL with Bilibili headers and returns Direct Bridge metadata", async () => {
    const url = new URL("https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/example.m4s?deadline=1999999999&token=abc");
    let request;
    const result = await bilibiliCdn({
        url,
        now: 1_800_000_000_000,
        fetchImpl: async (input, options) => {
            request = { input: input.toString(), options };
            return mediaResponse();
        },
    });

    assert.equal(request.input, url.toString());
    assert.equal(request.options.redirect, "manual");
    assert.equal(request.options.headers.referer, "https://www.bilibili.com/");
    assert.equal(request.options.headers.Range, "bytes=0-1023");
    assert.equal(result.service, "bilibili_cdn");
    assert.equal(result.urls, url.toString());
    assert.equal(result.directClientDownload, true);
    assert.equal(result.filenameAttributes.extension, "mp4");
});

test("rejects expired, denied, and non-media CDN responses", async () => {
    const expired = await bilibiliCdn({
        url: new URL("https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/example.m4s?deadline=1700000000"),
        now: 1_800_000_000_000,
        fetchImpl: async () => mediaResponse(),
    });
    assert.deepEqual(expired, { error: "bilibili.cdn.expired" });

    const denied = await bilibiliCdn({
        url: new URL("https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/example.m4s"),
        fetchImpl: async () => mediaResponse({ status: 403 }),
    });
    assert.deepEqual(denied, { error: "bilibili.cdn.expired" });

    const html = await bilibiliCdn({
        url: new URL("https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/example.m4s"),
        fetchImpl: async () => mediaResponse({ status: 200, contentType: "text/html" }),
    });
    assert.deepEqual(html, { error: "bilibili.cdn.not_media" });
});
