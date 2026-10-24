import type { DetectedMedia } from '../adapters/types';
import { sanitizeDownloadPath } from './filename';
import { planDownloadStrategy } from './probe';
import { isXinpianchangMedia } from '../adapters/xinpianchang';
import { openXinpianchangDownload } from './xinpianchang-job';
import { isAmazonMediaUrl } from '@freesavevideo/amazon-direct/hls';
import { openAmazonDownload } from './amazon-job';
import { isTikTokMediaUrl, openTikTokDownload } from './tiktok-job';

export type DownloadRequest = { url: string; filename?: string; media?: DetectedMedia };

export const downloadWithChrome = async ({ url, filename, media }: DownloadRequest) => {
    if (isTikTokMediaUrl(url) && (media?.kind === 'video' || /\.mp4$/i.test(filename || ''))) {
        await openTikTokDownload(url, filename);
        return;
    }
    if (isAmazonMediaUrl(url)) {
        await openAmazonDownload(url, filename);
        return;
    }
    if (isXinpianchangMedia(url)) {
        await openXinpianchangDownload(url, filename, media?.sourcePageUrl);
        return;
    }
    const strategy = media ? planDownloadStrategy(media) : { strategy: 'chrome-downloads' as const };
    if (strategy.strategy !== 'chrome-downloads') {
        throw new Error(strategy.reason || 'This media requires a page-context download strategy.');
    }
    await chrome.downloads.download({ url, filename: sanitizeDownloadPath(filename), saveAs: false });
};
