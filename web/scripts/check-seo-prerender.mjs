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
const domesticUrl = 'https://freesavevideo.online/zh/download/bilibili-video-download';
const domesticEntry = sitemap.match(
    new RegExp(`<loc>${domesticUrl}</loc>(.*?)<\\/url>`, 's'),
);
assert(domesticEntry, 'Expected the Chinese Bilibili landing page in sitemap.xml');
assert(
    !domesticEntry[1].includes('hreflang="en"'),
    'A domestic-only page must not advertise a missing English alternate',
);
assert(
    domesticEntry[1].includes(`hreflang="x-default" href="${domesticUrl}"`),
    'A domestic-only page must use its Chinese URL as x-default',
);

const domesticHtml = readOutput('zh', 'download', 'bilibili-video-download.html');
assert(
    !domesticHtml.includes('hreflang="en"'),
    'Rendered domestic-only page must not link to a missing English alternate',
);
assert(
    domesticHtml.includes(`hreflang="x-default" href="${domesticUrl}"`),
    'Rendered domestic-only page must use its Chinese URL as x-default',
);

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
    de: 'So laden Sie YouTube-Videos herunter',
    en: 'How to Download YouTube Videos',
    es: 'C\u00f3mo descargar videos de YouTube',
    fr: 'Comment t\u00e9l\u00e9charger des vid\u00e9os YouTube',
    ja: 'YouTube\u52d5\u753b\u3092\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9\u3059\u308b\u65b9\u6cd5',
    ko: 'YouTube \ub3d9\uc601\uc0c1 \ub2e4\uc6b4\ub85c\ub4dc \ubc29\ubc95',
    ru: '\u041a\u0430\u043a \u0441\u043a\u0430\u0447\u0430\u0442\u044c \u0432\u0438\u0434\u0435\u043e \u0441 YouTube',
    th: '\u0e27\u0e34\u0e18\u0e35\u0e14\u0e32\u0e27\u0e19\u0e4c\u0e42\u0e2b\u0e25\u0e14\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d YouTube',
    vi: 'C\u00e1ch t\u1ea3i video YouTube',
    zh: '\u5982\u4f55\u4e0b\u8f7d YouTube \u89c6\u9891',
};
for (const [lang, expectedTitle] of Object.entries(guideTitles)) {
    const guide = readOutput(lang, 'guide', 'youtube-download-guide.html');
    assert(headingText(guide) === expectedTitle, `${lang} YouTube guide has an unexpected h1`);
}

console.log('SEO prerender checks passed');
