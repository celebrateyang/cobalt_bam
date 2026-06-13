import type { AdapterContext, AdapterResult, DetectedMedia, PlatformAdapter } from './types';
import {
    dedupeBy,
    formatDurationLabel,
    getMetaContent,
    getPreferredThumbnail,
    readJsonScriptById,
    visitObject,
} from './utils';
import { normalizeUrl } from '../shared/url';

const TIKTOK_HOST_RE = /(^|\.)tiktok\.com$/i;
const TIKTOK_CDN_RE = /(tiktokcdn|byteoversea|muscdn|akamaized\.net|\/video\/tos\/|playwm|download)/i;

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
    videoCandidates: Array<{ url: string; source: string }>;
    imageCandidates: string[];
    audioCandidates: string[];
    isPhotoPost: boolean;
    usedEmbedFallback: boolean;
    needsLogin?: boolean;
    blockedByPlatform?: boolean;
};

const collectUrlCandidates = (rawValue: unknown, pageUrl: string) => {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    return values
        .flatMap((value) => {
            if (Array.isArray(value)) return value;
            return [value];
        })
        .map((value) => (typeof value === 'string' ? normalizeUrl(value, pageUrl) : null))
        .filter((url): url is string => Boolean(url));
};

const classifyCandidateKind = (url: string) => {
    const lower = url.toLowerCase();
    if (lower.includes('/download/')) return 'download';
    if (lower.includes('playwm')) return 'playwm';
    if (lower.includes('/video/tos/') || lower.includes('tiktokcdn') || lower.includes('byteoversea')) return 'direct';
    if (lower.includes('/aweme/v1/play') || lower.includes('play_addr')) return 'api-play';
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
    return score;
};

const qualityLabelFromUrl = (url: string) => {
    const decoded = decodeURIComponent(url);
    const ratio = decoded.match(/[?&](?:ratio|quality|video_quality)=([^&]+)/i)?.[1];
    if (ratio) return ratio.toUpperCase();
    const height = decoded.match(/(?:^|[^0-9])(2160|1440|1080|720|540|480)p(?:[^0-9]|$)/i)?.[1];
    return height ? `${height}p` : undefined;
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

const parseTikTokProbe = (context: AdapterContext): TikTokProbe => {
    const itemStruct = getUniversalItemStruct(context.document);
    const embedData = getEmbedVideoData(context.document, context.pageUrl);

    const videoCandidates: Array<{ url: string; source: string }> = [];
    const imageCandidates = new Set<string>();
    const audioCandidates = new Set<string>();
    const titles: string[] = [];
    const durations: string[] = [];

    const pushCandidate = (raw: unknown, source: string, preferredCodec = true) => {
        for (const url of collectUrlCandidates(raw, context.pageUrl)) {
            if (!TIKTOK_CDN_RE.test(url) && !/\/aweme\/v1\/play/i.test(url)) continue;
            videoCandidates.push({ url, source: `${source}:${preferredCodec ? 'preferred' : 'fallback'}` });
        }
    };

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

    const performanceCandidates = context.performanceEntries
        .map((entry) => normalizeUrl(entry.name, context.pageUrl))
        .filter((url): url is string => Boolean(url))
        .filter((url) => TIKTOK_CDN_RE.test(url) || /\/aweme\/v1\/play/i.test(url));
    for (const url of performanceCandidates) videoCandidates.push({ url, source: 'performance' });

    const currentVideoSources = [...context.document.querySelectorAll<HTMLVideoElement>('video')]
        .map((video) => normalizeUrl(video.currentSrc || video.src, context.pageUrl))
        .filter((url): url is string => Boolean(url));
    for (const url of currentVideoSources) videoCandidates.push({ url, source: 'video.currentSrc' });

    const genericVideoSources = context.genericScan()
        .filter((item) => item.kind === 'video' || item.kind === 'audio')
        .map((item) => ({ url: item.url, source: `generic.${item.kind}` }));
    for (const candidate of genericVideoSources) {
        if (TIKTOK_CDN_RE.test(candidate.url) || /\/aweme\/v1\/play/i.test(candidate.url)) {
            videoCandidates.push(candidate);
        }
    }

    const pageText = context.document.body?.textContent || '';
    const needsLogin = /log in|sign in|login to tiktok|登录/i.test(pageText);
    const blockedByPlatform = /post unavailable|content unavailable|private account|classified/i.test(pageText);

    const bestThumbnail =
        getMetaContent(context.document, 'meta[property="og:image"]') ||
        getPreferredThumbnail(context.document, context.pageUrl);

    return {
        title: titles.find(Boolean) || getMetaContent(context.document, 'meta[property="og:title"]') || context.pageTitle,
        thumbnailUrl: bestThumbnail ? normalizeUrl(bestThumbnail, context.pageUrl) ?? undefined : undefined,
        durationLabel: durations.find(Boolean),
        videoCandidates: dedupeBy(videoCandidates, (candidate) => candidate.url.replace(/[?#].*$/, '')),
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

        const videoMedia = dedupeBy(
            probe.videoCandidates
                .sort((left, right) => candidateScore(right.url, right.source) - candidateScore(left.url, left.source))
                .slice(0, 3)
                .map((candidate, index) => ({
                    id: `tiktok-video-${index + 1}`,
                    kind: 'video' as const,
                    url: candidate.url,
                    label: `${title}${probe.videoCandidates.length > 1 ? ` (${index + 1})` : ''}`,
                    source: 'adapter' as const,
                    format: 'MP4',
                    qualityLabel: qualityLabelFromUrl(candidate.url),
                    thumbnailUrl: probe.thumbnailUrl,
                    durationLabel: probe.durationLabel,
                    score: candidateScore(candidate.url, candidate.source),
                })),
            (item) => item.url.replace(/[?#].*$/, ''),
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
