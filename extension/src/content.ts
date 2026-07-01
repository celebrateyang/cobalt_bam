import { scanGenericMedia } from './adapters/generic';
import { scanWithAdapter } from './adapters/registry';
import type { DetectedMedia, DouyinDomVideoSnapshot, InstagramDomVideoSnapshot, InstagramResourceSnapshot, TikTokFeedItemSnapshot, TikTokResourceSnapshot } from './adapters/types';
import type { CaptureVisibleTabResponse, ExtensionMessage, InstagramResourceCacheResponse, PageScanResult, TikTokResourceCacheResponse } from './shared/messages';

declare global {
    interface Window {
        __fsvContentListenerReady?: boolean;
        __fsvTikTokFeedCache?: TikTokFeedItemSnapshot[];
        __fsvTikTokResourceCache?: TikTokResourceSnapshot[];
        __fsvInstagramResourceCache?: InstagramResourceSnapshot[];
        __fsvTikTokFeedObserverReady?: boolean;
        __fsvPageBridgeReady?: boolean;
        __fsvTikTokFeedCacheTimer?: number;
        __fsvInstagramResourcePageUrl?: string;
    }
}

export {};

const TIKTOK_HOST_RE = /(^|\.)tiktok\.com$/i;
const INSTAGRAM_HOST_RE = /(^|\.)instagram\.com$/i;
const DOUYIN_HOST_RE = /(^|\.)douyin\.com$|(^|\.)iesdouyin\.com$/i;
const TIKTOK_VIDEO_URL_RE = /\/aweme\/v1\/play\/|is_play_url=1|mime_type=video_|\/video\/tos\/|\.mp4(?:[?#]|$)|tiktokcdn|tiktokv|byteoversea|ibytedtos|muscdn|akamaized\.net/i;
const TIKTOK_AVATAR_RE = /(?:^|\/)tos-[^/?]*-avt-|\/avatar\//i;
const FREESAVEVIDEO_HOST_RE = /(^|\.)freesavevideo\.online$|^localhost$|^127\.0\.0\.1$/i;
const DEEPLEARNINGAI_CDN_RE = /(^|\.)cloudfront\.net$/i;
const INSTAGRAM_VIDEO_URL_RE = /\.(?:mp4|m4v)(?:[?#]|$)|\/v\/t\d+\.\d+-\d+\//i;
const INSTAGRAM_HOST_RESOURCE_RE = /(instagram|cdninstagram|fbcdn)/i;
const tikTokThumbnailCapturePending = new Set<string>();
let lastTikTokThumbnailCaptureAt = 0;

const isAllowedPageBridgeUrl = (value: string) => {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:') return false;
        const host = url.hostname.toLowerCase();
        return host === 'tiktok.com' ||
            host.endsWith('.tiktok.com') ||
            host.endsWith('.tiktokcdn.com') ||
            host.endsWith('.tiktokcdn-us.com') ||
            host.endsWith('.tiktokcdn-eu.com') ||
            host.endsWith('.tiktokv.com') ||
            host.endsWith('.byteoversea.com') ||
            host.endsWith('.ibytedtos.com') ||
            host.endsWith('.muscdn.com') ||
            host.endsWith('.akamaized.net') ||
            (
                DEEPLEARNINGAI_CDN_RE.test(host) &&
                /\.(?:mp4|m3u8)(?:$|[?#])/i.test(url.pathname)
            );
    } catch {
        return false;
    }
};

const installFreeSaveVideoPageBridge = () => {
    if (!FREESAVEVIDEO_HOST_RE.test(window.location.hostname) || window.__fsvPageBridgeReady) return;
    window.__fsvPageBridgeReady = true;

    window.postMessage({ source: 'freesavevideo-extension', type: 'FSV_EXTENSION_READY' }, window.location.origin);

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.origin !== window.location.origin) return;
        const data = event.data;
        if (!data || data.source !== 'freesavevideo-page' || data.type !== 'FSV_EXTENSION_DOWNLOAD') return;

        const requestId = typeof data.requestId === 'string' ? data.requestId : '';
        const url = typeof data.url === 'string' ? data.url : '';
        const filename = typeof data.filename === 'string' ? data.filename : undefined;
        if (!requestId || !isAllowedPageBridgeUrl(url)) {
            window.postMessage({
                source: 'freesavevideo-extension',
                type: 'FSV_EXTENSION_DOWNLOAD_RESULT',
                requestId,
                ok: false,
                error: 'Unsupported download URL.',
            }, window.location.origin);
            return;
        }

        void chrome.runtime.sendMessage({
            type: 'FSV_DOWNLOAD_URL',
            url,
            filename,
            media: {
                id: `page-download-${Date.now()}`,
                kind: 'video',
                url,
                label: filename || 'Video',
                source: 'api',
                format: /\.m3u8(?:$|[?#])/i.test(url) ? 'm3u8' : 'mp4',
            },
        } satisfies ExtensionMessage).then(() => {
            window.postMessage({
                source: 'freesavevideo-extension',
                type: 'FSV_EXTENSION_DOWNLOAD_RESULT',
                requestId,
                ok: true,
            }, window.location.origin);
        }).catch((error) => {
            window.postMessage({
                source: 'freesavevideo-extension',
                type: 'FSV_EXTENSION_DOWNLOAD_RESULT',
                requestId,
                ok: false,
                error: error instanceof Error ? error.message : 'Extension download failed.',
            }, window.location.origin);
        });
    });
};

installFreeSaveVideoPageBridge();

const getTikTokRecentFeedItems = () => {
    window.__fsvTikTokFeedCache ??= [];
    return window.__fsvTikTokFeedCache;
};

const getTikTokResourceItems = () => {
    window.__fsvTikTokResourceCache ??= [];
    return window.__fsvTikTokResourceCache;
};

const getInstagramResourceItems = () => {
    window.__fsvInstagramResourceCache ??= [];
    return window.__fsvInstagramResourceCache;
};

const resetInstagramResourceCacheIfPageChanged = () => {
    if (!INSTAGRAM_HOST_RE.test(window.location.hostname)) return false;
    const pageUrl = window.location.href;
    if (window.__fsvInstagramResourcePageUrl === pageUrl) return false;
    window.__fsvInstagramResourcePageUrl = pageUrl;
    window.__fsvInstagramResourceCache = [];
    return true;
};

const normalizeAbsoluteUrl = (rawUrl: string | null | undefined, pageUrl: string) => {
    if (!rawUrl) return undefined;
    try {
        return new URL(rawUrl, pageUrl).href;
    } catch {
        return undefined;
    }
};

const getVisibleArea = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
    const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    return width * height;
};

const getViewportRect = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const x = Math.max(0, rect.left);
    const y = Math.max(0, rect.top);
    const width = Math.max(0, Math.min(rect.right, window.innerWidth) - x);
    const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - y);
    return { x, y, width, height };
};

const textFromElement = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() || undefined;

const srcFromSrcset = (srcset: string | null | undefined, pageUrl: string) => {
    if (!srcset) return undefined;
    const entries = srcset
        .split(',')
        .map((entry) => {
            const [rawUrl, rawDescriptor] = entry.trim().split(/\s+/, 2);
            const url = normalizeAbsoluteUrl(rawUrl, pageUrl);
            const width = Number(rawDescriptor?.replace(/[^\d.]/g, '')) || 0;
            return url ? { url, width } : null;
        })
        .filter((entry): entry is { url: string; width: number } => entry !== null)
        .sort((left, right) => right.width - left.width);
    return entries[0]?.url;
};

const backgroundImageUrl = (element: Element, pageUrl: string) => {
    const value = window.getComputedStyle(element).backgroundImage;
    const match = value.match(/url\(["']?(.+?)["']?\)/);
    return normalizeAbsoluteUrl(match?.[1], pageUrl);
};

const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Unable to load captured screenshot.'));
        image.src = src;
    });

const cropScreenshotToRect = async (dataUrl: string, rect: TikTokFeedItemSnapshot['thumbnailRect']) => {
    if (!rect || rect.width < 8 || rect.height < 8) return undefined;
    const image = await loadImage(dataUrl);
    const scaleX = image.naturalWidth / Math.max(1, window.innerWidth);
    const scaleY = image.naturalHeight / Math.max(1, window.innerHeight);
    const sourceX = Math.max(0, rect.x * scaleX);
    const sourceY = Math.max(0, rect.y * scaleY);
    const sourceWidth = Math.min(image.naturalWidth - sourceX, Math.max(1, rect.width * scaleX));
    const sourceHeight = Math.min(image.naturalHeight - sourceY, Math.max(1, rect.height * scaleY));
    const canvas = document.createElement('canvas');
    canvas.width = 152;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.76);
};

const captureVideoElementFrame = (video: HTMLVideoElement) => {
    if (video.readyState < 2 || video.videoWidth < 8 || video.videoHeight < 8) return undefined;
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 152;
        canvas.height = 96;
        const context = canvas.getContext('2d');
        if (!context) return undefined;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.76);
    } catch {
        return undefined;
    }
};

