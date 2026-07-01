import type { AdapterContext, AdapterResult, DetectedMedia, PlatformAdapter } from './types';
import {
    dedupeBy,
    formatDurationLabel,
    getMetaContent,
    getPreferredThumbnail,
    readJsonScriptById,
    visitObject,
} from './utils';
import { normalizeUrl } from './runtime';

const TIKTOK_HOST_RE = /(^|\.)tiktok\.com$/i;
const TIKTOK_CDN_RE = /(tiktokcdn|tiktokv|byteoversea|ibytedtos|muscdn|akamaized\.net|\/video\/tos\/|playwm|download)/i;
const IMAGE_EXT_RE = /\.(?:jpe?g|png|webp|gif)(?:[?#]|$)/i;

type TikTokUniversalData = {
    __DEFAULT_SCOPE__?: {
        'webapp.video-detail'?: {
            statusCode?: number;
            statusMsg?: string;
            itemInfo?: {
                itemStruct?: Record<string, unknown>;
            };
        };
    };
};

type TikTokEmbedState = {
    source?: {
        data?: Record<string, unknown>;
    };
};

type TikTokProbe = {
    title?: string;
    thumbnailUrl?: string;
    durationLabel?: string;
    videoCandidates: TikTokVideoCandidate[];
    activeVideoUrl?: string;
    hasFeedStylePlayback: boolean;
    imageCandidates: string[];
    audioCandidates: string[];
    isPhotoPost: boolean;
    usedEmbedFallback: boolean;
    needsLogin?: boolean;
    blockedByPlatform?: boolean;
};

type TikTokVideoCandidate = {
    url: string;
    source: string;
    title?: string;
    author?: string;
    thumbnailUrl?: string;
    thumbnailRect?: { x: number; y: number; width: number; height: number };
    durationLabel?: string;
    seenAt?: number;
};

const isUsefulTikTokThumbnail = (url: string | undefined) => {
    if (!url) return false;
    if (/favicon|logo|icon|tiktok-?logo|app-icon|static\.tiktokstatic|website-login/i.test(url)) return false;
    if (/(?:^|\/)tos-[^/?]*-avt-|\/avatar\//i.test(url)) return false;
    return true;
};

const collectUrlCandidates = (rawValue: unknown, pageUrl: string): string[] => {
    if (typeof rawValue === 'string') {
        const normalized = normalizeUrl(rawValue, pageUrl);
        return normalized ? [normalized] : [];
    }

    if (Array.isArray(rawValue)) {
        return dedupeBy(
            rawValue.flatMap((value) => collectUrlCandidates(value, pageUrl)),
            (url) => url,
        );
    }

    if (rawValue && typeof rawValue === 'object') {
        const record = rawValue as Record<string, unknown>;
        if (Array.isArray(record.UrlList) || Array.isArray(record.urlList)) {
            return collectUrlCandidates(record.UrlList ?? record.urlList, pageUrl);
        }
    }

    return [];
};

const isLikelyTikTokVideoUrl = (url: string) => {
    const lower = url.toLowerCase();
    if (IMAGE_EXT_RE.test(lower)) return false;
    if (/(?:^|\/)tos-[^/?]*-avt-/i.test(lower) || /\/avatar\//i.test(lower)) return false;
    return (
        /\/aweme\/v1\/play\//i.test(lower) ||
        /(?:\?|&)is_play_url=1(?:&|$)/i.test(lower) ||
        /mime_type=video_/i.test(lower) ||
        /\/video\/tos\//i.test(lower) ||
        /\.mp4(?:[?#]|$)/i.test(lower) ||
        /(tiktokcdn|tiktokv|byteoversea|ibytedtos|muscdn|akamaized\.net)/i.test(lower) && /\/(?:obj|tos|video)\//i.test(lower)
    );
};

const classifyCandidateKind = (url: string) => {
    const lower = url.toLowerCase();
    if (/\/aweme\/v1\/play\//i.test(lower) || /(?:\?|&)is_play_url=1(?:&|$)/i.test(lower)) return 'api-play';
    if (lower.includes('/download/')) return 'download';
    if (lower.includes('playwm')) return 'playwm';
    if (lower.includes('/video/tos/') || lower.includes('tiktokcdn') || lower.includes('tiktokv') || lower.includes('byteoversea') || lower.includes('ibytedtos')) return 'direct';
    return 'other';
};

const candidateScore = (url: string, source: string, preferredCodec = true) => {
    let score = 0;
    switch (classifyCandidateKind(url)) {
        case 'api-play':
            score += 120;
            break;
        case 'direct':
            score += 112;
            break;
        case 'other':
            score += 72;
            break;
        case 'download':
            score += 50;
            break;
        case 'playwm':
            score += 35;
            break;
    }
    if (/watermark|playwm/i.test(url)) score -= 20;
    if (preferredCodec) score += 8;
    if (/h265|hevc/i.test(source)) score += 4;
    if (/(?:^|[^\d])(2160|1440|1080|720)p(?:[^\d]|$)/i.test(decodeURIComponent(url))) score += 10;
    if (/downloadaddr|embed/i.test(source)) score -= 3;
    if (/tiktok\.feed/i.test(source)) score += 45;
    if (/video\.currentsrc/i.test(source)) score += 28;
    if (/performance/i.test(source)) score += 12;
    if (/generic\./i.test(source)) score -= 8;
    return score;
};

const qualityLabelFromUrl = (url: string) => {
    const decoded = decodeURIComponent(url);
    const ratio = decoded.match(/[?&](?:ratio|quality|video_quality)=([^&]+)/i)?.[1];
    if (ratio) return ratio.toUpperCase();
    const height = decoded.match(/(?:^|[^0-9])(2160|1440|1080|720|540|480)p(?:[^0-9]|$)/i)?.[1];
    return height ? `${height}p` : undefined;
};

const videoCandidateKey = (url: string) => {
    try {
        const parsed = new URL(url);
        const stableParams = [
            'vid',
            'item_id',
            'video_id',
            'mime_type',
            'ratio',
            'quality',
            'video_quality',
            'br',
        ]
            .map((name) => [name, parsed.searchParams.get(name)] as const)
            .filter(([, value]) => Boolean(value))
            .map(([name, value]) => `${name}=${value}`);
        return `${parsed.hostname}${parsed.pathname}${stableParams.length ? `?${stableParams.join('&')}` : ''}`;
    } catch {
        return url.replace(/[?#].*$/, '');
    }
};

const candidateBucketKey = (url: string) => {
    try {
        const parsed = new URL(url);
        const itemId = parsed.searchParams.get('item_id') || parsed.searchParams.get('video_id');
        if (itemId) return itemId;
        return videoCandidateKey(url);
    } catch {
        return videoCandidateKey(url);
    }
};

const getUniversalItemStruct = (document: Document) => {
    const data = readJsonScriptById<TikTokUniversalData>(document, '__UNIVERSAL_DATA_FOR_REHYDRATION__');
    return data?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
};

const getEmbedVideoData = (document: Document, pageUrl: string) => {
    const postId = pageUrl.match(/\/(?:video|photo)\/(\d{8,})/i)?.[1];
    if (!postId) return null;
    const state = readJsonScriptById<TikTokEmbedState>(document, '__FRONTITY_CONNECT_STATE__');
    return state?.source?.data?.[`/embed/v2/${postId}`] as Record<string, unknown> | undefined;
};

const getVisibleArea = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
    const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    return width * height;
};

const getTikTokDomVideos = (document: Document, pageUrl: string) => {
    const candidates = [...document.querySelectorAll<HTMLVideoElement>('video')]
        .map((video) => {
            const url = normalizeUrl(video.currentSrc || video.src, pageUrl);
            if (!url || !isLikelyTikTokVideoUrl(url)) return null;
            const visibleArea = getVisibleArea(video);
            const score =
                visibleArea +
                ((video.paused ? 0 : 1) * 100_000) +
                ((video.currentTime > 0 ? 1 : 0) * 25_000) +
                ((video.readyState >= 2 ? 1 : 0) * 10_000);
            return {
                url,
                poster: normalizeUrl(video.poster || '', pageUrl) || undefined,
                thumbnailRect: {
                    x: Math.max(0, video.getBoundingClientRect().left),
                    y: Math.max(0, video.getBoundingClientRect().top),
                    width: Math.max(0, Math.min(video.getBoundingClientRect().right, window.innerWidth) - Math.max(0, video.getBoundingClientRect().left)),
                    height: Math.max(0, Math.min(video.getBoundingClientRect().bottom, window.innerHeight) - Math.max(0, video.getBoundingClientRect().top)),
                },
                score,
                visibleArea,
                paused: video.paused,
                currentTime: video.currentTime,
            };
        })
        .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
        .sort((left, right) => right.score - left.score);

    return candidates;
};

const parseTikTokProbe = (context: AdapterContext): TikTokProbe => {
    const itemStruct = getUniversalItemStruct(context.document);
    const embedData = getEmbedVideoData(context.document, context.pageUrl);
    const domVideos = getTikTokDomVideos(context.document, context.pageUrl);
    const activeVideo = domVideos[0];

    const videoCandidates: TikTokVideoCandidate[] = [];
    const imageCandidates = new Set<string>();
    const audioCandidates = new Set<string>();
    const titles: string[] = [];
    const durations: string[] = [];

    const pushCandidate = (raw: unknown, source: string, preferredCodec = true, thumbnailUrl?: string, seenAt?: number) => {
        for (const url of collectUrlCandidates(raw, context.pageUrl)) {
            if (!isLikelyTikTokVideoUrl(url)) continue;
            videoCandidates.push({
                url,
                source: `${source}:${preferredCodec ? 'preferred' : 'fallback'}`,
                thumbnailUrl,
                seenAt,
            });
        }
    };

    for (const item of context.tiktokFeedItems ?? []) {
        if (!isLikelyTikTokVideoUrl(item.url)) continue;
        videoCandidates.push({
            url: item.url,
            source: item.paused ? 'tiktok.feed.cached' : 'tiktok.feed.playing',
            title: item.title,
            author: item.author,
            thumbnailUrl: item.thumbnailUrl,
            thumbnailRect: item.thumbnailRect,
            durationLabel: item.durationLabel,
            seenAt: item.seenAt,
        });
        if (item.title) titles.push(item.title);
    }

    if (itemStruct) {
        const detail = itemStruct as Record<string, unknown>;
        const title = typeof detail.desc === 'string' ? detail.desc.trim() : undefined;
        if (title) titles.push(title);
        const durationLabel = formatDurationLabel(
            (detail.video as Record<string, unknown> | undefined)?.duration ??
            (detail.music as Record<string, unknown> | undefined)?.duration,
        );
        if (durationLabel) durations.push(durationLabel);

        const video = detail.video as Record<string, unknown> | undefined;
        const bitrateInfo = Array.isArray(video?.bitrateInfo) ? video?.bitrateInfo as Array<Record<string, unknown>> : [];
        for (const bitrate of bitrateInfo) {
            const codecType = String(bitrate?.CodecType || '').toLowerCase();
            const preferredCodec = !codecType.includes('h265');
            pushCandidate((bitrate?.PlayAddr as Record<string, unknown> | undefined)?.UrlList, `legacy.bitrate.${codecType || 'unknown'}`, preferredCodec);
        }

        pushCandidate((video?.PlayAddrStruct as Record<string, unknown> | undefined)?.UrlList, 'legacy.playAddrStruct');
        pushCandidate(video?.playAddr, 'legacy.playAddr');
        pushCandidate(video?.downloadAddr, 'legacy.downloadAddr');

        const images = (detail.imagePost as Record<string, unknown> | undefined)?.images;
        if (Array.isArray(images)) {
            for (const image of images) {
                if (!image || typeof image !== 'object') continue;
                const record = image as Record<string, unknown>;
                const urlLists = [
                    (record.imageURL as Record<string, unknown> | undefined)?.urlList,
                    (record.displayImage as Record<string, unknown> | undefined)?.urlList,
                    (record.image as Record<string, unknown> | undefined)?.urlList,
                    record.urlList,
                ];
                for (const urlList of urlLists) {
                    for (const url of collectUrlCandidates(urlList, context.pageUrl)) imageCandidates.add(url);
                }
            }
        }

        const musicUrl = (detail.music as Record<string, unknown> | undefined)?.playUrl;
        for (const url of collectUrlCandidates(musicUrl, context.pageUrl)) audioCandidates.add(url);
    }

    if (embedData) {
        const videoData = (embedData.videoData as Record<string, unknown> | undefined) || embedData;
        const itemInfos = videoData?.itemInfos as Record<string, unknown> | undefined;
        const musicInfos = videoData?.musicInfos as Record<string, unknown> | undefined;

        const title = typeof itemInfos?.text === 'string' ? itemInfos.text.trim() : undefined;
        if (title) titles.push(title);
        const embedVideoMeta = (itemInfos?.video as Record<string, unknown> | undefined)?.videoMeta as Record<string, unknown> | undefined;
        const durationLabel = formatDurationLabel(embedVideoMeta?.duration);
        if (durationLabel) durations.push(durationLabel);

        const embedVideo = itemInfos?.video as Record<string, unknown> | undefined;
        pushCandidate(embedVideo?.urls, 'embed.video.urls');
        pushCandidate(embedVideo?.playAddr, 'embed.video.playAddr');
        pushCandidate(embedVideo?.playUrl, 'embed.video.playUrl');
        pushCandidate(embedVideo?.downloadAddr, 'embed.video.downloadAddr', false);

        const imagePostInfo = itemInfos?.imagePostInfo as Record<string, unknown> | undefined;
        const images = Array.isArray(imagePostInfo?.images) ? imagePostInfo?.images : [];
        for (const image of images) {
            if (!image || typeof image !== 'object') continue;
            const record = image as Record<string, unknown>;
            const urlLists = [
                (record.imageURL as Record<string, unknown> | undefined)?.urlList,
                (record.displayImage as Record<string, unknown> | undefined)?.urlList,
                (record.image as Record<string, unknown> | undefined)?.urlList,
                record.urlList,
            ];
            for (const urlList of urlLists) {
                for (const url of collectUrlCandidates(urlList, context.pageUrl)) imageCandidates.add(url);
            }
        }

        for (const url of collectUrlCandidates(musicInfos?.playUrl, context.pageUrl)) audioCandidates.add(url);
    }

    domVideos.forEach((video, index) => {
        videoCandidates.push({
            url: video.url,
            source: index === 0 ? 'video.currentSrc.active' : 'video.currentSrc',
            thumbnailUrl: isUsefulTikTokThumbnail(video.poster) ? video.poster : undefined,
            thumbnailRect: video.thumbnailRect,
            seenAt: Date.now() - index,
        });
    });

    const performanceCandidates = context.performanceEntries
        .filter((entry) => isLikelyTikTokVideoUrl(entry.name))
        .sort((left, right) => right.startTime - left.startTime)
        .map((entry) => ({
            url: normalizeUrl(entry.name, context.pageUrl),
            seenAt: entry.startTime,
        }))
        .filter((entry): entry is { url: string; seenAt: number } => Boolean(entry.url));
    for (const entry of performanceCandidates) {
        videoCandidates.push({
            url: entry.url,
            source: 'performance',
            seenAt: entry.seenAt,
        });
    }

    for (const item of context.tiktokResourceItems ?? []) {
        if (!isLikelyTikTokVideoUrl(item.url)) continue;
        videoCandidates.push({
            url: item.url,
            source: 'tiktok.resource',
            thumbnailUrl: isUsefulTikTokThumbnail(item.thumbnailUrl) ? item.thumbnailUrl : undefined,
            seenAt: item.seenAt,
        });
    }

    const genericVideoSources = context.genericScan()
        .filter((item) => item.kind === 'video' || item.kind === 'audio')
        .map((item) => ({ url: item.url, source: `generic.${item.kind}` }));
    for (const candidate of genericVideoSources) {
        if (isLikelyTikTokVideoUrl(candidate.url)) {
            videoCandidates.push(candidate);
        }
    }

    const pageText = context.document.body?.textContent || '';
    const needsLogin = /log in|sign in|login to tiktok|登录/i.test(pageText);
    const blockedByPlatform = /post unavailable|content unavailable|private account|classified/i.test(pageText);

    const rawBestThumbnail =
        getMetaContent(context.document, 'meta[property="og:image"]') ||
        activeVideo?.poster ||
        getPreferredThumbnail(context.document, context.pageUrl);
    const bestThumbnail = normalizeUrl(rawBestThumbnail || '', context.pageUrl) ?? undefined;

    return {
        title: titles.find(Boolean) || getMetaContent(context.document, 'meta[property="og:title"]') || context.pageTitle,
        thumbnailUrl: isUsefulTikTokThumbnail(bestThumbnail) ? bestThumbnail : undefined,
        durationLabel: durations.find(Boolean),
        videoCandidates: (() => {
            const byBucket = new Map<string, TikTokVideoCandidate>();
            for (const candidate of videoCandidates) {
                if (/website-login|static\.tiktokstatic|\/login\//i.test(candidate.url)) continue;
                const key = candidateBucketKey(candidate.url);
                const existing = byBucket.get(key);
                if (!existing) {
                    byBucket.set(key, candidate);
                    continue;
                }
                const existingScore = candidateScore(existing.url, existing.source);
                const nextScore = candidateScore(candidate.url, candidate.source);
                const existingSeenAt = existing.seenAt ?? -1;
                const nextSeenAt = candidate.seenAt ?? -1;
                if (nextScore > existingScore || (nextScore === existingScore && nextSeenAt > existingSeenAt)) {
                    byBucket.set(key, {
                        ...candidate,
                        title: candidate.title || existing.title,
                        author: candidate.author || existing.author,
                        thumbnailUrl: candidate.thumbnailUrl || existing.thumbnailUrl,
                        thumbnailRect: candidate.thumbnailRect || existing.thumbnailRect,
                        durationLabel: candidate.durationLabel || existing.durationLabel,
                    });
                } else if (
                    (!existing.thumbnailUrl && candidate.thumbnailUrl) ||
                    (!existing.thumbnailRect && candidate.thumbnailRect) ||
                    (!existing.title && candidate.title) ||
                    (!existing.author && candidate.author) ||
                    (!existing.durationLabel && candidate.durationLabel)
                ) {
                    byBucket.set(key, {
                        ...existing,
                        title: existing.title || candidate.title,
                        author: existing.author || candidate.author,
                        thumbnailUrl: existing.thumbnailUrl || candidate.thumbnailUrl,
                        thumbnailRect: existing.thumbnailRect || candidate.thumbnailRect,
                        durationLabel: existing.durationLabel || candidate.durationLabel,
                    });
                }
            }

            return [...byBucket.values()]
                .sort((left, right) => {
                    const seenDelta = (right.seenAt ?? -1) - (left.seenAt ?? -1);
                    if (seenDelta !== 0) return seenDelta;
                    return candidateScore(right.url, right.source) - candidateScore(left.url, left.source);
                });
        })(),
        activeVideoUrl: activeVideo?.url,
        hasFeedStylePlayback: !/\/(?:video|photo)\//i.test(context.pageUrl) && Boolean(activeVideo?.url),
        imageCandidates: [...imageCandidates],
        audioCandidates: [...audioCandidates],
        isPhotoPost: imageCandidates.size > 0 && videoCandidates.length === 0,
        usedEmbedFallback: !itemStruct && Boolean(embedData),
        needsLogin,
        blockedByPlatform,
    };
};

export const tiktokAdapter: PlatformAdapter = {
    id: 'tiktok',
    label: 'TikTok adapter',
    matches(url) {
        return TIKTOK_HOST_RE.test(url.hostname) || url.hostname === 'vt.tiktok.com';
    },
    scan(context): AdapterResult {
        const probe = parseTikTokProbe(context);
        const title = probe.title || context.pageTitle;
        const preferredCandidates = probe.videoCandidates;

        const videoMedia = dedupeBy(
            preferredCandidates
                .sort((left, right) => {
                    const seenDelta = (right.seenAt ?? -1) - (left.seenAt ?? -1);
                    if (seenDelta !== 0) return seenDelta;
                    return candidateScore(right.url, right.source) - candidateScore(left.url, left.source);
                })
                .map((candidate, index) => ({
                    id: `tiktok-video-${index + 1}`,
                    kind: 'video' as const,
                    url: candidate.url,
                    label: `${candidate.title || candidate.author || title}${preferredCandidates.length > 1 ? ` (${index + 1})` : ''}`,
                    source: 'adapter' as const,
                    format: 'MP4',
                    qualityLabel: qualityLabelFromUrl(candidate.url),
                    thumbnailUrl: isUsefulTikTokThumbnail(candidate.thumbnailUrl) ? candidate.thumbnailUrl : undefined,
                    thumbnailRect: candidate.thumbnailRect,
                    durationLabel: candidate.durationLabel || probe.durationLabel,
                    score: candidateScore(candidate.url, candidate.source),
                    requiresPageContext: true,
                })),
            (item) => videoCandidateKey(item.url),
        );

        const imageMedia = dedupeBy(
            probe.imageCandidates.map((url, index) => ({
                id: `tiktok-image-${index + 1}`,
                kind: 'image' as const,
                url,
                label: `${title} image ${index + 1}`,
                source: 'adapter' as const,
                format: 'JPG',
                thumbnailUrl: url,
                score: 50 - index,
            })),
            (item) => item.url.replace(/[?#].*$/, ''),
        ).slice(0, 12);

        const audioMedia = dedupeBy(
            probe.audioCandidates.map((url, index) => ({
                id: `tiktok-audio-${index + 1}`,
                kind: 'audio' as const,
                url,
                label: `${title} original audio`,
                source: 'adapter' as const,
                format: /mime_type=audio_mpeg/i.test(url) ? 'MP3' : 'M4A',
                durationLabel: probe.durationLabel,
                score: 40 - index,
            })),
            (item) => item.url.replace(/[?#].*$/, ''),
        ).slice(0, 1);

        const media = probe.isPhotoPost
            ? [...imageMedia, ...audioMedia]
            : [...videoMedia, ...(!videoMedia.length ? audioMedia : [])];

        if (media.length > 0) {
            const warnings: string[] = [];
            if (probe.usedEmbedFallback) {
                warnings.push('TikTok used an embed-style fallback on this page, so the top candidate may be less stable than direct page data.');
            }
            if (videoMedia.some((item) => /playwm|watermark/i.test(item.url))) {
                warnings.push('Some TikTok candidates may include watermark or redirect behavior. The first result is ranked as the best available option.');
            }
            if (probe.isPhotoPost && audioMedia.length) {
                warnings.push('This TikTok post looks like a photo slideshow, so images and original audio are shown together.');
            }

            return {
                platform: 'tiktok',
                pageUrl: context.pageUrl,
                pageTitle: title,
                hostname: context.hostname,
                status: 'ok',
                media,
                warnings: warnings.length ? warnings : undefined,
            };
        }

        return {
            platform: 'tiktok',
            pageUrl: context.pageUrl,
            pageTitle: title,
            hostname: context.hostname,
            status: probe.needsLogin ? 'needsLogin' : probe.blockedByPlatform ? 'blockedByPlatform' : 'needsPlayback',
            media: context.genericScan().slice(0, 6),
            warnings: [
                probe.needsLogin
                    ? 'Log in on TikTok in this tab, then scan again.'
                    : probe.blockedByPlatform
                        ? 'This TikTok post may be private, unavailable, or blocked in your current region.'
                        : 'Play the TikTok post for 1-2 seconds, then scan again so the active media request is available.',
            ],
        };
    },
};
