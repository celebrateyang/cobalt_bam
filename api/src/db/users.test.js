import assert from "node:assert/strict";
import test from "node:test";

import {
    calculateFirstDownloadGraceCharge,
    resolveDownloadRequestAction,
} from "./users.js";

test("charges the full amount when enough points are available", () => {
    assert.deepEqual(
        calculateFirstDownloadGraceCharge({
            requiredPoints: 80,
            availablePoints: 100,
            allowFirstDownloadGrace: true,
            firstDownloadGraceEligible: true,
        }),
        {
            allowed: true,
            useFirstDownloadGrace: false,
            chargedPoints: 80,
            gracePoints: 0,
        },
    );
});

test("reserves only available points for an eligible first download", () => {
    assert.deepEqual(
        calculateFirstDownloadGraceCharge({
            requiredPoints: 80,
            availablePoints: 20,
            allowFirstDownloadGrace: true,
            maxGracePoints: 200,
            firstDownloadGraceEligible: true,
        }),
        {
            allowed: true,
            useFirstDownloadGrace: true,
            chargedPoints: 20,
            gracePoints: 60,
        },
    );
});

test("does not grant first-download grace while another hold is active", () => {
    const result = calculateFirstDownloadGraceCharge({
        requiredPoints: 80,
        availablePoints: 20,
        allowFirstDownloadGrace: true,
        maxGracePoints: 200,
        firstDownloadGraceEligible: true,
        activeHoldCount: 1,
    });

    assert.equal(result.allowed, false);
    assert.equal(result.useFirstDownloadGrace, false);
});

test("does not grant grace above the configured limit", () => {
    const result = calculateFirstDownloadGraceCharge({
        requiredPoints: 300,
        availablePoints: 20,
        allowFirstDownloadGrace: true,
        maxGracePoints: 200,
        firstDownloadGraceEligible: true,
    });

    assert.equal(result.allowed, false);
    assert.equal(result.useFirstDownloadGrace, false);
});

test("replays a completed direct response without another extraction", () => {
    const now = 10_000;
    assert.deepEqual(
        resolveDownloadRequestAction({
            request: {
                source_url: "https://example.com/video",
                status: "completed",
                response_body: { status: "redirect" },
                replay_expires_at: now + 1_000,
            },
            sourceUrl: "https://example.com/video",
            now,
        }),
        { action: "replay" },
    );
});

test("replays a queued response only while its hold is active", () => {
    const now = 10_000;
    const request = {
        source_url: "https://example.com/video",
        status: "completed",
        response_body: { status: "local-processing" },
        replay_expires_at: now + 1_000,
    };

    assert.equal(resolveDownloadRequestAction({
        request,
        sourceUrl: request.source_url,
        hold: { status: "held", expires_at: now + 500 },
        now,
    }).action, "replay");
    assert.equal(resolveDownloadRequestAction({
        request,
        sourceUrl: request.source_url,
        hold: { status: "released", expires_at: now + 500 },
        now,
    }).action, "claim");
});

test("rejects finalized and concurrently processing queue ids", () => {
    const now = 10_000;
    const completed = {
        source_url: "https://example.com/video",
        status: "completed",
        response_body: { status: "local-processing" },
        replay_expires_at: now + 1_000,
    };
    assert.equal(resolveDownloadRequestAction({
        request: completed,
        sourceUrl: completed.source_url,
        hold: { status: "finalized", expires_at: now + 500 },
        now,
    }).code, "IDEMPOTENCY_FINALIZED");

    assert.equal(resolveDownloadRequestAction({
        request: {
            source_url: completed.source_url,
            status: "processing",
            lease_expires_at: now + 500,
        },
        sourceUrl: completed.source_url,
        now,
    }).code, "IDEMPOTENCY_IN_PROGRESS");
});

test("rejects reuse of a queue id for another URL", () => {
    assert.equal(resolveDownloadRequestAction({
        request: {
            source_url: "https://example.com/original",
            status: "failed",
        },
        sourceUrl: "https://example.com/other",
    }).code, "IDEMPOTENCY_CONFLICT");
});
