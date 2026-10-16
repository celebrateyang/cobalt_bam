export const normalizeTikTokShortLinkAlias = (url) => {
    if (
        ["http:", "https:"].includes(url.protocol)
        && ["tt.site", "www.tt.site"].includes(url.hostname)
        && /^\/t\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
    ) {
        // The same share code resolves on TikTok even when tt.site returns 502.
        const canonical = new URL(url.toString());
        canonical.hostname = "www.tiktok.com";
        return canonical;
    }
    return url;
};
