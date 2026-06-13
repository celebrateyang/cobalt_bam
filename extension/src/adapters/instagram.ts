import type { AdapterContext, AdapterResult, DetectedMedia, PlatformAdapter } from './types';
import {
    dedupeBy,
    findJsonObjectByProperty,
    formatDurationLabel,
    getMetaContent,
    getPreferredThumbnail,
    readJsonLdScripts,
    visitObject,
} from './utils';
import { normalizeUrl } from '../shared/url';

const INSTAGRAM_HOST_RE = /(^|\.)instagram\.com$|(^|\.)ddinstagram\.com$/i;

type InstagramShortcodeMedia = {
    __typename?: string;
    is_video?: boolean;
    video_url?: string;
    video_duration?: number;
    display_url?: string;
    edge_sidecar_to_children?: {
        edges?: Array<{
            node?: InstagramShortcodeMedia;
        }>;
    };
    xdt_shortcode_media?: InstagramShortcodeMedia;
    shortcode_media?: InstagramShortcodeMedia;
};

const getPathInfo = (pageUrl: string) => {
    try {
        const url = new URL(pageUrl);
        const parts = url.pathname.split('/').filter(Boolean);
        return {
            parts,
            isStory: parts[0] === 'stories',
            isReel: parts[0] === 'reel' || parts[0] === 'reels' || (parts[1] === 'reel'),
            isPost: parts[0] === 'p',
            isShare: parts[0] === 'share',
        };
    } catch {
        return { parts: [], isStory: false, isReel: false, isPost: false, isShare: false };
    }
};

const findShortcodeMediaFromScripts = (document: Document) => {
    const scripts = [...document.querySelectorAll<HTMLScriptElement>('script')];
    for (const script of scripts) {
        const text = script.textContent;
        if (!text) continue;
        const media =
            findJsonObjectByProperty<InstagramShortcodeMedia>(text, ['xdt_shortcode_media']) ||
            findJsonObjectByProperty<InstagramShortcodeMedia>(text, ['shortcode_media']);
        if (media) return media;
    }
    return null;
};

const unwrapShortcodeMedia = (value: InstagramShortcodeMedia | null) =>
    value?.xdt_shortcode_media || value?.shortcode_media || value;

const getJsonLdMedia = (document: Document, pageUrl: string) => {
    const entries = readJsonLdScripts<Record<string, unknown>>(document);
    for (const entry of entries) {
        const type = String(entry['@type'] || '');
        if (type === 'VideoObject') {
            const contentUrl = typeof entry.contentUrl === 'string' ? normalizeUrl(entry.contentUrl, pageUrl) : null;
            const thumbnail = typeof entry.thumbnailUrl === 'string' ? normalizeUrl(entry.thumbnailUrl, pageUrl) : null;
            return {
                type: 'video' as const,
                url: contentUrl || undefined,
                thumbnailUrl: thumbnail || undefined,
                durationLabel: formatDurationLabel(typeof entry.duration === 'string' ? undefined : entry.duration),
            };
        }
    }
    return null;
};

const collectStoryMediaFromPage = (context: AdapterContext) => {
    const videoUrl = [...context.document.querySelectorAll<HTMLVideoElement>('video')]
        .map((video) => normalizeUrl(video.currentSrc || video.src, context.pageUrl))
        .find((url): url is string => Boolean(url));
    if (videoUrl) {
        return [{
            id: 'instagram-story-video',
            kind: 'video' as const,
            url: videoUrl,
            label: context.pageTitle,
            source: 'dom' as const,
            format: 'MP4',
            thumbnailUrl: getPreferredThumbnail(context.document, context.pageUrl),
            score: 60,
            requiresPageContext: true,
        }];
    }

    const imageUrl = [...context.document.querySelectorAll<HTMLImageElement>('img')]
        .map((img) => normalizeUrl(img.currentSrc || img.src, context.pageUrl))
        .find((url): url is string => Boolean(url));
    if (imageUrl) {
        return [{
            id: 'instagram-story-image',
            kind: 'image' as const,
            url: imageUrl,
            label: context.pageTitle,
            source: 'dom' as const,
            format: 'JPG',
            thumbnailUrl: imageUrl,
            score: 50,
            requiresPageContext: true,
        }];
    }

    return [];
};

