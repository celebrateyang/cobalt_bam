import assert from "node:assert/strict";
import test from "node:test";

import {
    evaluateMembershipFeatureEligibility,
    normalizeMembershipFeature,
} from "./membership-features.js";

test("normalizes supported feature keys", () => {
    assert.equal(normalizeMembershipFeature(" Random_Chat "), "random_chat");
    assert.equal(normalizeMembershipFeature(null), "");
});

test("rejects unknown features", () => {
    const result = evaluateMembershipFeatureEligibility({
        feature: "unknown",
        membership: null,
    });

    assert.equal(result.supported, false);
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "FEATURE_NOT_FOUND");
});

test("requires an active membership", () => {
    const result = evaluateMembershipFeatureEligibility({
        feature: "video_recording",
        membership: null,
    });

    assert.equal(result.supported, true);
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "MEMBERSHIP_REQUIRED");
});

test("requires the feature entitlement on the active membership", () => {
    const membership = {
        active: true,
        entitlements: ["member_download"],
    };
    const result = evaluateMembershipFeatureEligibility({
        feature: "ai_video_studio",
        membership,
    });

    assert.equal(result.eligible, false);
    assert.equal(result.reason, "ENTITLEMENT_MISSING");
});

test("allows a feature granted by the active membership", () => {
    const membership = {
        active: true,
        entitlements: ["member_download", "random_chat"],
    };
    const result = evaluateMembershipFeatureEligibility({
        feature: "random_chat",
        membership,
    });

    assert.equal(result.eligible, true);
    assert.equal(result.reason, null);
    assert.equal(result.membership, membership);
});
