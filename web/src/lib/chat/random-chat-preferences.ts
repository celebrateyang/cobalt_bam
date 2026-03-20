import { browser } from "$app/environment";
import languages from "$i18n/languages.json";

export const RANDOM_CHAT_COUNTRY_OPTIONS = [
    "ANY",
    "US",
    "CN",
    "TH",
    "JP",
    "KR",
    "DE",
    "FR",
    "ES",
    "RU",
    "VN",
] as const;

export const RANDOM_CHAT_SELF_GENDER_OPTIONS = [
    "unspecified",
    "male",
    "female",
] as const;

export const RANDOM_CHAT_TARGET_GENDER_OPTIONS = ["any", "male", "female"] as const;

const uiLanguageKeys = Object.keys(languages);

export type RandomChatCountry = (typeof RANDOM_CHAT_COUNTRY_OPTIONS)[number];
export type RandomChatSelfGender = (typeof RANDOM_CHAT_SELF_GENDER_OPTIONS)[number];
export type RandomChatTargetGender = (typeof RANDOM_CHAT_TARGET_GENDER_OPTIONS)[number];
export type RandomChatUiLanguage = "auto" | (typeof uiLanguageKeys)[number];

export type RandomChatPreferences = {
    schemaVersion: 1;
    selfGender: RandomChatSelfGender;
    targetGender: RandomChatTargetGender;
    targetCountry: RandomChatCountry;
    uiLanguage: RandomChatUiLanguage;
    autoNext: boolean;
    mirrorLocalVideo: boolean;
    muteRemoteOnJoin: boolean;
    showSafetyNotice: boolean;
};

export const defaultRandomChatPreferences: RandomChatPreferences = {
    schemaVersion: 1,
    selfGender: "unspecified",
    targetGender: "any",
    targetCountry: "ANY",
    uiLanguage: "auto",
    autoNext: true,
    mirrorLocalVideo: true,
    muteRemoteOnJoin: false,
    showSafetyNotice: true,
};

const STORAGE_KEY = "random_chat_prefs_v1";

const isCountry = (value: unknown): value is RandomChatCountry =>
    typeof value === "string" &&
    (RANDOM_CHAT_COUNTRY_OPTIONS as readonly string[]).includes(value);

const isSelfGender = (value: unknown): value is RandomChatSelfGender =>
    typeof value === "string" &&
    (RANDOM_CHAT_SELF_GENDER_OPTIONS as readonly string[]).includes(value);

const isTargetGender = (value: unknown): value is RandomChatTargetGender =>
    typeof value === "string" &&
    (RANDOM_CHAT_TARGET_GENDER_OPTIONS as readonly string[]).includes(value);

const isUiLanguage = (value: unknown): value is RandomChatUiLanguage =>
    value === "auto" ||
    (typeof value === "string" && uiLanguageKeys.includes(value));

export const normalizeRandomChatPreferences = (
    input: unknown,
): RandomChatPreferences => {
    const source =
        input && typeof input === "object"
            ? (input as Partial<RandomChatPreferences>)
            : {};

    return {
        schemaVersion: 1,
        selfGender: isSelfGender(source.selfGender)
            ? source.selfGender
            : defaultRandomChatPreferences.selfGender,
        targetGender: isTargetGender(source.targetGender)
            ? source.targetGender
            : defaultRandomChatPreferences.targetGender,
        targetCountry: isCountry(source.targetCountry)
            ? source.targetCountry
            : defaultRandomChatPreferences.targetCountry,
        uiLanguage: isUiLanguage(source.uiLanguage)
            ? source.uiLanguage
            : defaultRandomChatPreferences.uiLanguage,
        autoNext:
            typeof source.autoNext === "boolean"
                ? source.autoNext
                : defaultRandomChatPreferences.autoNext,
        mirrorLocalVideo:
            typeof source.mirrorLocalVideo === "boolean"
                ? source.mirrorLocalVideo
                : defaultRandomChatPreferences.mirrorLocalVideo,
        muteRemoteOnJoin:
            typeof source.muteRemoteOnJoin === "boolean"
                ? source.muteRemoteOnJoin
                : defaultRandomChatPreferences.muteRemoteOnJoin,
        showSafetyNotice:
            typeof source.showSafetyNotice === "boolean"
                ? source.showSafetyNotice
                : defaultRandomChatPreferences.showSafetyNotice,
    };
};

export const loadRandomChatPreferences = (): RandomChatPreferences => {
    if (!browser) {
        return defaultRandomChatPreferences;
    }

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return defaultRandomChatPreferences;
        }
        return normalizeRandomChatPreferences(JSON.parse(raw));
    } catch {
        return defaultRandomChatPreferences;
    }
};

export const saveRandomChatPreferences = (
    prefs: RandomChatPreferences,
): RandomChatPreferences => {
    const normalized = normalizeRandomChatPreferences(prefs);
    if (browser) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }
    return normalized;
};
