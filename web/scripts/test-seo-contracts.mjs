import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import { compile, preprocess } from 'svelte/compiler';
import * as svelteInternal from 'svelte/internal';
import * as svelte from 'svelte';
import * as svelteStore from 'svelte/store';

// Load the real route/data modules without a production build or network calls.
// Only framework context and the decorative supported-services strip are stubbed.
const root = fileURLToPath(new URL('../', import.meta.url));
const cache = new Map();
const testPage = svelteStore.writable({ params: { lang: 'en' }, url: new URL('https://freesavevideo.online/en/faq') });
const testTranslations = svelteStore.writable(key => key);
const framework = {
    '$env/static/public': {},
    '@sveltejs/kit': {
        redirect(status, location) { throw Object.assign(new Error('redirect'), { status, location }); },
        error(status, message) { throw Object.assign(new Error(message), { status }); },
    },
    'svelte/internal': svelteInternal,
    svelte,
    'svelte/store': svelteStore,
    '$app/stores': { page: testPage },
    '$lib/i18n/translations': { t: testTranslations },
    '$components/save/SupportedServices.svelte': { __esModule: true, default: svelteInternal.create_ssr_component(() => '') },
};

function evaluate(source, filename) {
    const js = ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    const module = { exports: {} };
    const require = name => {
        if (name in framework) return framework[name];
        const target = name.startsWith('$lib/') ? resolve(root, 'src/lib', name.slice(5))
            : name.startsWith('$i18n/') ? resolve(root, 'i18n', name.slice(6))
            : resolve(dirname(filename), name);
        return load(target);
    };
    new Function('require', 'module', 'exports', js)(require, module, module.exports);
    return module.exports;
}

function load(filename) {
    filename = resolve(root, filename);
    if (!existsSync(filename)) filename += '.ts';
    if (!cache.has(filename)) {
        const source = readFileSync(filename, 'utf8');
        cache.set(filename, filename.endsWith('.json') ? JSON.parse(source) : evaluate(source, filename));
    }
    return cache.get(filename);
}

async function component(file) {
    const filename = resolve(root, file);
    const source = readFileSync(filename, 'utf8');
    const processed = await preprocess(source, {
        script: ({ content, attributes }) => attributes.lang === 'ts' ? {
            code: ts.transpileModule(content, { compilerOptions: {
                target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
                verbatimModuleSyntax: true,
            } }).outputText,
        } : undefined,
    }, { filename });
    return evaluate(compile(processed.code, { filename, generate: 'ssr' }).js.code, filename).default;
}

function setTestLocale(lang, path = 'faq') {
    testPage.set({ params: { lang }, url: new URL(`https://freesavevideo.online/${lang}/${path}`) });
    testTranslations.set(key => {
        const [namespace, ...parts] = key.split('.');
        const resource = load(`i18n/${lang}/${namespace}.json`);
        const dottedKey = parts.join('.');
        return resource[dottedKey] ?? parts.reduce((value, part) => value?.[part], resource) ?? key;
    });
}

const escapeText = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const routes = load('src/lib/seo/route-locales.ts');
const links = load('src/lib/seo/internal-links.ts');
const { supportedLanguages } = load('src/lib/seo/language-routing.ts');
const { seoLandingSlugs, getSeoLandingPage, getSeoLandingLocale } = load('src/lib/seo/landing-pages.ts');

test('all directory, home and related links resolve in their advertised language', async () => {
    const downloads = load('src/routes/[lang]/download/+page.ts');
    const guides = load('src/routes/[lang]/guide/+page.ts');
    for (const lang of supportedLanguages) {
        const data = await downloads.load({ params: { lang } });
        assert(data.cards.length > 0);
        for (const card of data.cards) {
            assert(routes.getDownloadSeoLanguages(card.slug).includes(lang), `${lang}/${card.slug}`);
            if (card.guideSlug) assert(routes.getGuideSeoLanguages(card.guideSlug).includes(lang));
        }
        for (const guide of (await guides.load({ params: { lang } })).guides) {
            assert(routes.getGuideSeoLanguages(guide.slug).includes(lang));
        }
        const home = links.getHubDownloadLinks(8, 'all', lang);
        assert(home.slice(0, 3).some(item => item.slug === 'youtube-download'), `${lang}: ${home.map(item => item.slug).join(', ')}`);
        for (const item of home) assert(routes.getDownloadSeoLanguages(item.slug).includes(lang));
        for (const slug of seoLandingSlugs) {
            for (const item of links.getRelatedDownloadLinks(slug, 6, 'all', lang)) {
                assert(routes.getDownloadSeoLanguages(item.slug).includes(lang));
                assert.notEqual(item.slug, slug);
            }
        }
        for (const item of links.getHubGuideLinks(6, 'all', lang)) assert(routes.getGuideSeoLanguages(item.slug).includes(lang));
    }
    assert.deepEqual(routes.getDownloadSeoLanguages('youtube-playlist-to-mp3'), ['en', 'zh']);
    assert.deepEqual(routes.getDownloadSeoLanguages('batch-video-downloader'), ['en']);
    assert.deepEqual(routes.getDownloadSeoLanguages('bilibili-video-download'), ['zh']);
    assert.deepEqual(routes.getDownloadSeoLanguages('does-not-exist'), []);
    const detail = load('src/routes/[lang]/download/[slug]/+page.ts');
    assert(detail.entries().some(item => item.lang === 'en' && item.slug === 'youtube-playlist-to-mp3'));
    assert.equal((await detail.load({ params: { lang: 'en', slug: 'youtube-playlist-to-mp3' } })).lang, 'en');
});

