import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';

import { getPreferredLanguage, getRequestCountry, isLangPrefixedPath } from '$lib/seo/language-routing';

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

    if (
        (event.request.method === 'GET' || event.request.method === 'HEAD') &&
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

    // Apply COOP/COEP headers to enable SharedArrayBuffer for libav
    // Exclude the youtube-video-downloader page which contains a Bilibili iframe that would be blocked
    if (!pathname.includes('youtube-video-downloader')) {
        response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    }

    return response;
};
