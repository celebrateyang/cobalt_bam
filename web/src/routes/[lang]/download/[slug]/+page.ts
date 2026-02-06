import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

import { getSeoLandingPage, seoLandingSlugs } from '$lib/seo/landing-pages';
import { guidePages } from '$lib/seo/guide-pages';

export const prerender = true;

export const entries = () => {
    const languages = ['en', 'zh', 'th', 'ru', 'ja', 'es', 'vi', 'ko', 'fr', 'de'];
    return languages.flatMap((lang) => seoLandingSlugs.map((slug) => ({ lang, slug })));
};

export const load: PageLoad = async ({ params }) => {
    const landing = getSeoLandingPage(params.slug);
    if (!landing) error(404, 'Not found');

    const guide = guidePages.find((item) => item.landingSlug === params.slug);
    const relatedPages = seoLandingSlugs
        .filter((slug) => slug !== params.slug)
        .map((slug) => getSeoLandingPage(slug))
        .filter((page): page is NonNullable<typeof page> => Boolean(page))
        .slice(0, 6);

    return {
        lang: params.lang,
        slug: params.slug,
        landing,
        guideSlug: guide?.slug ?? null,
        relatedPages,
    };
};
