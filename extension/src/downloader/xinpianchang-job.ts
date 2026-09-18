import { isXinpianchangMedia } from '../adapters/xinpianchang';
import { sanitizeDownloadPath } from './filename';

export type XinpianchangJob = { url: string; filename: string; sourcePageUrl?: string; createdAt: number };

export async function openXinpianchangDownload(url: string, filename?: string, sourcePageUrl?: string) {
    if (!isXinpianchangMedia(url)) throw new Error('Unsupported Xinpianchang resource.');
    const path = sanitizeDownloadPath(filename || 'FreeSaveVideo/xinpianchang.mp4');
    if (!/\.mp4$/i.test(path)) throw new Error('Xinpianchang downloads must use an MP4 filename.');
    const key = `xpc-job-${crypto.randomUUID()}`;
    const job: XinpianchangJob = { url, filename: path, sourcePageUrl, createdAt: Date.now() };
    await chrome.storage.session.set({ [key]: job });
    try {
        // A persistent page owns the Blob even if the popup closes or worker sleeps.
        await chrome.tabs.create({ url: chrome.runtime.getURL(`download/index.html#${key}`) });
    } catch (error) {
        await chrome.storage.session.remove(key);
        throw error;
    }
}
