import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

import { getLearnPage, learnSlugs } from '$lib/seo/learn-pages';

export const prerender = true;

export const entries = () => learnSlugs.map((slug) => ({ lang: 'en', slug }));

export const load: PageLoad = async ({ params }) => {
    if (params.lang !== 'en') {
        error(404, 'Not found');
    }

    const article = getLearnPage(params.slug);
    if (!article) error(404, 'Not found');

    return {
        lang: params.lang,
        article,
    };
};
