import type { PageLoad } from './$types';

import { guidePages } from '$lib/seo/guide-pages';
import { getGuidePriority } from '$lib/seo/internal-links';
import { getSeoLandingLocale, getSeoLandingPage } from '$lib/seo/landing-pages';

export const prerender = true;

const languages = ['en', 'zh', 'th', 'ru', 'ja', 'es', 'vi', 'ko', 'fr', 'de'];

export const entries = () => languages.map((lang) => ({ lang }));

export const load: PageLoad = async ({ params }) => {
    const guides = guidePages
        .map((guide) => {
            const landing = getSeoLandingPage(guide.landingSlug);
            if (!landing) return null;
            const locale = getSeoLandingLocale(landing, params.lang);
            return {
                slug: guide.slug,
                landingSlug: guide.landingSlug,
                platform: guide.platform,
                title: locale.h1,
                lede: locale.lede,
            };
        })
        .filter(Boolean)
        .sort((a, b) => {
            const priorityDiff = getGuidePriority(a.slug) - getGuidePriority(b.slug);
            return priorityDiff !== 0 ? priorityDiff : a.title.localeCompare(b.title, params.lang);
        });

    return {
        lang: params.lang,
        guides,
    };
};
