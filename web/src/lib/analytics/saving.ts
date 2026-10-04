export type SaveOutcome = "dialog" | "download" | "shared" | "copied" | "cancelled" | "failed";
export type SaveContext = { source?: "queue" | "bulk" | "dialog" | "download"; repeat?: boolean };

// Do not include filenames, source URLs, account IDs, or error messages.
export const trackSave = (action: string, method: string, context: SaveContext = {}) => {
    if (typeof window === "undefined") return;
    const target = window as Window & {
        clarity?: (...args: unknown[]) => void;
        gtag?: (...args: unknown[]) => void;
    };
    try {
        target.gtag?.("event", "media_save", {
            action, method, source: context.source || "download", repeat: Boolean(context.repeat),
        });
        target.clarity?.("set", "save_method", method);
        target.clarity?.("set", "save_source", context.source || "download");
        target.clarity?.("set", "save_repeat", String(Boolean(context.repeat)));
        target.clarity?.("event", `media_save_${action}`);
    } catch {
        // Analytics must never interrupt saving.
    }
};
