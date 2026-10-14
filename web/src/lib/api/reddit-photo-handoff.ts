const metadataErrors = new Set([
    'error.api.fetch.empty',
    'error.api.fetch.fail',
    'error.api.fetch.short_link',
    'error.api.upstream.incomplete',
    'error.api.upstream.circuit_open',
]);

export const safeRedditPostUrl = (value: string): string | null => {
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port
            || !(url.hostname === 'reddit.com' || url.hostname.endsWith('.reddit.com') || url.hostname === 'redd.it')) return null;
        url.protocol = 'https:';
        return url.toString();
    } catch {
        return null;
    }
};

export const redditPhotoHandoff = (
    sourceUrl: string,
    response?: { status: string; error?: { code: string } },
): 'confirmed' | 'possible' | null => {
    const safeUrl = safeRedditPostUrl(sourceUrl);
    if (!safeUrl) return null;
    if (!response && /^\/gallery\/[a-z0-9]{1,16}\/?$/i.test(new URL(safeUrl).pathname)) return 'confirmed';
    if (response?.status !== 'error') return null;
    if (response.error?.code === 'error.api.reddit.browser_required') return 'confirmed';
    return response.error?.code && metadataErrors.has(response.error.code) ? 'possible' : null;
};
