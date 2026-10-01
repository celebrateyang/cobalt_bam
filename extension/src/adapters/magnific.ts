import type { DetectedMedia, PlatformAdapter } from './types';
import { normalizeUrl } from './runtime';

const HOST_RE = /(^|\.)magnific\.(?:com|ai)$/i;
const FREE_PAGE_RE = /^\/(?:[a-z]{2}\/)?free-(?:photo|ai-image|vector|psd|video)\/[^/]+\/?$/i;
const FREE_VIDEO_RE = /^\/(?:[a-z]{2}\/)?free-video\//i;
const MEDIA_RE = /\.(?:avif|gif|jpe?g|png|webp|mp4|mov|webm|mp3|m4a|aac|ogg|wav)(?:[?#]|$)/i;

const isMagnificMedia = (value: string) => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && HOST_RE.test(url.hostname) && MEDIA_RE.test(url.href);
    } catch {
        return false;
    }
};

const metaMedia = (document: Document, pageUrl: string, videoPage: boolean): DetectedMedia[] => {
    const selectors = videoPage
        ? ['meta[property="og:video:secure_url"]', 'meta[property="og:video"]', 'meta[name="twitter:player:stream"]']
        : ['meta[property="og:image:secure_url"]', 'meta[property="og:image"]', 'meta[name="twitter:image"]'];
    const kind = videoPage ? 'video' : 'image';
    const format = videoPage ? 'MP4' : 'IMAGE';
    const found: DetectedMedia[] = [];
    for (const selector of selectors) {
        const raw = document.querySelector<HTMLMetaElement>(selector)?.content;
        const url = raw ? normalizeUrl(raw, pageUrl) : null;
        if (!url || !isMagnificMedia(url) || found.some((item) => item.url === url)) continue;
        found.push({
            id: `magnific-meta-${found.length + 1}`,
            kind,
            url,
            label: videoPage ? 'Magnific public video preview' : 'Magnific public image',
            source: 'adapter',
            format,
            score: 100,
        });
    }
    return found;
};

export const magnificAdapter: PlatformAdapter = {
    id: 'magnific',
    label: 'Magnific',
    matches(url) {
        return HOST_RE.test(url.hostname);
    },
    scan(context) {
        const page = new URL(context.pageUrl);
        if (!FREE_PAGE_RE.test(page.pathname)) {
            return {
                platform: 'magnific',
                pageUrl: context.pageUrl,
                pageTitle: context.pageTitle,
                hostname: context.hostname,
                status: 'unsupportedContent',
                media: [],
                warnings: ['Only public Magnific pages whose URL is explicitly marked free are supported. Premium assets, account creations, Projects, and credit-based exports are excluded.'],
            };
        }

        const videoPage = FREE_VIDEO_RE.test(page.pathname);
        const explicitMedia = metaMedia(context.document, context.pageUrl, videoPage);
        const scannedMedia = context.genericScan().filter((item) => {
                if (!isMagnificMedia(item.url)) return false;
                return videoPage
                    ? item.kind === 'video' || item.kind === 'playlist'
                    : item.kind === 'image';
            });
        // Image pages contain large recommendation grids. Prefer the page's
        // explicit Open Graph asset so unrelated suggestions are not offered.
        const candidates = videoPage
            ? [...explicitMedia, ...scannedMedia]
            : explicitMedia.length
              ? explicitMedia
              : scannedMedia.slice(0, 1);
        const media = candidates.filter((item, index, list) =>
            list.findIndex((candidate) => candidate.url === item.url) === index
        );
        return {
            platform: 'magnific',
            pageUrl: context.pageUrl,
            pageTitle: context.pageTitle,
            hostname: context.hostname,
            status: media.length ? 'ok' : videoPage ? 'needsPlayback' : 'empty',
            media,
            warnings: media.length
                ? ['Only the public media exposed by this free page is listed. Free assets may require creator attribution under Magnific\'s license.']
                : ['No public media is visible yet. For a free video page, start playback and scan again.'],
        };
    },
};
