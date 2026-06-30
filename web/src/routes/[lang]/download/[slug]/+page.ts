import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

import { guidePages } from '$lib/seo/guide-pages';
import { getSeoLandingPage, seoLandingSlugs } from '$lib/seo/landing-pages';
import { getRelatedDownloadLinks, isInternationalDownloadSlug } from '$lib/seo/internal-links';
import { getRelatedLearnPagesForDownload } from '$lib/seo/learn-pages';

export const prerender = true;

export const entries = () => {
    const languages = ['en', 'zh', 'th', 'ru', 'ja', 'es', 'vi', 'ko', 'fr', 'de'];
    return languages.flatMap((lang) =>
        seoLandingSlugs
            .filter((slug) => lang !== 'en' || isInternationalDownloadSlug(slug))
            .map((slug) => ({ lang, slug })),
    );
};

export const load: PageLoad = async ({ params }) => {
    if (params.lang === 'en' && !isInternationalDownloadSlug(params.slug)) {
        error(404, 'Not found');
    }

    const landing = getSeoLandingPage(params.slug);
    if (!landing) error(404, 'Not found');

    const linkAudience = params.lang === 'en' ? 'international' : 'all';
    const guide = guidePages.find((item) => item.landingSlug === params.slug);
    const relatedPages = getRelatedDownloadLinks(params.slug, 6, linkAudience)
        .map((item) => getSeoLandingPage(item.slug))
        .filter((page): page is NonNullable<typeof page> => Boolean(page));
    const relatedLearnPages =
        params.lang === 'en' ? getRelatedLearnPagesForDownload(params.slug, 4) : [];

    return {
        lang: params.lang,
        slug: params.slug,
        landing,
        guideSlug: guide?.slug ?? null,
        relatedPages,
        relatedLearnPages,
    };
};
