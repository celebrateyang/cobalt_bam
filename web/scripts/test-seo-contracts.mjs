import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import { compile, preprocess } from 'svelte/compiler';
import * as svelteInternal from 'svelte/internal';
import * as svelteStore from 'svelte/store';

// Load the real route/data modules without a production build or network calls.
// Only framework context and the decorative supported-services strip are stubbed.
const root = fileURLToPath(new URL('../', import.meta.url));
const cache = new Map();
const framework = {
    '$env/static/public': {},
    '@sveltejs/kit': {
        redirect(status, location) { throw Object.assign(new Error('redirect'), { status, location }); },
        error(status, message) { throw Object.assign(new Error(message), { status }); },
    },
    'svelte/internal': svelteInternal,
    'svelte/store': svelteStore,
    '$app/stores': { page: svelteStore.readable({ params: { lang: 'en' }, url: new URL('https://freesavevideo.online/en/faq') }) },
    '$lib/i18n/translations': { t: svelteStore.readable(key => key) },
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

test('sitemap contains the repaired hubs and bilingual audio route without noindex entries', async () => {
    const { shouldNoindexLocalizedPath } = load('src/lib/seo/indexing.ts');
    const response = load('src/routes/sitemap.xml/+server.ts').GET();
    const xml = await response.text();
    for (const path of ['/en/download', '/zh/download', '/en/download/youtube-playlist-to-mp3']) assert(xml.includes(`<loc>https://freesavevideo.online${path}</loc>`));
    assert(!xml.includes('/fr/download/youtube-playlist-to-mp3'));
    const locations = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
    assert.equal(new Set(locations).size, locations.length);
    for (const location of locations) {
        const [, lang, ...path] = new URL(location).pathname.split('/');
        assert(!shouldNoindexLocalizedPath('/' + path.join('/'), lang), location);
    }
    assert(!xml.includes('<lastmod>undefined</lastmod>'));
    assert(!xml.includes('2026-09-03'));
});
