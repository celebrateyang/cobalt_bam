export type MediaKind = 'video' | 'audio' | 'image' | 'playlist' | 'subtitle' | 'link';

export type DetectedMedia = {
    id: string;
    kind: MediaKind;
    url: string;
    label: string;
    source: string;
    format?: string;
    sizeLabel?: string;
    qualityLabel?: string;
    thumbnailUrl?: string;
};

export type PageScanResult = {
    pageUrl: string;
    pageTitle: string;
    hostname: string;
    isYouTube: boolean;
    media: DetectedMedia[];
};

export type ExtensionMessage =
    | { type: 'FSV_SCAN_PAGE' }
    | { type: 'FSV_SCAN_RESULT'; result: PageScanResult }
    | { type: 'FSV_OPEN_FREESAVEVIDEO'; url: string }
    | { type: 'FSV_COPY_TO_CLIPBOARD'; text: string };

export const FREESAVEVIDEO_ORIGIN = 'https://freesavevideo.online';

export const YOUTUBE_HOST_RE = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i;
