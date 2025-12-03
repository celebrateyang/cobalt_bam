import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';

const supportedLanguages = ['en', 'zh', 'th', 'ru'];
const defaultLanguage = 'en';

export const GET: RequestHandler = async ({ request, cookies }) => {
    // Check if user has a language preference saved
    const savedLanguage = cookies.get('preferred-language');
    if (savedLanguage && supportedLanguages.includes(savedLanguage)) {
        throw redirect(302, `/${savedLanguage}`);
    }

    // Parse Accept-Language header
    const acceptLanguage = request.headers.get('accept-language');
    
    if (acceptLanguage) {
        // Parse accept-language header (e.g., "zh-CN,zh;q=0.9,en;q=0.8")
        const languages = acceptLanguage
            .split(',')
            .map(lang => {
                const [code, qValue] = lang.trim().split(';q=');
                const langCode = code.split('-')[0].toLowerCase(); // Get primary language code
                const quality = qValue ? parseFloat(qValue) : 1.0;
                return { code: langCode, quality };
            })
            .sort((a, b) => b.quality - a.quality);

        // Find first supported language
        for (const { code } of languages) {
            if (supportedLanguages.includes(code)) {
                throw redirect(302, `/${code}`);
            }
        }
    }

    // Fallback to default language
    throw redirect(302, `/${defaultLanguage}`);
};
