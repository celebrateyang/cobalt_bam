import { browser } from "$app/environment";
import { derived, get, writable } from "svelte/store";

import env from "$lib/env";
import { INTERNAL_locale } from "$lib/i18n/translations";
import { currentApiURL } from "$lib/api/api-url";

import type { Clerk as ClerkInstance } from "@clerk/clerk-js";

type ClerkLocalization = unknown;

type ClerkUser = {
    id: string;
    imageUrl?: string;
    fullName?: string | null;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    primaryEmailAddressId?: string | null;
    primaryEmailAddress?: { emailAddress: string } | null;
    emailAddresses?: { id: string; emailAddress: string }[];
};

type ClerkSession = {
    id: string;
    getToken: (options?: unknown) => Promise<string | null>;
};

export const clerk = writable<ClerkInstance | null>(null);
export const clerkLoaded = writable(false);
export const clerkUser = writable<ClerkUser | null>(null);
export const clerkSession = writable<ClerkSession | null>(null);

export const clerkEnabled = !!env.CLERK_PUBLISHABLE_KEY;

const clerkAppearance = {
    variables: {
        colorPrimary: "#82b52d",
        borderRadius: "11px",
    },
};

const supportedClerkLocales = [
    "de",
    "en",
    "es",
    "fr",
    "ja",
    "ko",
    "ru",
    "th",
    "vi",
    "zh",
] as const;

type ClerkLocaleKey = (typeof supportedClerkLocales)[number];
type ClerkLocalizationMap = Record<ClerkLocaleKey, ClerkLocalization>;

const clerkCaptchaErrorCopy: Record<ClerkLocaleKey, string> = {
    de: "Die Sicherheitsprüfung ist fehlgeschlagen. Aktualisieren Sie Chrome, Edge oder Firefox oder versuchen Sie es in einem privaten Fenster ohne Erweiterungen erneut. Wechseln Sie bei Bedarf das Netzwerk.",
    en: "Security verification failed. Update Chrome, Edge, or Firefox, or try again in a private window with extensions disabled. If needed, switch networks.",
    es: "La verificación de seguridad falló. Actualiza Chrome, Edge o Firefox, o inténtalo de nuevo en una ventana privada con las extensiones desactivadas. Si es necesario, cambia de red.",
    fr: "La vérification de sécurité a échoué. Mettez à jour Chrome, Edge ou Firefox, ou réessayez dans une fenêtre privée avec les extensions désactivées. Si nécessaire, changez de réseau.",
    ja: "セキュリティ確認に失敗しました。Chrome、Edge、Firefoxを最新版に更新するか、拡張機能を無効にしたプライベートウィンドウで再試行してください。必要に応じてネットワークも切り替えてください。",
    ko: "보안 확인에 실패했습니다. Chrome, Edge 또는 Firefox를 최신 버전으로 업데이트하거나 확장 프로그램을 끈 비공개 창에서 다시 시도하세요. 필요한 경우 네트워크를 변경하세요.",
    ru: "Не удалось пройти проверку безопасности. Обновите Chrome, Edge или Firefox либо повторите попытку в приватном окне с отключёнными расширениями. При необходимости смените сеть.",
    th: "การตรวจสอบความปลอดภัยล้มเหลว โปรดอัปเดต Chrome, Edge หรือ Firefox หรือลองอีกครั้งในหน้าต่างส่วนตัวโดยปิดส่วนขยาย หากจำเป็นให้เปลี่ยนเครือข่าย",
    vi: "Xác minh bảo mật không thành công. Hãy cập nhật Chrome, Edge hoặc Firefox, hoặc thử lại trong cửa sổ riêng tư khi đã tắt tiện ích mở rộng. Nếu cần, hãy đổi mạng.",
    zh: "安全验证失败。请升级到最新版 Chrome、Edge 或 Firefox，或在关闭扩展的无痕窗口中重试；若仍失败，请更换网络。",
};

const getClerkLocaleKey = () => {
    const fallbackFromPath =
        (browser && window.location.pathname.match(/^\/([a-z]{2})\b/)?.[1]) || "en";

    const appLocale = (get(INTERNAL_locale) as string | undefined) || fallbackFromPath;
    const base = appLocale.toLowerCase().split("-")[0] || "en";

    return (supportedClerkLocales.includes(base as ClerkLocaleKey) ? base : "en") as ClerkLocaleKey;
};