test('both root redirect implementations preserve queries and avoid shared language caching', async () => {
    const edge = load('functions/index.ts');
    const server = load('src/routes/+page.server.ts');
    for (const headers of [
        { 'accept-language': 'zh-CN, en;q=0.5' },
        { cookie: 'preferred-language=ja', 'accept-language': 'en' },
        { cookie: 'preferred-language=%invalid', 'accept-language': 'de;q=0,en;q=1' },
        { 'cf-ipcountry': 'JP', 'user-agent': 'Googlebot' },
    ]) {
        const request = new Request('https://freesavevideo.online/?utm_source=test&x=1', { headers });
        const response = await edge.onRequest({ request });
        let serverHeaders;
        assert.throws(() => server.load({ request, url: new URL(request.url), cookies: { get: () => undefined }, setHeaders: value => { serverHeaders = value; } }), error => {
            assert.equal(error.status, 302);
            assert.equal(response.headers.get('location'), `https://freesavevideo.online${error.location}`);
            assert(error.location.endsWith('?utm_source=test&x=1'));
            assert(!error.location.includes('/?'));
            return true;
        });
        assert.equal(response.headers.get('cache-control'), 'private, no-store');
        assert.equal(serverHeaders['Cache-Control'], 'private, no-store');
    }
});

test('rendered FAQ and learning hub contain parseable JSON-LD', async () => {
    for (const [file, props, type] of [
        ['src/routes/[lang]/faq/+page.svelte', {}, 'FAQPage'],
        ['src/routes/[lang]/learn/+page.svelte', { data: { lang: 'en', pages: [{ title: '</script><unsafe>', slug: 'sample', description: 'Example' }] } }, 'ItemList'],
    ]) {
        const rendered = (await component(file)).render(props);
        const schemas = [...rendered.head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
        assert(schemas.some(schema => schema['@type'] === type), file);
        assert(!rendered.head.includes('</script><unsafe>'));
    }
});

test('localized directory SSR exposes valid task links and localized headings', async () => {
    const page = await component('src/routes/[lang]/download/+page.svelte');
    const loader = load('src/routes/[lang]/download/+page.ts');
    const { getDirectoryCopy } = load('src/lib/seo/directory-copy.ts');
    for (const lang of supportedLanguages) {
        const rendered = page.render({ data: await loader.load({ params: { lang } }) });
        assert(rendered.html.includes(getDirectoryCopy(lang).title));
        if (lang !== 'en') assert.notEqual(getDirectoryCopy(lang).title, getDirectoryCopy('en').title);
        for (const match of rendered.html.matchAll(/href="\/([^/]+)\/download\/([^"?#]+)"/g)) {
            assert(routes.getDownloadSeoLanguages(match[2]).includes(match[1]), match[0]);
        }
        for (const match of rendered.head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(match[1]);
    }
    const youtube = getSeoLandingPage('youtube-download');
    assert(youtube.locales.id);
    assert.notEqual(getSeoLandingLocale(youtube, 'id').h1, getSeoLandingLocale(youtube, 'en').h1);
});

test('tools and FAQ SSR use localized copy and fixed route paths for every language', async () => {
    const toolsPage = await component('src/routes/[lang]/free-video-tools/+page.svelte');
    const faqPage = await component('src/routes/[lang]/faq/+page.svelte');
    const { toolCapabilities } = load('src/lib/seo/capabilities.ts');
    const { getSeoRuntimeContent } = load('src/lib/seo/runtime-content.ts');
    try {
        for (const lang of supportedLanguages) {
            setTestLocale(lang, 'free-video-tools');
            const faq = load(`i18n/${lang}/faq.json`);
            const remux = load(`i18n/${lang}/remux.json`);
            const rendered = toolsPage.render({ data: { lang } });
            assert(rendered.html.includes(escapeText(faq.items.what_is.q)), lang);
            assert(rendered.html.includes(escapeText(remux.seo.description)), lang);
            assert(!rendered.html.includes('faq.actions.'), lang);
            for (const tool of toolCapabilities) {
                const localizedTool = getSeoRuntimeContent(lang).freeTools.find(item => `/${item.path}` === tool.path);
                assert(localizedTool, `${lang}: missing tool ${tool.id}`);
                assert(rendered.html.includes(escapeText(localizedTool.title)), `${lang}/${tool.id}`);
                assert(rendered.html.includes(`href="/${lang}${tool.path}"`), `${lang}/${tool.id}`);
            }
            for (const schema of rendered.head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(schema[1]);

            setTestLocale(lang);
            const faqHtml = faqPage.render({}).html;
            assert(faqHtml.includes(escapeText(faq.actions.guides)), lang);
            assert(faqHtml.includes(escapeText(faq.actions.directory)), lang);
            assert(faqHtml.includes(`href="/${lang}/guide"`), lang);
        }
    } finally {
        testTranslations.set(key => key);
        testPage.set({ params: { lang: 'en' }, url: new URL('https://freesavevideo.online/en/faq') });
    }
});

test('every advertised download and guide detail renders localized shared labels', async t => {
    const { getSeoRuntimeContent } = load('src/lib/seo/runtime-content.ts');
    const englishLabels = getSeoRuntimeContent('en').labels;
    for (const lang of supportedLanguages) {
        for (const [key, value] of Object.entries(getSeoRuntimeContent(lang).labels)) {
            assert.equal(typeof value, 'string', `${lang}/${key}`);
            assert(value.trim().length > 0, `${lang}/${key}`);
            if (lang !== 'en') assert.notEqual(value, englishLabels[key], `${lang}/${key}`);
        }
    }

    const seenLanguages = new Set();
    let renderedCount = 0;
    for (const kind of ['download', 'guide']) {
        const page = await component(`src/routes/[lang]/${kind}/[slug]/+page.svelte`);
        const loader = load(`src/routes/[lang]/${kind}/[slug]/+page.ts`);
        for (const params of loader.entries()) {
            const labels = getSeoRuntimeContent(params.lang).labels;
            const html = page.render({ data: await loader.load({ params }) }).html;
            const context = `${params.lang}/${kind}/${params.slug}`;
            const hasLabel = (tag, value) => [...html.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, 'g'))]
                .some(match => match[1] === escapeText(value));
            assert(hasLabel('h2', labels.toolsWithoutPoints), context);
            if (kind === 'download') {
                assert(hasLabel('h3', labels.corePages), context);
                assert(hasLabel('h3', labels.similarDownloads), context);
            } else {
                const eyebrow = html.match(/<p class="eyebrow[^\"]*">([^<]*)<\/p>/);
                assert.equal(eyebrow?.[1], escapeText(labels.downloadGuide), context);
            }
            if (params.lang !== 'en') {
                assert(!/>(Free tools without points|Download guide|Core pages|Similar downloads)</.test(html), context);
            }
            seenLanguages.add(params.lang);
            renderedCount++;
        }
    }
    assert.deepEqual([...seenLanguages].sort(), [...supportedLanguages].sort());
    t.diagnostic(`Verified localized shared labels on ${renderedCount} detail pages across ${seenLanguages.size} languages`);
});

test('YouTube guides render distinct instructional content and matching FAQ schema', async () => {
    const page = await component('src/routes/[lang]/guide/[slug]/+page.svelte');
    const { getGuidePage } = load('src/lib/seo/guide-pages.ts');
    for (const lang of ['en', 'zh']) for (const slug of ['youtube-download-guide', 'youtube-shorts-download-guide']) {
        const guide = getGuidePage(slug);
        const landing = getSeoLandingPage(guide.landingSlug);
        const rendered = page.render({ data: { lang, slug, guide, landing } });
        assert(!rendered.html.includes(getSeoLandingLocale(landing, lang).lede));
        assert(rendered.html.includes('Android'));
        assert(rendered.html.includes('iPhone'));
        const faq = [...rendered.head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1])).find(s => s['@type'] === 'FAQPage');
        assert.equal(faq.mainEntity.length, 4);
        for (const question of faq.mainEntity) assert(rendered.html.includes(question.name));
    }
});

