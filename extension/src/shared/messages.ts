import type { AdapterResult, DetectedMedia, InstagramResourceSnapshot, TikTokResourceSnapshot } from '../adapters/types';
export type { AdapterResult, AdapterStatus, DetectedMedia, MediaKind, PlatformId } from '../adapters/types';

export type PageScanResult = AdapterResult;

export type ExtensionMessage =
    | { type: 'FSV_SCAN_PAGE' }
    | { type: 'FSV_SCAN_RESULT'; result: PageScanResult }
    | { type: 'FSV_OPEN_FREESAVEVIDEO'; url: string }
    | { type: 'FSV_DOWNLOAD_URL'; url: string; filename?: string; media?: DetectedMedia }
    | { type: 'FSV_PAGE_DOWNLOAD'; tabId: number; url: string; filename?: string; media?: DetectedMedia }
    | { type: 'FSV_FIND_TIKTOK_RESOURCE_CANDIDATES'; pageUrl?: string; postId?: string }
    | { type: 'FSV_GET_TIKTOK_RESOURCE_CACHE' }
    | { type: 'FSV_REMEMBER_TIKTOK_RESOURCE_THUMBNAIL'; url: string; thumbnailUrl: string }
    | { type: 'FSV_GET_INSTAGRAM_RESOURCE_CACHE' }
    | { type: 'FSV_REMEMBER_INSTAGRAM_RESOURCE_THUMBNAIL'; url: string; thumbnailUrl: string }
    | { type: 'FSV_CLEAR_INSTAGRAM_RESOURCE_CACHE' }
    | { type: 'FSV_CAPTURE_VISIBLE_TAB' }
    | { type: 'FSV_COPY_TO_CLIPBOARD'; text: string };

export type TikTokResourceCacheResponse = {
    ok: boolean;
    items?: TikTokResourceSnapshot[];
};

export type TikTokResourceCandidateResponse = {
    ok: boolean;
    items?: TikTokResourceSnapshot[];
    error?: string;
};

export type InstagramResourceCacheResponse = {
    ok: boolean;
    items?: InstagramResourceSnapshot[];
};

export type CaptureVisibleTabResponse = {
    ok: boolean;
    dataUrl?: string;
    error?: string;
};

export const FREESAVEVIDEO_ORIGIN = 'https://freesavevideo.online';

export const YOUTUBE_HOST_RE = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i;
