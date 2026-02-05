import type { RequestHandler } from './$types';

import env from '$lib/env';
import { seoLandingSlugs } from '$lib/seo/landing-pages';
import { guideSlugs } from '$lib/seo/guide-pages';

const site = env.HOST ? `https://${env.HOST}` : 'https://freesavevideo.online';
const languages = ['en', 'zh', 'th', 'ru', 'ja', 'es', 'vi', 'ko', 'fr', 'de'];

// paths to include in sitemap
const pages = [
    '',
    'clipboard',
    'discover',
    'guide',
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

function generateSitemap(): string {
    const urls: string[] = [];
    const now = new Date().toISOString();

    for (const lang of languages) {
        // top-level pages
        for (const page of pages) {
            const path = page ? `/${lang}/${page}` : `/${lang}`;
            const priority = page === '' ? '1.0' : '0.8';
            const changefreq = page === '' ? 'daily' : 'weekly';

            urls.push(`
    <url>
        <loc>${site}${path}</loc>
        <lastmod>${now}</lastmod>
        <changefreq>${changefreq}</changefreq>
        <priority>${priority}</priority>
    </url>`);
        }

        // about sub-pages
        for (const aboutPage of aboutPages) {
            const available = aboutPagesByLang.get(lang);
            if (!available || !available.has(aboutPage)) continue;
            urls.push(`
    <url>
        <loc>${site}/${lang}/about/${aboutPage}</loc>
        <lastmod>${now}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.6</priority>
    </url>`);
        }
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
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
