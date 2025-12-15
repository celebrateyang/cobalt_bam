import { browser } from "$app/environment";
import { derived, writable } from "svelte/store";

import env from "$lib/env";

import type { Clerk as ClerkInstance } from "@clerk/clerk-js";

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

let initPromise: Promise<ClerkInstance | null> | null = null;

export const initClerk = async () => {
    if (!browser) return null;
    if (!env.CLERK_PUBLISHABLE_KEY) return null;

    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        const { Clerk } = await import("@clerk/clerk-js");
        const instance = new Clerk(env.CLERK_PUBLISHABLE_KEY);

        await instance.load();

        clerk.set(instance);
        clerkLoaded.set(true);

        clerkUser.set(instance.user as unknown as ClerkUser | null);
        clerkSession.set(instance.session as unknown as ClerkSession | null);

        instance.addListener((resources) => {
            clerkUser.set(resources.user as unknown as ClerkUser | null);
            clerkSession.set(resources.session as unknown as ClerkSession | null);
        });

        return instance;
    })();

    return initPromise;
};

export const signIn = async (options: Record<string, unknown> = {}) => {
    const instance = await initClerk();
    if (!instance) return;

    instance.openSignIn({
        appearance: clerkAppearance,
        ...options,
    } as any);
};

export const signUp = async (options: Record<string, unknown> = {}) => {
    const instance = await initClerk();
    if (!instance) return;

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

