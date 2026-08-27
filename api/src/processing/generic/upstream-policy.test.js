import assert from "node:assert/strict";
import test from "node:test";

import {
    shouldAttemptGenericFallbackForError,
    shouldUseGenericUpstreamResponse,
} from "./index.js";

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
