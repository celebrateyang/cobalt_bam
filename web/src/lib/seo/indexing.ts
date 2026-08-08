import { publicNoindexPaths, supportedSeoLanguages } from '$lib/seo/site';

const supportedLanguageSet = new Set<string>(supportedSeoLanguages);

const normalizePath = (path: string): string => {
    if (path !== '/' && path.endsWith('/')) return path.replace(/\/+$/, '');
    return path;
};

const isPathOrDescendant = (path: string, base: string): boolean =>
    path === base || path.startsWith(`${base}/`);

export const shouldNoindexLocalizedPath = (path: string, lang: string): boolean => {
    const normalizedPath = normalizePath(path || '/');

    if (publicNoindexPaths.some((base) => isPathOrDescendant(normalizedPath, base))) {
        return true;
    }

    // These pages remain publicly accessible for trust, support, and compliance,
    // but their localized variants are not useful search landing pages.
    if (isPathOrDescendant(normalizedPath, '/about') || normalizedPath === '/support') {
        return true;
    }

    // Only the English support hubs are intentionally included in the sitemap.
    return lang !== 'en' && (normalizedPath === '/faq' || normalizedPath === '/guide');
};

export const getLegacyRedirectTarget = (pathname: string): string | null => {
    const normalizedPathname = normalizePath(pathname);
    const match = normalizedPathname.match(/^\/([^/]+)(\/.*)?$/);
    if (!match || !supportedLanguageSet.has(match[1])) return null;

    const lang = match[1];
    const localizedPath = match[2] || '';

    if (localizedPath === '/about') return `/${lang}/about/general`;
    if (localizedPath === '/about/community') return `/${lang}/support`;
    if (localizedPath === '/about/credits') return `/${lang}/about/general`;

    return null;
};

export const getLocalizedRoute = (
    pathname: string,
): { lang: string; path: string } | null => {
    const normalizedPathname = normalizePath(pathname);
    const match = normalizedPathname.match(/^\/([^/]+)(\/.*)?$/);
    if (!match || !supportedLanguageSet.has(match[1])) return null;

    return {
        lang: match[1],
        path: match[2] || '/',
    };
};
