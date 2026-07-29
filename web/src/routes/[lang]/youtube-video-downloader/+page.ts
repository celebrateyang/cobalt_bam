import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const prerender = true;

export const entries = () => {
    const languages = ['en', 'zh', 'th', 'ru', 'ja', 'es', 'vi', 'ko', 'fr', 'de'];
    return languages.map(lang => ({ lang }));
};

export const load: PageLoad = ({ params }) => {
    redirect(308, `/${params.lang}/download/youtube-download`);
};
