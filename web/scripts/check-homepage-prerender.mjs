import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const languages = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'ru', 'th', 'vi', 'zh'];
const outputRoot = join(process.cwd(), '.svelte-kit', 'output', 'prerendered', 'pages');
const failures = [];

const fail = (lang, message) => failures.push(`[${lang}] ${message}`);
const count = (value, pattern) => value.match(pattern)?.length ?? 0;

const pageFileForPath = (pathname) => {
    const normalized = pathname.replace(/^\//, '').replace(/\/$/, '');
    return join(outputRoot, `${normalized}.html`);
};

const seoHrefPattern = /^\/(?:de|en|es|fr|ja|ko|ru|th|vi|zh)\/(?:download|guide|learn|faq|free-video-tools|youtube-video-downloader)(?:\/|$)/;

for (const lang of languages) {
    const homepageFile = join(outputRoot, `${lang}.html`);
    if (!existsSync(homepageFile)) {
        fail(lang, `missing prerendered homepage: ${homepageFile}`);
        continue;
    }

    const html = readFileSync(homepageFile, 'utf8');

    if (count(html, /<h1(?:\s|>)/g) !== 1) fail(lang, 'homepage must contain exactly one H1');
    if (count(html, /<h2(?:\s|>)/g) < 6) fail(lang, 'expected semantic H2 section headings');
    if (!/class="[^"]*\bplatform-section\b[^"]*"/.test(html)) fail(lang, 'platform content is missing from SSR HTML');
    if (!/class="[^"]*\bseo-body\b[^"]*"/.test(html)) fail(lang, 'capability content is missing from SSR HTML');
    if (!/class="[^"]*\bhome-faq\b[^"]*"/.test(html)) fail(lang, 'visible FAQ is missing from SSR HTML');
    if (!html.includes('FAQPage')) fail(lang, 'FAQPage JSON-LD is missing');
    if (!html.includes('rel="canonical"')) fail(lang, 'canonical link is missing');
    if (!html.includes('hreflang="x-default"')) fail(lang, 'x-default hreflang is missing');

    for (const alternate of languages) {
        if (!html.includes(`hreflang="${alternate}"`)) {
            fail(lang, `hreflang for ${alternate} is missing`);
        }
    }

    if (count(html, /href="https:\/\/nopainstudy\.top\/"/g) !== 1) {
        fail(lang, 'expected exactly one NoPainStudy link');
    }
    if (!/class="[^"]*\becosystem-card\b[^"]*"/.test(html)) fail(lang, 'NoPainStudy ecosystem card is missing');

    for (const forbidden of ['isAccessibleForFree', 'priceCurrency', '&quot;price&quot;:&quot;0&quot;']) {
        if (html.includes(forbidden)) fail(lang, `forbidden free-price signal found: ${forbidden}`);
    }

    if (lang === 'en' && /href="\/en\/download\/(?:douyin|bilibili|kuaishou|naver|toutiao|weibo|haokan|xiaohongshu)[^"]*"/.test(html)) {
        fail(lang, 'English homepage links to a non-international download landing page');
    }

    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    const seoPaths = new Set(
        hrefs
            .map((href) => href.split('#')[0].split('?')[0])
            .filter((href) => seoHrefPattern.test(href)),
    );

    for (const pathname of seoPaths) {
        if (!existsSync(pageFileForPath(pathname))) {
            fail(lang, `SEO link has no prerendered page: ${pathname}`);
        }
    }
}

if (failures.length) {
    console.error('Homepage prerender regression check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Homepage prerender regression check passed for ${languages.length} locales.`);
