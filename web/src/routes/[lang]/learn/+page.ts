import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

import { learnPages } from '$lib/seo/learn-pages';

export const prerender = true;

export const entries = () => [{ lang: 'en' }];

export const load: PageLoad = async ({ params }) => {
    if (params.lang !== 'en') {
        error(404, 'Not found');
    }

    return {
        lang: params.lang,
        pages: learnPages,
    };
};
