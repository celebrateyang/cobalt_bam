import { page } from "$app/stores";
import { get } from "svelte/store";

import {
    fetchMembershipFeatureEligibility,
    type MembershipEligibilityReason,
    type MembershipFeature,
} from "$lib/api/membership";
import { loadTranslations, t } from "$lib/i18n/translations";
import { createDialog } from "$lib/state/dialogs";

type MembershipGateOptions = {
    returnPath?: string | null;
};

const currentRoute = () => {
    const currentPage = get(page);
    return `${currentPage.url.pathname}${currentPage.url.search}`;
};

export const membershipAccountPath = (returnPath?: string | null) => {
    const currentPage = get(page);
    const lang = currentPage.params.lang || "en";
    const params = new URLSearchParams({ section: "membership" });
    const normalizedReturnPath =
        returnPath?.startsWith("/") && !returnPath.startsWith("//")
            ? returnPath
            : null;

    if (normalizedReturnPath) {
        params.set("redirect", normalizedReturnPath);
    }

    return `/${lang}/account?${params.toString()}`;
};

export const showMembershipUpgradeDialog = async (
    feature: MembershipFeature,
    reason: MembershipEligibilityReason = "MEMBERSHIP_REQUIRED",
    options: MembershipGateOptions = {},
) => {
    const currentPage = get(page);
    const lang = currentPage.params.lang || "en";
    await loadTranslations(lang, "membership-gate");

    createDialog({
        id: `membership-upgrade-${feature}`,
        type: "membership-upgrade",
        feature,
        reason,
        returnPath: options.returnPath || currentRoute(),
    });
};

export const requireMembershipFeature = async (
    feature: MembershipFeature,
    options: MembershipGateOptions = {},
) => {
    try {
        const eligibility = await fetchMembershipFeatureEligibility(feature);
        if (eligibility.eligible) return true;

        await showMembershipUpgradeDialog(
            feature,
            eligibility.reason || "MEMBERSHIP_REQUIRED",
            options,
        );
        return false;
    } catch (error) {
        const currentPage = get(page);
        const lang = currentPage.params.lang || "en";
        await loadTranslations(lang, "membership-gate");

        console.debug("membership eligibility check failed", error);
        createDialog({
            id: `membership-check-failed-${feature}`,
            type: "small",
            meowbalt: "error",
            title: get(t)("membership-gate.error.title"),
            bodyText: get(t)("membership-gate.error.body"),
            buttons: [
                {
                    text: get(t)("membership-gate.action.close"),
                    main: true,
                    action: () => undefined,
                },
            ],
        });
        return false;
    }
};
