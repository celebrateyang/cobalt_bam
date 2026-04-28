import type { PageLoad } from './$types';

export const prerender = true;

export const entries = () => {
    const languages = ['en', 'zh', 'th', 'ru', 'ja', 'es', 'vi', 'ko', 'fr', 'de'];
    return languages.map((lang) => ({ lang }));
};

export const load: PageLoad = async ({ params }) => ({
    lang: params.lang,
});
