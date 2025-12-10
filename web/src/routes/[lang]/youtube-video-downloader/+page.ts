import type { PageLoad } from './$types';

export const prerender = true;

export const entries = () => {
    const languages = ['en', 'zh', 'th', 'ru', 'ja', 'es', 'vi', 'ko', 'fr', 'de'];
    return languages.map(lang => ({ lang }));
};

export const load: PageLoad = async ({ params }) => {
    const { loadTranslations } = await import('$lib/i18n/translations');
    await loadTranslations(params.lang, ['tampermonkey']);
    return { lang: params.lang };
};
