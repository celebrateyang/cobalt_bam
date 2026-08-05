import type { PageLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';

import { guideSlugs, getGuidePage } from '$lib/seo/guide-pages';
import { getSeoLandingPage } from '$lib/seo/landing-pages';
import {
    getGuideSeoLanguages,
    getPreferredSeoLanguage,
} from '$lib/seo/route-locales';

export const prerender = true;

export const entries = () =>
    guideSlugs.flatMap((slug) =>
        getGuideSeoLanguages(slug).map((lang) => ({ lang, slug })),
    );

export const load: PageLoad = async ({ params }) => {
    const guide = getGuidePage(params.slug);
    if (!guide) error(404, 'Not found');

    const availableLanguages = getGuideSeoLanguages(params.slug);
    if (!availableLanguages.includes(params.lang)) {
        const lang = getPreferredSeoLanguage(availableLanguages);
        redirect(308, `/${lang}/guide/${params.slug}`);
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
