export const MEMBERSHIP_FEATURE_ENTITLEMENTS = Object.freeze([
    "ai_video_studio",
    "video_recording",
    "random_chat",
]);

const membershipFeatureSet = new Set(MEMBERSHIP_FEATURE_ENTITLEMENTS);

export const normalizeMembershipFeature = (feature) =>
    typeof feature === "string" ? feature.trim().toLowerCase() : "";

export const evaluateMembershipFeatureEligibility = ({ feature, membership }) => {
    const normalizedFeature = normalizeMembershipFeature(feature);

    if (!membershipFeatureSet.has(normalizedFeature)) {
        return {
            supported: false,
            eligible: false,
            feature: normalizedFeature,
            reason: "FEATURE_NOT_FOUND",
            membership: membership || null,
        };
    }

    if (!membership?.active) {
        return {
            supported: true,
            eligible: false,
            feature: normalizedFeature,
            reason: "MEMBERSHIP_REQUIRED",
            membership: null,
        };
    }

    const entitlements = Array.isArray(membership.entitlements)
        ? membership.entitlements
        : [];
    const eligible = entitlements.includes(normalizedFeature);

    return {
        supported: true,
        eligible,
        feature: normalizedFeature,
        reason: eligible ? null : "ENTITLEMENT_MISSING",
        membership,
    };
};
