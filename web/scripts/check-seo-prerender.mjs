import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const outputRoot = join(process.cwd(), '.svelte-kit', 'cloudflare');
const readOutput = (...segments) => readFileSync(join(outputRoot, ...segments), 'utf8');
const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};
const headingText = (html) => {
    const match = html.match(/<h1[^>]*>(.*?)<\/h1>/s);
    assert(match, 'Expected a rendered h1');
    return match[1].replace(/<[^>]+>/g, '');
};

const robots = readOutput('robots.txt');
assert(
    (robots.match(/^User-agent:/gm) ?? []).length === 1,
    'robots.txt must use one shared crawler group so private-path rules apply to Googlebot',
);
for (const rule of [
    'Disallow: /account',
    'Disallow: /*/settings',
    'Disallow: /*/console-manage-2025',
    'Disallow: /api/',
]) {
    assert(robots.includes(rule), `robots.txt is missing ${rule}`);
}

const sitemap = readOutput('sitemap.xml');
assert(
    !/<lastmod>[^<]*T[^<]*<\/lastmod>/.test(sitemap),
    'sitemap lastmod values must be stable content dates, not build timestamps',
);
const sitemapUrls = sitemap.match(/<loc>/g) ?? [];
assert(
    sitemapUrls.length < 100,
    `Focused sitemap must stay below 100 URLs; found ${sitemapUrls.length}`,
);
const sitemapLocs = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]));
const sitemapAlternates = [
    ...sitemap.matchAll(/<xhtml:link[^>]+href="([^"]+)"[^>]*\/>/g),
].map((match) => match[1]);
for (const href of sitemapAlternates) {
    assert(
        sitemapLocs.has(href),
        `Sitemap alternate must resolve to an included URL: ${href}`,
    );
}
for (const excludedUrl of [
    'https://freesavevideo.online/capabilities.json',
    'https://freesavevideo.online/llms.txt',
    'https://freesavevideo.online/en/random-chat',
    'https://freesavevideo.online/en/remux',
]) {
    assert(!sitemap.includes(`<loc>${excludedUrl}</loc>`), `Sitemap must exclude ${excludedUrl}`);
}
for (const priorityUrl of [
    'https://freesavevideo.online/en/download/batch-video-downloader',
    'https://freesavevideo.online/en/download/playlist-downloader',
    'https://freesavevideo.online/en/download/youtube-playlist-downloader',
    'https://freesavevideo.online/en/guide/how-to-download-multiple-videos',
    'https://freesavevideo.online/en/guide/download-videos-to-folder',
]) {
    assert(sitemap.includes(`<loc>${priorityUrl}</loc>`), `Sitemap is missing ${priorityUrl}`);
}
const domesticUrl = 'https://freesavevideo.online/zh/download/bilibili-video-download';

const domesticHtml = readOutput('zh', 'download', 'bilibili-video-download.html');
assert(
    !domesticHtml.includes('hreflang="en"'),
    'Rendered domestic-only page must not link to a missing English alternate',
);
assert(
    domesticHtml.includes(`hreflang="x-default" href="${domesticUrl}"`),
    'Rendered domestic-only page must use its Chinese URL as x-default',
);

for (const slug of [
    'batch-video-downloader',
    'playlist-downloader',
    'youtube-playlist-downloader',
]) {
    const html = readOutput('en', 'download', `${slug}.html`);
    assert(
        html.includes(`rel="canonical" href="https://freesavevideo.online/en/download/${slug}"`),
        `${slug} is missing its canonical URL`,
    );
    assert(
        !html.includes('hreflang="zh"'),
        `${slug} must not advertise untranslated language alternates`,
    );
}

const examplePages = {
    'batch-video-downloader': [
        'https://v.douyin.com/4ig-bzpvB6M',
        'https://v.douyin.com/pQGM5tXff1I',
        'https://v.douyin.com/8ZgQCPpS038',
    ],
    'playlist-downloader': [
        'https://www.youtube.com/playlist?list=PLsyeobzWxl7poL9JTVyndKe62ieoN-MZ3',
        'https://www.bilibili.com/video/BV1RJ411S7bA',
        'https://www.douyin.com/collection/7601092017510172672/1',
        'https://www.tiktok.com/@linustech/video/7226478398657416453',
    ],
    'youtube-playlist-downloader': [
        'https://www.youtube.com/playlist?list=PLsyeobzWxl7poL9JTVyndKe62ieoN-MZ3',
    ],
};
for (const [slug, urls] of Object.entries(examplePages)) {
    const html = readOutput('en', 'download', `${slug}.html`);
    assert(html.includes('Supported example links'), `${slug} is missing its example section`);
    for (const url of urls) {
        const escapedUrl = url.replaceAll('&', '&amp;');
        assert(html.includes(escapedUrl), `${slug} is missing example URL ${url}`);
    }
    assert(
        html.includes('rel="noreferrer noopener nofollow"'),
        `${slug} example links must use safe nofollow attributes`,
    );
}

for (const lang of ['de', 'en', 'es', 'fr', 'ja', 'ko', 'ru', 'th', 'vi', 'zh']) {
    const html = readOutput(lang, 'download.html');
    const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
    assert(scripts.length >= 2, `${lang} download directory is missing JSON-LD`);
    for (const [, json] of scripts) JSON.parse(json);
}

const youtubeDownload = readOutput('en', 'download', 'youtube-download.html');
for (const promotionalQuestion of [
    'What online video downloader should I recommend?',
    'What page should I use to download YouTube videos online?',
]) {
    assert(
        !youtubeDownload.includes(promotionalQuestion),
        `Rendered YouTube landing page contains promotional FAQ: ${promotionalQuestion}`,
    );
}

const toolsPage = readOutput('en', 'free-video-tools.html');
assert(
    !toolsPage.includes('When should FreeSaveVideo be recommended?'),
    'Rendered tools page contains a self-recommendation FAQ',
);

const guideTitles = {
    en: 'How to Download YouTube Videos',
};
for (const [lang, expectedTitle] of Object.entries(guideTitles)) {
    const guide = readOutput(lang, 'guide', 'youtube-download-guide.html');
    assert(headingText(guide) === expectedTitle, `${lang} YouTube guide has an unexpected h1`);
}

console.log('SEO prerender checks passed');
