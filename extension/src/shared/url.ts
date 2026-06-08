import { FREESAVEVIDEO_ORIGIN, YOUTUBE_HOST_RE } from './messages';

export const isHttpUrl = (value: string): boolean => {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
};

export const normalizeUrl = (value: string, baseUrl: string): string | null => {
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

export const isYouTubeUrl = (value: string): boolean => {
    try {
        return YOUTUBE_HOST_RE.test(new URL(value).hostname);
    } catch {
        return false;
    }
};

export const buildFreeSaveVideoUrl = (targetUrl: string): string => {
    const url = new URL('/en', FREESAVEVIDEO_ORIGIN);
    url.searchParams.set('url', targetUrl);
    url.searchParams.set('utm_source', 'chrome_extension');
    url.searchParams.set('utm_medium', 'extension');
    url.searchParams.set('utm_campaign', 'media_detect');
    return url.toString();
};
