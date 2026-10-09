export type SavedBuyMeACoffeeOrder = {
    id: number;
    kind: "credit" | "membership";
    savedAt: number;
};

const key = (userId: string) => `fsv_bmc_pending:${userId}`;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// Store only an order reference. Payment codes and receipts stay on the server.
export const saveBuyMeACoffeeOrder = (
    storage: Storage,
    userId: string,
    id: number,
    kind: SavedBuyMeACoffeeOrder["kind"],
) => {
    try {
        storage.setItem(key(userId), JSON.stringify({ id, kind, savedAt: Date.now() }));
    } catch { /* Payment remains available when storage is disabled. */ }
};

export const readBuyMeACoffeeOrder = (
    storage: Storage,
    userId: string,
): SavedBuyMeACoffeeOrder | null => {
    try {
        const saved = JSON.parse(storage.getItem(key(userId)) || "null");
        const age = Date.now() - saved?.savedAt;
        if (saved && Number.isSafeInteger(saved.id) && saved.id > 0 &&
            ["credit", "membership"].includes(saved.kind) &&
            Number.isFinite(age) && age >= 0 && age < MAX_AGE) return saved;
        storage.removeItem(key(userId));
    } catch { /* Ignore invalid or unavailable storage. */ }
    return null;
};

export const removeBuyMeACoffeeOrder = (storage: Storage, userId: string) => {
    try { storage.removeItem(key(userId)); } catch { /* Best effort. */ }
};

export const safeBuyMeACoffeeCheckoutUrl = (value: unknown): string => {
    try {
        const url = new URL(String(value || ""));
        return url.protocol === "https:" && url.hostname === "buymeacoffee.com" &&
            !url.username && !url.password && !url.port && /^\/[^/]+\/e\/\d+\/?$/.test(url.pathname)
            ? url.href : "";
    } catch { return ""; }
};
