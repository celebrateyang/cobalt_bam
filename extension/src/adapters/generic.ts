import type {
    AdapterContext,
    AdapterResult,
    DetectedMedia,
    MediaKind,
    PlatformAdapter,
} from './types';
import { normalizeUrl } from '../shared/url';

const MAX_RESULTS = 80;

const MEDIA_EXTENSIONS: Array<{ re: RegExp; kind: MediaKind; label: string }> = [
    { re: /\.(m3u8)(?:[?#]|$)/i, kind: 'playlist', label: 'HLS playlist' },
    { re: /\.(mpd)(?:[?#]|$)/i, kind: 'playlist', label: 'DASH manifest' },
    { re: /\.(mp4|webm|mov|m4v|avi|mkv)(?:[?#]|$)/i, kind: 'video', label: 'Video file' },
    { re: /\.(mp3|m4a|aac|ogg|opus|wav|flac)(?:[?#]|$)/i, kind: 'audio', label: 'Audio file' },
    { re: /\.(vtt|srt|ass)(?:[?#]|$)/i, kind: 'subtitle', label: 'Subtitle file' },
    { re: /\.(jpg|jpeg|png|webp|gif|avif)(?:[?#]|$)/i, kind: 'image', label: 'Image file' },
];

const formatBytes = (bytes: number): string | undefined => {
    if (!Number.isFinite(bytes) || bytes <= 0) return undefined;
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
};

const isNoiseUrl = (url: string) => {
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        const path = parsed.pathname.toLowerCase();
        if (host === 'data.bilibili.com' || host.endsWith('.data.bilibili.com')) return true;
        if (host === 'cm.bilibili.com' || host.endsWith('.cm.bilibili.com')) return true;
        if (path.includes('/log/') || path.includes('/collect') || path.includes('/report')) return true;
        if (/click|heartbeat|tracking|analytics|beacon/i.test(path)) return true;
        return false;
    } catch {
        return false;
    }
};

const isBilibiliMediaHost = (host: string) =>
    /(^|\.)bilivideo\.com$/i.test(host) ||
    /(^|\.)akamaized\.net$/i.test(host) ||
    /^upos-/i.test(host);

const classifyUrl = (url: string): { kind: MediaKind; label: string } | null => {
    if (isNoiseUrl(url)) return null;
    let parsed: URL | null = null;
    try {
        parsed = new URL(url);
    } catch {
        parsed = null;
    }
    if (parsed && isBilibiliMediaHost(parsed.hostname)) {
        const path = parsed.pathname;
        if (/\/audio\.m4s$/i.test(path)) return { kind: 'audio', label: 'Audio stream' };
        if (/\/video\.m4s$/i.test(path)) return { kind: 'video', label: 'Video stream' };
        if (/\.(m4s|mp4)$/i.test(path)) return { kind: 'video', label: 'Video stream' };
    }
    for (const item of MEDIA_EXTENSIONS) {
        if (item.re.test(url)) return { kind: item.kind, label: item.label };
    }
    return null;
};

const inferFormat = (url: string, fallback?: string): string | undefined => {
    if (fallback?.includes('/')) return fallback.split('/').pop()?.toUpperCase();
    if (/\/(?:video|audio)\.m4s(?:[?#]|$)/i.test(url)) return 'MP4';
    const match = url.match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i);
    if (match) return match[1].toUpperCase();
    if (/m4s/i.test(url)) return 'M4S';
    return undefined;
};

const inferQuality = (url: string): string | undefined => {
    const value = decodeURIComponent(url);
    const qn = value.match(/[?&](?:qn|quality|accept_quality)=(\d+)/i)?.[1];
    if (qn) {
        const map: Record<string, string> = {
            '120': '4K',
            '116': '1080p60',
            '112': '1080p+',
            '80': '1080p',
            '64': '720p',
            '32': '480p',
            '16': '360p',
        };
        return map[qn] ?? `${qn}p`;
    }
    const height = value.match(/(?:^|[^0-9])([1-9][0-9]{2,3})p(?:[^0-9]|$)/i)?.[1];
    return height ? `${height}p` : undefined;
};

const pageThumbnail = (context: Pick<AdapterContext, 'document' | 'pageUrl'>): string | undefined => {
    const { document, pageUrl } = context;
    const ogImage = document.querySelector<HTMLMetaElement>('meta[property="og:image"], meta[name="twitter:image"]')?.content;
    const normalizedOg = ogImage ? normalizeUrl(ogImage, pageUrl) : null;
    if (normalizedOg) return normalizedOg;
    const poster = document.querySelector<HTMLVideoElement>('video[poster]')?.poster;
    const normalizedPoster = poster ? normalizeUrl(poster, pageUrl) : null;
    if (normalizedPoster) return normalizedPoster;
    const image = [...document.querySelectorAll<HTMLImageElement>('img')]
        .find((img) => (img.naturalWidth || img.width) >= 240 && (img.naturalHeight || img.height) >= 120);
    return image ? normalizeUrl(image.currentSrc || image.src, pageUrl) ?? undefined : undefined;
};

const pageMediaLabel = (pageTitle: string, kind: MediaKind, fallback: string) => {
    const title = pageTitle.trim().replace(/\s+/g, ' ');
    if (!title || (kind !== 'video' && kind !== 'audio' && kind !== 'playlist')) return fallback;
    if (kind === 'audio') return `${title}.m4a`;
    if (kind === 'playlist') return `${title}.m3u8`;
    return `${title}.mp4`;
};

const bestText = (element: Element, fallback: string): string => {
    const aria = element.getAttribute('aria-label')?.trim();
    if (aria) return aria.slice(0, 80);
    const title = element.getAttribute('title')?.trim();
    if (title) return title.slice(0, 80);
    const alt = element.getAttribute('alt')?.trim();
    if (alt) return alt.slice(0, 80);
    const text = element.textContent?.trim().replace(/\s+/g, ' ');
    if (text) return text.slice(0, 80);
    return fallback;
};

const dedupeKeyFor = (url: string) => {
    if (/\.(m4s|mp4|m3u8|mpd)(?:[?#]|$)/i.test(url)) {
        return url.replace(/[?#].*$/, '');
    }
    return url;
};

const sortMedia = (media: DetectedMedia[]) => {
    const rank: Record<MediaKind, number> = {
        video: 0,
        playlist: 1,
        audio: 2,
        subtitle: 3,
        image: 4,
        link: 5,
    };
    return [...media].sort((a, b) => {
        const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        return rank[a.kind] - rank[b.kind];
    });
};

const addMedia = (
    seen: Map<string, DetectedMedia>,
    rawUrl: string | null | undefined,
    baseUrl: string,
    kind: MediaKind,
    label: string,
    source: DetectedMedia['source'],
    meta: Partial<DetectedMedia> = {},
) => {
    if (seen.size >= MAX_RESULTS || !rawUrl) return;
    const url = normalizeUrl(rawUrl, baseUrl);
    if (!url || isNoiseUrl(url)) return;
    const dedupeKey = dedupeKeyFor(url);
    if (seen.has(dedupeKey)) return;
    seen.set(dedupeKey, {
        id: String(seen.size + 1),
        kind,
        url,
        label,
        source,
        format: meta.format ?? inferFormat(url),
        qualityLabel: meta.qualityLabel ?? inferQuality(url),
        sizeLabel: meta.sizeLabel,
        thumbnailUrl: meta.thumbnailUrl,
        durationLabel: meta.durationLabel,
        filename: meta.filename,
        score: meta.score,
        requiresPageContext: meta.requiresPageContext,
    });
};

export const scanGenericMedia = (context: Pick<AdapterContext, 'document' | 'pageUrl' | 'pageTitle' | 'performanceEntries'>): DetectedMedia[] => {
    const seen = new Map<string, DetectedMedia>();
    const { document, pageUrl, pageTitle, performanceEntries } = context;
    const fallbackThumbnail = pageThumbnail({ document, pageUrl });

    document.querySelectorAll<HTMLVideoElement>('video').forEach((video, index) => {
        addMedia(seen, video.currentSrc || video.src, pageUrl, 'video', bestText(video, `Video ${index + 1}`), 'dom', {
            thumbnailUrl: normalizeUrl(video.poster, pageUrl) ?? fallbackThumbnail,
            score: 60,
        });
        video.querySelectorAll<HTMLSourceElement>('source').forEach((source) => {
            addMedia(seen, source.src, pageUrl, 'video', source.type || 'Video source', 'dom', {
                format: inferFormat(source.src, source.type),
                thumbnailUrl: fallbackThumbnail,
                score: 55,
            });
        });
        video.querySelectorAll<HTMLTrackElement>('track').forEach((track) => {
            addMedia(seen, track.src, pageUrl, 'subtitle', track.kind || 'Subtitle track', 'dom', {
                format: inferFormat(track.src),
                score: 30,
            });
        });
    });

    document.querySelectorAll<HTMLAudioElement>('audio').forEach((audio, index) => {
        addMedia(seen, audio.currentSrc || audio.src, pageUrl, 'audio', bestText(audio, `Audio ${index + 1}`), 'dom', {
            score: 50,
        });
        audio.querySelectorAll<HTMLSourceElement>('source').forEach((source) => {
            addMedia(seen, source.src, pageUrl, 'audio', source.type || 'Audio source', 'dom', {
                format: inferFormat(source.src, source.type),
                score: 45,
            });
        });
    });

    document.querySelectorAll<HTMLImageElement>('img').forEach((img, index) => {
        const candidate = img.currentSrc || img.src;
        if (!candidate) return;
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        if (width < 220 && height < 220) return;
        addMedia(seen, candidate, pageUrl, 'image', bestText(img, `Image ${index + 1}`), 'dom', {
            thumbnailUrl: candidate,
            score: 15,
        });
    });

    document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
        const url = normalizeUrl(anchor.href, pageUrl);
        if (!url) return;
        const classified = classifyUrl(url);
        if (!classified) return;
        addMedia(seen, url, pageUrl, classified.kind, bestText(anchor, classified.label), 'fallback', {
            thumbnailUrl: classified.kind === 'video' || classified.kind === 'playlist' ? fallbackThumbnail : undefined,
            score: 35,
        });
    });

    document.querySelectorAll<HTMLSourceElement>('source[src]').forEach((source) => {
        const url = normalizeUrl(source.src, pageUrl);
        if (!url) return;
        const classified = classifyUrl(url);
        if (!classified) return;
        addMedia(seen, url, pageUrl, classified.kind, source.type || classified.label, 'dom', {
            format: inferFormat(url, source.type),
            thumbnailUrl: classified.kind === 'video' || classified.kind === 'playlist' ? fallbackThumbnail : undefined,
            score: 40,
        });
    });

    performanceEntries.forEach((entry) => {
        const url = normalizeUrl(entry.name, pageUrl);
        if (!url) return;
        const classified = classifyUrl(url);
        if (!classified) return;
        const size = entry.encodedBodySize || entry.transferSize || entry.decodedBodySize;
        addMedia(seen, url, pageUrl, classified.kind, pageMediaLabel(pageTitle, classified.kind, classified.label), 'network', {
            sizeLabel: formatBytes(size),
            thumbnailUrl: classified.kind === 'video' || classified.kind === 'playlist' ? fallbackThumbnail : undefined,
            score: 70,
        });
    });

    return sortMedia([...seen.values()]);
};

export const genericAdapter: PlatformAdapter = {
    id: 'generic',
    label: 'Generic media scanner',
    matches: () => true,
    scan(context) {
        const media = context.genericScan();
        return {
            platform: 'generic',
            pageUrl: context.pageUrl,
            pageTitle: context.pageTitle,
            hostname: context.hostname,
            status: media.length ? 'ok' : 'empty',
            media,
            warnings: media.length ? undefined : ['No obvious public media was found. Start playback, then scan again.'],
        };
    },
};
