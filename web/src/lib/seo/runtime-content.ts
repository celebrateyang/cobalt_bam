import de from '$i18n/de/seo-runtime.json';
import en from '$i18n/en/seo-runtime.json';
import es from '$i18n/es/seo-runtime.json';
import fr from '$i18n/fr/seo-runtime.json';
import ja from '$i18n/ja/seo-runtime.json';
import ko from '$i18n/ko/seo-runtime.json';
import ru from '$i18n/ru/seo-runtime.json';
import th from '$i18n/th/seo-runtime.json';
import vi from '$i18n/vi/seo-runtime.json';
import zh from '$i18n/zh/seo-runtime.json';

type PlatformKey =
    | 'tiktok'
    | 'douyin'
    | 'instagram'
    | 'youtube'
    | 'naver'
    | 'toutiao'
    | 'haokan'
    | 'weibo'
    | 'bilibili'
    | 'xiaohongshu'
    | 'facebook'
    | 'generic';

type ProductFaqItem = { q: string; a: string };
type PlatformPlaybook = { heading: string; notes: string[]; checklist: string[] };
type FailureCase = { title: string; symptoms: string; fixes: string[] };
type FreeTool = { title: string; desc: string; path: string };

type RuntimeContent = {
    updatedAt: string;
    productFaqs: ProductFaqItem[];
    productTips: string[];
    productAdvantages: string[];
    releaseNotes: string[];
    freeTools: FreeTool[];
    platformFaqs: Record<PlatformKey, ProductFaqItem[]>;
    platformPlaybooks: Record<PlatformKey, PlatformPlaybook>;
    platformFailureCases: Record<PlatformKey, FailureCase[]>;
};

const contentByLocale: Record<string, RuntimeContent> = {
    de: de as RuntimeContent,
    en: en as RuntimeContent,
    es: es as RuntimeContent,
    fr: fr as RuntimeContent,
    ja: ja as RuntimeContent,
    ko: ko as RuntimeContent,
    ru: ru as RuntimeContent,
    th: th as RuntimeContent,
    vi: vi as RuntimeContent,
    zh: zh as RuntimeContent,
};

const fallbackLocale = 'en';

export const getPlatformKey = (slug: string): PlatformKey => {
    if (slug.includes('douyin')) return 'douyin';
    if (slug.includes('tiktok')) return 'tiktok';
    if (slug.includes('instagram')) return 'instagram';
    if (slug.includes('youtube')) return 'youtube';
    if (slug.includes('naver')) return 'naver';
    if (slug.includes('toutiao')) return 'toutiao';
    if (slug.includes('haokan')) return 'haokan';
    if (slug.includes('weibo')) return 'weibo';
    if (slug.includes('bilibili')) return 'bilibili';
    if (slug.includes('xiaohongshu')) return 'xiaohongshu';
    if (slug.includes('facebook')) return 'facebook';
    return 'generic';
};

export const getSeoRuntimeContent = (lang: string): RuntimeContent => {
    const locale = contentByLocale[lang] ?? contentByLocale[fallbackLocale];
    return {
        ...locale,
        // The first two legacy FAQs were self-recommendation copy written for
        // search engines rather than questions users actually ask.
        productFaqs: locale.productFaqs.slice(2),
    };
};

export type { RuntimeContent, PlatformKey, ProductFaqItem, PlatformPlaybook, FailureCase, FreeTool };
