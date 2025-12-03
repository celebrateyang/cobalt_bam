export const prerender = true;

// Generate static pages for all supported languages
export const entries = () => {
    const languages = ['en', 'zh', 'th', 'ru'];
    return languages.map(lang => ({ lang }));
};
