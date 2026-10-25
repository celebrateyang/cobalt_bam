export const MOBILE_LARGE_DOWNLOAD_BYTES = 500 * 1024 * 1024;

export const needsMobileLargeDownloadWarning = (
    mobile: boolean,
    response: { status: string; service?: string; estimatedSizeBytes?: number },
    sourceUrl: string,
) => {
    if (!mobile || !["redirect", "tunnel", "local-processing"].includes(response.status)) return false;
    let youtube = response.service === "youtube";
    try {
        const host = new URL(sourceUrl.replace(/^"|"$/g, "")).hostname.toLowerCase();
        youtube ||= host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com");
    } catch { /* A service hint can still identify the resolved response. */ }
    return youtube && Number.isSafeInteger(response.estimatedSizeBytes)
        && response.estimatedSizeBytes! >= MOBILE_LARGE_DOWNLOAD_BYTES;
};
