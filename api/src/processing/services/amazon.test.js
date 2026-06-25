import assert from "node:assert/strict";
import test from "node:test";

import {
    extractAmazonLiveMetadata,
    selectAmazonLiveVariant,
} from "./amazon.js";

test("extracts Amazon Live metadata from JSON-LD", () => {
    const html = `
        <script type="application/ld+json">
        {
            "@context": "https://schema.org",
            "@type": "VideoObject",
            "name": "Example &amp; demo",
            "contentUrl": "https://m.media-amazon.com/path/master.m3u8",
            "duration": "PT2M14S",
            "author": {"@type": "Person", "name": "Creator"}
        }
        </script>
    `;

    assert.deepEqual(extractAmazonLiveMetadata(html), {
        manifestUrl: "https://m.media-amazon.com/path/master.m3u8",
        title: "Example & demo",
        uploader: "Creator",
        duration: "PT2M14S",
    });
});

test("selects the closest requested Amazon Live quality", () => {
    const variants = [
        { uri: "360.m3u8", resolution: { height: 360 }, bandwidth: 600000 },
        { uri: "720.m3u8", resolution: { height: 720 }, bandwidth: 1900000 },
        { uri: "1080.m3u8", resolution: { height: 1080 }, bandwidth: 3500000 },
    ];

    assert.equal(selectAmazonLiveVariant(variants, "720").uri, "720.m3u8");
    assert.equal(selectAmazonLiveVariant(variants, "480").uri, "360.m3u8");
    assert.equal(selectAmazonLiveVariant(variants, "max").uri, "1080.m3u8");
});
