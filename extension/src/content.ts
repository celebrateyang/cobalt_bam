import type { DetectedMedia, ExtensionMessage, MediaKind, PageScanResult } from './shared/messages';

declare global {
    interface Window {
        __fsvContentListenerReady?: boolean;
    }
}

const MAX_RESULTS = 80;
const YOUTUBE_HOST_RE = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i;

const MEDIA_EXTENSIONS: Array<{ re: RegExp; kind: MediaKind; label: string }> = [
    { re: /\.(m3u8)(?:[?#]|$)/i, kind: 'playlist', label: 'HLS playlist' },
    { re: /\.(mpd)(?:[?#]|$)/i, kind: 'playlist', label: 'DASH manifest' },
    { re: /\.(mp4|webm|mov|m4v|avi|mkv|m4s)(?:[?#]|$)/i, kind: 'video', label: 'Video file' },
    { re: /\.(mp3|m4a|aac|ogg|opus|wav|flac)(?:[?#]|$)/i, kind: 'audio', label: 'Audio file' },
    { re: /\.(vtt|srt|ass)(?:[?#]|$)/i, kind: 'subtitle', label: 'Subtitle file' },
    { re: /\.(jpg|jpeg|png|webp|gif|avif)(?:[?#]|$)/i, kind: 'image', label: 'Image file' },
];

const pageUrl = () => window.location.href;

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

const normalizeUrl = (value: string, baseUrl: string): string | null => {
    if (!value || value.startsWith('blob:') || value.startsWith('data:')) return null;
    try {
        const url = new URL(value, baseUrl);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        url.hash = '';
        return url.toString();
    } catch {
        return null;
    }
};

const classifyUrl = (url: string): { kind: MediaKind; label: string } | null => {
    if (/\/video\.m4s(?:[?#]|$)/i.test(url)) return { kind: 'video', label: 'Bilibili video stream' };
    if (/\/audio\.m4s(?:[?#]|$)/i.test(url)) return { kind: 'audio', label: 'Bilibili audio stream' };
    if (/\.bilivideo\.com\//i.test(url) && /m4s|mp4/i.test(url)) return { kind: 'video', label: 'Bilibili media stream' };
    for (const item of MEDIA_EXTENSIONS) {
        if (item.re.test(url)) return { kind: item.kind, label: item.label };
    }
    return null;
};

const inferFormat = (url: string, fallback?: string): string | undefined => {
    if (fallback?.includes('/')) return fallback.split('/').pop()?.toUpperCase();
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

const pageThumbnail = (): string | undefined => {
    const ogImage = document.querySelector<HTMLMetaElement>('meta[property="og:image"], meta[name="twitter:image"]')?.content;
    const normalizedOg = ogImage ? normalizeUrl(ogImage, pageUrl()) : null;
    if (normalizedOg) return normalizedOg;
    const poster = document.querySelector<HTMLVideoElement>('video[poster]')?.poster;
    const normalizedPoster = poster ? normalizeUrl(poster, pageUrl()) : null;
    if (normalizedPoster) return normalizedPoster;
    const image = [...document.querySelectorAll<HTMLImageElement>('img')]
        .find((img) => (img.naturalWidth || img.width) >= 240 && (img.naturalHeight || img.height) >= 120);
    return image ? normalizeUrl(image.currentSrc || image.src, pageUrl()) ?? undefined : undefined;
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

const addMedia = (
    seen: Map<string, DetectedMedia>,
    rawUrl: string | null | undefined,
    baseUrl: string,
    kind: MediaKind,
    label: string,
    source: string,
    meta: Partial<DetectedMedia> = {},
) => {
    if (seen.size >= MAX_RESULTS || !rawUrl) return;
    const url = normalizeUrl(rawUrl, baseUrl);
    if (!url || seen.has(url)) return;
    seen.set(url, {
        id: String(seen.size + 1),
        kind,
        url,
        label,
        source,
        format: meta.format ?? inferFormat(url),
        qualityLabel: meta.qualityLabel ?? inferQuality(url),
        sizeLabel: meta.sizeLabel,
        thumbnailUrl: meta.thumbnailUrl,
    });
};

const scanDom = (): PageScanResult => {
    const seen = new Map<string, DetectedMedia>();
    const baseUrl = pageUrl();
    const fallbackThumbnail = pageThumbnail();

    document.querySelectorAll<HTMLVideoElement>('video').forEach((video, index) => {
        addMedia(seen, video.currentSrc || video.src, baseUrl, 'video', bestText(video, `Video ${index + 1}`), 'video', {
            thumbnailUrl: normalizeUrl(video.poster, baseUrl) ?? fallbackThumbnail,
        });
        video.querySelectorAll<HTMLSourceElement>('source').forEach((source) => {
            addMedia(seen, source.src, baseUrl, 'video', source.type || 'Video source', 'video source', {
                format: inferFormat(source.src, source.type),
                thumbnailUrl: fallbackThumbnail,
            });
        });
        video.querySelectorAll<HTMLTrackElement>('track').forEach((track) => {
            addMedia(seen, track.src, baseUrl, 'subtitle', track.kind || 'Subtitle track', 'track', {
                format: inferFormat(track.src),
            });
        });
    });

    document.querySelectorAll<HTMLAudioElement>('audio').forEach((audio, index) => {
        addMedia(seen, audio.currentSrc || audio.src, baseUrl, 'audio', bestText(audio, `Audio ${index + 1}`), 'audio');
        audio.querySelectorAll<HTMLSourceElement>('source').forEach((source) => {
            addMedia(seen, source.src, baseUrl, 'audio', source.type || 'Audio source', 'audio source', {
                format: inferFormat(source.src, source.type),
            });
        });
    });

    document.querySelectorAll<HTMLImageElement>('img').forEach((img, index) => {
        const candidate = img.currentSrc || img.src;
        if (!candidate) return;
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        if (width < 220 && height < 220) return;
        addMedia(seen, candidate, baseUrl, 'image', bestText(img, `Image ${index + 1}`), 'image', {
            thumbnailUrl: candidate,
        });
    });

    document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
        const url = normalizeUrl(anchor.href, baseUrl);
        if (!url) return;
        const classified = classifyUrl(url);
        if (!classified) return;
        addMedia(seen, url, baseUrl, classified.kind, bestText(anchor, classified.label), 'link', {
            thumbnailUrl: classified.kind === 'video' || classified.kind === 'playlist' ? fallbackThumbnail : undefined,
        });
    });

    document.querySelectorAll<HTMLSourceElement>('source[src]').forEach((source) => {
        const url = normalizeUrl(source.src, baseUrl);
        if (!url) return;
        const classified = classifyUrl(url);
        if (!classified) return;
        addMedia(seen, url, baseUrl, classified.kind, source.type || classified.label, 'source', {
            format: inferFormat(url, source.type),
            thumbnailUrl: classified.kind === 'video' || classified.kind === 'playlist' ? fallbackThumbnail : undefined,
        });
    });

    performance.getEntriesByType('resource').forEach((entry) => {
        if (!(entry instanceof PerformanceResourceTiming)) return;
        const url = normalizeUrl(entry.name, baseUrl);
        if (!url) return;
        const classified = classifyUrl(url);
        if (!classified) return;
        const size = entry.encodedBodySize || entry.transferSize || entry.decodedBodySize;
        addMedia(seen, url, baseUrl, classified.kind, classified.label, 'network', {
            sizeLabel: formatBytes(size),
            thumbnailUrl: classified.kind === 'video' || classified.kind === 'playlist' ? fallbackThumbnail : undefined,
        });
    });

    return {
        pageUrl: baseUrl,
        pageTitle: document.title || window.location.hostname,
        hostname: window.location.hostname,
        isYouTube: YOUTUBE_HOST_RE.test(window.location.hostname),
        media: [...seen.values()].sort((a, b) => {
            const rank: Record<MediaKind, number> = {
                video: 0,
                playlist: 1,
                audio: 2,
                subtitle: 3,
                image: 4,
                link: 5,
            };
            return rank[a.kind] - rank[b.kind];
        }),
    };
};

if (!window.__fsvContentListenerReady) {
    window.__fsvContentListenerReady = true;
    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
        if (message.type !== 'FSV_SCAN_PAGE') return false;
        sendResponse(scanDom());
        return false;
    });
}
