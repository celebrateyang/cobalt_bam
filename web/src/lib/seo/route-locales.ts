import { getGuidePage } from '$lib/seo/guide-pages';
import { getSeoLandingPage } from '$lib/seo/landing-pages';
import {
    isEnglishOnlyDownloadSlug,
    isInternationalDownloadSlug,
} from '$lib/seo/internal-links';
import { supportedLanguages } from '$lib/seo/language-routing';

export const getDownloadSeoLanguages = (slug: string): string[] => {
    if (!getSeoLandingPage(slug)) return [];
    if (isEnglishOnlyDownloadSlug(slug)) return ['en'];
    if (isInternationalDownloadSlug(slug)) return [...supportedLanguages];
    return ['zh'];
};

export const getGuideSeoLanguages = (slug: string): string[] => {
    const guide = getGuidePage(slug);
    return guide ? getDownloadSeoLanguages(guide.landingSlug) : [];
};

export const getPreferredSeoLanguage = (languages: string[]): string =>
    languages.includes('en') ? 'en' : languages.includes('zh') ? 'zh' : languages[0] ?? 'en';