let clerkLocalizationsPromise: Promise<ClerkLocalizationMap> | null = null;

const loadClerkLocalizations = async (): Promise<ClerkLocalizationMap> => {
    if (!clerkLocalizationsPromise) {
        clerkLocalizationsPromise = import("@clerk/localizations").then((module) => ({
            de: module.deDE,
            en: module.enUS,
            es: module.esES,
            fr: module.frFR,
            ja: module.jaJP,
            ko: module.koKR,
            ru: module.ruRU,
            th: module.thTH,
            vi: module.viVN,
            zh: module.zhCN,
        }));
    }

    return clerkLocalizationsPromise;
};

const getClerkLocalization = async () => {
    const localizations = await loadClerkLocalizations();
    const localeKey = getClerkLocaleKey();
    const localization = (localizations[localeKey] || localizations.en) as {
        unstable__errors?: Record<string, unknown>;
        [key: string]: unknown;
    };
    const captchaError = clerkCaptchaErrorCopy[localeKey];

    return {
        ...localization,
        unstable__errors: {
            ...localization.unstable__errors,
            captcha_invalid: captchaError,
            captcha_unavailable: captchaError,
        },
    };
};

let initPromise: Promise<ClerkInstance | null> | null = null;
let loadedLocaleKey: ClerkLocaleKey | null = null;
let localeSyncPromise: Promise<void> | null = null;
let lastSyncedUserId: string | null = null;
let syncPromise: Promise<void> | null = null;

const CLERK_INIT_TIMEOUT_MS = 12000;
const META_COMPLETE_REGISTRATION_WINDOW_MS = 10 * 60 * 1000;
const META_COMPLETE_REGISTRATION_TRACKED_PREFIX =
    "meta_complete_registration_tracked:";
const CLERK_HAS_SIGNED_IN_KEY = "fsv.clerk.has_signed_in";

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error(`${label} timed out`));
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
};

const setLocalStorageFlag = (key: string, value: string) => {
    if (!browser) return;

    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Ignore storage errors in strict privacy mode.
    }
};

export const hasSeenClerkSignInLocally = () => {
    if (!browser) return false;

    try {
        return window.localStorage.getItem(CLERK_HAS_SIGNED_IN_KEY) === "1";
    } catch {
        return false;
    }
};

export const hasClerkAuthenticationHintLocally = () => {
    if (hasSeenClerkSignInLocally()) return true;

    const instance = get(clerk) as (ClerkInstance & {
        client?: { lastAuthenticationStrategy?: string | null } | null,
    }) | null;
    return Boolean(instance?.client?.lastAuthenticationStrategy);
};

const markClerkSignInSeenLocally = () => {
    setLocalStorageFlag(CLERK_HAS_SIGNED_IN_KEY, "1");
};

const toEpochMs = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return value;
    }

    if (typeof value === "string" && value.trim()) {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }

    return null;
};

const trackMetaCompleteRegistration = (
    clerkUserId: string,
    createdAtRaw: unknown,
) => {
    if (!browser) return;

    const createdAt = toEpochMs(createdAtRaw);
    if (!createdAt) return;

    if (Math.abs(Date.now() - createdAt) > META_COMPLETE_REGISTRATION_WINDOW_MS) {
        return;
    }

    const dedupeKey = `${META_COMPLETE_REGISTRATION_TRACKED_PREFIX}${clerkUserId}`;
    try {
        if (window.localStorage.getItem(dedupeKey) === "1") {
            return;
        }
    } catch {
        // Ignore storage errors in strict privacy mode.
    }

    const fbq = (window as { fbq?: (...args: unknown[]) => void }).fbq;
    if (typeof fbq !== "function") return;

    fbq("track", "CompleteRegistration");

    try {
        window.localStorage.setItem(dedupeKey, "1");
    } catch {
        // Ignore storage errors in strict privacy mode.
    }
};

const syncClerkLocale = async (instance: ClerkInstance) => {
    const desiredKey = getClerkLocaleKey();

    if (loadedLocaleKey === desiredKey) {
        return;
    }

    if (localeSyncPromise) {
        await localeSyncPromise;
        if (loadedLocaleKey === desiredKey) return;
    }

    localeSyncPromise = instance
        .load({
            localization: await getClerkLocalization(),
        } as any)
        .then(() => {
            loadedLocaleKey = desiredKey;
        })
        .finally(() => {
            localeSyncPromise = null;
        });

    await localeSyncPromise;
};

