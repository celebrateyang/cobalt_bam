import type { RequestHandler } from './$types';

import env from '$lib/env';
import { supportedSeoLanguages } from '$lib/seo/site';
import { getDownloadSeoLanguages } from '$lib/seo/route-locales';
import { isTiktokLanding, tiktokContentUpdatedAt } from '$lib/seo/tiktok-content';
import { getPlatformDownloadConfig } from '$lib/seo/platform-download-landings';

const site = env.HOST ? `https://${env.HOST}` : 'https://freesavevideo.online';
const languages = [...supportedSeoLanguages];
const lastModified = {
    site: '2026-09-06',
};

// Search Console's indexed pages report, last updated 2026-10-23.
const indexedPaths = ['/en', '/es/download', '/ja/download'];
// Dedicated pages reviewed in the November 2026 landing-page traffic analysis.
const featuredLandingSlugs = [
    'youtube-download', 'aparat-video-downloader', 'dailymotion-video-downloader',
    'google-drive-video-downloader', 'vk-video-downloader', 'rutube-video-downloader',
    'streamable-video-downloader', 'threads-video-downloader', 'bluesky-video-downloader',
    'twitch-clip-downloader', 'vimeo-video-download', 'reddit-video-download',
    'pinterest-video-download', 'tiktok-no-watermark',
];
const priorityLandingLastModified = new Set([
    'youtube-download',
    'youtube-shorts-download',
    'youtube-playlist-downloader',
    'tiktok-no-watermark',
    'tiktok-collection-download',
    'tiktok-mp3-download',
    'instagram-video-download',
    'instagram-reels-download',
]);

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
    lastmod: string | undefined,
    changefreq: string,
    priority: string,
    alternates = '',
) => `
    <url>
        <loc>${escapeXml(loc)}</loc>
        ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
        <changefreq>${changefreq}</changefreq>
        <priority>${priority}</priority>${alternates}
    </url>`;

function generateSitemap(): string {
    const urls: string[] = [];
    for (const path of indexedPaths) {
        urls.push(urlEntry(`${site}${path}`, lastModified.site, 'weekly', '0.8'));
    }

    for (const slug of featuredLandingSlugs) {
        const availableLanguages = getDownloadSeoLanguages(slug);
        for (const lang of availableLanguages) {
            const path = `/${lang}/download/${slug}`;
            urls.push(
                urlEntry(
                    `${site}${path}`,
                    getPlatformDownloadConfig(slug) ? '2026-10-27' : slug === 'aparat-video-downloader' ? '2026-10-25' : isTiktokLanding(slug)
                        ? tiktokContentUpdatedAt
                        : slug === 'dailymotion-video-downloader'
                        ? '2026-10-11'
                        : slug === 'xinpianchang-video-download'
                        ? '2026-09-19'
                        : ['de', 'th'].includes(lang) && priorityLandingLastModified.has(slug)
                          ? '2026-09-21'
                          : slug === 'youtube-download' && lang === 'id'
                            ? '2026-09-06'
                            : undefined,
                    'weekly',
                    '0.9',
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
