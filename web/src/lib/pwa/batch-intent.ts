import { browser } from "$app/environment";

import type { DialogBatchItem } from "$lib/types/dialog";
import type { DownloadModeOption } from "$lib/types/settings";

const PENDING_BATCH_INTENT_KEY = "pending-batch-intent";

export type PendingBatchIntent = {
    title?: string;
    items: DialogBatchItem[];
    selectedUrls: string[];
    collectionKey?: string;
    collectionSourceUrl?: string;
    downloadMode?: DownloadModeOption;
    returnPath: string;
    autostart: boolean;
    updatedAt: number;
};

const isValidBatchItem = (value: unknown): value is DialogBatchItem => {
    if (!value || typeof value !== "object") return false;

    const item = value as DialogBatchItem;
    return typeof item.url === "string" && item.url.trim().length > 0;
};

const isValidDownloadMode = (value: unknown): value is DownloadModeOption =>
    value === "auto" || value === "audio" || value === "mute";

const parsePendingBatchIntent = (raw: string | null): PendingBatchIntent | null => {
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as Partial<PendingBatchIntent>;
        const items = Array.isArray(parsed?.items)
            ? parsed.items.filter(isValidBatchItem)
            : [];

        if (!items.length) return null;

        const selectedUrls = Array.isArray(parsed?.selectedUrls)
            ? parsed.selectedUrls.filter(
                  (url): url is string => typeof url === "string" && url.length > 0,
              )
            : items.map((item) => item.url);

        const returnPath =
            typeof parsed?.returnPath === "string" && parsed.returnPath.startsWith("/")
                ? parsed.returnPath
                : null;

        if (!returnPath) return null;

        return {
            title: typeof parsed?.title === "string" ? parsed.title : undefined,
            items,
            selectedUrls,
            collectionKey:
                typeof parsed?.collectionKey === "string"
                    ? parsed.collectionKey
                    : undefined,
            collectionSourceUrl:
                typeof parsed?.collectionSourceUrl === "string"
                    ? parsed.collectionSourceUrl
                    : undefined,
            downloadMode: isValidDownloadMode(parsed?.downloadMode)
                ? parsed.downloadMode
                : undefined,
            returnPath,
            autostart: parsed?.autostart === true,
            updatedAt: Number(parsed?.updatedAt) || Date.now(),
        };
    } catch {
        return null;
    }
};

export const readPendingBatchIntent = () => {
    if (!browser) return null;

    return parsePendingBatchIntent(sessionStorage.getItem(PENDING_BATCH_INTENT_KEY));
};

export const savePendingBatchIntent = (
    intent: Omit<PendingBatchIntent, "updatedAt">,
) => {
    if (!browser) return;

    const payload: PendingBatchIntent = {
        ...intent,
        updatedAt: Date.now(),
    };

    sessionStorage.setItem(PENDING_BATCH_INTENT_KEY, JSON.stringify(payload));
};

export const clearPendingBatchIntent = () => {
    if (!browser) return;

    sessionStorage.removeItem(PENDING_BATCH_INTENT_KEY);
};
