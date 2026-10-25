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
    sitemapUrls.length <= 50_000,
    `Sitemap must stay within the 50,000 URL protocol limit; found ${sitemapUrls.length}`,
);
const sitemapLocs = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]));
for (const lang of ['en', 'fa']) {
    const slug = 'aparat-video-downloader';
    const path = `/${lang}/download/${slug}`;
    const canonical = `https://freesavevideo.online${path}`;
    const html = readOutput(lang, 'download', `${slug}.html`);
    assert(sitemapLocs.has(canonical), `Aparat ${lang} missing from sitemap`);
    assert(new RegExp(`<html[^>]+lang="${lang}"[^>]+dir="${lang === 'fa' ? 'rtl' : 'ltr'}"`).test(html), `Aparat ${lang} document language/direction`);
    assert(!html.includes('__FSV_DOCUMENT_'), `Aparat ${lang} unresolved document placeholder`);
    assert(html.includes(`rel="canonical" href="${canonical}"`), `Aparat ${lang} canonical`);
    assert(html.includes('name="robots" content="index,follow"'), `Aparat ${lang} must be indexable`);
    for (const alternate of ['en', 'fa']) {
        assert(html.includes(`hreflang="${alternate}" href="https://freesavevideo.online/${alternate}/download/${slug}"`), `Aparat ${lang} missing reciprocal ${alternate}`);
    }
    assert(html.includes(`hreflang="x-default" href="https://freesavevideo.online/en/download/${slug}"`), `Aparat ${lang} x-default`);
    assert(!/hreflang="(?:zh|de|th)"/.test(html), `Aparat ${lang} advertises untranslated pages`);
    assert(html.includes('id="aparat-url"'), `Aparat ${lang} missing SSR form`);
    assert((html.match(/<h1\b/g) || []).length === 1, `Aparat ${lang} requires one h1`);
    assert(html.includes('2026-10-25'), `Aparat ${lang} missing stable review date`);
    assert(!html.includes('wmsAuthSign='), `Aparat ${lang} must not expose cached expiring media URLs`);
    if (lang === 'fa') {
        assert(headingText(html).includes('\u0622\u067e\u0627\u0631\u0627\u062a'), 'Aparat Persian heading fell back to English');
        assert(!html.includes('\uFFFD'), 'Aparat Persian contains replacement characters');
    }
    const schemas = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(([, data]) => JSON.parse(data));
    const graph = schemas.find(data => data['@graph']?.some(item => item['@id'] === `${canonical}#app`))?.['@graph'];
    assert(graph, `Aparat ${lang} missing schema graph`);
    assert(graph.find(item => item['@type'] === 'WebPage').inLanguage === lang, `Aparat ${lang} schema language`);
    const app = graph.find(item => item['@type'] === 'WebApplication');
    assert(!app.offers && !app.aggregateRating, `Aparat ${lang} must not invent price/review claims`);
    for (const question of graph.find(item => item['@type'] === 'FAQPage').mainEntity) {
        const visibleAnswer = question.acceptedAnswer.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        assert(html.includes(visibleAnswer), `Aparat ${lang} schema answer missing from page`);
    }
}
const legacyAlternativePath = '/en/learn/cobalt-tools-savefrom-alternative';
assert(!sitemap.includes(legacyAlternativePath), 'Sitemap must exclude the retired combined article');
assert(
    readOutput('_redirects').includes(`${legacyAlternativePath} /en/learn/cobalt-tools-alternative 308`),
    'The retired article must permanently redirect to the Cobalt article',
);
const learnHub = readOutput('en', 'learn.html');
for (const slug of ['cobalt-tools-alternative', 'savefrom-alternative']) {
    const path = `/en/learn/${slug}`;
    const html = readOutput('en', 'learn', `${slug}.html`);
    assert(sitemapLocs.has(`https://freesavevideo.online${path}`), `${slug} is missing from sitemap`);
    assert(learnHub.includes(`href="${path}"`), `${slug} is missing from the learning hub`);
    assert(html.includes(`rel="canonical" href="https://freesavevideo.online${path}"`), `${slug} needs its own canonical`);
    const data = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
        .map(([, json]) => JSON.parse(json));
    assert(data.some(item => item['@type'] === 'Article' && item.mainEntityOfPage === `https://freesavevideo.online${path}`), `${slug} has incorrect article schema`);
    assert(data.some(item => item['@type'] === 'FAQPage'), `${slug} is missing FAQ schema`);
}
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

const youtubePlaylistHtml = readOutput('en', 'download', 'youtube-playlist-downloader.html');
assert(
    youtubePlaylistHtml.includes('rel="canonical" href="https://freesavevideo.online/en/download/youtube-playlist-downloader"'),
    'youtube-playlist-downloader is missing its canonical URL',
);
assert(
    youtubePlaylistHtml.includes('hreflang="th" href="https://freesavevideo.online/th/download/youtube-playlist-downloader"'),
    'youtube-playlist-downloader is missing its localized Thai alternate',
);
assert(
    youtubePlaylistHtml.includes('hreflang="ja" href="https://freesavevideo.online/ja/download/youtube-playlist-downloader"'),
    'youtube-playlist-downloader is missing its localized Japanese alternate',
);

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

for (const lang of ['de', 'en', 'es', 'fr', 'id', 'ja', 'ko', 'ru', 'th', 'vi', 'zh']) {
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
    en: 'How to Download YouTube Videos: Links, Mobile Saving and Errors',
    ja: 'YouTube 動画保存ガイド：リンク、モバイル保存、エラー対処',
    th: 'วิธีดาวน์โหลดวิดีโอ YouTube',
};
for (const [lang, expectedTitle] of Object.entries(guideTitles)) {
    const guide = readOutput(lang, 'guide', 'youtube-download-guide.html');
    assert(headingText(guide) === expectedTitle, `${lang} YouTube guide has an unexpected h1`);
}

console.log('SEO prerender checks passed');
