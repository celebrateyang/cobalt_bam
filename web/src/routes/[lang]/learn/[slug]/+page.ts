import type { PageLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';

import { getLearnPage, learnSlugs } from '$lib/seo/learn-pages';
import { getLegacyRedirectTarget } from '$lib/seo/indexing';

export const prerender = true;

export const entries = () => [
    ...learnSlugs.map((slug) => ({ lang: 'en', slug })),
    { lang: 'en', slug: 'cobalt-tools-savefrom-alternative' },
];

export const load: PageLoad = async ({ params }) => {
    if (params.lang !== 'en') {
        error(404, 'Not found');
    }

    const target = getLegacyRedirectTarget(`/${params.lang}/learn/${params.slug}`);
    if (target) redirect(308, target);

    const article = getLearnPage(params.slug);
    if (!article) error(404, 'Not found');

    return {
        lang: params.lang,
        article,
    };
};
