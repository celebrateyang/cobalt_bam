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
import { normalizeUrl } from './runtime';

const INSTAGRAM_HOST_RE = /(^|\.)instagram\.com$|(^|\.)ddinstagram\.com$/i;
const INSTAGRAM_VIDEO_RE = /\.(?:mp4|m4v)(?:[?#]|$)/i;
const INSTAGRAM_VIDEO_RESOURCE_RE = /\.(?:mp4|m4v)(?:[?#]|$)|\/v\/t\d+\.\d+-\d+\//i;

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

const getMetaVideoMedia = (context: AdapterContext): DetectedMedia[] => {
    const title = getMetaContent(context.document, 'meta[property="og:title"]') || context.pageTitle;
    const thumbnailUrl = getPreferredThumbnail(context.document, context.pageUrl);
    const candidates = dedupeBy(
        [
            getMetaContent(context.document, 'meta[property="og:video"]'),
            getMetaContent(context.document, 'meta[property="og:video:secure_url"]'),
            getMetaContent(context.document, 'meta[name="twitter:player:stream"]'),
        ]
            .map((value) => (value ? normalizeUrl(value, context.pageUrl) : null))
            .filter((url): url is string => Boolean(url)),
        (url) => url.replace(/[?#].*$/, ''),
    );

    return candidates.map((url, index) => ({
        id: `instagram-meta-video-${index + 1}`,
        kind: 'video' as const,
        url,
        label: title,
        source: 'adapter' as const,
        format: 'MP4',
        thumbnailUrl: context.instagramResourceItems?.find((item) => item.url === url)?.thumbnailUrl || thumbnailUrl,
        score: 88 - index,
        requiresPageContext: true,
    }));
};

const collectInlineVideoMedia = (context: AdapterContext): DetectedMedia[] => {
    const title = getMetaContent(context.document, 'meta[property="og:title"]') || context.pageTitle;
    const thumbnailUrl = getPreferredThumbnail(context.document, context.pageUrl);
    const videoUrls = dedupeBy(
        [
            ...[...context.document.querySelectorAll<HTMLVideoElement>('video')].map((video) => video.currentSrc || video.src),
            ...context.performanceEntries.map((entry) => entry.name),
        ]
            .map((value) => normalizeUrl(value, context.pageUrl))
            .filter((url): url is string => Boolean(url))
            .filter((url) => INSTAGRAM_VIDEO_RE.test(url) || /mime_type=video_/i.test(url)),
        (url) => url.replace(/[?#].*$/, ''),
    );

    return videoUrls.map((url, index) => ({
        id: `instagram-inline-video-${index + 1}`,
        kind: 'video' as const,
        url,
        label: title,
        source: index === 0 ? 'dom' as const : 'network' as const,
        format: 'MP4',
        thumbnailUrl: context.instagramResourceItems?.find((item) => item.url === url)?.thumbnailUrl || thumbnailUrl,
        score: 82 - index,
        requiresPageContext: true,
    }));
};

const collectResourceVideoMedia = (context: AdapterContext): DetectedMedia[] => {
    const title = getMetaContent(context.document, 'meta[property="og:title"]') || context.pageTitle;
    const resources = dedupeBy(
        dedupeBy(
            (context.instagramResourceItems ?? [])
                .filter((item) => INSTAGRAM_VIDEO_RESOURCE_RE.test(item.url))
                .filter((item) => Boolean(item.thumbnailUrl))
                .sort((left, right) => right.seenAt - left.seenAt),
            (item) => item.url,
        ),
        (item) => item.thumbnailUrl || item.url,
    );

    return resources.slice(0, 6).map((item, index) => ({
        id: `instagram-resource-video-${index + 1}`,
        kind: 'video' as const,
        url: item.url,
        label: `${title}${resources.length > 1 ? ` (${index + 1})` : ''}`,
        source: 'adapter' as const,
        format: 'MP4',
        thumbnailUrl: item.thumbnailUrl,
        score: 94 - index,
        requiresPageContext: true,
    }));
};

const collectDomVideoMedia = (context: AdapterContext): DetectedMedia[] => {
    const title = getMetaContent(context.document, 'meta[property="og:title"]') || context.pageTitle;
    const videos = dedupeBy(
        (context.instagramDomVideos ?? [])
            .filter((item) => item.url.startsWith('blob:') || INSTAGRAM_VIDEO_RESOURCE_RE.test(item.url) || INSTAGRAM_VIDEO_RE.test(item.url))
            .sort((left, right) => right.seenAt - left.seenAt),
        (item) => item.url,
    );

    return videos.map((item, index) => ({
        id: `instagram-dom-video-${index + 1}`,
        kind: 'video' as const,
        url: item.url,
        label: `${title}${videos.length > 1 ? ` (${index + 1})` : ''}`,
        source: 'dom' as const,
        format: 'MP4',
        thumbnailUrl: item.thumbnailUrl,
        thumbnailRect: item.thumbnailRect,
        durationLabel: item.durationLabel,
        score: 110 - index,
        requiresPageContext: true,
    }));
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
                    requiresPageContext: true,
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
            requiresPageContext: true,
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
        const domVideoMedia = collectDomVideoMedia(context);
        const adapterMedia = shortcodeMedia ? mediaItemsFromShortcode(context, shortcodeMedia) : [];
        const resourceVideoMedia = collectResourceVideoMedia(context);
        const metaVideoMedia = getMetaVideoMedia(context);
        const inlineVideoMedia = collectInlineVideoMedia(context);

        const media = domVideoMedia.length
            ? domVideoMedia
            : adapterMedia.length
            ? adapterMedia
            : metaVideoMedia.length
                ? metaVideoMedia
                : inlineVideoMedia.length
                    ? inlineVideoMedia
                    : resourceVideoMedia.length
                ? resourceVideoMedia
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
                    requiresPageContext: true,
                } satisfies DetectedMedia]
                : collectCandidateUrls(context)
                    .map((url, index) => ({
                        id: `instagram-fallback-${index + 1}`,
                        kind: /\.mp4(?:[?#]|$)/i.test(url) ? 'video' : 'image',
                        url,
                        label: getMetaContent(context.document, 'meta[property="og:title"]') || context.pageTitle,
                        source: 'fallback',
                        format: /\.mp4(?:[?#]|$)/i.test(url) ? 'MP4' : 'JPG',
                        thumbnailUrl: /\.mp4(?:[?#]|$)/i.test(url)
                            ? context.instagramResourceItems?.find((item) => item.url === url)?.thumbnailUrl
                            : url,
                        score: 35 - index,
                    } satisfies DetectedMedia))
                    .filter((item) => item.kind !== 'video' || Boolean(item.thumbnailUrl));

        if (media.length > 0) {
            return {
                platform: 'instagram',
                pageUrl: context.pageUrl,
                pageTitle: getMetaContent(context.document, 'meta[property="og:title"]') || context.pageTitle,
                hostname: context.hostname,
                status: 'ok',
                media,
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
