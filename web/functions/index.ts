const supportedLanguages = ['en', 'zh', 'th', 'ru', 'ja', 'es', 'vi', 'ko', 'fr', 'de'];
const defaultLanguage = 'en';

function getCookieLanguage(header: string | null): string | null {
    if (!header) return null;
    const match = header.match(/(?:^|;)\\s*preferred-language=([^;]+)/i);
    if (!match) return null;
    const value = decodeURIComponent(match[1]);
    return supportedLanguages.includes(value) ? value : null;
}

function getAcceptLanguage(header: string | null): string | null {
    if (!header) return null;

    const languages = header
        .split(',')
        .map((part) => {
            const [codePart, qPart] = part.trim().split(';q=');
            const code = codePart.split('-')[0].toLowerCase();
            const quality = qPart ? parseFloat(qPart) : 1.0;
            return { code, quality: Number.isFinite(quality) ? quality : 0 };
        })
        .sort((a, b) => b.quality - a.quality);

    for (const { code } of languages) {
        if (supportedLanguages.includes(code)) return code;
    }

    return null;
}

export const onRequest: PagesFunction = async ({ request }) => {
    const url = new URL(request.url);

    // Only handle the site root; everything else is served statically
    if (url.pathname !== '/') {
        return fetch(request);
    }

    const cookieLanguage = getCookieLanguage(request.headers.get('cookie'));
    if (cookieLanguage) {
        const target = new URL(`/${cookieLanguage}/`, url);
        target.search = url.search; // preserve query string if present
        return Response.redirect(target.toString(), 302);
    }

    const headerLanguage = getAcceptLanguage(request.headers.get('accept-language'));
    const lang = headerLanguage ?? defaultLanguage;

    const target = new URL(`/${lang}/`, url);
    target.search = url.search;
    return Response.redirect(target.toString(), 302);
};
