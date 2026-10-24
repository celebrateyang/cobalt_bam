import { sanitizeDownloadPath } from './filename';

const hosts = ['tiktok.com', 'tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com',
    'tiktokv.com', 'tokcdn.com', 'byteoversea.com', 'ibytedtos.com', 'muscdn.com'];

export const isTikTokMediaUrl = (value: string) => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
    } catch {
        return false;
    }
};

export type TikTokJob = { url: string; filename: string; createdAt: number };

export async function openTikTokDownload(url: string, filename?: string) {
    if (!isTikTokMediaUrl(url)) throw new Error('Unsupported TikTok resource.');
    const path = sanitizeDownloadPath(filename || 'FreeSaveVideo/tiktok.mp4');
    if (!/\.mp4$/i.test(path)) throw new Error('TikTok downloads must use an MP4 filename.');
    const key = `tiktok-job-${crypto.randomUUID()}`;
    const job: TikTokJob = { url, filename: path, createdAt: Date.now() };
    await chrome.storage.session.set({ [key]: job });
    try {
        await chrome.tabs.create({ url: chrome.runtime.getURL(`download/index.html#${key}`) });
    } catch (error) {
        await chrome.storage.session.remove(key);
        throw error;
    }
}
