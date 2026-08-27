import assert from "node:assert/strict";
import test from "node:test";

import {
    isPublicAddress,
    parseSafeGenericURL,
    validateGenericURL,
} from "./url-safety.js";
import { canAttemptGenericURL, getGenericServiceHost } from "./index.js";

const wsjUrl = "https://www.wsj.com/video/mudslide-hits-nepal-tibet-border/AC8B1893-B73A-40C1-86F1-5427E611956C";

test("accepts an unconfigured public WSJ video URL for generic extraction", async () => {
    assert.equal(canAttemptGenericURL(wsjUrl), true);
    assert.equal(getGenericServiceHost(wsjUrl), "www.wsj.com");
    assert.equal(
        await validateGenericURL(wsjUrl, async () => [
            { address: "8.8.8.8", family: 4 },
            { address: "2606:4700:4700::1111", family: 6 },
        ]),
        true,
    );
});

test("rejects local hosts, IP literals, credentials, and non-web ports", () => {
    for (const value of [
        "http://localhost/video",
        "http://127.0.0.1/video",
        "http://[::1]/video",
        "http://video.internal/file.mp4",
        "https://user:password@example.com/video",
        "https://example.com:8080/video",
        "file:///etc/passwd",
    ]) {
        assert.equal(parseSafeGenericURL(value), null, value);
        assert.equal(canAttemptGenericURL(value), false, value);
    }
});

test("rejects hostnames resolving to any non-public address", async () => {
    const mixedResolver = async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.8", family: 4 },
    ];

    assert.equal(await validateGenericURL("https://example.com/video", mixedResolver), false);
});

test("classifies private, loopback, link-local, and public addresses", () => {
    for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "fc00::1", "fe80::1"]) {
        assert.equal(isPublicAddress(address), false, address);
    }
    for (const address of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"]) {
        assert.equal(isPublicAddress(address), true, address);
    }
});