const waitForVideoEvent = (video: HTMLVideoElement, eventName: string, timeoutMs: number) =>
    new Promise<boolean>((resolve) => {
        const timeout = window.setTimeout(() => {
            cleanup();
            resolve(false);
        }, timeoutMs);
        const onEvent = () => {
            cleanup();
            resolve(true);
        };
        const cleanup = () => {
            window.clearTimeout(timeout);
            video.removeEventListener(eventName, onEvent);
            video.removeEventListener('error', onEvent);
        };
        video.addEventListener(eventName, onEvent, { once: true });
        video.addEventListener('error', onEvent, { once: true });
    });

const captureVideoUrlFrame = async (url: string) => {
    try {
        const response = await fetch(url, {
            credentials: INSTAGRAM_HOST_RESOURCE_RE.test(url) ? 'omit' : 'include',
            cache: 'force-cache',
            referrer: window.location.href,
        });
        if (!response.ok) return undefined;
        const contentType = response.headers.get('content-type') || '';
        if (contentType && !contentType.toLowerCase().startsWith('video/') && !contentType.toLowerCase().includes('octet-stream')) {
            return undefined;
        }

        const blob = await response.blob();
        if (!blob.size) return undefined;
        const objectUrl = URL.createObjectURL(blob);
        try {
            const video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.preload = 'metadata';
            video.src = objectUrl;
            const loaded = await waitForVideoEvent(video, 'loadedmetadata', 3500);
            if (!loaded || !Number.isFinite(video.duration)) return undefined;
            const targetTime = Math.min(Math.max(video.duration * 0.08, 0.05), 0.8);
            video.currentTime = targetTime;
            await waitForVideoEvent(video, 'seeked', 2500);
            return captureVideoElementFrame(video);
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    } catch {
        return undefined;
    }
};

const hydrateTikTokResourceThumbnails = async (items: TikTokResourceSnapshot[]) => {
    const missing = items.filter((item) => !item.thumbnailUrl).filter((item, index, array) =>
        array.findIndex((candidate) => candidate.url === item.url) === index,
    );
    const workers = Array.from({ length: Math.min(3, missing.length) }, async (_, workerIndex) => {
        for (let index = workerIndex; index < missing.length; index += 3) {
            const item = missing[index];
            const thumbnailUrl = await captureVideoUrlFrame(item.url);
            if (thumbnailUrl) rememberTikTokResourceThumbnail(item.url, thumbnailUrl);
        }
    });
    await Promise.allSettled(workers);
};

const hydrateInstagramResourceThumbnails = async (items: InstagramResourceSnapshot[]) => {
    const missing = items.filter((item) => !item.thumbnailUrl).filter((item, index, array) =>
        array.findIndex((candidate) => candidate.url === item.url) === index,
    );
    const workers = Array.from({ length: Math.min(3, missing.length) }, async (_, workerIndex) => {
        for (let index = workerIndex; index < missing.length; index += 3) {
            const item = missing[index];
            const thumbnailUrl = await captureVideoUrlFrame(item.url);
            if (thumbnailUrl) rememberInstagramResourceThumbnail(item.url, thumbnailUrl);
        }
    });
    await Promise.allSettled(workers);
};

const rememberTikTokResourceThumbnail = (url: string, thumbnailUrl: string | undefined) => {
    if (!thumbnailUrl || !thumbnailUrl.startsWith('data:')) return;
    upsertTikTokResourceItem({ url, thumbnailUrl, seenAt: Date.now() });
    void chrome.runtime.sendMessage({
        type: 'FSV_REMEMBER_TIKTOK_RESOURCE_THUMBNAIL',
        url,
        thumbnailUrl,
    }).catch(() => {
        // Background cache is a convenience; the page-local cache is still updated above.
    });
};

const rememberInstagramResourceThumbnail = (url: string, thumbnailUrl: string | undefined) => {
    if (!thumbnailUrl || !thumbnailUrl.startsWith('data:')) return;
    upsertInstagramResourceItem({ url, thumbnailUrl, seenAt: Date.now() });
    void chrome.runtime.sendMessage({
        type: 'FSV_REMEMBER_INSTAGRAM_RESOURCE_THUMBNAIL',
        url,
        thumbnailUrl,
    }).catch(() => {
        // Background cache is a convenience; the page-local cache is still updated above.
    });
};

const captureTikTokThumbnail = async (item: TikTokFeedItemSnapshot) => {
    if (!item.thumbnailRect || item.thumbnailUrl?.startsWith('data:') || tikTokThumbnailCapturePending.has(item.url)) return;
    const now = Date.now();
    if (now - lastTikTokThumbnailCaptureAt < 650) return;
    lastTikTokThumbnailCaptureAt = now;
    tikTokThumbnailCapturePending.add(item.url);
    try {
        const response = await chrome.runtime.sendMessage({ type: 'FSV_CAPTURE_VISIBLE_TAB' }) as CaptureVisibleTabResponse;
        if (!response.ok || !response.dataUrl) return;
        const thumbnailUrl = await cropScreenshotToRect(response.dataUrl, item.thumbnailRect);
        if (!thumbnailUrl) return;
        rememberTikTokResourceThumbnail(item.url, thumbnailUrl);
        upsertTikTokFeedItem({
            ...item,
            thumbnailUrl,
            seenAt: Date.now() + (item.visibleArea || 0),
        });
    } catch {
        // Best effort only; normal scanning still works without cached thumbnails.
    } finally {
        tikTokThumbnailCapturePending.delete(item.url);
    }
};

const findTikTokFeedCard = (video: HTMLVideoElement) => {
    let current: Element | null = video;
    for (let depth = 0; current && depth < 9; depth += 1, current = current.parentElement) {
        const rect = current.getBoundingClientRect();
        const hasPostLink = Boolean(current.querySelector('a[href*="/video/"], a[href^="/@"]'));
        const hasUsefulMedia = current.querySelectorAll('video,img,picture').length >= 2;
        if ((hasPostLink || hasUsefulMedia) && rect.height > 180 && rect.width > 180) return current;
    }
    return video.closest('article') || video.parentElement || video;
};

const findTikTokPoster = (video: HTMLVideoElement, card: Element, pageUrl: string) => {
    const poster = normalizeAbsoluteUrl(video.poster, pageUrl);
    if (poster && !TIKTOK_AVATAR_RE.test(poster)) return poster;

    const videoRect = video.getBoundingClientRect();
    const images = [...card.querySelectorAll<HTMLImageElement>('img')]
        .map((image) => {
            const src =
                normalizeAbsoluteUrl(image.currentSrc || image.src, pageUrl) ||
                srcFromSrcset(image.getAttribute('srcset'), pageUrl);
            if (!src || TIKTOK_AVATAR_RE.test(src)) return null;
            const rect = image.getBoundingClientRect();
            const area = Math.max(0, rect.width) * Math.max(0, rect.height);
            if (area < 1600) return null;
            const overlapsVideo =
                rect.left < videoRect.right &&
                rect.right > videoRect.left &&
                rect.top < videoRect.bottom &&
                rect.bottom > videoRect.top;
            return {
                src,
                score: area + (overlapsVideo ? 250_000 : 0) + getVisibleArea(image),
            };
        })
        .filter((item): item is { src: string; score: number } => Boolean(item))
        .sort((left, right) => right.score - left.score);

    if (images[0]?.src) return images[0].src;

    const backgroundImages = [...card.querySelectorAll<HTMLElement>('*')]
        .map((element) => {
            const src = backgroundImageUrl(element, pageUrl);
            if (!src || TIKTOK_AVATAR_RE.test(src)) return null;
            const area = getVisibleArea(element);
            if (area < 1600) return null;
            return { src, score: area };
        })
        .filter((item): item is { src: string; score: number } => item !== null)
        .sort((left, right) => right.score - left.score);

    return backgroundImages[0]?.src;
};

const findTikTokTitle = (card: Element) => {
    const selectors = [
        '[data-e2e*="video-desc"]',
        '[data-e2e*="browse-video-desc"]',
        '[data-e2e*="feed-video-desc"]',
        'h1',
        'h2',
        'strong',
    ];
    for (const selector of selectors) {
        const text = textFromElement(card.querySelector(selector));
        if (text && text.length > 2 && !text.startsWith('@')) return text.slice(0, 180);
    }

    const aria = card.querySelector('[aria-label]')?.getAttribute('aria-label')?.replace(/\s+/g, ' ').trim();
    if (aria && aria.length > 2) return aria.slice(0, 180);

    return undefined;
};

const findTikTokAuthor = (card: Element) => {
    const authorLink = [...card.querySelectorAll<HTMLAnchorElement>('a[href^="/@"], a[href*="tiktok.com/@"]')]
        .map((link) => {
            const text = textFromElement(link);
            const hrefHandle = link.getAttribute('href')?.match(/\/(@[^/?#]+)/)?.[1];
            return (text?.startsWith('@') ? text : hrefHandle)?.slice(0, 80);
        })
        .find(Boolean);
    return authorLink;
};

const upsertTikTokFeedItem = (item: TikTokFeedItemSnapshot) => {
    rememberTikTokResourceThumbnail(item.url, item.thumbnailUrl);
    const recentItems = getTikTokRecentFeedItems();
    const existingIndex = recentItems.findIndex((existing) => existing.url === item.url);
    if (existingIndex >= 0) {
        const existing = recentItems.splice(existingIndex, 1)[0];
        recentItems.unshift({
            ...existing,
            ...item,
            title: item.title || existing.title,
            author: item.author || existing.author,
            thumbnailUrl: item.thumbnailUrl || existing.thumbnailUrl,
        });
    } else {
        recentItems.unshift(item);
    }
    recentItems.sort((left, right) => right.seenAt - left.seenAt);
};

const upsertTikTokResourceItem = (item: TikTokResourceSnapshot) => {
    if (!TIKTOK_VIDEO_URL_RE.test(item.url) || TIKTOK_AVATAR_RE.test(item.url)) return;
    const resourceItems = getTikTokResourceItems();
    const existingIndex = resourceItems.findIndex((existing) => existing.url === item.url);
    const existing = existingIndex >= 0 ? resourceItems.splice(existingIndex, 1)[0] : undefined;
    resourceItems.unshift({
        ...existing,
        ...item,
        thumbnailUrl: item.thumbnailUrl || existing?.thumbnailUrl,
    });
    resourceItems.sort((left, right) => right.seenAt - left.seenAt);
};

const upsertInstagramResourceItem = (item: InstagramResourceSnapshot) => {
    if (!INSTAGRAM_HOST_RESOURCE_RE.test(item.url) || !INSTAGRAM_VIDEO_URL_RE.test(item.url)) return;
    const resourceItems = getInstagramResourceItems();
    const existingIndex = resourceItems.findIndex((existing) => existing.url === item.url);
    const existing = existingIndex >= 0 ? resourceItems.splice(existingIndex, 1)[0] : undefined;
    resourceItems.unshift({
        ...existing,
        ...item,
        thumbnailUrl: item.thumbnailUrl || existing?.thumbnailUrl,
    });
    resourceItems.sort((left, right) => right.seenAt - left.seenAt);
};

const refreshTikTokResourceCache = () => {
    if (!TIKTOK_HOST_RE.test(window.location.hostname)) return;
    for (const entry of performance.getEntriesByType('resource')) {
        if (!(entry instanceof PerformanceResourceTiming)) continue;
        const url = normalizeAbsoluteUrl(entry.name, window.location.href);
        if (!url) continue;
        upsertTikTokResourceItem({ url, seenAt: entry.startTime });
    }
};

const refreshInstagramResourceCache = () => {
    if (!INSTAGRAM_HOST_RE.test(window.location.hostname)) return;
    resetInstagramResourceCacheIfPageChanged();
    for (const entry of performance.getEntriesByType('resource')) {
        if (!(entry instanceof PerformanceResourceTiming)) continue;
        const url = normalizeAbsoluteUrl(entry.name, window.location.href);
        if (!url) continue;
        upsertInstagramResourceItem({ url, seenAt: entry.startTime });
    }
};

const collectInstagramDomVideos = (): InstagramDomVideoSnapshot[] => {
    if (!INSTAGRAM_HOST_RE.test(window.location.hostname)) return [];
    const now = Date.now();
    const pageUrl = window.location.href;
    return [...document.querySelectorAll<HTMLVideoElement>('video')]
        .map((video) => {
            const url = normalizeAbsoluteUrl(video.currentSrc || video.src, pageUrl);
            if (!url) return null;
            const visibleArea = getVisibleArea(video);
            if (visibleArea < 1_600 && !video.currentTime) return null;
            const item: InstagramDomVideoSnapshot = {
                url,
                thumbnailUrl: captureVideoElementFrame(video),
                thumbnailRect: getViewportRect(video),
                durationLabel: Number.isFinite(video.duration) ? `${Math.round(video.duration)}s` : undefined,
                visibleArea,
                currentTime: video.currentTime,
                paused: video.paused,
                seenAt: now + visibleArea + (video.paused ? 0 : 100_000) + (video.currentTime > 0 ? 25_000 : 0),
            };
            return item;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((left, right) => right.seenAt - left.seenAt);
};

const collectDouyinDomVideos = (): DouyinDomVideoSnapshot[] => {
    if (!DOUYIN_HOST_RE.test(window.location.hostname)) return [];
    const now = Date.now();
    const pageUrl = window.location.href;
    return [...document.querySelectorAll<HTMLVideoElement>('video')]
        .map((video) => {
            const url = normalizeAbsoluteUrl(video.currentSrc || video.src, pageUrl);
            if (!url) return null;
            const visibleArea = getVisibleArea(video);
            if (visibleArea < 1_600 && !video.currentTime) return null;
            const item: DouyinDomVideoSnapshot = {
                url,
                thumbnailUrl: captureVideoElementFrame(video),
                thumbnailRect: getViewportRect(video),
                durationLabel: Number.isFinite(video.duration) ? `${Math.round(video.duration)}s` : undefined,
                visibleArea,
                currentTime: video.currentTime,
                paused: video.paused,
                seenAt: now + visibleArea + (video.paused ? 0 : 100_000) + (video.currentTime > 0 ? 25_000 : 0),
            };
            return item;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((left, right) => right.seenAt - left.seenAt);
};

const refreshTikTokFeedCache = () => {
    if (!TIKTOK_HOST_RE.test(window.location.hostname)) return;
    refreshTikTokResourceCache();
    const now = Date.now();
    const pageUrl = window.location.href;
    const videos = [...document.querySelectorAll<HTMLVideoElement>('video')]
        .map((video) => {
            const directUrl = normalizeAbsoluteUrl(video.currentSrc || video.src, pageUrl);
            const url = directUrl && TIKTOK_VIDEO_URL_RE.test(directUrl) ? directUrl : undefined;
            if (!url || !TIKTOK_VIDEO_URL_RE.test(url)) return null;
            const card = findTikTokFeedCard(video);
            const visibleArea = getVisibleArea(video);
            const item: TikTokFeedItemSnapshot = {
                url,
                title: findTikTokTitle(card),
                author: findTikTokAuthor(card),
                thumbnailUrl: findTikTokPoster(video, card, pageUrl) || captureVideoElementFrame(video),
                thumbnailRect: getViewportRect(video),
                visibleArea,
                currentTime: video.currentTime,
                paused: video.paused,
                seenAt: now + visibleArea + (video.paused ? 0 : 100_000) + (video.currentTime > 0 ? 25_000 : 0),
            };
            return item;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((left, right) => right.seenAt - left.seenAt);

    for (const item of videos) upsertTikTokFeedItem(item);
    const bestVisibleItem = videos.find((item) => item.visibleArea && item.visibleArea > 8_000 && !item.thumbnailUrl?.startsWith('data:'));
    if (bestVisibleItem) void captureTikTokThumbnail(bestVisibleItem);
};

const scheduleTikTokFeedCacheRefresh = () => {
    if (!TIKTOK_HOST_RE.test(window.location.hostname) || window.__fsvTikTokFeedCacheTimer) return;
    window.__fsvTikTokFeedCacheTimer = window.setTimeout(() => {
        window.__fsvTikTokFeedCacheTimer = undefined;
        refreshTikTokFeedCache();
    }, 150);
};

if (TIKTOK_HOST_RE.test(window.location.hostname) && !window.__fsvTikTokFeedObserverReady) {
    window.__fsvTikTokFeedObserverReady = true;
    refreshTikTokResourceCache();
    refreshTikTokFeedCache();
    window.addEventListener('scroll', scheduleTikTokFeedCacheRefresh, { passive: true });
    window.addEventListener('resize', scheduleTikTokFeedCacheRefresh, { passive: true });
    document.addEventListener('play', scheduleTikTokFeedCacheRefresh, true);
    document.addEventListener('timeupdate', scheduleTikTokFeedCacheRefresh, true);
    const observer = new MutationObserver(scheduleTikTokFeedCacheRefresh);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'poster', 'style'] });
    const performanceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            if (!(entry instanceof PerformanceResourceTiming)) continue;
            const url = normalizeAbsoluteUrl(entry.name, window.location.href);
            if (!url) continue;
            upsertTikTokResourceItem({ url, seenAt: entry.startTime });
        }
    });
    try {
        performanceObserver.observe({ type: 'resource', buffered: true });
    } catch {
        refreshTikTokResourceCache();
    }
    window.setInterval(refreshTikTokFeedCache, 1000);
}

if (INSTAGRAM_HOST_RE.test(window.location.hostname) && !window.__fsvTikTokFeedObserverReady) {
    window.__fsvTikTokFeedObserverReady = true;
    refreshInstagramResourceCache();
    const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            if (!(entry instanceof PerformanceResourceTiming)) continue;
            const url = normalizeAbsoluteUrl(entry.name, window.location.href);
            if (!url) continue;
            upsertInstagramResourceItem({ url, seenAt: entry.startTime });
        }
    });
    try {
        observer.observe({ type: 'resource', buffered: true });
    } catch {
        refreshInstagramResourceCache();
    }
    window.setInterval(refreshInstagramResourceCache, 1000);
}

const scanPage = async (): Promise<PageScanResult> => {
    const pageUrl = window.location.href;
    const pageTitle = document.title || window.location.hostname;
    const performanceEntries = performance
        .getEntriesByType('resource')
        .filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming);

    let cachedGenericMedia: PageScanResult['media'] | null = null;
    let backgroundTikTokResources: TikTokResourceSnapshot[] = [];
    let backgroundInstagramResources: InstagramResourceSnapshot[] = [];
    if (TIKTOK_HOST_RE.test(window.location.hostname)) {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'FSV_GET_TIKTOK_RESOURCE_CACHE' }) as TikTokResourceCacheResponse;
            backgroundTikTokResources = response.ok ? response.items ?? [] : [];
        } catch {
            backgroundTikTokResources = [];
        }
        for (const item of backgroundTikTokResources) upsertTikTokResourceItem(item);
        refreshTikTokFeedCache();
        await hydrateTikTokResourceThumbnails(getTikTokResourceItems());
    } else {
        refreshTikTokFeedCache();
    }

    if (INSTAGRAM_HOST_RE.test(window.location.hostname)) {
        const pageChanged = resetInstagramResourceCacheIfPageChanged();
        if (pageChanged) {
            try {
                await chrome.runtime.sendMessage({ type: 'FSV_CLEAR_INSTAGRAM_RESOURCE_CACHE' });
            } catch {
                // Best effort; local cache is already cleared.
            }
        }
        try {
            const response = await chrome.runtime.sendMessage({ type: 'FSV_GET_INSTAGRAM_RESOURCE_CACHE' }) as InstagramResourceCacheResponse;
            backgroundInstagramResources = response.ok ? response.items ?? [] : [];
        } catch {
            backgroundInstagramResources = [];
        }
        for (const item of backgroundInstagramResources) upsertInstagramResourceItem(item);
        refreshInstagramResourceCache();
        await hydrateInstagramResourceThumbnails(getInstagramResourceItems());
    }

    return scanWithAdapter({
        pageUrl,
        pageTitle,
        hostname: window.location.hostname,
        document,
        performanceEntries,
        tiktokFeedItems: TIKTOK_HOST_RE.test(window.location.hostname) ? [...getTikTokRecentFeedItems()] : undefined,
        tiktokResourceItems: TIKTOK_HOST_RE.test(window.location.hostname)
            ? [...backgroundTikTokResources, ...getTikTokResourceItems()]
            : undefined,
        douyinDomVideos: DOUYIN_HOST_RE.test(window.location.hostname) ? collectDouyinDomVideos() : undefined,
        instagramDomVideos: INSTAGRAM_HOST_RE.test(window.location.hostname) ? collectInstagramDomVideos() : undefined,
        instagramResourceItems: INSTAGRAM_HOST_RE.test(window.location.hostname)
            ? [...backgroundInstagramResources, ...getInstagramResourceItems()]
            : undefined,
        genericScan: () => {
            if (!cachedGenericMedia) {
                cachedGenericMedia = scanGenericMedia({
                    document,
                    pageUrl,
                    pageTitle,
                    performanceEntries,
                });
            }
            return cachedGenericMedia;
        },
    });
};

