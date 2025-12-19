export const prerender = true;
export const ssr = true;
export const trailingSlash = 'never';

// Root layout - no translation loading here
// Translations are loaded in [lang]/+layout.ts
export const load = async () => {
    return {};
};
