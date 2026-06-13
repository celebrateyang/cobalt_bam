import type { AdapterContext, AdapterResult, DetectedMedia, PlatformAdapter } from './types';
import {
    collectUrlsFromObject,
    dedupeBy,
    formatDurationLabel,
    getMetaContent,
    getPreferredThumbnail,
    readAssignedJsonFromScripts,
    visitObject,
} from './utils';
import { normalizeUrl } from '../shared/url';

const DOUYIN_HOST_RE = /(^|\.)douyin\.com$|(^|\.)iesdouyin\.com$/i;
const DOUYIN_CANDIDATE_RE = /(douyinvod\.com|bytevod|zjcdn\.com|\/aweme\/v1\/play(?:wm)?\/)/i;
const DOUYIN_DIRECT_RE = /(douyinvod\.com|bytevod)/i;

type DouyinProbe = {
    title?: string;
    thumbnailUrl?: string;
    durationLabel?: string;
    videoCandidates: string[];
    imageCandidates: string[];
};

const isDouyinCandidateUrl = (url: string) => DOUYIN_CANDIDATE_RE.test(url);
const isDirectVodUrl = (url: string) => DOUYIN_DIRECT_RE.test(url);

const classifyDouyinUrl = (url: string) => {
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        const path = parsed.pathname.toLowerCase();
        if (host.endsWith('douyinvod.com')) return 'douyinvod';
        if (host.includes('bytevod')) return 'bytevod';
        if (host.endsWith('zjcdn.com')) return 'zjcdn';
        if (path.includes('/aweme/v1/playwm')) return 'playwm';
        if (path.includes('/aweme/v1/play')) return 'aweme';
        return 'other';
    } catch {
        return 'other';
    }
};

const candidateScore = (url: string) => {
    const mediaClass = classifyDouyinUrl(url);
    let score = 0;
    switch (mediaClass) {
        case 'douyinvod':
            score += 140;
            break;
        case 'bytevod':
            score += 130;
            break;
        case 'zjcdn':
            score += 95;
            break;
        case 'aweme':
            score += 70;
            break;
        case 'playwm':
            score += 45;
            break;
        default:
            score += 35;
            break;
    }

    if (/(?:^|[^\d])(2160|1440|1080|720)p(?:[^\d]|$)/i.test(url)) score += 10;
    if (/playwm/i.test(url)) score -= 25;
    if (/[?&](?:ratio|quality|video_quality)=1080p/i.test(url)) score += 12;
    return score;
};

const qualityLabelFromUrl = (url: string) => {
    const decoded = decodeURIComponent(url);
    const ratio = decoded.match(/[?&](?:ratio|quality|video_quality)=([^&]+)/i)?.[1];
    if (ratio) return ratio.toUpperCase();
    const height = decoded.match(/(?:^|[^0-9])(2160|1440|1080|720|540|480)p(?:[^0-9]|$)/i)?.[1];
    return height ? `${height}p` : undefined;
};

const bestTitle = (context: AdapterContext, probe: DouyinProbe) =>
    probe.title ||
    getMetaContent(context.document, 'meta[property="og:title"]') ||
    context.pageTitle;

