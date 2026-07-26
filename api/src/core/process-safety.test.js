import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { isExpectedAbortError } from "./process-safety.js";

test("recognizes Undici request aborts as recoverable", () => {
    assert.equal(isExpectedAbortError({
        name: "AbortError",
        code: "UND_ERR_ABORTED",
        message: "Request aborted",
    }), true);
});

test("does not suppress unknown programming errors", () => {
    assert.equal(isExpectedAbortError(new TypeError("broken invariant")), false);
});

test("keeps the process alive after an uncaught Undici abort", () => {
    const script = `
        import { installProcessSafetyHandlers } from "./src/core/process-safety.js";
        installProcessSafetyHandlers();
        queueMicrotask(() => {
            const error = new Error("Request aborted");
            error.name = "AbortError";
            error.code = "UND_ERR_ABORTED";
            throw error;
        });
        setTimeout(() => console.log("still-alive"), 20);
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
        cwd: process.cwd(),
        encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /still-alive/);
    assert.match(result.stderr, /PROCESS RECOVERED/);
});