test('Korean guide hubs and usage notes do not fall back to English', async () => {
    const lang = 'ko';
    const index = await component('src/routes/[lang]/guide/+page.svelte');
    const indexData = await load('src/routes/[lang]/guide/+page.ts').load({ params: { lang } });
    const indexHtml = index.render({ data: indexData }).html;
    assert(!indexHtml.includes('Download Guides'));
    assert(!indexHtml.includes('Step-by-step download guides for popular platforms.'));
    const detail = await component('src/routes/[lang]/guide/[slug]/+page.svelte');
    const { getGuidePage } = load('src/lib/seo/guide-pages.ts');
    const slug = 'youtube-download-guide';
    const guide = getGuidePage(slug);
    const html = detail.render({ data: { lang, slug, guide, landing: getSeoLandingPage(guide.landingSlug) } }).html;
    assert(!html.includes('Copy the link and paste it into the downloader. Results depend on what the platform provides.'));
    assert(!html.includes('If a link fails, confirm it is publicly accessible and try again later or switch networks.'));
});

test('Spanish, French and Vietnamese SEO titles retain native diacritics', () => {
    const withoutDiacritics = value => value.normalize('NFD').replace(/\p{M}/gu, '');
    for (const lang of ['es', 'fr', 'vi']) {
        const homeTitle = load(`i18n/${lang}/general.json`).seo.home.title;
        const youtubeTitle = getSeoLandingLocale(getSeoLandingPage('youtube-download'), lang).metaTitle;
        assert.notEqual(homeTitle, withoutDiacritics(homeTitle), `${lang}: home title`);
        assert.notEqual(youtubeTitle, withoutDiacritics(youtubeTitle), `${lang}: YouTube title`);
    }
});

