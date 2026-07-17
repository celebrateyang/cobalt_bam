import assert from "node:assert/strict";
import test from "node:test";

import { normalizePlatformDomain } from "./platform-domain.js";
import { extract, identifyService } from "./url.js";
import { createResponse } from "./request.js";

test("normalizes public URLs to registrable domains", () => {
    assert.deepEqual(
        normalizePlatformDomain("https://m.example.co.uk/video/1?token=secret#part"),
        {
            domain: "example.co.uk",
            homepageUrl: "https://example.co.uk/",
        },
    );
    assert.deepEqual(normalizePlatformDomain("Example.COM"), {
        domain: "example.com",
        homepageUrl: "https://example.com/",
    });
});

test("rejects private, non-web, and malformed platform inputs", () => {
    for (const value of ["localhost", "127.0.0.1", "https://video.internal/a", "ftp://example.com/file", "not a domain"]) {
        assert.equal(normalizePlatformDomain(value), null);
    }
});

test("distinguishes unknown platforms from invalid and unsupported URLs", () => {
    const enabled = new Set(["youtube"]);

    assert.deepEqual(extract(new URL("ftp://example.com/file"), enabled), {
        error: "link.invalid",
    });
    assert.deepEqual(extract(new URL("https://video.example.co.uk/watch/1"), enabled), {
        error: "platform.unsupported",
        domain: "example.co.uk",
    });
    assert.equal(
        extract(new URL("https://youtube.com/channel/example"), enabled).error,
        "youtube.link.unsupported",
    );
});

test("recognizes configured platforms independently from URL patterns", () => {
    const enabled = new Set(["youtube"]);
    assert.equal(identifyService("https://studio.youtube.com/example", enabled)?.service, "youtube");
    assert.equal(identifyService("https://youtube.com/", enabled)?.enabled, true);
    assert.equal(identifyService("https://youtu.be/", enabled)?.service, "youtube");
    assert.equal(identifyService("https://b23.tv/", enabled)?.service, "bilibili");
});

test("exposes explicit platform request metadata on eligible errors", () => {
    const response = createResponse("error", {
        code: "error.api.platform.unsupported",
        context: { domain: "example.co.uk" },
        platformRequest: { eligible: true, domain: "example.co.uk" },
    });
    assert.equal(response.status, 400);
    assert.deepEqual(response.body.platformRequest, {
        eligible: true,
        domain: "example.co.uk",
    });
});
