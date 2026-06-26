import { browser } from "$app/environment";
import { page } from "$app/stores";
import { get } from "svelte/store";

import { loadTranslations, t } from "$lib/i18n/translations";
import { createDialog } from "$lib/state/dialogs";
import {
    checkSignedIn,
    hasClerkAuthenticationHintLocally,
    isSignedIn,
    signIn,
    signUp,
} from "$lib/state/clerk";

type RequireDownloadAuthOptions = {
    beforeOpenClerk?: () => void | Promise<void>,
};

const DOWNLOAD_AUTH_PROMPT_COUNT_KEY = "fsv.download.auth_prompt_count";
const DIALOG_CLOSE_SETTLE_MS = 180;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const readDownloadAuthPromptCount = () => {
    if (!browser) return 0;

    try {
        const raw = window.localStorage.getItem(DOWNLOAD_AUTH_PROMPT_COUNT_KEY);
        const parsed = Number.parseInt(raw || "0", 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch {
        return 0;
    }
};

const incrementDownloadAuthPromptCount = () => {
    if (!browser) return;

    try {
        const next = readDownloadAuthPromptCount() + 1;
        window.localStorage.setItem(DOWNLOAD_AUTH_PROMPT_COUNT_KEY, String(next));
    } catch {
        // Ignore storage errors in strict privacy mode.
    }
};

const currentUrl = () => {
    const pageUrl = get(page)?.url?.href;
    if (pageUrl) return pageUrl;
    return browser ? window.location.href : undefined;
};

const loadAuthPromptTranslations = async () => {
    const lang = get(page)?.params?.lang || "en";
    await Promise.all([
        loadTranslations(lang, "auth"),
        loadTranslations(lang, "button"),
    ]);
};

const confirmRegistrationRetry = async () => {
    await loadAuthPromptTranslations();

    return new Promise<boolean>((resolve) => {
        createDialog({
            id: `download-auth-retry-${Date.now()}`,
            type: "small",
            meowbalt: "question",
            title: get(t)("auth.download_signup_retry_title"),
            bodyText: get(t)("auth.download_signup_retry_body"),
            bodySubText: get(t)("auth.download_signup_retry_benefits"),
            leftAligned: true,
            buttons: [
                {
                    text: get(t)("button.cancel"),
                    main: false,
                    action: () => resolve(false),
                },
                {
                    text: get(t)("auth.download_signup_retry_cta"),
                    main: true,
                    action: () => resolve(true),
                },
            ],
        });
    });
};

export const requireDownloadAuth = async (
    options: RequireDownloadAuthOptions = {},
) => {
    if (get(isSignedIn)) return true;

    const alreadySignedIn = await checkSignedIn();
    if (alreadySignedIn) return true;

    const shouldOpenSignUp = !hasClerkAuthenticationHintLocally();
    const shouldExplainRetry =
        shouldOpenSignUp && readDownloadAuthPromptCount() > 0;

    if (shouldExplainRetry) {
        const approved = await confirmRegistrationRetry();
        if (!approved) return false;

        await sleep(DIALOG_CLOSE_SETTLE_MS);

        const signedInAfterDialog = await checkSignedIn();
        if (signedInAfterDialog) return true;
    }

    incrementDownloadAuthPromptCount();
    await options.beforeOpenClerk?.();

    const redirectUrl = currentUrl();
    const redirectOptions = {
        fallbackRedirectUrl: redirectUrl,
        signInFallbackRedirectUrl: redirectUrl,
        signUpFallbackRedirectUrl: redirectUrl,
    };

    if (shouldOpenSignUp) {
        await signUp(redirectOptions);
    } else {
        await signIn(redirectOptions);
    }

    return false;
};
