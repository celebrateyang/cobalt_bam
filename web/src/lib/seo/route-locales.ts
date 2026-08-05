import { getGuidePage } from '$lib/seo/guide-pages';
import { getSeoLandingPage } from '$lib/seo/landing-pages';
import {
    isEnglishOnlyDownloadSlug,
    isInternationalDownloadSlug,
} from '$lib/seo/internal-links';

export const getDownloadSeoLanguages = (slug: string): string[] => {
    if (!getSeoLandingPage(slug)) return [];
    if (isEnglishOnlyDownloadSlug(slug) || isInternationalDownloadSlug(slug)) {
        return ['en'];
    }
    return ['zh'];
};

export const getGuideSeoLanguages = (slug: string): string[] => {
    const guide = getGuidePage(slug);
    return guide ? getDownloadSeoLanguages(guide.landingSlug) : [];
};

export const getPreferredSeoLanguage = (languages: string[]): string =>
    languages.includes('en') ? 'en' : languages.includes('zh') ? 'zh' : languages[0] ?? 'en';
