import { getPreferredLanguage, getRequestCountry } from '../src/lib/seo/language-routing';

export const onRequest: PagesFunction = async ({ request }) => {
    const url = new URL(request.url);

    // Only handle the site root; everything else is served statically.
    if (url.pathname !== '/') {
        return fetch(request);
    }

    const lang = getPreferredLanguage({
        cookieHeader: request.headers.get('cookie'),
        acceptLanguage: request.headers.get('accept-language'),
        country: getRequestCountry(request),
        userAgent: request.headers.get('user-agent'),
    });

    const target = new URL(`/${lang}/`, url);
    target.search = url.search;
    return Response.redirect(target.toString(), 302);
};