const syncUserToAPI = async (instance: ClerkInstance | null | undefined) => {
    if (!instance?.session) return;

    const userId = instance.user?.id;
    if (!userId || userId === lastSyncedUserId) return;

    markClerkSignInSeenLocally();

    if (syncPromise) {
        await syncPromise;
        if (lastSyncedUserId === userId) return;
    }

    syncPromise = (async () => {
        try {
            const token = await instance.session?.getToken();
            if (!token) return;

            const apiBase = currentApiURL();
            const response = await fetch(`${apiBase}/user/me`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }).catch(() => null);

            if (response?.ok) {
                const payload = await response.json().catch(() => null);
                const createdAt = payload?.data?.user?.created_at;
                trackMetaCompleteRegistration(userId, createdAt);
            } else if (response?.status === 403) {
                const payload = await response.json().catch(() => null);
                const code = payload?.error?.code;
                if (
                    code === "DUPLICATE_SIGNUP_BLOCKED" ||
                    code === "ACCOUNT_DISABLED"
                ) {
                    await instance.signOut().catch(() => {});
                    clerkUser.set(null);
                    clerkSession.set(null);
                }
            }

            lastSyncedUserId = userId;
        } catch (error) {
            console.debug("Clerk syncUserToAPI failed", error);
        } finally {
            syncPromise = null;
        }
    })();

    await syncPromise;
};

export const initClerk = async () => {
    if (!browser) return null;
    const publishableKey = env.CLERK_PUBLISHABLE_KEY;
    if (!publishableKey) return null;

    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        try {
            const { Clerk } = await withTimeout(
                import("@clerk/clerk-js"),
                CLERK_INIT_TIMEOUT_MS,
                "Clerk SDK import",
            );
            const instance = new Clerk(publishableKey);

            await withTimeout(
                syncClerkLocale(instance),
                CLERK_INIT_TIMEOUT_MS,
                "Clerk load",
            );

            clerk.set(instance);
            clerkLoaded.set(true);

            clerkUser.set(instance.user as unknown as ClerkUser | null);
            clerkSession.set(instance.session as unknown as ClerkSession | null);

            if (instance.user) {
                markClerkSignInSeenLocally();
            }

            await syncUserToAPI(instance);

            instance.addListener((resources) => {
                clerkUser.set(resources.user as unknown as ClerkUser | null);
                clerkSession.set(resources.session as unknown as ClerkSession | null);

                if (resources.user) {
                    markClerkSignInSeenLocally();
                    void syncUserToAPI(instance);
                }
            });

            return instance;
        } catch (error) {
            console.debug("Clerk init failed", error);
            clerk.set(null);
            clerkUser.set(null);
            clerkSession.set(null);
            clerkLoaded.set(true);
            initPromise = null;
            return null;
        }
    })();

    return initPromise;
};

export const signIn = async (options: Record<string, unknown> = {}) => {
    const instance = await initClerk();
    if (!instance) return;
    await syncClerkLocale(instance);

    instance.openSignIn({
        appearance: clerkAppearance,
        ...options,
    } as any);
};

export const checkSignedIn = async (maxWaitMs = 600) => {
    const instance = await initClerk();
    if (!instance) return false;

    await syncClerkLocale(instance);

    if (instance.user) return true;

    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        await new Promise((r) => setTimeout(r, 75));
        if (instance.user) return true;
    }

    return false;
};

export const signUp = async (options: Record<string, unknown> = {}) => {
    const instance = await initClerk();
    if (!instance) return;
    await syncClerkLocale(instance);

    instance.openSignUp({
        appearance: clerkAppearance,
        ...options,
    } as any);
};

export const openUserProfile = async (
    options: Record<string, unknown> = {},
) => {
    const instance = await initClerk();
    if (!instance) return;
    await syncClerkLocale(instance);

    instance.openUserProfile({
        appearance: clerkAppearance,
        ...options,
    } as any);
};

export const signOut = async () => {
    const instance = await initClerk();
    if (!instance) return;
    await instance.signOut();
};

export const getClerkToken = async () => {
    const instance = await initClerk();
    const session = instance?.session as unknown as ClerkSession | null | undefined;
    return (await session?.getToken()) ?? null;
};

export const isSignedIn = derived(
    [clerkLoaded, clerkUser],
    ([$clerkLoaded, $clerkUser]) => $clerkLoaded && !!$clerkUser,
);
