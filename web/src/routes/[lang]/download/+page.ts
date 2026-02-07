import type { PageLoad } from './$types';

import { guidePages } from '$lib/seo/guide-pages';
import {
    getSeoLandingLocale,
    getSeoLandingPage,
    seoLandingSlugs,
} from '$lib/seo/landing-pages';

export const prerender = true;

const languages = ['en', 'zh', 'th', 'ru', 'ja', 'es', 'vi', 'ko', 'fr', 'de'];

export const entries = () => languages.map((lang) => ({ lang }));

export const load: PageLoad = async ({ params }) => {
    const cards = seoLandingSlugs
        .map((slug) => {
            const landing = getSeoLandingPage(slug);
            if (!landing) return null;
            const locale = getSeoLandingLocale(landing, params.lang);
            const guide = guidePages.find((item) => item.landingSlug === slug);

            return {
                slug,
                h1: locale.h1,
                lede: locale.lede,
                keywords: locale.metaKeywords.slice(0, 3),
                guideSlug: guide?.slug ?? null,
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.h1.localeCompare(b.h1, params.lang));

    return {
        lang: params.lang,
        cards,
    };
};
