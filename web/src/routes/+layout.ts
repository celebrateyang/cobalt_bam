export const prerender = true;
export const ssr = true;

// Root layout - no translation loading here
// Translations are loaded in [lang]/+layout.ts
export const load = async () => {
    return {};
};
