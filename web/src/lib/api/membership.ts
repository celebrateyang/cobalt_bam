import { currentApiURL } from "$lib/api/api-url";
import { getClerkToken } from "$lib/state/clerk";

export const membershipFeatures = [
    "ai_video_studio",
    "video_recording",
    "random_chat",
] as const;

export type MembershipFeature = (typeof membershipFeatures)[number];
export type MembershipEligibilityReason =
    | "SIGN_IN_REQUIRED"
    | "MEMBERSHIP_REQUIRED"
    | "ENTITLEMENT_MISSING";

export type MembershipSummary = {
    active: true;
    planKey: string;
    planName: string;
    currentPeriodStart: number | null;
    currentPeriodEnd: number | null;
    entitlements: string[];
};

export type MembershipFeatureEligibility = {
    supported: true;
    eligible: boolean;
    feature: MembershipFeature;
    reason: MembershipEligibilityReason | null;
    membership: MembershipSummary | null;
};

export const fetchMembershipFeatureEligibility = async (
    feature: MembershipFeature,
): Promise<MembershipFeatureEligibility> => {
    const token = await getClerkToken();
    if (!token) {
        return {
            supported: true,
            eligible: false,
            feature,
            reason: "SIGN_IN_REQUIRED",
            membership: null,
        };
    }

    const response = await fetch(
        `${currentApiURL()}/user/features/${encodeURIComponent(feature)}/eligibility`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        },
    );
    const payload = await response.json().catch(() => null);

    if (response.status === 401) {
        return {
            supported: true,
            eligible: false,
            feature,
            reason: "SIGN_IN_REQUIRED",
            membership: null,
        };
    }

    if (!response.ok || payload?.status !== "success") {
        throw new Error(
            payload?.error?.message || "Failed to verify membership eligibility",
        );
    }

    return payload.data as MembershipFeatureEligibility;
};
