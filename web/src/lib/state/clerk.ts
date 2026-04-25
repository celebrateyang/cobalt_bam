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
    return localizations[getClerkLocaleKey()] || localizations.en;
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

            await syncUserToAPI(instance);

            instance.addListener((resources) => {
                clerkUser.set(resources.user as unknown as ClerkUser | null);
                clerkSession.set(resources.session as unknown as ClerkSession | null);

                if (resources.user) {
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
