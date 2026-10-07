import { isAmazonMediaUrl } from '@freesavevideo/amazon-direct/hls';
import { sanitizeDownloadPath } from './filename';

export type AmazonJob = { url: string; filename: string; createdAt: number };
export async function openAmazonDownload(url: string, filename?: string) {
    if (!isAmazonMediaUrl(url)) throw new Error('Unsupported Amazon resource.');
    const path = sanitizeDownloadPath(filename || 'FreeSaveVideo/amazon.mp4');
    if (!/\.mp4$/i.test(path)) throw new Error('Amazon video downloads must use an MP4 filename.');
    const key = `amazon-job-${crypto.randomUUID()}`;
    const job: AmazonJob = { url, filename: path, createdAt: Date.now() };
    await chrome.storage.session.set({ [key]: job });
    try {
        await chrome.tabs.create({ url: chrome.runtime.getURL(`download/index.html#${key}`) });
    } catch (error) {
        await chrome.storage.session.remove(key);
        throw error;
    }
}
