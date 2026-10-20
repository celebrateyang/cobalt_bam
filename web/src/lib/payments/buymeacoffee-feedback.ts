// Keep session suppression even when browser storage is unavailable.
const seen = new Set<string>();
export const feedbackSeen = (key: string, storage: Pick<Storage, "getItem">) => {
    if (seen.has(key)) return true;
    try { return storage.getItem(key) === "1"; } catch { return false; }
};
export const markFeedbackSeen = (key: string, storage: Pick<Storage, "setItem">) => {
    seen.add(key);
    try { storage.setItem(key, "1"); } catch { /* In-memory suppression remains available. */ }
};
