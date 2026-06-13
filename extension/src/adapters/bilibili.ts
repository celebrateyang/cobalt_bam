import type { AdapterContext, AdapterResult, DetectedMedia, PlatformAdapter } from './types';
import {
    dedupeBy,
    formatDurationLabel,
    getMetaContent,
    getPreferredThumbnail,
    readAssignedJsonFromScripts,
} from './utils';
import { normalizeUrl } from '../shared/url';

const BILIBILI_HOST_RE = /(^|\.)bilibili\.com$|(^|\.)bilibili\.tv$|(^|\.)b23\.tv$/i;

type BilibiliPlayInfo = {
    data?: {
        dash?: {
            duration?: number;
            video?: Array<Record<string, unknown>>;
            audio?: Array<Record<string, unknown>>;
        };
        timelength?: number;
        accept_quality?: number[];
    };
    dash?: {
        duration?: number;
        video?: Array<Record<string, unknown>>;
        audio?: Array<Record<string, unknown>>;
    };
    timelength?: number;
};

type BilibiliState = {
    videoData?: {
        title?: string;
        pic?: string;
        pages?: Array<{ page?: number; part?: string }>;
    };
    p?: number;
};

const getDash = (playInfo: BilibiliPlayInfo) => playInfo?.data?.dash ?? playInfo?.dash;
const getTimelength = (playInfo: BilibiliPlayInfo) => playInfo?.data?.timelength ?? playInfo?.timelength ?? getDash(playInfo)?.duration;

const playInfoFromPage = (document: Document) =>
    readAssignedJsonFromScripts<BilibiliPlayInfo>(document, ['window.__playinfo__=', '__playinfo__=']);

const initialStateFromPage = (document: Document) =>
    readAssignedJsonFromScripts<BilibiliState>(document, ['window.__INITIAL_STATE__=', '__INITIAL_STATE__=']);

const qualityLabelForStream = (stream: Record<string, unknown>) => {
    const height = typeof stream.height === 'number' ? stream.height : undefined;
    const width = typeof stream.width === 'number' ? stream.width : undefined;
    if (height) return `${height}p`;
    if (width) return `${width}w`;
    return undefined;
};

const codecPreference = (codecs: unknown) => {
    const value = typeof codecs === 'string' ? codecs.toLowerCase() : '';
    if (value.includes('avc')) return 20;
    if (value.includes('hev') || value.includes('h265')) return 16;
    if (value.includes('av1')) return 14;
    return 0;
};

const buildStreamUrl = (stream: Record<string, unknown>, pageUrl: string) => {
    const raw = typeof stream.baseUrl === 'string'
        ? stream.baseUrl
        : typeof stream.base_url === 'string'
            ? stream.base_url
            : undefined;
    return raw ? normalizeUrl(raw, pageUrl) : null;
};

