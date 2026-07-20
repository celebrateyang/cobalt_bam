import assert from "node:assert/strict";
import test from "node:test";

import pinterest from "./pinterest.js";

test("returns fetch.empty instead of throwing when Pinterest has no media", async (t) => {
    t.mock.method(globalThis, "fetch", async () => ({
        text: async () => "<html></html>"
    }));

    await assert.doesNotReject(() => pinterest({ id: "710935491197723081" }));
    assert.deepEqual(
        await pinterest({ id: "710935491197723081" }),
        { error: "fetch.empty" }
    );
});

test("returns fetch.fail when a short link cannot be resolved", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
        throw new Error("network failure");
    });

    assert.deepEqual(
        await pinterest({ shortLink: "unresolved" }),
        { error: "fetch.fail" }
    );
});
