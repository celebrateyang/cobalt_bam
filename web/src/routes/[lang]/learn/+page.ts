import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

import { learnPages, getLocalizedLearnPage } from '$lib/seo/learn-pages';
import { getLearnSeoLanguages, localizedAlternativeSlugs } from '$lib/seo/learn-locales';

export const prerender = true;

export const entries = () => getLearnSeoLanguages().map((lang) => ({ lang }));

export const load: PageLoad = async ({ params }) => {
    if (!getLearnSeoLanguages().includes(params.lang)) {
        error(404, 'Not found');
    }

    return {
        lang: params.lang,
        pages: params.lang === 'en' ? learnPages : localizedAlternativeSlugs
            .map((slug) => getLocalizedLearnPage(slug, params.lang))
            .filter((page): page is NonNullable<typeof page> => Boolean(page)),
    };
};