const buildVideoItems = (
    context: AdapterContext,
    playInfo: BilibiliPlayInfo,
    state: BilibiliState | null,
    thumbnailUrl: string | undefined,
    durationLabel: string | undefined,
) => {
    const dash = getDash(playInfo);
    const title = state?.videoData?.title || context.pageTitle;
    const streams = Array.isArray(dash?.video) ? dash.video : [];

    const items = streams
        .flatMap((stream, index): DetectedMedia[] => {
            const url = buildStreamUrl(stream, context.pageUrl);
            if (!url) return [];
            const qualityLabel = qualityLabelForStream(stream);
            return [{
                id: `bilibili-video-${index + 1}`,
                kind: 'video',
                url,
                label: qualityLabel ? `Video stream ${qualityLabel}` : 'Video stream',
                source: 'adapter',
                format: 'M4S',
                qualityLabel,
                thumbnailUrl,
                durationLabel,
                score:
                    100 +
                    (typeof stream.bandwidth === 'number' ? Math.round(stream.bandwidth / 100000) : 0) +
                    codecPreference(stream.codecs),
                filename: `${title}${qualityLabel ? `-${qualityLabel}` : ''}.mp4`,
            }];
        });

    return dedupeBy(
        items.sort((left, right) => (right.score ?? 0) - (left.score ?? 0)),
        (item) => item.url.replace(/[?#].*$/, ''),
    ).slice(0, 4);
};

const buildAudioItems = (
    context: AdapterContext,
    playInfo: BilibiliPlayInfo,
    state: BilibiliState | null,
    thumbnailUrl: string | undefined,
    durationLabel: string | undefined,
) => {
    const dash = getDash(playInfo);
    const title = state?.videoData?.title || context.pageTitle;
    const streams = Array.isArray(dash?.audio) ? dash.audio : [];

    const items = streams
        .flatMap((stream, index): DetectedMedia[] => {
            const url = buildStreamUrl(stream, context.pageUrl);
            if (!url) return [];
            const bandwidth = typeof stream.bandwidth === 'number' ? stream.bandwidth : undefined;
            return [{
                id: `bilibili-audio-${index + 1}`,
                kind: 'audio',
                url,
                label: bandwidth ? `Audio stream ${Math.round(bandwidth / 1000)} kbps` : 'Audio stream',
                source: 'adapter',
                format: 'M4A',
                sizeLabel: bandwidth ? `${Math.round(bandwidth / 1000)} kbps` : undefined,
                thumbnailUrl,
                durationLabel,
                score: 70 + (bandwidth ? Math.round(bandwidth / 10000) : 0),
                filename: `${title}-audio.m4a`,
            }];
        });

    return dedupeBy(
        items.sort((left, right) => (right.score ?? 0) - (left.score ?? 0)),
        (item) => item.url.replace(/[?#].*$/, ''),
    ).slice(0, 2);
};

const networkFallbackItems = (context: AdapterContext, thumbnailUrl: string | undefined, durationLabel: string | undefined) => {
    const items = context.performanceEntries
        .flatMap((entry): DetectedMedia[] => {
            const url = normalizeUrl(entry.name, context.pageUrl);
            if (!url) return [];
            try {
                const parsed = new URL(url);
                const host = parsed.hostname.toLowerCase();
                const path = parsed.pathname.toLowerCase();
                if (
                    !(host.endsWith('bilivideo.com') || host.endsWith('akamaized.net') || host.startsWith('upos-')) ||
                    path.includes('/log') ||
                    path.includes('/collect')
                ) {
                    return [];
                }
                const isAudio = /\/audio\.m4s$/i.test(path);
                const qualityLabel = path.match(/(?:^|\/)(\d{3,4})p(?:\/|$)/i)?.[1];
                return [{
                    id: `bilibili-network-${url}`,
                    kind: isAudio ? 'audio' : 'video',
                    url,
                    label: isAudio ? 'Audio stream' : 'Video stream',
                    source: 'network',
                    format: isAudio ? 'M4A' : 'M4S',
                    qualityLabel: qualityLabel ? `${qualityLabel}p` : undefined,
                    thumbnailUrl,
                    durationLabel,
                    score: isAudio ? 55 : 65,
                }];
            } catch {
                return [];
            }
        });

    return dedupeBy(items, (item) => item.url.replace(/[?#].*$/, ''));
};

export const bilibiliAdapter: PlatformAdapter = {
    id: 'bilibili',
    label: 'Bilibili adapter',
    matches(url) {
        return BILIBILI_HOST_RE.test(url.hostname);
    },
    scan(context): AdapterResult {
        const playInfo = playInfoFromPage(context.document);
        const state = initialStateFromPage(context.document);
        const thumbnailUrl =
            normalizeUrl(state?.videoData?.pic || '', context.pageUrl) ||
            getPreferredThumbnail(context.document, context.pageUrl);
        const durationLabel = formatDurationLabel(getTimelength(playInfo || {}));

        const videoItems = playInfo
            ? buildVideoItems(context, playInfo, state, thumbnailUrl, durationLabel)
            : [];
        const audioItems = playInfo
            ? buildAudioItems(context, playInfo, state, thumbnailUrl, durationLabel)
            : [];
        const networkItems = networkFallbackItems(context, thumbnailUrl, durationLabel)
            .filter((item) => (item.kind === 'video' ? videoItems.length < 4 : audioItems.length < 2));

        const media = dedupeBy(
            [...videoItems, ...audioItems, ...networkItems],
            (item) => item.url.replace(/[?#].*$/, ''),
        );

        if (media.length > 0) {
            return {
                platform: 'bilibili',
                pageUrl: context.pageUrl,
                pageTitle: state?.videoData?.title || context.pageTitle,
                hostname: context.hostname,
                status: 'ok',
                media,
                warnings: [
                    'Bilibili usually exposes separate video and audio streams. Download both streams if you need the best quality.',
                ],
            };
        }

        return {
            platform: 'bilibili',
            pageUrl: context.pageUrl,
            pageTitle: state?.videoData?.title || context.pageTitle,
            hostname: context.hostname,
            status: 'fallbackOnly',
            media: context.genericScan().slice(0, 8),
            warnings: ['No structured Bilibili play info was found on this page, so generic scan results are shown instead.'],
        };
    },
};
