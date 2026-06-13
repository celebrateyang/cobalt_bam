import type { DetectedMedia } from '../adapters/types';

export type DownloadProbeResult = {
    strategy: 'chrome-downloads' | 'page-context';
    reason?: string;
};

export const planDownloadStrategy = (media: DetectedMedia): DownloadProbeResult => {
    if (media.requiresPageContext) {
        return {
            strategy: 'page-context',
            reason: 'This media may require page cookies, headers, or a fetch/blob fallback.',
        };
    }

    return {
        strategy: 'chrome-downloads',
    };
};
