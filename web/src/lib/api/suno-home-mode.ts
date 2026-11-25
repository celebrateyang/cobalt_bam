import type { CobaltSaveRequestBody } from '$lib/types/api';

/** The homepage's automatic mode should favor music for Suno song links. */
export function sunoHomeDownloadMode(url: string, mode: CobaltSaveRequestBody['downloadMode']): CobaltSaveRequestBody['downloadMode'] {
    // The request omits default settings, so undefined also means automatic.
    if (mode !== 'auto' && mode !== undefined) return mode;
    try {
        const value = url.trim();
        const parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
        if (!['http:', 'https:'].includes(parsed.protocol) || !['suno.com', 'www.suno.com'].includes(parsed.hostname.toLowerCase()) || parsed.username || parsed.password || parsed.port) return mode;
        if (/^\/(?:s\/[a-z0-9]{1,64}|song\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/?$/i.test(parsed.pathname)) return 'audio';
    } catch { /* Preserve the user's mode for invalid or unrelated URLs. */ }
    return mode;
}
