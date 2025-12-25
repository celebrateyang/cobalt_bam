import { browser } from "$app/environment";
import { derived, get, writable } from "svelte/store";

import env from "$lib/env";
import { INTERNAL_locale } from "$lib/i18n/translations";

import type { Clerk as ClerkInstance } from "@clerk/clerk-js";
import { deDE, enUS, esES, frFR, jaJP, koKR, ruRU, thTH, viVN, zhCN } from "@clerk/localizations";

type ClerkUser = {
    id: string;
    imageUrl?: string;
    fullName?: string | null;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    primaryEmailAddress?: { emailAddress: string } | null;
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

const localeToClerkLocalization = {
    de: deDE,
    en: enUS,
    es: esES,
    fr: frFR,
    ja: jaJP,
    ko: koKR,
    ru: ruRU,
    th: thTH,
    vi: viVN,
    zh: zhCN,
} as const;

const getClerkLocaleKey = () => {
    const fallbackFromPath =
        (browser && window.location.pathname.match(/^\/([a-z]{2})\b/)?.[1]) || "en";

    const appLocale = (get(INTERNAL_locale) as string | undefined) || fallbackFromPath;
    const base = appLocale.toLowerCase().split("-")[0] || "en";

    return (base in localeToClerkLocalization ? base : "en") as keyof typeof localeToClerkLocalization;
};

const getClerkLocalization = () =>
    localeToClerkLocalization[getClerkLocaleKey()] || enUS;

let initPromise: Promise<ClerkInstance | null> | null = null;
let loadedLocaleKey: keyof typeof localeToClerkLocalization | null = null;
let localeSyncPromise: Promise<void> | null = null;
let lastSyncedUserId: string | null = null;
let syncPromise: Promise<void> | null = null;

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
            localization: getClerkLocalization(),
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
    if (!instance?.session || !env.DEFAULT_API) return;

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

            await fetch(`${env.DEFAULT_API}/user/me`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }).catch(() => null);

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
    if (!env.CLERK_PUBLISHABLE_KEY) return null;

    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        const { Clerk } = await import("@clerk/clerk-js");
        const instance = new Clerk(env.CLERK_PUBLISHABLE_KEY);

        await syncClerkLocale(instance);

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
