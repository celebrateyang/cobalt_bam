export const GIFT_DAY_MS = 24 * 60 * 60 * 1000;
export const GIFT_VISIBLE_MS = 20_000;
export const GIFT_STORAGE_KEY = "fsv-referral-gift-v2";
export const GIFT_SESSION_KEY = "fsv-referral-gift-seen-v2";

export type GiftHistory = {
    downloads: number;
    lastShownAt: number;
    downloadsAtLastShown: number;
    quietUntil: number;
};

export const readGiftHistory = (raw: string | null): GiftHistory => {
    let value: Partial<GiftHistory> = {};
    try { value = JSON.parse(raw || "{}") || {}; } catch { /* Ignore invalid local data. */ }
    const number = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : 0;
    const downloads = number(value.downloads);
    return {
        downloads,
        lastShownAt: number(value.lastShownAt),
        downloadsAtLastShown: Math.min(downloads, number(value.downloadsAtLastShown)),
        quietUntil: number(value.quietUntil),
    };
};

export const canOfferGift = (history: GiftHistory, seenThisVisit: boolean, now: number) => {
    if (seenThisVisit || now < history.quietUntil) return false;
    if (!history.lastShownAt) return history.downloads >= 2;
    return now - history.lastShownAt >= 7 * GIFT_DAY_MS
        && history.downloads - history.downloadsAtLastShown >= 3;
};

// Wait for the entire queue, including folder writes and every batch entry.
// A processed file awaiting Save is not a completed saving operation.
type GiftQueueItem = {
    state: string;
    saveRequested?: boolean;
    saveOutcome?: string;
    autoSave?: { enabled?: boolean; state?: string };
    batchSessionId?: string;
    batchSelectionTotal?: number;
};
export const isGiftQueueSettled = (items: Record<string, GiftQueueItem>) => {
    const batches = new Map<string, { seen: number; total: number }>();
    for (const item of Object.values(items)) {
        if (item.state !== "done") return false;
        if (item.autoSave?.enabled) {
            if (item.autoSave.state !== "saved") return false;
        } else if (!item.saveRequested || !["download", "shared"].includes(item.saveOutcome || "")) {
            return false;
        }
        if (item.batchSessionId) {
            const batch = batches.get(item.batchSessionId) || { seen: 0, total: 0 };
            batch.seen++;
            batch.total = Math.max(batch.total, item.batchSelectionTotal || 0);
            batches.set(item.batchSessionId, batch);
        }
    }
    return [...batches.values()].every(batch => batch.seen >= batch.total);
};
