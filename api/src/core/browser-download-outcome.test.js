import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeBrowserDownloadOutcome } from "./browser-download-outcome.js";

const requestId = "864b97cb-748a-4e63-8f38-fb8c8dca873a";
test("rejects malformed identity and unsupported browser states", () => {
    for (const body of [null, {}, { requestId: "bad id", state: "failed" }, { requestId, state: "saved" }]) {
        assert.equal(normalizeBrowserDownloadOutcome(body, "Safari"), null);
    }
});
test("accepts browser trace IDs generated without crypto.randomUUID", () => {
    assert.ok(normalizeBrowserDownloadOutcome({ requestId: "muuvbj9k-gurzfu", state: "processed" }, "Safari"));
});
test("bounds client diagnostics without persisting URLs, filenames or arbitrary fields", () => {
    const result = normalizeBrowserDownloadOutcome({ requestId, state: "failed", errorCode: "queue.worker_didnt_start",
        diagnostic: { workerStage: "initializing", elapsedMs: 240000, initializationMs: -1,
            attempt: 2, threaded: false, errorName: "TimeoutError", url: "https://private.test", unexpected: "secret" },
    }, "x".repeat(1000));
    assert.equal(result.outcome.userAgent.length, 300);
    assert.equal(result.outcome.diagnostic.workerStage, "initializing");
    assert.equal(result.outcome.diagnostic.elapsedMs, 240000);
    assert.equal(result.outcome.diagnostic.initializationMs, null);
    assert.equal(result.outcome.diagnostic.threaded, false);
    assert.equal(result.outcome.diagnostic.url, undefined);
    assert.equal(result.outcome.diagnostic.unexpected, undefined);
});
test("processed means media preparation, and retains recovery timing without claiming a file was saved", () => {
    const result = normalizeBrowserDownloadOutcome({ requestId, state: "processed", errorCode: "stale error",
        diagnostic: { workerStage: "encoding", initializationMs: 90000, attempt: 2, threaded: false },
    }, "Safari");
    assert.equal(result.outcome.errorCode, null);
    assert.equal(result.outcome.state, "processed");
    assert.equal(result.outcome.diagnostic.initializationMs, 90000);
    assert.equal(result.outcome.diagnostic.attempt, 2);
});
