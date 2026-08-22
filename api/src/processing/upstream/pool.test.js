import assert from "node:assert/strict";
import test from "node:test";

import { orderUpstreamCandidates } from "./pool.js";

test("prioritizes explicitly configured domestic upstreams", () => {
    const api4 = { url: "https://api4.freesavevideo.online/" };
    const api2 = { url: "https://api2.freesavevideo.online/" };

    assert.deepEqual(
        orderUpstreamCandidates([api4, api2], {
            regions: ["cn"],
            preferredCnURLs: [
                "https://api2.freesavevideo.online",
                "https://api4.freesavevideo.online",
            ],
        }),
        [api2, api4],
    );
});

test("keeps the existing order outside the domestic pool", () => {
    const api3 = { url: "https://api3.freesavevideo.online/" };
    const api5 = { url: "https://api5.freesavevideo.online/" };

    assert.deepEqual(
        orderUpstreamCandidates([api5, api3], {
            regions: ["global"],
            preferredCnURLs: ["https://api2.freesavevideo.online"],
        }),
        [api5, api3],
    );
});
