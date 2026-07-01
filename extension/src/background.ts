import type { ExtensionMessage } from './shared/messages';
import type { DetectedMedia, InstagramResourceSnapshot, TikTokResourceSnapshot } from './adapters/types';
import { downloadWithChrome } from './downloader/chrome-downloads';
import { buildFreeSaveVideoUrl } from './shared/url';

const TIKTOK_VIDEO_URL_RE = /\/aweme\/v1\/play\/|is_play_url=1|mime_type=video_|\/video\/tos\/|\.mp4(?:[?#]|$)|tokcdn|tiktokcdn|tiktokv|byteoversea|ibytedtos|muscdn|akamaized\.net/i;
const TIKTOK_AVATAR_RE = /(?:^|\/)tos-[^/?]*-avt-|\/avatar\//i;
const INSTAGRAM_VIDEO_URL_RE = /\.(?:mp4|m4v)(?:[?#]|$)|\/v\/t\d+\.\d+-\d+\//i;
const INSTAGRAM_HOST_RE = /(instagram|cdninstagram|fbcdn)/i;
const tikTokResourceCache = new Map<number, TikTokResourceSnapshot[]>();
const instagramResourceCache = new Map<number, InstagramResourceSnapshot[]>();

const getTikTokPostIdFromUrl = (value?: string) => {
    if (!value) return '';
    try {
        const url = new URL(value);
        if (!/(^|\.)tiktok\.com$/i.test(url.hostname) && url.hostname !== 'vt.tiktok.com') return '';
        return url.pathname.match(/\/(?:video|photo)\/(\d{8,})/i)?.[1] || '';
    } catch {
        return '';
    }
};

const scoreTikTokResourceUrl = (value: string) => {
    const lower = value.toLowerCase();
    let score = 0;
    if (/\.mp4(?:[?#]|$)/i.test(lower)) score += 60;
    if (/mime_type=video_|\/video\/tos\/|is_play_url=1|\/aweme\/v1\/play\//i.test(lower)) score += 45;
    if (/tokcdn|tiktokcdn|tiktokv|byteoversea|ibytedtos|muscdn|akamaized\.net/i.test(lower)) score += 25;
    if (/[?&]bytestart=\d+|[?&]byteend=\d+/i.test(lower)) score -= 20;
    if (/playwm|watermark|avatar|tos-[^/?]*-avt/i.test(lower)) score -= 50;
    return score;
};

const normalizeTikTokResourceItems = (items: TikTokResourceSnapshot[]) => {
    const seen = new Set<string>();
    return items
        .filter((item) => item?.url && TIKTOK_VIDEO_URL_RE.test(item.url) && !TIKTOK_AVATAR_RE.test(item.url))
        .filter((item) => {
            if (seen.has(item.url)) return false;
            seen.add(item.url);
            return true;
        })
        .sort((left, right) => (
            scoreTikTokResourceUrl(right.url) - scoreTikTokResourceUrl(left.url) ||
            (right.seenAt || 0) - (left.seenAt || 0)
        ))
        .slice(0, 12);
};

const scanTikTokTabResources = async (tabId: number) => {
    try {
        const response = await chrome.tabs.sendMessage(tabId, { type: 'FSV_SCAN_PAGE' } satisfies ExtensionMessage);
        const media = Array.isArray(response?.media) ? response.media : [];
        return media
            .filter((item: DetectedMedia) => item?.kind === 'video' && TIKTOK_VIDEO_URL_RE.test(item.url) && !TIKTOK_AVATAR_RE.test(item.url))
            .map((item: DetectedMedia) => ({
                url: item.url,
                thumbnailUrl: item.thumbnailUrl,
                seenAt: Date.now() + (Number(item.score) || 0),
            }));
    } catch {
        return [];
    }
};

const findTikTokResourceCandidates = async (pageUrl?: string, postId?: string) => {
    const targetPostId = postId || getTikTokPostIdFromUrl(pageUrl);
    const tabs = await chrome.tabs.query({});
    const tikTokTabs = tabs.filter((tab) => {
        const tabUrl = tab.url || '';
        if (!/^https?:\/\/([^/]+\.)?tiktok\.com\/|^https?:\/\/vt\.tiktok\.com\//i.test(tabUrl)) return false;
        if (!targetPostId) return true;
        return getTikTokPostIdFromUrl(tabUrl) === targetPostId || tabUrl.includes(targetPostId);
    });

    const items: TikTokResourceSnapshot[] = [];
    for (const tab of tikTokTabs) {
        if (tab.id === undefined) continue;
        items.push(...(tikTokResourceCache.get(tab.id) ?? []));
        items.push(...await scanTikTokTabResources(tab.id));
    }

    return normalizeTikTokResourceItems(items);
};

const upsertTikTokTabResource = (tabId: number, url: string, thumbnailUrl?: string) => {
    if (tabId < 0 || !TIKTOK_VIDEO_URL_RE.test(url) || TIKTOK_AVATAR_RE.test(url)) return;
    const items = tikTokResourceCache.get(tabId) ?? [];
    const existingIndex = items.findIndex((item) => item.url === url);
    const existing = existingIndex >= 0 ? items.splice(existingIndex, 1)[0] : undefined;
    items.unshift({
        url,
        thumbnailUrl: thumbnailUrl || existing?.thumbnailUrl,
        seenAt: Date.now(),
    });
    tikTokResourceCache.set(tabId, items);
};

const upsertInstagramTabResource = (tabId: number, url: string, thumbnailUrl?: string) => {
    if (tabId < 0 || !INSTAGRAM_HOST_RE.test(url) || !INSTAGRAM_VIDEO_URL_RE.test(url)) return;
    const items = instagramResourceCache.get(tabId) ?? [];
    const existingIndex = items.findIndex((item) => item.url === url);
    const existing = existingIndex >= 0 ? items.splice(existingIndex, 1)[0] : undefined;
    items.unshift({
        url,
        thumbnailUrl: thumbnailUrl || existing?.thumbnailUrl,
        seenAt: Date.now(),
    });
    instagramResourceCache.set(tabId, items);
};

chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        upsertTikTokTabResource(details.tabId, details.url);
        upsertInstagramTabResource(details.tabId, details.url);
    },
    {
        urls: [
            '*://*.tiktok.com/*',
            '*://*.tiktokcdn.com/*',
            '*://*.tiktokv.com/*',
            '*://*.tokcdn.com/*',
            '*://*.byteoversea.com/*',
            '*://*.ibytedtos.com/*',
            '*://*.muscdn.com/*',
            '*://*.akamaized.net/*',
            '*://*.instagram.com/*',
            '*://*.fbcdn.net/*',
            '*://*.cdninstagram.com/*',
        ],
        types: ['media', 'xmlhttprequest', 'other'],
    },
);

chrome.tabs.onRemoved.addListener((tabId) => {
    tikTokResourceCache.delete(tabId);
    instagramResourceCache.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'loading' && !changeInfo.url) return;
    const url = changeInfo.url || tab.url || '';
    if (/instagram\.com/i.test(url)) instagramResourceCache.delete(tabId);
    if (/tiktok\.com/i.test(url)) tikTokResourceCache.delete(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
    void chrome.storage.local.set({
        installedAt: new Date().toISOString(),
    });
});

const downloadInMainWorld = async (tabId: number, url: string, filename?: string, media?: DetectedMedia) => {
    const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        args: [url, filename, media?.kind],
        func: async (targetUrl: string, targetFilename?: string, mediaKind?: DetectedMedia['kind']) => {
            const matchesType = (value: string) => {
                const type = value.toLowerCase();
                if (!type || type === 'application/octet-stream') return true;
                if (mediaKind === 'video') return type.startsWith('video/');
                if (mediaKind === 'audio') return type.startsWith('audio/');
                if (mediaKind === 'image') return type.startsWith('image/');
                return true;
            };

            const isInstagramCdnUrl = (value: string) => /instagram|cdninstagram|fbcdn/i.test(value);
            const rangeKey = (value: string) => {
                try {
                    const parsed = new URL(value);
                    parsed.searchParams.delete('bytestart');
                    parsed.searchParams.delete('byteend');
                    return parsed.href;
                } catch {
                    return value.replace(/([?&])byte(?:start|end)=\d+/g, '');
                }
            };
            const rangeStart = (value: string) => {
                try {
                    return Number(new URL(value).searchParams.get('bytestart') || '0');
                } catch {
                    return 0;
                }
            };
            const isRangeUrl = (value: string) => /[?&]bytestart=\d+/i.test(value) || /[?&]byteend=\d+/i.test(value);

            const fetchBlob = async (candidateUrl: string) => {
                const response = await fetch(candidateUrl, {
                    credentials: isInstagramCdnUrl(candidateUrl) ? 'omit' : 'include',
                    cache: 'no-store',
                    referrer: window.location.href,
                });
                if (!response.ok) {
                    throw new Error(`Download failed with status ${response.status}.`);
                }

                const contentType = response.headers.get('content-type') || '';
                if (!matchesType(contentType)) {
                    throw new Error(`Unexpected content type: ${contentType || 'unknown'}.`);
                }

                const blob = await response.blob();
                if (!blob.size) {
                    throw new Error('Empty download payload.');
                }
                if (!matchesType(blob.type || contentType)) {
                    throw new Error(`Downloaded payload is not a ${mediaKind || 'media'} file.`);
                }
                return blob;
            };

            const fetchMergedByteRanges = async (candidateUrls: string[]) => {
                const groups = new Map<string, string[]>();
                for (const candidateUrl of candidateUrls.filter(isRangeUrl)) {
                    const key = rangeKey(candidateUrl);
                    groups.set(key, [...(groups.get(key) || []), candidateUrl]);
                }

                const orderedGroups = [...groups.values()]
                    .map((items) => items.sort((left, right) => rangeStart(left) - rangeStart(right)))
                    .sort((left, right) => right.length - left.length);

                for (const group of orderedGroups) {
                    if (!group.some((url) => rangeStart(url) === 0)) continue;
                    try {
                        const chunks = [];
                        let type = '';
                        for (const url of group) {
                            const chunk = await fetchBlob(url);
                            if (!type && chunk.type) type = chunk.type;
                            chunks.push(chunk);
                        }
                        const merged = new Blob(chunks, { type: type || 'video/mp4' });
                        if (merged.size) return merged;
                    } catch {
                        // Try the next range group.
                    }
                }
                return undefined;
            };

            const instagramVideoUrl = /\.(?:mp4|m4v)(?:[?#]|$)|\/v\/t\d+\.\d+-\d+\//i;
            const fallbackUrls = performance
                .getEntriesByType('resource')
                .filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming)
                .filter((entry) => /instagram|cdninstagram|fbcdn/i.test(entry.name) && instagramVideoUrl.test(entry.name))
                .sort((left, right) => right.startTime - left.startTime)
                .map((entry) => entry.name);

            const candidates = [targetUrl, ...fallbackUrls].filter((value, index, array) => value && array.indexOf(value) === index);
            const fullCandidates = candidates.filter((value) => !isRangeUrl(value));
            const rangeCandidates = candidates.filter(isRangeUrl);
            let blob: Blob | undefined;
            let lastError: unknown;
            for (const candidateUrl of fullCandidates) {
                try {
                    blob = await fetchBlob(candidateUrl);
                    break;
                } catch (error) {
                    lastError = error;
                }
            }
            if (!blob) {
                blob = await fetchMergedByteRanges(rangeCandidates);
            }
            if (!blob) {
                throw lastError instanceof Error ? lastError : new Error('Page-context download failed.');
            }

            const basename = targetFilename?.split('/').pop()?.trim() || 'download';
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = basename;
            link.style.display = 'none';
            document.body.append(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
            return { ok: true };
        },
    });

    if (!result?.result?.ok) {
        throw new Error('Page-context download failed.');
    }
};

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
    if (message.type === 'FSV_OPEN_FREESAVEVIDEO') {
        void chrome.tabs.create({ url: buildFreeSaveVideoUrl(message.url) });
    }
    if (message.type === 'FSV_DOWNLOAD_URL') {
        void downloadWithChrome(message);
    }
    if (message.type === 'FSV_PAGE_DOWNLOAD') {
        void downloadInMainWorld(message.tabId, message.url, message.filename, message.media)
            .then(() => sendResponse({ ok: true }))
            .catch((error) => {
                sendResponse({
                    ok: false,
                    error: error instanceof Error ? error.message : 'Unknown page download error.',
                });
            });
        return true;
    }
    if (message.type === 'FSV_FIND_TIKTOK_RESOURCE_CANDIDATES') {
        void findTikTokResourceCandidates(message.pageUrl, message.postId)
            .then((items) => sendResponse({ ok: true, items }))
            .catch((error) => sendResponse({
                ok: false,
                items: [],
                error: error instanceof Error ? error.message : 'TikTok candidate lookup failed.',
            }));
        return true;
    }
    if (message.type === 'FSV_GET_TIKTOK_RESOURCE_CACHE') {
        const tabId = sender.tab?.id;
        sendResponse({ ok: Boolean(tabId), items: tabId ? tikTokResourceCache.get(tabId) ?? [] : [] });
        return true;
    }
    if (message.type === 'FSV_GET_INSTAGRAM_RESOURCE_CACHE') {
        const tabId = sender.tab?.id;
        sendResponse({ ok: Boolean(tabId), items: tabId ? instagramResourceCache.get(tabId) ?? [] : [] });
        return true;
    }
    if (message.type === 'FSV_REMEMBER_TIKTOK_RESOURCE_THUMBNAIL') {
        const tabId = sender.tab?.id;
        if (tabId !== undefined) upsertTikTokTabResource(tabId, message.url, message.thumbnailUrl);
        sendResponse({ ok: tabId !== undefined });
        return true;
    }
    if (message.type === 'FSV_REMEMBER_INSTAGRAM_RESOURCE_THUMBNAIL') {
        const tabId = sender.tab?.id;
        if (tabId !== undefined) upsertInstagramTabResource(tabId, message.url, message.thumbnailUrl);
        sendResponse({ ok: tabId !== undefined });
        return true;
    }
    if (message.type === 'FSV_CLEAR_INSTAGRAM_RESOURCE_CACHE') {
        const tabId = sender.tab?.id;
        if (tabId !== undefined) instagramResourceCache.delete(tabId);
        sendResponse({ ok: tabId !== undefined });
        return true;
    }
    if (message.type === 'FSV_CAPTURE_VISIBLE_TAB') {
        if (!sender.tab?.windowId) {
            sendResponse({ ok: false, error: 'No sender tab window.' });
            return true;
        }
        chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'jpeg', quality: 72 }, (dataUrl) => {
            const error = chrome.runtime.lastError;
            if (error || !dataUrl) {
                sendResponse({ ok: false, error: error?.message || 'Capture failed.' });
                return;
            }
            sendResponse({ ok: true, dataUrl });
        });
        return true;
    }
    return false;
});
