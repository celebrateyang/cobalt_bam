import type { PlatformAdapter, DetectedMedia } from './types';

export const isXinpianchangMedia = (value: string) => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && /(^|\.)xpccdn\.com$/i.test(url.hostname)
            && /\.mp4$/i.test(url.pathname);
    } catch { return false; }
};

export const xinpianchangAdapter: PlatformAdapter = {
    id: 'xinpianchang',
    label: 'Xinpianchang',
    matches: url => /^(www\.)?xinpianchang\.com$/i.test(url.hostname),
    scan(context) {
        const media: DetectedMedia[] = context.genericScan()
            .filter(item => (item.kind === 'video' || item.kind === 'audio') && isXinpianchangMedia(item.url))
            .map(item => ({ ...item, sourcePageUrl: context.pageUrl,
                label: item.kind === 'video' ? context.pageTitle : item.label }));
        return {
            platform: 'xinpianchang', pageUrl: context.pageUrl, pageTitle: context.pageTitle,
            hostname: context.hostname, status: media.length ? 'ok' : 'needsPlayback', media,
            warnings: media.length ? [] : ['Complete the site verification and play the video, then scan again.'],
        };
    },
};
