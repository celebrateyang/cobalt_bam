import type { RequestHandler } from './$types';

import env from '$lib/env';
import { seoLandingSlugs } from '$lib/seo/landing-pages';
import { getGuidePage, guideSlugs } from '$lib/seo/guide-pages';
import { getLearnPage, learnSlugs } from '$lib/seo/learn-pages';
import { machineReadablePaths, supportedSeoLanguages } from '$lib/seo/site';
import { isInternationalDownloadSlug } from '$lib/seo/internal-links';

const site = env.HOST ? `https://${env.HOST}` : 'https://freesavevideo.online';
const languages = [...supportedSeoLanguages];
const excludedPathPatterns = [/^\/[^/]+\/donate(?:\/|$)/];
const lastModified = {
    site: '2026-07-17',
    seoPages: '2026-06-30',
    machineReadable: '2026-06-27',
    support: '2026-06-15',
    about: '2026-06-15',
};

// paths to include in sitemap
const pages = [
    '',
    'free-video-tools',
    'clipboard',
    'random-chat',
    'discover',
    'guide',
    'download',
    'support',
    'videorecord',
    'youtube-video-downloader',
    ...guideSlugs.map((slug) => `guide/${slug}`),
    ...seoLandingSlugs.map((slug) => `download/${slug}`),
    'about/general',
    'remux',
    'faq',
];

// sub-pages under /about (only include if source markdown exists)
const aboutFiles = import.meta.glob('$i18n/*/about/*.md');
const aboutPages = ['general', 'privacy', 'terms'];
const aboutPagesByLang = new Map<string, Set<string>>();

for (const file of Object.keys(aboutFiles)) {
    const match = file.match(/\/([^/]+)\/about\/([^/]+)\.md$/);
    if (!match) continue;
    const [, lang, page] = match;
    const set = aboutPagesByLang.get(lang) ?? new Set<string>();
    set.add(page);
    aboutPagesByLang.set(lang, set);
}

const shouldExcludePath = (path: string) =>
    excludedPathPatterns.some((pattern) => pattern.test(path));

const escapeXml = (value: string): string =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');

const normalizePath = (path: string) => (path === '/' ? '' : path);

const availableLanguagesForPath = (path: string): string[] => {
    const downloadSlug = path.match(/^\/[^/]+\/download\/([^/]+)$/)?.[1];
    if (downloadSlug && !isInternationalDownloadSlug(downloadSlug)) {
        return languages.filter((lang) => lang !== 'en');
    }

    const guideSlug = path.match(/^\/[^/]+\/guide\/([^/]+)$/)?.[1];
    const guide = guideSlug ? getGuidePage(guideSlug) : null;
    if (guide && !isInternationalDownloadSlug(guide.landingSlug)) {
        return languages.filter((lang) => lang !== 'en');
    }

    return languages;
};

const buildAlternateLinks = (path: string): string => {
    const normalized = normalizePath(path);
    const withoutLang = normalized.replace(/^\/[^/]+/, '');
    const alternateLanguages = availableLanguagesForPath(path);
    const defaultLanguage = alternateLanguages.includes('en') ? 'en' : 'zh';

    return [
        ...alternateLanguages.map((lang) => {
            const href = `${site}/${lang}${withoutLang}`;
            return `<xhtml:link rel="alternate" hreflang="${lang}" href="${escapeXml(href)}" />`;
        }),
        `<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(`${site}/${defaultLanguage}${withoutLang}`)}" />`,
    ].join('');
};

const urlEntry = (
    loc: string,
    lastmod: string,
    changefreq: string,
    priority: string,
    alternates = '',
) => `
    <url>
        <loc>${escapeXml(loc)}</loc>
        <lastmod>${lastmod}</lastmod>
        <changefreq>${changefreq}</changefreq>
        <priority>${priority}</priority>${alternates}
    </url>`;

function generateSitemap(): string {
    const urls: string[] = [];

    urls.push(urlEntry(`${site}/`, lastModified.site, 'daily', '1.0'));

    for (const path of machineReadablePaths) {
        urls.push(
            urlEntry(
                `${site}${path}`,
                lastModified.machineReadable,
                'weekly',
                path === '/capabilities.json' ? '0.7' : '0.6',
            ),
        );
    }

    urls.push(urlEntry(`${site}/en/learn`, lastModified.seoPages, 'weekly', '0.8'));
    for (const slug of learnSlugs) {
        const article = getLearnPage(slug);
        urls.push(
            urlEntry(
                `${site}/en/learn/${slug}`,
                article?.updatedAt ?? lastModified.seoPages,
                'weekly',
                '0.8',
            ),
        );
    }

    for (const lang of languages) {
        // top-level pages
        for (const page of pages) {
            const downloadSlug = page.match(/^download\/([^/]+)$/)?.[1];
            if (lang === 'en' && downloadSlug && !isInternationalDownloadSlug(downloadSlug)) {
                continue;
            }
            const guideSlug = page.match(/^guide\/([^/]+)$/)?.[1];
            const guide = guideSlug ? getGuidePage(guideSlug) : null;
            if (
                lang === 'en' &&
                guide &&
                !isInternationalDownloadSlug(guide.landingSlug)
            ) {
                continue;
            }

            const path = page ? `/${lang}/${page}` : `/${lang}`;
            if (shouldExcludePath(path)) continue;
            const priority = page === '' ? '1.0' : '0.8';
            const changefreq = page === '' ? 'daily' : 'weekly';
            const pageLastModified =
                page === ''
                    ? lastModified.site
                    : page === 'support'
                      ? lastModified.support
                      : lastModified.seoPages;

            urls.push(
                urlEntry(`${site}${path}`, pageLastModified, changefreq, priority, buildAlternateLinks(path)),
            );
        }

        // about sub-pages
        for (const aboutPage of aboutPages) {
            const available = aboutPagesByLang.get(lang);
            if (!available || !available.has(aboutPage)) continue;
            const path = `/${lang}/about/${aboutPage}`;
            if (shouldExcludePath(path)) continue;
            urls.push(
                urlEntry(`${site}${path}`, lastModified.about, 'monthly', '0.6', buildAlternateLinks(path)),
            );
        }
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('')}
</urlset>`;
}

export const GET: RequestHandler = () => {
    const sitemap = generateSitemap();

    return new Response(sitemap, {
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600'
        }
    });
};

export const prerender = true;
