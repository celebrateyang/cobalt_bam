import { scanGenericMedia } from './adapters/generic';
import { scanWithAdapter } from './adapters/registry';
import type { ExtensionMessage, PageScanResult } from './shared/messages';

declare global {
    interface Window {
        __fsvContentListenerReady?: boolean;
    }
}

const scanPage = async (): Promise<PageScanResult> => {
    const pageUrl = window.location.href;
    const pageTitle = document.title || window.location.hostname;
    const performanceEntries = performance
        .getEntriesByType('resource')
        .filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming);

    let cachedGenericMedia: PageScanResult['media'] | null = null;

    return scanWithAdapter({
        pageUrl,
        pageTitle,
        hostname: window.location.hostname,
        document,
        performanceEntries,
        genericScan: () => {
            if (!cachedGenericMedia) {
                cachedGenericMedia = scanGenericMedia({
                    document,
                    pageUrl,
                    pageTitle,
                    performanceEntries,
                });
            }
            return cachedGenericMedia;
        },
    });
};

if (!window.__fsvContentListenerReady) {
    window.__fsvContentListenerReady = true;
    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
        if (message.type !== 'FSV_SCAN_PAGE') return false;
        void scanPage().then(sendResponse);
        return true;
    });
}