const parseDouyinPayload = (context: AdapterContext): DouyinProbe => {
    const routerData = readAssignedJsonFromScripts<unknown>(context.document, ['window._ROUTER_DATA =', 'window._ROUTER_DATA=']);
    const renderData = readAssignedJsonFromScripts<unknown>(
        context.document,
        ['window._RENDER_DATA =', 'window._RENDER_DATA='],
        { decodeUriComponent: true },
    );
    const payloads = [routerData, renderData].filter(Boolean);

    const titles: string[] = [];
    const thumbnails: string[] = [];
    const durations: string[] = [];
    const videoCandidates = new Set<string>();
    const imageCandidates = new Set<string>();

    for (const payload of payloads) {
        visitObject(payload, (node) => {
            if (Array.isArray(node)) return;
            const record = node as Record<string, unknown>;
            const title =
                typeof record.desc === 'string' ? record.desc.trim() :
                typeof record.description === 'string' ? record.description.trim() :
                typeof record.title === 'string' ? record.title.trim() :
                undefined;
            if (title) titles.push(title);

            const duration =
                record.duration ??
                record.video_duration ??
                (record.video && typeof record.video === 'object'
                    ? (record.video as Record<string, unknown>).duration
                    : undefined);
            const durationLabel = formatDurationLabel(duration);
            if (durationLabel) durations.push(durationLabel);

            const imageArrays = [
                record.images,
                record.image_list,
                record.images_list,
            ];

            for (const imageArray of imageArrays) {
                if (!Array.isArray(imageArray)) continue;
                for (const image of imageArray) {
                    if (!image || typeof image !== 'object') continue;
                    const imageRecord = image as Record<string, unknown>;
                    const urlList = [imageRecord.url_list, imageRecord.download_url_list];
                    for (const urls of urlList) {
                        if (!Array.isArray(urls)) continue;
                        for (const raw of urls) {
                            if (typeof raw !== 'string') continue;
                            const normalized = normalizeUrl(raw, context.pageUrl);
                            if (normalized) imageCandidates.add(normalized);
                        }
                    }
                }
            }
        });

        const payloadVideoUrls = collectUrlsFromObject(payload, context.pageUrl, isDouyinCandidateUrl);
        for (const url of payloadVideoUrls) videoCandidates.add(url);

        const payloadImageUrls = collectUrlsFromObject(payload, context.pageUrl, (url) =>
            /\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(url),
        );
        for (const url of payloadImageUrls) imageCandidates.add(url);
    }

    const bestThumbnail =
        [...videoCandidates].find((url) => isDirectVodUrl(url)) ||
        [...imageCandidates][0] ||
        getPreferredThumbnail(context.document, context.pageUrl);

    const normalizedThumbnail =
        bestThumbnail && !/\.(?:mp4|m3u8|m4s)(?:[?#]|$)/i.test(bestThumbnail)
            ? normalizeUrl(bestThumbnail, context.pageUrl) ?? undefined
            : getPreferredThumbnail(context.document, context.pageUrl);

    return {
        title: titles.find(Boolean),
        thumbnailUrl: normalizedThumbnail,
        durationLabel: durations.find(Boolean),
        videoCandidates: [...videoCandidates],
        imageCandidates: [...imageCandidates],
    };
};

const performanceCandidates = (context: AdapterContext) =>
    dedupeBy(
        context.performanceEntries
            .map((entry) => normalizeUrl(entry.name, context.pageUrl))
            .filter((url): url is string => Boolean(url))
            .filter((url) => isDouyinCandidateUrl(url) && !/webcast|avatar|cover|recommend|im\/fetch/i.test(url)),
        (url) => url.replace(/[?#].*$/, ''),
    );

const currentVideoCandidates = (context: AdapterContext) =>
    dedupeBy(
        [...context.document.querySelectorAll<HTMLVideoElement>('video')]
            .map((video) => normalizeUrl(video.currentSrc || video.src, context.pageUrl))
            .filter((url): url is string => Boolean(url)),
        (url) => url.replace(/[?#].*$/, ''),
    );

const buildVideoMedia = (context: AdapterContext, probe: DouyinProbe): DetectedMedia[] => {
    const ranked = dedupeBy(
        [
            ...probe.videoCandidates,
            ...performanceCandidates(context),
            ...currentVideoCandidates(context),
            ...context.genericScan().filter((item) => item.kind === 'video').map((item) => item.url),
        ],
        (url) => {
            try {
                const parsed = new URL(url);
                return `${parsed.hostname}${parsed.pathname}`;
            } catch {
                return url;
            }
        },
    )
        .filter((url) => !/webcast|avatar|cover|recommend|im\/fetch/i.test(url))
        .sort((left, right) => candidateScore(right) - candidateScore(left))
        .slice(0, 3);

    const title = bestTitle(context, probe);
    const thumbnailUrl = probe.thumbnailUrl || getPreferredThumbnail(context.document, context.pageUrl);

    return ranked.map((url, index) => ({
        id: `douyin-video-${index + 1}`,
        kind: 'video',
        url,
        label: `${title}${ranked.length > 1 ? ` (${index + 1})` : ''}`,
        source: 'adapter',
        format: 'MP4',
        qualityLabel: qualityLabelFromUrl(url),
        thumbnailUrl,
        durationLabel: probe.durationLabel,
        score: candidateScore(url),
    }));
};

const buildImageMedia = (context: AdapterContext, probe: DouyinProbe): DetectedMedia[] => {
    const title = bestTitle(context, probe);
    return dedupeBy(probe.imageCandidates, (url) => url.replace(/[?#].*$/, ''))
        .slice(0, 12)
        .map((url, index) => ({
            id: `douyin-image-${index + 1}`,
            kind: 'image',
            url,
            label: `${title} image ${index + 1}`,
            source: 'adapter',
            format: 'JPG',
            thumbnailUrl: url,
            score: 40 - index,
        }));
};

export const douyinAdapter: PlatformAdapter = {
    id: 'douyin',
    label: 'Douyin adapter',
    matches(url) {
        return DOUYIN_HOST_RE.test(url.hostname) || url.hostname === 'v.douyin.com';
    },
    scan(context): AdapterResult {
        const probe = parseDouyinPayload(context);
        const videoMedia = buildVideoMedia(context, probe);
        const imageMedia = buildImageMedia(context, probe);
        const media = [...videoMedia, ...(videoMedia.length ? [] : imageMedia)];

        if (media.length > 0) {
            const warnings: string[] = [];
            if (videoMedia.some((item) => /playwm|\/aweme\/v1\/play/i.test(item.url))) {
                warnings.push('Some Douyin candidates come from redirect play URLs and may be less stable than direct CDN links.');
            }
            if (!videoMedia.length && imageMedia.length) {
                warnings.push('This Douyin page looks like a note or slides post, so image results are shown instead of MP4 video.');
            }

            return {
                platform: 'douyin',
                pageUrl: context.pageUrl,
                pageTitle: bestTitle(context, probe),
                hostname: context.hostname,
                status: 'ok',
                media,
                warnings: warnings.length ? warnings : undefined,
            };
        }

        const genericMedia = context.genericScan();
        const hasVideoElement = context.document.querySelector('video') !== null;
        const pageText = context.document.body?.textContent || '';
        const needsLogin = /登录|登入|log in|sign in/i.test(pageText);

        return {
            platform: 'douyin',
            pageUrl: context.pageUrl,
            pageTitle: bestTitle(context, probe),
            hostname: context.hostname,
            status: needsLogin ? 'needsLogin' : hasVideoElement ? 'needsPlayback' : genericMedia.length ? 'fallbackOnly' : 'needsPlayback',
            media: genericMedia.filter((item) => item.kind !== 'image').slice(0, 6),
            warnings: [
                needsLogin
                    ? 'Log in on Douyin in this tab, then scan again.'
                    : 'Start playback for 1-2 seconds, then scan again to let the adapter pick up the active media request.',
            ],
        };
    },
};
