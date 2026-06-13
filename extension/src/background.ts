import type { ExtensionMessage } from './shared/messages';
import { downloadWithChrome } from './downloader/chrome-downloads';
import { buildFreeSaveVideoUrl } from './shared/url';

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
        void downloadWithChrome(message);
    }
});
