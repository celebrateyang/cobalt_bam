import { setTimeout as delay } from 'node:timers/promises';

// yt-dlp's available_at is a Unix timestamp in seconds, not a fixed delay.
// Only the selected media URLs may impose a wait on this request.
export const getYoutubeMediaAvailableAt = (info, result) => {
    const urls = new Set([result?.urls].flat().filter(url => typeof url === 'string'));
    return (Array.isArray(info?.formats) ? info.formats : []).reduce((latest, format) => {
        if (!urls.has(format?.url)) return latest;
        const timestamp = Number(format.available_at);
        if (!Number.isFinite(timestamp) || timestamp <= 0) return latest;
        const milliseconds = Math.ceil(timestamp * 1000);
        return Number.isSafeInteger(milliseconds) ? Math.max(latest, milliseconds) : latest;
    }, 0);
};

export const waitForYoutubeMedia = async (info, result, {
    now = Date.now,
    wait = delay,
    maxWaitMs = 45000,
    onWait = () => {},
} = {}) => {
    const availableAt = getYoutubeMediaAvailableAt(info, result);
    const waitMs = Math.max(0, availableAt - now());
    if (waitMs === 0) return true;
    // A corrupt timestamp or long scheduled wait must not hold a request open.
    if (waitMs > Math.max(0, maxWaitMs)) return false;
    onWait(waitMs);
    await wait(waitMs);
    return true;
};
