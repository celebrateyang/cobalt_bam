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

type SignUpMode = "email" | "oauth";

const DOWNLOAD_AUTH_PROMPT_COUNT_KEY = "fsv.download.auth_prompt_count";
const DIALOG_CLOSE_SETTLE_MS = 180;

const emailFirstSignUpAppearance = {
    variables: {
        colorPrimary: "#82b52d",
        borderRadius: "11px",
    },
    elements: {
        socialButtonsBlockButton: {
            display: "none",
        },
        dividerRow: {
            display: "none",
        },
    },
};

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

const isLikelyChinaVisitor = () => {
    if (!browser) return false;

    const pageLang = get(page)?.params?.lang;
    const languages = [
        navigator.language,
        ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    ].filter(Boolean);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return (
        pageLang === "zh" ||
        languages.some((lang) => /^zh(-|$)/i.test(lang)) ||
        timeZone === "Asia/Shanghai"
    );
};

const confirmChinaRegistrationChoice = async (isRetry: boolean) => {
    await loadAuthPromptTranslations();

    return new Promise<SignUpMode | false>((resolve) => {
        createDialog({
            id: `download-auth-cn-choice-${Date.now()}`,
            type: "small",
            meowbalt: "question",
            title: get(t)(
                isRetry
                    ? "auth.download_signup_cn_retry_title"
                    : "auth.download_signup_cn_title",
            ),
            bodyText: get(t)(
                isRetry
                    ? "auth.download_signup_cn_retry_body"
                    : "auth.download_signup_cn_body",
            ),
            bodySubText: get(t)("auth.download_signup_cn_subtext"),
            leftAligned: true,
            buttons: [
                {
                    text: get(t)("button.cancel"),
                    main: false,
                    action: () => resolve(false),
                },
                {
                    text: get(t)("auth.download_signup_cn_oauth_cta"),
                    main: false,
                    action: () => resolve("oauth"),
                },
                {
                    text: get(t)("auth.download_signup_cn_email_cta"),
                    main: true,
                    action: () => resolve("email"),
                },
            ],
        });
    });
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
    const shouldGuideChinaNewUser =
        shouldOpenSignUp && isLikelyChinaVisitor();

    let signUpMode: SignUpMode = "oauth";

    if (shouldGuideChinaNewUser) {
        const choice = await confirmChinaRegistrationChoice(shouldExplainRetry);
        if (!choice) return false;

        await sleep(DIALOG_CLOSE_SETTLE_MS);

        const signedInAfterDialog = await checkSignedIn();
        if (signedInAfterDialog) return true;

        signUpMode = choice;
    } else if (shouldExplainRetry) {
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
        await signUp({
            ...redirectOptions,
            ...(signUpMode === "email"
                ? { appearance: emailFirstSignUpAppearance }
                : {}),
        });
    } else {
        await signIn(redirectOptions);
    }

    return false;
};
