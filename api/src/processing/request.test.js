import assert from "node:assert/strict";
import test from "node:test";

import { normalizeRequest } from "./request.js";

test("accepts the explicit Bilibili Direct Bridge request flag", async () => {
    const result = await normalizeRequest({
        url: "https://www.bilibili.com/video/BV1zy4y1L7Xd?p=3",
        localProcessing: "disabled",
        alwaysProxy: false,
        bilibiliDirectBridge: true,
    });

    assert.equal(result.success, true);
    assert.equal(result.data.bilibiliDirectBridge, true);
    assert.equal(result.data.localProcessing, "disabled");
    assert.equal(result.data.alwaysProxy, false);
});
