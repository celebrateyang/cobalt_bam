import { goto } from "$app/navigation";
import { page } from "$app/stores";

import { get } from "svelte/store";

import { currentApiURL } from "$lib/api/api-url";
import { t } from "$lib/i18n/translations";
import { getClerkToken } from "$lib/state/clerk";
import { createDialog } from "$lib/state/dialogs";

export const FIRST_DOWNLOAD_GRACE_MAX_GAP = 30;

export type PointsHelpSection = "topup" | "referral" | "promotion" | "contact";

export type CurrentUserPointsProfile = {
    points: number | null;
    downloadSuccessCount: number;
    firstDownloadGraceEligible: boolean;
    firstDownloadGraceUsed: boolean;
};

const normalizeRedirectPath = (redirectPath?: string | null) => {
    if (!redirectPath || typeof redirectPath !== "string") return null;
    if (!redirectPath.startsWith("/") || redirectPath.startsWith("//")) return null;
    return redirectPath;
};

export const accountPath = (
    section?: PointsHelpSection,
    redirectPath?: string | null,
) => {
    const lang = get(page)?.params?.lang || "en";
    const basePath = `/${lang}/account`;
    const params = new URLSearchParams();

    if (section) {
        params.set("section", section);
    }

    const normalizedRedirectPath = normalizeRedirectPath(redirectPath);
    if (normalizedRedirectPath) {
        params.set("redirect", normalizedRedirectPath);
    }

    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
};

const navigateToAccountSection = async (
    section: PointsHelpSection,
    onBeforeNavigate?: (() => void) | null,
    redirectPath?: string | null,
) => {
    onBeforeNavigate?.();
    const delayMs = onBeforeNavigate ? 200 : 0;
    if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await goto(accountPath(section, redirectPath));
};

export const fetchCurrentUserPointsProfile =
    async (): Promise<CurrentUserPointsProfile | null> => {
        const token = await getClerkToken();
        if (!token) return null;

        const apiBase = currentApiURL();
        const res = await fetch(`${apiBase}/user/me`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }).catch(() => null);

        if (!res?.ok) return null;

        const data = await res.json().catch(() => null);
        const user = data?.data?.user;

        return {
            points:
                typeof user?.points === "number" ? user.points : null,
            downloadSuccessCount: Number(user?.download_success_count ?? 0) || 0,
            firstDownloadGraceEligible:
                user?.first_download_grace_eligible === true,
            firstDownloadGraceUsed:
                user?.first_download_grace_used === true,
        };
    };

export const isFirstDownloadGraceEligible = (
    profile: CurrentUserPointsProfile | null,
    gap: number,
) =>
    !!profile &&
    profile.firstDownloadGraceEligible &&
    profile.downloadSuccessCount === 0 &&
    !profile.firstDownloadGraceUsed &&
    gap > 0 &&
    gap <= FIRST_DOWNLOAD_GRACE_MAX_GAP;

export const showPointsInsufficientDialog = (
    currentPoints: number,
    requiredPoints: number,
    onBeforeNavigate?: (() => void) | null,
    redirectPath?: string | null,
) => {
    createDialog({
        id: `points-insufficient-${Date.now()}`,
        type: "small",
        meowbalt: "error",
        title: get(t)("dialog.batch.points_insufficient.title"),
        bodyText: get(t)("dialog.batch.points_insufficient.body", {
            current: currentPoints,
            required: requiredPoints,
        }),
        buttons: [
            {
                text: get(t)("button.free_points"),
                main: false,
                action: () => {
                    void navigateToAccountSection("contact", onBeforeNavigate, redirectPath);
                },
            },
            {
                text: get(t)("button.invite_points"),
                main: false,
                action: () => {
                    void navigateToAccountSection("referral", onBeforeNavigate, redirectPath);
                },
            },
            {
                text: get(t)("button.promotion_points"),
                main: false,
                action: () => {
                    void navigateToAccountSection("promotion", onBeforeNavigate, redirectPath);
                },
            },
            {
                text: get(t)("button.buy_points"),
                main: true,
                action: () => {
                    void navigateToAccountSection("topup", onBeforeNavigate, redirectPath);
                },
            },
        ],
    });
};
