import { page } from "$app/stores";

import { get } from "svelte/store";

import { loadTranslations, t } from "$lib/i18n/translations";
import { fetchCurrentUserPointsProfile } from "$lib/points/ui";
import { createDialog } from "$lib/state/dialogs";
import type { CobaltErrorResponse } from "$lib/types/api";

export const MEMBERSHIP_DOWNLOAD_LIMIT_ERROR =
    "error.api.membership.limit.exceeded";

type MembershipLimitContext = NonNullable<CobaltErrorResponse["error"]["context"]>;
type MembershipLimitReason = "daily_limit" | "monthly_limit";

const finiteNumber = (value: unknown) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

const inferLimitReason = (
    context: MembershipLimitContext | undefined,
): MembershipLimitReason | null => {
    if (context?.reason === "daily_limit" || context?.reason === "monthly_limit") {
        return context.reason;
    }

    const membership = context?.membership;
    const dailyUsed = finiteNumber(membership?.usage?.dailySuccessfulDownloads);
    const dailyLimit = finiteNumber(membership?.limits?.dailySuccessfulDownloads);
    if (dailyUsed !== null && dailyLimit !== null && dailyUsed >= dailyLimit) {
        return "daily_limit";
    }

    const monthlyUsed = finiteNumber(membership?.usage?.monthlySuccessfulDownloads);
    const monthlyLimit = finiteNumber(membership?.limits?.monthlySuccessfulDownloads);
    if (monthlyUsed !== null && monthlyLimit !== null && monthlyUsed >= monthlyLimit) {
        return "monthly_limit";
    }

    return null;
};

export const showMembershipDownloadLimitDialog = async (
    context?: MembershipLimitContext,
) => {
    const lang = get(page)?.params?.lang || "en";
    await Promise.all([
        loadTranslations(lang, "error"),
        loadTranslations(lang, "dialog"),
    ]);

    // Refresh the account snapshot so the dialog uses the same authoritative
    // usage values that the account page will show after navigation.
    const profile = await fetchCurrentUserPointsProfile().catch(() => null);
    const membership = profile?.membership ?? context?.membership ?? null;
    const mergedContext: MembershipLimitContext = {
        ...context,
        membership,
    };
    const reason = inferLimitReason(mergedContext);

    const isDaily = reason === "daily_limit";
    const used = finiteNumber(
        isDaily
            ? membership?.usage?.dailySuccessfulDownloads
            : membership?.usage?.monthlySuccessfulDownloads,
    );
    const limit = finiteNumber(
        isDaily
            ? membership?.limits?.dailySuccessfulDownloads
            : membership?.limits?.monthlySuccessfulDownloads,
    );
    const hasDetailedUsage = reason !== null && used !== null && limit !== null;
    const bodyText = hasDetailedUsage
        ? get(t)(
            isDaily
                ? "error.api.membership.limit.daily_exceeded"
                : "error.api.membership.limit.monthly_exceeded",
            { used, limit },
        )
        : get(t)(MEMBERSHIP_DOWNLOAD_LIMIT_ERROR);

    createDialog({
        id: "membership-download-limit",
        type: "small",
        meowbalt: "error",
        title: get(t)("dialog.error.title"),
        bodyText,
        buttons: [
            {
                text: get(t)("button.gotit"),
                main: true,
                action: () => {},
            },
        ],
    });
};
