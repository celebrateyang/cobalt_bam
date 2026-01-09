import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

import { getSeoLandingPage, seoLandingSlugs } from '$lib/seo/landing-pages';

export const prerender = true;

export const entries = () => {
    const languages = ['en', 'zh', 'th', 'ru', 'ja', 'es', 'vi', 'ko', 'fr', 'de'];
    return languages.flatMap((lang) => seoLandingSlugs.map((slug) => ({ lang, slug })));
};

export const load: PageLoad = async ({ params }) => {
    const landing = getSeoLandingPage(params.slug);
    if (!landing) error(404, 'Not found');

    return {
        lang: params.lang,
        slug: params.slug,
        landing,
    };
};

