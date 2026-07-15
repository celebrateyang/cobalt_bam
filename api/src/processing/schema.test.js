import assert from "node:assert/strict";
import test from "node:test";

import { apiSchema } from "./schema.js";

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
