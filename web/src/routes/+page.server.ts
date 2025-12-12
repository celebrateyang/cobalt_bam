import { redirect } from '@sveltejs/kit';
import type { PageServerLoadEvent } from './$types';

const supportedLanguages = ['en', 'zh', 'th', 'ru', 'ja', 'es', 'vi', 'ko', 'fr', 'de'];
const defaultLanguage = 'en';

export const load = ({ request, cookies }: PageServerLoadEvent) => {
    // 1. Check cookie preference
    const cookieLang = cookies.get('preferred-language');
    if (cookieLang && supportedLanguages.includes(cookieLang)) {
        throw redirect(302, `/${cookieLang}`);
    }

    // 2. Check header preference
    const acceptLanguage = request.headers.get('accept-language');
    if (acceptLanguage) {
        // Simple parser for accept-language header
        // e.g. "en-US,en;q=0.9,zh-CN;q=0.8"
        const languages = acceptLanguage.split(',').map((lang: string) => {
            const [code, weight] = lang.split(';q=');
            return {
                code: code.trim().split('-')[0].toLowerCase(),
                weight: weight ? parseFloat(weight) : 1.0
            };
        }).sort((a: { weight: number }, b: { weight: number }) => b.weight - a.weight);

        for (const lang of languages) {
            if (supportedLanguages.includes(lang.code)) {
                throw redirect(302, `/${lang.code}`);
            }
        }
    }

    // 3. Fallback to default
    throw redirect(302, `/${defaultLanguage}`);
};
