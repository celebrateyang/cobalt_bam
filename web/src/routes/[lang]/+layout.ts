import type { LayoutLoad } from './$types';
import { loadTranslations } from '$lib/i18n/translations';

export const prerender = 'auto';
export const ssr = true;

export const load: LayoutLoad = async ({ params, url, data }) => {
    const { lang } = params;
    const { pathname } = url;

    // Load translations for the current language
    await loadTranslations(lang, pathname);

    return {
        ...data,
        lang
    };
};
