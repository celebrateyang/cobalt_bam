import type { PageLoad } from './$types';

export const prerender = true;

export const entries = () => {
    const languages = ['en', 'zh', 'th', 'ru', 'ja', 'es', 'vi', 'ko', 'fr', 'de'];
    return languages.map(lang => ({ lang }));
};

export const load: PageLoad = async ({ params, url }) => {
    const { loadTranslations } = await import('$lib/i18n/translations');
    // Load the namespace plus the current pathname (mirrors other routes)
    await loadTranslations(params.lang, ['tampermonkey', url.pathname]);
    return { lang: params.lang };
};
