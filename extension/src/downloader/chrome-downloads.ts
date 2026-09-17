import type { DetectedMedia } from '../adapters/types';
import { sanitizeDownloadPath } from './filename';
import { planDownloadStrategy } from './probe';
import { isXinpianchangMedia } from '../adapters/xinpianchang';
import { prepareXinpianchangDownload, removeXinpianchangRule } from './xinpianchang';

export type DownloadRequest = {
    url: string;
    filename?: string;
    media?: DetectedMedia;
};

export const downloadWithChrome = async ({ url, filename, media }: DownloadRequest) => {
    const strategy = media ? planDownloadStrategy(media) : { strategy: 'chrome-downloads' as const };
    if (strategy.strategy !== 'chrome-downloads') {
        throw new Error(strategy.reason || 'This media requires a page-context download strategy.');
    }

    const xpc = isXinpianchangMedia(url);
    const ruleId = xpc ? await prepareXinpianchangDownload(url, media?.sourcePageUrl) : undefined;
    try {
        if (xpc) {
            const response = await fetch(url, { headers: { Range: 'bytes=0-31' },
                credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(20000) });
            if (!response.ok) {
                await response.body?.cancel();
                throw new Error(`Xinpianchang media returned ${response.status}. Play the video and scan again.`);
            }
            const reader = response.body?.getReader();
            const prefix: number[] = [];
            try {
                while (reader && prefix.length < 8) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    prefix.push(...value.slice(0, 8 - prefix.length));
                }
            } finally { await reader?.cancel(); }
            if (String.fromCharCode(...prefix.slice(4, 8)) !== 'ftyp') {
                throw new Error('The server did not return an MP4 file. Play the video and scan again.');
            }
        }
        const downloadId = await chrome.downloads.download({
            url,
            filename: sanitizeDownloadPath(filename),
            saveAs: false,
            ...(xpc ? { headers: [{ name: 'Range', value: 'bytes=0-' }] } : {}),
        });
        if (ruleId !== undefined) {
            await chrome.storage.session.set({ [`xpc-download-${downloadId}`]: ruleId });
            const [item] = await chrome.downloads.search({ id: downloadId });
            if (item?.state === 'complete' || item?.state === 'interrupted') {
                await removeXinpianchangRule(ruleId);
                await chrome.storage.session.remove(`xpc-download-${downloadId}`);
            }
            if (item?.state === 'interrupted') throw new Error(item.error || 'Download interrupted.');
        }
    } catch (error) {
        if (ruleId !== undefined) await removeXinpianchangRule(ruleId);
        throw error;
    }
};
