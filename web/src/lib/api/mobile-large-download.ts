export const MOBILE_LARGE_DOWNLOAD_BYTES = 500 * 1024 * 1024;

const isYoutube = (service: string | undefined, sourceUrl: string) => {
    if (service === "youtube") return true;
    try {
        const host = new URL(sourceUrl.replace(/^"|"$/g, "")).hostname.toLowerCase();
        return host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com");
    } catch { return false; }
};

export const needsMobileLargeDownloadWarning = (
    mobile: boolean,
    response: { status: string; service?: string; estimatedSizeBytes?: number; duration?: number },
    sourceUrl: string,
) => {
    if (!mobile || !["redirect", "tunnel", "local-processing"].includes(response.status)) return false;
    return isYoutube(response.service, sourceUrl) && (
        (Number.isSafeInteger(response.estimatedSizeBytes) && response.estimatedSizeBytes! >= MOBILE_LARGE_DOWNLOAD_BYTES)
        || (Number.isFinite(response.duration) && response.duration! >= 3600)
    );
};

export const youtubeStorageWarning = async (
    mobile: boolean,
    response: { status: string; type?: string; service?: string; estimatedSizeBytes?: number; duration?: number },
    sourceUrl: string,
    storage: { getDirectory?: unknown; estimate?: () => Promise<{ quota?: number; usage?: number }> } | undefined,
    probe?: () => Promise<boolean>,
) => {
    if (mobile || !isYoutube(response.service, sourceUrl)) return null;
    const usesQueue = response.status === "local-processing" ||
        (response.status === "tunnel" && ["merge", "remux", "mute", "audio", "gif"].includes(response.type || ""));
    const size = response.estimatedSizeBytes;
    const large = (Number.isSafeInteger(size) && size! >= MOBILE_LARGE_DOWNLOAD_BYTES)
        || (Number.isFinite(response.duration) && response.duration! >= 3600);
    if (!usesQueue || !large) return null;
    if (typeof storage?.getDirectory !== "function") return "storage_unavailable";
    try {
        const estimate = await storage.estimate?.();
        // Client-side muxing keeps input tracks while writing an output file.
        // This is an estimate, not a reservation or a guarantee of success.
        const required = size && response.status === "local-processing" && response.type !== "proxy"
            ? size * 2 : size;
        if (size && Number.isFinite(estimate?.quota) && Number.isFinite(estimate?.usage)
            && estimate!.quota! - estimate!.usage! < required!) return "storage_low";
    } catch { /* An unavailable estimate is not proof that space is insufficient. */ }
    if (probe) {
        try { if (!await probe()) return "storage_unavailable"; }
        catch { return "storage_unavailable"; }
    }
    return null;
};
