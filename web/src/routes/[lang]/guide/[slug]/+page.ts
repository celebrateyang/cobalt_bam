import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

import { guideSlugs, getGuidePage } from '$lib/seo/guide-pages';
import { getSeoLandingPage } from '$lib/seo/landing-pages';
import { isInternationalDownloadSlug } from '$lib/seo/internal-links';

export const prerender = true;

const languages = ['en', 'zh', 'th', 'ru', 'ja', 'es', 'vi', 'ko', 'fr', 'de'];

export const entries = () =>
    languages.flatMap((lang) =>
        guideSlugs
            .map((slug) => {
                const guide = getGuidePage(slug);
                if (!guide) return null;
                if (lang === 'en' && !isInternationalDownloadSlug(guide.landingSlug)) {
                    return null;
                }
                return { lang, slug };
            })
            .filter((entry): entry is { lang: string; slug: string } => Boolean(entry)),
    );

export const load: PageLoad = async ({ params }) => {
    const guide = getGuidePage(params.slug);
    if (!guide) error(404, 'Not found');
    if (params.lang === 'en' && !isInternationalDownloadSlug(guide.landingSlug)) {
        error(404, 'Not found');
    }

    const landing = getSeoLandingPage(guide.landingSlug);
    if (!landing) error(404, 'Not found');

    return {
        lang: params.lang,
        slug: params.slug,
        guide,
        landing,
    };
};
