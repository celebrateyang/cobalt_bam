import type { RequestHandler } from './$types';

import env from '$lib/env';
import { seoLandingSlugs } from '$lib/seo/landing-pages';
import { getGuidePage, guideSlugs } from '$lib/seo/guide-pages';
import { getLearnPage, learnSlugs } from '$lib/seo/learn-pages';
import { supportedSeoLanguages } from '$lib/seo/site';
import { getDownloadSeoLanguages, getGuideSeoLanguages } from '$lib/seo/route-locales';

const site = env.HOST ? `https://${env.HOST}` : 'https://freesavevideo.online';
const languages = [...supportedSeoLanguages];
const lastModified = {
    site: '2026-07-17',
    seoPages: '2026-08-06',
};

const languageHubPages = ['', 'download'];
const englishSupportPages = ['guide', 'faq'];

const escapeXml = (value: string): string =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');

const normalizePath = (path: string) => (path === '/' ? '' : path);

const buildAlternateLinks = (
    path: string,
    availableLanguages: readonly string[] = languages,
): string => {
    const normalized = normalizePath(path);
    const withoutLang = normalized.replace(/^\/[^/]+/, '');
    const alternateLanguages = availableLanguages;
    const defaultLanguage = alternateLanguages.includes('en')
        ? 'en'
        : alternateLanguages[0] ?? 'en';

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
        for (const page of languageHubPages) {
            const path = page ? `/${lang}/${page}` : `/${lang}`;
            const priority = page === '' ? '1.0' : '0.8';
            const changefreq = page === '' ? 'daily' : 'weekly';
            urls.push(
                urlEntry(
                    `${site}${path}`,
                    page === '' ? lastModified.site : lastModified.seoPages,
                    changefreq,
                    priority,
                    buildAlternateLinks(path),
                ),
            );
        }
    }

    for (const page of englishSupportPages) {
        urls.push(
            urlEntry(`${site}/en/${page}`, lastModified.seoPages, 'weekly', '0.7'),
        );
    }

    for (const slug of seoLandingSlugs) {
        const availableLanguages = getDownloadSeoLanguages(slug);
        for (const lang of availableLanguages) {
            const path = `/${lang}/download/${slug}`;
            urls.push(
                urlEntry(
                    `${site}${path}`,
                    lastModified.seoPages,
                    'weekly',
                    '0.9',
                    buildAlternateLinks(path, availableLanguages),
                ),
            );
        }
    }

    for (const slug of guideSlugs) {
        const guide = getGuidePage(slug);
        if (!guide) continue;
        const availableLanguages = getGuideSeoLanguages(slug);
        for (const lang of availableLanguages) {
            const path = `/${lang}/guide/${slug}`;
            urls.push(
                urlEntry(
                    `${site}${path}`,
                    lastModified.seoPages,
                    'monthly',
                    '0.7',
                    buildAlternateLinks(path, availableLanguages),
                ),
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
