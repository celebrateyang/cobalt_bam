import { browser } from "$app/environment";
import { page } from "$app/stores";
import { get } from "svelte/store";

import { loadTranslations, t } from "$lib/i18n/translations";
import { createDialog } from "$lib/state/dialogs";

export type SignUpMode = "email" | "oauth";

const SIGN_UP_PROMPT_COUNT_KEY = "fsv.auth.sign_up_prompt_count";

export const emailFirstSignUpAppearance = {
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

const readSignUpPromptCount = () => {
    if (!browser) return 0;

    try {
        const raw = window.localStorage.getItem(SIGN_UP_PROMPT_COUNT_KEY);
        const parsed = Number.parseInt(raw || "0", 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch {
        return 0;
    }
};

const incrementSignUpPromptCount = () => {
    if (!browser) return;

    try {
        const next = readSignUpPromptCount() + 1;
        window.localStorage.setItem(SIGN_UP_PROMPT_COUNT_KEY, String(next));
    } catch {
        // Ignore storage errors in strict privacy mode.
    }
};

export const isLikelyChinaVisitor = () => {
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

export const chooseSignUpMode = async (): Promise<SignUpMode | false> => {
    if (!isLikelyChinaVisitor()) return "oauth";

    const lang = get(page)?.params?.lang || "en";
    await Promise.all([
        loadTranslations(lang, "auth"),
        loadTranslations(lang, "button"),
    ]);

    const isRetry = readSignUpPromptCount() > 0;

    return new Promise<SignUpMode | false>((resolve) => {
        createDialog({
            id: `sign-up-cn-choice-${Date.now()}`,
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
                    action: () => {
                        incrementSignUpPromptCount();
                        resolve("oauth");
                    },
                },
                {
                    text: get(t)("auth.download_signup_cn_email_cta"),
                    main: true,
                    action: () => {
                        incrementSignUpPromptCount();
                        resolve("email");
                    },
                },
            ],
        });
    });
};
