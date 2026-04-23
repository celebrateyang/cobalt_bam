import { browser } from "$app/environment";

export const PWA_INSTALLED_KEY = "pwa-installed";

const PWA_INSTALLED_COOKIE = "pwa-installed";
const PWA_INSTALLED_COOKIE_VALUE = "true";
const PWA_INSTALLED_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type InstalledRelatedApp = {
    platform?: string;
    id?: string;
    url?: string;
};

type NavigatorWithInstalledApps = Navigator & {
    getInstalledRelatedApps?: () => Promise<InstalledRelatedApp[]>;
};

const hasInstallCookie = () => {
    if (!browser) return false;

    return document.cookie
        .split(";")
        .map((chunk) => chunk.trim())
        .some((chunk) => chunk === `${PWA_INSTALLED_COOKIE}=${PWA_INSTALLED_COOKIE_VALUE}`);
};

export const isStandaloneMode = () => {
    if (!browser) return false;

    return (
        window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: window-controls-overlay)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
};

export const hasStoredInstallMarker = () => {
    if (!browser) return false;

    return (
        localStorage.getItem(PWA_INSTALLED_KEY) === PWA_INSTALLED_COOKIE_VALUE ||
        hasInstallCookie()
    );
};

export const persistInstallMarker = () => {
    if (!browser) return;

    try {
        localStorage.setItem(PWA_INSTALLED_KEY, PWA_INSTALLED_COOKIE_VALUE);
    } catch {
        // Ignore storage failures in strict privacy modes.
    }

    document.cookie =
        `${PWA_INSTALLED_COOKIE}=${PWA_INSTALLED_COOKIE_VALUE}; ` +
        `path=/; max-age=${PWA_INSTALLED_COOKIE_MAX_AGE}; SameSite=Lax`;
};

export const detectInstalledRelatedWebapp = async () => {
    if (!browser) return false;

    const navigatorWithInstalledApps = navigator as NavigatorWithInstalledApps;
    if (typeof navigatorWithInstalledApps.getInstalledRelatedApps !== "function") {
        return false;
    }

    try {
        const relatedApps = await navigatorWithInstalledApps.getInstalledRelatedApps();
        return relatedApps.some((app) => app?.platform === "webapp");
    } catch {
        return false;
    }
};
