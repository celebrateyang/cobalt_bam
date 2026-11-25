import type { PageLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';

import { getLocalizedLearnPage, learnSlugs } from '$lib/seo/learn-pages';
import { getLearnSeoLanguages } from '$lib/seo/learn-locales';
import { getLegacyRedirectTarget } from '$lib/seo/indexing';

export const prerender = true;

export const entries = () => [
    ...learnSlugs.flatMap((slug) => getLearnSeoLanguages(slug).map((lang) => ({ lang, slug }))),
    { lang: 'en', slug: 'cobalt-tools-savefrom-alternative' },
    { lang: 'en', slug: 'savefrom-tools-alternative' },
    { lang: 'zh', slug: 'savefrom-tools-alternative' },
];

export const load: PageLoad = async ({ params }) => {
    const target = getLegacyRedirectTarget(`/${params.lang}/learn/${params.slug}`);
    if (target) redirect(308, target);

    const article = getLocalizedLearnPage(params.slug, params.lang);
    if (!article) error(404, 'Not found');

    return {
        lang: params.lang,
        article,
    };
};