const mediaItemsFromShortcode = (context: AdapterContext, media: InstagramShortcodeMedia) => {
    const title = getMetaContent(context.document, 'meta[property="og:title"]') || context.pageTitle;
    const thumbnailUrl =
        normalizeUrl(media.display_url || '', context.pageUrl) ||
        getPreferredThumbnail(context.document, context.pageUrl);

    const sidecar = media.edge_sidecar_to_children?.edges || [];
    if (sidecar.length) {
        const items = sidecar.flatMap((edge, index): DetectedMedia[] => {
            const node = edge.node;
            if (!node) return [];
            const durationLabel = formatDurationLabel(node.video_duration);
            const displayUrl = normalizeUrl(node.display_url || '', context.pageUrl) || thumbnailUrl;
            const videoUrl = normalizeUrl(node.video_url || '', context.pageUrl);
            if (node.is_video && videoUrl) {
                return [{
                    id: `instagram-carousel-video-${index + 1}`,
                    kind: 'video',
                    url: videoUrl,
                    label: `${title} video ${index + 1}`,
                    source: 'adapter',
                    format: 'MP4',
                    thumbnailUrl: displayUrl,
                    durationLabel,
                    score: 90 - index,
                }];
            }
            if (displayUrl) {
                return [{
                    id: `instagram-carousel-image-${index + 1}`,
                    kind: 'image',
                    url: displayUrl,
                    label: `${title} image ${index + 1}`,
                    source: 'adapter',
                    format: 'JPG',
                    thumbnailUrl: displayUrl,
                    score: 60 - index,
                }];
            }
            return [];
        });

        return dedupeBy(items, (item) => item.url.replace(/[?#].*$/, ''));
    }

    const durationLabel = formatDurationLabel(media.video_duration);
    const videoUrl = normalizeUrl(media.video_url || '', context.pageUrl);
    if (media.is_video && videoUrl) {
        return [{
            id: 'instagram-video',
            kind: 'video' as const,
            url: videoUrl,
            label: title,
            source: 'adapter' as const,
            format: 'MP4',
            thumbnailUrl,
            durationLabel,
            score: 100,
        }];
    }

    const imageUrl = normalizeUrl(media.display_url || '', context.pageUrl);
    if (imageUrl) {
        return [{
            id: 'instagram-image',
            kind: 'image' as const,
            url: imageUrl,
            label: title,
            source: 'adapter' as const,
            format: 'JPG',
            thumbnailUrl: imageUrl,
            score: 70,
        }];
    }

    return [];
};

const collectCandidateUrls = (context: AdapterContext) => {
    const urls = new Set<string>();
    const matcher = /(cdninstagram|fbcdn|instagram\.com\/.*\.(?:mp4|jpg|jpeg|png|webp))/i;

    for (const entry of context.performanceEntries) {
        const url = normalizeUrl(entry.name, context.pageUrl);
        if (url && matcher.test(url)) urls.add(url);
    }

    visitObject(context.genericScan(), (node) => {
        if (Array.isArray(node)) return;
        const record = node as Record<string, unknown>;
        for (const value of Object.values(record)) {
            if (typeof value !== 'string') continue;
            const url = normalizeUrl(value, context.pageUrl);
            if (url && matcher.test(url)) urls.add(url);
        }
    });

    return [...urls];
};

export const instagramAdapter: PlatformAdapter = {
    id: 'instagram',
    label: 'Instagram adapter',
    matches(url) {
        return INSTAGRAM_HOST_RE.test(url.hostname);
    },
    scan(context): AdapterResult {
        const pathInfo = getPathInfo(context.pageUrl);
        const pageText = context.document.body?.textContent || '';
        const needsLogin = /log in|sign in|登录|private account/i.test(pageText);
        const blockedByPlatform = /not available|content unavailable|expired/i.test(pageText);

        if (pathInfo.isStory) {
            const storyMedia = collectStoryMediaFromPage(context);
            return {
                platform: 'instagram',
                pageUrl: context.pageUrl,
                pageTitle: context.pageTitle,
                hostname: context.hostname,
                status: storyMedia.length ? 'ok' : needsLogin ? 'needsLogin' : blockedByPlatform ? 'unsupportedContent' : 'needsPlayback',
                media: storyMedia,
                warnings: storyMedia.length
                    ? ['Instagram stories can expire or require page cookies. If download fails, reopen the story and try again.']
                    : [
                        needsLogin
                            ? 'Log in on Instagram in this tab, then reopen the story and scan again.'
                            : 'Instagram stories are not stable for direct extraction yet. Open the story first, then scan again if media appears.',
                    ],
            };
        }

        const shortcodeMedia = unwrapShortcodeMedia(findShortcodeMediaFromScripts(context.document));
        const jsonLdMedia = getJsonLdMedia(context.document, context.pageUrl);
        const adapterMedia = shortcodeMedia ? mediaItemsFromShortcode(context, shortcodeMedia) : [];

        const media = adapterMedia.length
            ? adapterMedia
            : jsonLdMedia?.url
                ? [{
                    id: `instagram-jsonld-${jsonLdMedia.type}`,
                    kind: jsonLdMedia.type,
                    url: jsonLdMedia.url,
                    label: getMetaContent(context.document, 'meta[property="og:title"]') || context.pageTitle,
                    source: 'adapter',
                    format: jsonLdMedia.type === 'video' ? 'MP4' : 'JPG',
                    thumbnailUrl: jsonLdMedia.thumbnailUrl,
                    durationLabel: jsonLdMedia.durationLabel,
                    score: 65,
                } satisfies DetectedMedia]
                : collectCandidateUrls(context)
                    .slice(0, 8)
                    .map((url, index) => ({
                        id: `instagram-fallback-${index + 1}`,
                        kind: /\.mp4(?:[?#]|$)/i.test(url) ? 'video' : 'image',
                        url,
                        label: getMetaContent(context.document, 'meta[property="og:title"]') || context.pageTitle,
                        source: 'fallback',
                        format: /\.mp4(?:[?#]|$)/i.test(url) ? 'MP4' : 'JPG',
                        thumbnailUrl: getPreferredThumbnail(context.document, context.pageUrl),
                        score: 35 - index,
                    } satisfies DetectedMedia));

        if (media.length > 0) {
            const warnings: string[] = [];
            if (!adapterMedia.length) {
                warnings.push('Instagram returned fallback page media instead of structured post data, so some results may be less reliable.');
            }
            if (pathInfo.isReel) {
                warnings.push('Instagram reels often work best after the reel is fully opened in the current tab.');
            }
            return {
                platform: 'instagram',
                pageUrl: context.pageUrl,
                pageTitle: getMetaContent(context.document, 'meta[property="og:title"]') || context.pageTitle,
                hostname: context.hostname,
                status: 'ok',
                media,
                warnings: warnings.length ? warnings : undefined,
            };
        }

        return {
            platform: 'instagram',
            pageUrl: context.pageUrl,
            pageTitle: getMetaContent(context.document, 'meta[property="og:title"]') || context.pageTitle,
            hostname: context.hostname,
            status: needsLogin ? 'needsLogin' : blockedByPlatform ? 'blockedByPlatform' : 'fallbackOnly',
            media: context.genericScan().slice(0, 6),
            warnings: [
                needsLogin
                    ? 'Log in on Instagram in this tab, then scan again.'
                    : blockedByPlatform
                        ? 'This Instagram page may be private, expired, or blocked from direct access.'
                        : 'Structured Instagram post data was not found on this page, so fallback candidates are shown instead.',
            ],
        };
    },
};
