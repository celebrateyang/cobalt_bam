export const YOUTUBE_HOST_RE = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i;

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