const mediaTypeMatches = (blobType: string, media?: DetectedMedia) => {
    if (!media) return true;
    const type = blobType.toLowerCase();
    if (!type || type === 'application/octet-stream') return true;
    switch (media.kind) {
        case 'video':
            return type.startsWith('video/');
        case 'audio':
            return type.startsWith('audio/');
        case 'image':
            return type.startsWith('image/');
        default:
            return true;
    }
};

const basenameFromFilename = (filename?: string) => {
    const raw = filename?.split('/').pop()?.trim();
    return raw || 'download';
};

const downloadInPageContext = async (url: string, filename?: string, media?: DetectedMedia) => {
    const response = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
    });
    if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}.`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!mediaTypeMatches(contentType, media)) {
        throw new Error(`Unexpected content type: ${contentType || 'unknown'}.`);
    }

    const blob = await response.blob();
    if (!blob.size) {
        throw new Error('Empty download payload.');
    }

    if (!mediaTypeMatches(blob.type || contentType, media)) {
        throw new Error(`Downloaded payload is not a ${media?.kind || 'media'} file.`);
    }

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = basenameFromFilename(filename);
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
};

if (!window.__fsvContentListenerReady) {
    window.__fsvContentListenerReady = true;
    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
        if (message.type === 'FSV_SCAN_PAGE') {
            void scanPage().then(sendResponse);
            return true;
        }
        if (message.type === 'FSV_PAGE_DOWNLOAD') {
            void downloadInPageContext(message.url, message.filename, message.media)
                .then(() => sendResponse({ ok: true }))
                .catch((error) => {
                    sendResponse({
                        ok: false,
                        error: error instanceof Error ? error.message : 'Unknown download error.',
                    });
                });
            return true;
        }
        return false;
    });
}
