import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

import { guidePages } from '$lib/seo/guide-pages';
import { getSeoLandingPage, seoLandingSlugs } from '$lib/seo/landing-pages';
import { getRelatedDownloadLinks } from '$lib/seo/internal-links';

export const prerender = true;

export const entries = () => {
    const languages = ['en', 'zh', 'th', 'ru', 'ja', 'es', 'vi', 'ko', 'fr', 'de'];
    return languages.flatMap((lang) => seoLandingSlugs.map((slug) => ({ lang, slug })));
};

export const load: PageLoad = async ({ params }) => {
    const landing = getSeoLandingPage(params.slug);
    if (!landing) error(404, 'Not found');

    const guide = guidePages.find((item) => item.landingSlug === params.slug);
    const relatedPages = getRelatedDownloadLinks(params.slug, 6)
        .map((item) => getSeoLandingPage(item.slug))
        .filter((page): page is NonNullable<typeof page> => Boolean(page));

    return {
        lang: params.lang,
        slug: params.slug,
        landing,
        guideSlug: guide?.slug ?? null,
        relatedPages,
    };
};
