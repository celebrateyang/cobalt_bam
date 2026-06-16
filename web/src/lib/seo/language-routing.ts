export const supportedLanguages = ['en', 'zh', 'th', 'ru', 'ja', 'es', 'vi', 'ko', 'fr', 'de'] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];

export const defaultLanguage: SupportedLanguage = 'en';

const supportedLanguageSet = new Set<string>(supportedLanguages);

const countryLanguageMap: Record<string, SupportedLanguage> = {
    AT: 'de',
    BE: 'fr',
    CA: 'en',
    CH: 'de',
    CN: 'zh',
    DE: 'de',
    ES: 'es',
    FR: 'fr',
    GB: 'en',
    HK: 'zh',
    JP: 'ja',
    KR: 'ko',
    LU: 'fr',
    MC: 'fr',
    MX: 'es',
    SG: 'zh',
    TH: 'th',
    TW: 'zh',
    US: 'en',
    VN: 'vi',
};

const botUserAgentPattern =
    /bot|crawler|spider|slurp|chatgpt|oai-search|gptbot|google-extended|gemini|grok|xai|perplexity|claudebot|bytespider|bingpreview/i;

export const isSupportedLanguage = (value: string | null | undefined): value is SupportedLanguage =>
    typeof value === 'string' && supportedLanguageSet.has(value);

export const isLangPrefixedPath = (pathname: string) =>
    supportedLanguages.some((lang) => pathname === `/${lang}` || pathname.startsWith(`/${lang}/`));

export const getCookieLanguage = (cookieHeader: string | null | undefined): SupportedLanguage | null => {
    if (!cookieHeader) return null;
    const match = cookieHeader.match(/(?:^|;)\s*preferred-language=([^;]+)/i);
    if (!match) return null;

    const value = decodeURIComponent(match[1]);
    return isSupportedLanguage(value) ? value : null;
};

export const getAcceptLanguage = (header: string | null | undefined): SupportedLanguage | null => {
    if (!header) return null;

    const languages = header
        .split(',')
        .map((part) => {
            const [codePart, qPart] = part.trim().split(';q=');
            const code = codePart.split('-')[0].toLowerCase();
            const quality = qPart ? Number.parseFloat(qPart) : 1.0;
            return { code, quality: Number.isFinite(quality) ? quality : 0 };
        })
        .sort((a, b) => b.quality - a.quality);

    for (const { code } of languages) {
        if (isSupportedLanguage(code)) return code;
    }

    return null;
};

export const getCountryLanguage = (country: string | null | undefined): SupportedLanguage | null => {
    if (!country) return null;
    return countryLanguageMap[country.trim().toUpperCase()] ?? null;
};

export const isCrawlerUserAgent = (userAgent: string | null | undefined) =>
    typeof userAgent === 'string' && botUserAgentPattern.test(userAgent);

export type LanguageRequestInput = {
    cookieHeader?: string | null;
    acceptLanguage?: string | null;
    country?: string | null;
    userAgent?: string | null;
};

export const getPreferredLanguage = ({
    cookieHeader,
    acceptLanguage,
    country,
    userAgent,
}: LanguageRequestInput): SupportedLanguage => {
    const cookieLanguage = getCookieLanguage(cookieHeader);
    if (cookieLanguage) return cookieLanguage;

    const headerLanguage = getAcceptLanguage(acceptLanguage);
    if (headerLanguage) return headerLanguage;

    if (!isCrawlerUserAgent(userAgent)) {
        const countryLanguage = getCountryLanguage(country);
        if (countryLanguage) return countryLanguage;
    }

    return defaultLanguage;
};

export const getRequestCountry = (request: Request): string | null => {
    const headerCountry = request.headers.get('cf-ipcountry');
    if (headerCountry) return headerCountry;

    const cfCountry = (request as Request & { cf?: { country?: string } }).cf?.country;
    return cfCountry ?? null;
};
