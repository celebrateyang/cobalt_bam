import type { AdapterResult, DetectedMedia } from '../adapters/types';

const extensionFromUrl = (value: string) => {
    try {
        const match = new URL(value).pathname.match(/\.([a-z0-9]{2,5})$/i);
        return match?.[1].toLowerCase();
    } catch {
        return undefined;
    }
};

export const extensionFor = (item: DetectedMedia) => {
    const format = item.format?.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (format === 'hls') return 'm3u8';
    if (format === 'dash') return 'mpd';
    if (format === 'm4s') return 'mp4';
    return format || extensionFromUrl(item.url) || (item.kind === 'image' ? 'jpg' : 'mp4');
};

export const safeFilenamePart = (value: string) =>
    value
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100) || 'download';

export const buildDownloadFilename = (result: Pick<AdapterResult, 'pageTitle'>, item: DetectedMedia) => {
    if (item.filename) {
        return `FreeSaveVideo/${safeFilenamePart(item.filename)}`;
    }
    const title = safeFilenamePart(result.pageTitle || item.label || 'download');
    const suffix = item.qualityLabel ? `-${safeFilenamePart(item.qualityLabel)}` : '';
    return `FreeSaveVideo/${title}${suffix}.${extensionFor(item)}`;
};

export const sanitizeDownloadPath = (value?: string) => {
    const fallback = 'FreeSaveVideo/download';
    if (!value) return fallback;
    const cleaned = value
        .replace(/[<>:"\\|?*\x00-\x1f]/g, '_')
        .replace(/^\/+/, '')
        .replace(/\/{2,}/g, '/')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned || fallback;
};
