import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';

import { getPreferredLanguage, getRequestCountry, isLangPrefixedPath } from '$lib/seo/language-routing';
import {
    getLegacyRedirectTarget,
    getLocalizedRoute,
    shouldNoindexLocalizedPath,
} from '$lib/seo/indexing';

const shouldSkipLangRedirect = (pathname: string) => {
    if (pathname === '/') return true;
    if (pathname === '/sitemap.xml') return true;
    if (pathname === '/version.json') return true;
    if (pathname.startsWith('/api')) return true;
    if (pathname.startsWith('/_app')) return true;
    if (pathname.startsWith('/cdn-cgi')) return true;

    const lastSegment = pathname.split('/').at(-1) ?? '';
    if (lastSegment.includes('.')) return true;

    return false;
};

export const handle: Handle = async ({ event, resolve }) => {
    const pathname = event.url.pathname;
    const isNavigationRequest =
        event.request.method === 'GET' || event.request.method === 'HEAD';

    if (isNavigationRequest) {
        const legacyRedirectTarget = getLegacyRedirectTarget(pathname);
        if (legacyRedirectTarget) throw redirect(308, legacyRedirectTarget);
    }

    if (
        isNavigationRequest &&
        !shouldSkipLangRedirect(pathname) &&
        !isLangPrefixedPath(pathname)
    ) {
        throw redirect(302, `/${getPreferredLanguage({
            cookieHeader: event.request.headers.get('cookie'),
            acceptLanguage: event.request.headers.get('accept-language'),
            country: getRequestCountry(event.request),
            userAgent: event.request.headers.get('user-agent'),
        })}${pathname}`);
    }

    const response = await resolve(event);
    const localizedRoute = getLocalizedRoute(pathname);
    if (
        localizedRoute &&
        shouldNoindexLocalizedPath(localizedRoute.path, localizedRoute.lang)
    ) {
        response.headers.set('X-Robots-Tag', 'noindex, follow');
    }

    // Apply COOP/COEP headers to enable SharedArrayBuffer for libav.
    // Third-party embeds and payment SDKs need normal cross-origin behavior.
    const isAccountPage = /^\/[a-z]{2}\/account(?:\/|$)/.test(pathname);
    if (!pathname.includes('youtube-video-downloader') && !isAccountPage) {
        response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    }

    return response;
};
