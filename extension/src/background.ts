import type { ExtensionMessage } from './shared/messages';
import { buildFreeSaveVideoUrl } from './shared/url';

const sanitizeDownloadPath = (value?: string) => {
    const fallback = 'FreeSaveVideo/download';
    if (!value) return fallback;
    const cleaned = value
        .replace(/[<>:"\\|?*\x00-\x1f]/g, '_')
        .replace(/^\/+/, '')
        .replace(/\/{2,}/g, '/')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned || fallback;
};

chrome.runtime.onInstalled.addListener(() => {
    void chrome.storage.local.set({
        installedAt: new Date().toISOString(),
    });
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.type === 'FSV_OPEN_FREESAVEVIDEO') {
        void chrome.tabs.create({ url: buildFreeSaveVideoUrl(message.url) });
    }
    if (message.type === 'FSV_DOWNLOAD_URL') {
        void chrome.downloads.download({
            url: message.url,
            filename: sanitizeDownloadPath(message.filename),
            saveAs: false,
        });
    }
});