test('sitemap contains the repaired hubs and bilingual audio route without noindex entries', async () => {
    const { shouldNoindexLocalizedPath } = load('src/lib/seo/indexing.ts');
    const response = load('src/routes/sitemap.xml/+server.ts').GET();
    const xml = await response.text();
    for (const path of ['/en/download', '/zh/download', '/ja', '/ja/download', '/th', '/th/download', '/en/download/youtube-playlist-to-mp3']) assert(xml.includes(`<loc>https://freesavevideo.online${path}</loc>`));
    assert(!xml.includes('/fr/download/youtube-playlist-to-mp3'));
    for (const lang of supportedLanguages) {
        for (const page of ['guide', 'faq']) {
            assert(!shouldNoindexLocalizedPath(`/${page}`, lang));
            assert(xml.includes(`<loc>https://freesavevideo.online/${lang}/${page}</loc>`));
            assert(xml.includes(`hreflang="${lang}" href="https://freesavevideo.online/${lang}/${page}"`));
        }
    }
    const locations = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
    assert.equal(new Set(locations).size, locations.length);
    for (const location of locations) {
        const [, lang, ...path] = new URL(location).pathname.split('/');
        assert(!shouldNoindexLocalizedPath('/' + path.join('/'), lang), location);
    }
    assert(!xml.includes('<lastmod>undefined</lastmod>'));
    assert(!xml.includes('2026-09-03'));
});

