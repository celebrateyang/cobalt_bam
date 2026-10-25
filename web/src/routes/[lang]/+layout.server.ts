import type { LayoutServerLoad } from './$types';
import { error } from '@sveltejs/kit';

import languages from '$i18n/languages.json';
import { isPersianAparatPath } from '$lib/seo/scoped-locales';

const supportedLanguages = Object.keys(languages);

export const load: LayoutServerLoad = async ({ params, url }) => {
    const { lang } = params;

    // If the language is not supported, return 404 instead of redirecting to home
    if (!supportedLanguages.includes(lang) && !isPersianAparatPath(url.pathname)) {
        throw error(404, 'Not found');
    }

    return {
        lang
    };
};
