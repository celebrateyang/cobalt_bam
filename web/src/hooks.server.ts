import { redirect } from '@sveltejs/kit';
import type { Handle, RequestEvent } from '@sveltejs/kit';

const supportedLanguages = ['en', 'zh', 'th', 'ru', 'ja', 'es', 'vi', 'ko', 'fr', 'de'] as const;
type SupportedLanguage = (typeof supportedLanguages)[number];

const defaultLanguage: SupportedLanguage = 'en';

const isLangPrefixedPath = (pathname: string) =>
    supportedLanguages.some(lang => pathname === `/${lang}` || pathname.startsWith(`/${lang}/`));

const getPreferredLanguage = (event: RequestEvent): SupportedLanguage => {
    const cookieLang = event.cookies.get('preferred-language');
    if (cookieLang && supportedLanguages.includes(cookieLang as SupportedLanguage)) {
        return cookieLang as SupportedLanguage;
    }

    const acceptLanguage = event.request.headers.get('accept-language');
    if (acceptLanguage) {
        const languages = acceptLanguage
            .split(',')
            .map((lang: string) => {
                const [code, weight] = lang.split(';q=');
                return {
                    code: code.trim().split('-')[0].toLowerCase(),
                    weight: weight ? parseFloat(weight) : 1.0
                };
            })
            .sort((a: { weight: number }, b: { weight: number }) => b.weight - a.weight);

        for (const lang of languages) {
            if (supportedLanguages.includes(lang.code as SupportedLanguage)) {
                return lang.code as SupportedLanguage;
            }
        }
    }

    return defaultLanguage;
};

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
        throw redirect(302, `/${getPreferredLanguage(event)}${pathname}`);
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