test('English and Chinese home and FAQ copy avoid unsupported service and private-content promises', async () => {
    const faqPage = await component('src/routes/[lang]/faq/+page.svelte');
    const homeSections = await component('src/components/home/HomeDeferredSections.svelte');
    try {
        for (const lang of ['en', 'zh']) {
            const home = load(`i18n/${lang}/home.json`);
            const faq = load(`i18n/${lang}/faq.json`);
            assert.doesNotMatch(JSON.stringify({ home, faq }), /100\s*\+/, lang);
            assert.doesNotMatch(home.platforms.facebook.desc, /public and private|\u516c\u5f00\/\u79c1\u5bc6/, lang);
            if (lang === 'en') {
                assert.match(home.platforms.description, /supported services list/);
                assert.match(home.platforms.description, /source and parsing result/);
                assert.match(home.platforms.facebook.desc, /public Facebook videos and Reels/);
                assert.match(home.platforms.facebook.desc, /Private or login-required content is not supported/);
                assert.match(faq.items.supported_platforms.a, /Only publicly accessible content is supported/);
            } else {
                assert.match(home.platforms.description, /\u652f\u6301\u7684\u7f51\u7ad9/);
                assert.match(home.platforms.description, /\u5b9e\u9645\u89e3\u6790\u7ed3\u679c/);
                assert.match(home.platforms.facebook.desc, /\u516c\u5f00\u7684 Facebook/);
                assert.match(home.platforms.facebook.desc, /\u4e0d\u652f\u6301\u79c1\u5bc6\u6216\u5fc5\u987b\u767b\u5f55/);
                assert.match(faq.items.supported_platforms.a, /\u4ec5\u652f\u6301\u516c\u5f00\u53ef\u8bbf\u95ee\u7684\u5185\u5bb9/);
            }
            setTestLocale(lang, '');
            const homeHtml = homeSections.render({
                currentLocale: lang,
                canonicalUrl: `https://freesavevideo.online/${lang}`,
                platformCards: Object.entries(home.platforms)
                    .filter(([, value]) => typeof value === 'object')
                    .map(([slug, value]) => ({ slug, ...value })),
                guideDescription1: '',
                guideDescription2: '',
            }).html;
            assert(homeHtml.includes(escapeText(home.platforms.description)), lang);
            assert(homeHtml.includes(escapeText(home.platforms.facebook.desc)), lang);
            assert.doesNotMatch(homeHtml, /100\s*\+|public and private|\u516c\u5f00\/\u79c1\u5bc6/, lang);
            setTestLocale(lang);
            const rendered = faqPage.render({});
            assert(rendered.html.includes(escapeText(faq.items.supported_platforms.a)), lang);
            assert.doesNotMatch(rendered.html, /100\s*\+/, lang);
            const schema = [...rendered.head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
                .map(match => JSON.parse(match[1])).find(item => item['@type'] === 'FAQPage');
            assert(schema, lang);
            const supported = schema.mainEntity.find(item => item.name === faq.items.supported_platforms.q);
            assert.equal(supported?.acceptedAnswer.text, faq.items.supported_platforms.a, lang);
            assert.doesNotMatch(JSON.stringify(schema), /100\s*\+/, lang);
        }
    } finally {
        testTranslations.set(key => key);
        testPage.set({ params: { lang: 'en' }, url: new URL('https://freesavevideo.online/en/faq') });
    }
});

test('Thai downloader copy matches production account, public-content and logging behavior', () => {
    const faq = load('i18n/th/faq.json').items;
    const home = load('i18n/th/home.json');
    const privacy = readFileSync(resolve(root, 'i18n/th/about/privacy.md'), 'utf8');
    const about = readFileSync(resolve(root, 'i18n/th/about/general.md'), 'utf8');
    const appTemplate = readFileSync(resolve(root, 'src/app.html'), 'utf8');
    const hooks = readFileSync(resolve(root, 'src/hooks.server.ts'), 'utf8');

    assert.match(faq.youtube_supported.a, /YouTube/);
    assert.match(faq.youtube_supported.a, /สาธารณะ/);
    assert.match(faq.need_login.a, /เข้าสู่ระบบ/);
    assert.match(home.platforms.facebook.desc, /สาธารณะ/);
    assert.match(faq.supported_platforms.a, /yt-dlp/);
    assert.doesNotMatch(faq.supported_platforms.a, /100\+/);
    assert.doesNotMatch(privacy, /URL ต้นทาง/);
    assert.match(privacy, /2 วัน/);
    assert.doesNotMatch(about, /นโยบายไม่เก็บบันทึก/);
    assert.match(appTemplate, /lang="__FSV_DOCUMENT_LANGUAGE__"/);
    assert.match(hooks, /transformPageChunk/);
});

test('Japanese downloader copy matches production account, public-content and logging behavior', () => {
    const faq = load('i18n/ja/faq.json').items;
    const home = load('i18n/ja/home.json');
    const privacy = readFileSync(resolve(root, 'i18n/ja/about/privacy.md'), 'utf8');
    const about = readFileSync(resolve(root, 'i18n/ja/about/general.md'), 'utf8');

    assert.match(faq.youtube_supported.a, /YouTube/);
    assert.match(faq.youtube_supported.a, /公開/);
    assert.match(faq.need_login.a, /ログイン/);
    assert.match(home.platforms.facebook.desc, /公開/);
    assert.match(faq.supported_platforms.a, /yt-dlp/);
    assert.doesNotMatch(faq.supported_platforms.a, /100\+|100以上/);
    assert.doesNotMatch(privacy, /URL.*(?:保存|保持|記録)|(?:保存|保持|記録).*URL/);
    assert.match(privacy, /2 日/);
    assert.doesNotMatch(about, /ゼロログ/);
});
