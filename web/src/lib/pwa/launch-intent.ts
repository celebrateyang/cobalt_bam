import { browser } from "$app/environment";

const PENDING_LAUNCH_INTENT_KEY = "pending-launch-intent";

type PendingLaunchIntent = {
    url: string;
    autostart: boolean;
    updatedAt: number;
};

const parsePendingLaunchIntent = (raw: string | null): PendingLaunchIntent | null => {
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as PendingLaunchIntent;
        if (!parsed || typeof parsed.url !== "string" || !parsed.url.trim()) {
            return null;
        }

        return {
            url: parsed.url,
            autostart: parsed.autostart === true,
            updatedAt: Number(parsed.updatedAt) || Date.now(),
        };
    } catch {
        return null;
    }
};

export const readPendingLaunchIntent = () => {
    if (!browser) return null;

    return parsePendingLaunchIntent(sessionStorage.getItem(PENDING_LAUNCH_INTENT_KEY));
};

export const savePendingLaunchIntent = (
    url: string,
    options: { autostart?: boolean } = {},
) => {
    if (!browser) return;

    const payload: PendingLaunchIntent = {
        url,
        autostart: options.autostart === true,
        updatedAt: Date.now(),
    };

    sessionStorage.setItem(PENDING_LAUNCH_INTENT_KEY, JSON.stringify(payload));
};

export const markPendingLaunchAutostartHandled = () => {
    if (!browser) return;

    const current = readPendingLaunchIntent();
    if (!current) return;

    savePendingLaunchIntent(current.url, { autostart: false });
};

export const clearPendingLaunchIntent = () => {
    if (!browser) return;

    sessionStorage.removeItem(PENDING_LAUNCH_INTENT_KEY);
};
