import assert from "node:assert/strict";
import { test } from "node:test";
import { env } from "../../config.js";
import { getDirectLink, getResponseFromPlayerConfig } from "./vimeo.js";

test("Vimeo player progressive files use url and quality", async () => {
    const result = await getResponseFromPlayerConfig({
        video: { duration: 191 },
        request: { files: { progressive: [
            { url: "https://cdn.example/1080.mp4", quality: "1080p", width: 1920, height: 1080 },
            { url: "https://cdn.example/720.mp4", quality: "720p", width: 1280, height: 720 },
        ] } },
    }, {}, 720);
    assert.equal(result.urls, "https://cdn.example/720.mp4");
    assert.equal(result.filenameAttributes.qualityLabel, "720p");
});

test("Vimeo API progressive fields remain supported", async () => {
    const result = await getDirectLink({ files: [
        { link: "https://cdn.example/api.mp4", rendition: "1080p", width: 1920, height: 1080 },
    ] }, 1080);
    assert.equal(result.urls, "https://cdn.example/api.mp4");
});

test("missing progressive renditions fall through without throwing", async () => {
    for (const files of [[], [{ quality: "source", url: "https://cdn.example/source.mp4" }], [{ quality: "720p" }]]) {
        assert.equal(await getDirectLink({ files }, 720), undefined);
    }
});

test("progressive player files respect the duration limit", async () => {
    const result = await getResponseFromPlayerConfig({
        video: { duration: env.durationLimit + 1 },
        request: { files: { progressive: [
            { url: "https://cdn.example/720.mp4", quality: "720p" },
        ] } },
    }, {}, 720);
    assert.deepEqual(result, { error: "content.too_long" });
});
