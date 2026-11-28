import assert from "node:assert/strict";
import test from "node:test";

import { apiSchema } from "./schema.js";
import { normalizeRequest } from "./request.js";
import { buildUpstreamDownloadBody } from "./upstream/request.js";

test("forwards a clip range without silently stripping invalid ranges", async () => {
    const url = "https://www.youtube.com/watch?v=abcdefghijk";
    const clip = { start: 10, end: 30 };
    const valid = await normalizeRequest({ url, youtubeClip: clip });
    assert.equal(valid.success, true);
    assert.deepEqual(buildUpstreamDownloadBody(valid.data).youtubeClip, clip);
    for (const range of [{ start: 30, end: 10 }, { start: -1, end: 2 }, null,
        { start: 0, end: 10, sourceDuration: 100 }]) {
        assert.equal((await normalizeRequest({ url, youtubeClip: range })).success, false);
    }
});

test("accepts and preserves a stable queue id", async () => {
    const result = await apiSchema.safeParseAsync({
        url: "https://example.com/video",
        queueId: "queue_1234-abcd",
    });

    assert.equal(result.success, true);
    assert.equal(result.data.queueId, "queue_1234-abcd");
});

test("rejects queue ids that cannot be safely used as idempotency keys", async () => {
    const result = await apiSchema.safeParseAsync({
        url: "https://example.com/video",
        queueId: "queue id with spaces",
    });

    assert.equal(result.success, false);
});
