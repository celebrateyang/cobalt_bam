import assert from "node:assert/strict";
import test from "node:test";

import {
    shouldAttemptGenericFallbackForError,
    shouldPreferLocalGenericExtraction,
    shouldUseGenericUpstreamResponse,
} from "./index.js";

test("extracts Google Drive on the API egress before using upstream metadata", () => {
    assert.equal(shouldPreferLocalGenericExtraction(
        "https://drive.google.com/file/d/19jcgT9WEnB5aVSk6rLC2lhSoHnoE0_UK/view",
    ), true);
    assert.equal(shouldPreferLocalGenericExtraction(
        new URL("https://DRIVE.GOOGLE.COM/file/d/example/view?resourcekey=key"),
    ), true);
});

test("preserves upstream-first extraction for other hosts and lookalikes", () => {
    for (const url of [
        "https://vimeo.com/123",
        "https://drive.google.com.example.test/file/d/example/view",
        "https://example.test/?url=https://drive.google.com/",
        "invalid",
        null,
    ]) {
        assert.equal(shouldPreferLocalGenericExtraction(url), false);
    }
});

test("uses direct and processing-capable generic upstream responses", () => {
    assert.equal(shouldUseGenericUpstreamResponse({ status: "redirect" }), true);
    assert.equal(shouldUseGenericUpstreamResponse({ status: "local-processing" }), true);
    assert.equal(shouldUseGenericUpstreamResponse({ status: "picker" }), true);
});

test("defers generic upstream tunnels so local extraction can produce a direct URL", () => {
    assert.equal(shouldUseGenericUpstreamResponse({ status: "tunnel" }), false);
    assert.equal(shouldUseGenericUpstreamResponse({ status: "error" }), false);
    assert.equal(shouldUseGenericUpstreamResponse(null), false);
});

test("allows generic fallback for unknown platforms and new URL patterns", () => {
    assert.equal(shouldAttemptGenericFallbackForError("platform.unsupported"), true);
    assert.equal(shouldAttemptGenericFallbackForError("link.unsupported"), true);
    assert.equal(shouldAttemptGenericFallbackForError("service.disabled"), false);
    assert.equal(shouldAttemptGenericFallbackForError("youtube.link.unsupported"), false);
});
