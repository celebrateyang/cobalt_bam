import type { PageLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';

import { guidePages } from '$lib/seo/guide-pages';
import { getSeoLandingPage, seoLandingSlugs } from '$lib/seo/landing-pages';
import {
    getRelatedDownloadLinks,
} from '$lib/seo/internal-links';
import { getRelatedLearnPagesForDownload } from '$lib/seo/learn-pages';
import {
    getDownloadSeoLanguages,
    getPreferredSeoLanguage,
} from '$lib/seo/route-locales';

export const prerender = true;

export const entries = () => {
    return seoLandingSlugs.flatMap((slug) =>
        getDownloadSeoLanguages(slug).map((lang) => ({ lang, slug })),
    );
};

export const load: PageLoad = async ({ params }) => {
    const landing = getSeoLandingPage(params.slug);
    if (!landing) error(404, 'Not found');

    const availableLanguages = getDownloadSeoLanguages(params.slug);
    if (!availableLanguages.includes(params.lang)) {
        const lang = getPreferredSeoLanguage(availableLanguages);
        redirect(308, `/${lang}/download/${params.slug}`);
    }

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
