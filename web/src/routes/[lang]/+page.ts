export const prerender = true;

// Generate static pages for all supported languages
export const entries = () => {
    const languages = ['en', 'zh', 'th', 'ru', 'ja', 'es', 'vi', 'ko', 'fr', 'de'];
    return languages.map(lang => ({ lang }));
};
