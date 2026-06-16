import { redirect } from '@sveltejs/kit';
import type { PageServerLoadEvent } from './$types';

import { getPreferredLanguage, getRequestCountry } from '$lib/seo/language-routing';

export const load = ({ request, cookies }: PageServerLoadEvent) => {
    const cookieLang = cookies.get('preferred-language');
    const lang = getPreferredLanguage({
        cookieHeader: cookieLang ? `preferred-language=${encodeURIComponent(cookieLang)}` : request.headers.get('cookie'),
        acceptLanguage: request.headers.get('accept-language'),
        country: getRequestCountry(request),
        userAgent: request.headers.get('user-agent'),
    });

    throw redirect(302, `/${lang}`);
};
