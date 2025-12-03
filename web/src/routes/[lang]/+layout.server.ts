import type { LayoutServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';

import languages from '$i18n/languages.json';

const supportedLanguages = Object.keys(languages);

export const load: LayoutServerLoad = async ({ params, url }) => {
    const { lang } = params;

    // Validate language parameter
    if (!supportedLanguages.includes(lang)) {
        // Redirect to English version if language is not supported
        throw redirect(302, `/en${url.pathname.replace(/^\/[^/]+/, '')}`);
    }

    return {
        lang
    };
};
