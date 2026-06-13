import type { AdapterResult, DetectedMedia } from '../adapters/types';
export type { AdapterResult, AdapterStatus, DetectedMedia, MediaKind, PlatformId } from '../adapters/types';

export type PageScanResult = AdapterResult;

export type ExtensionMessage =
    | { type: 'FSV_SCAN_PAGE' }
    | { type: 'FSV_SCAN_RESULT'; result: PageScanResult }
    | { type: 'FSV_OPEN_FREESAVEVIDEO'; url: string }
    | { type: 'FSV_DOWNLOAD_URL'; url: string; filename?: string; media?: DetectedMedia }
    | { type: 'FSV_COPY_TO_CLIPBOARD'; text: string };

export const FREESAVEVIDEO_ORIGIN = 'https://freesavevideo.online';

export const YOUTUBE_HOST_RE = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i;
