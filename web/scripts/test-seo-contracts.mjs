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
    '$app/environment': { browser: false, dev: false, building: false },
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

// Preload real nested components for this synchronous SSR module loader.
framework['$components/learn/AlternativeArticle.svelte'] = { __esModule: true, default: await component('src/components/learn/AlternativeArticle.svelte') };
framework['$components/save/GoogleDriveDownloadForm.svelte'] = { __esModule: true, default: await component('src/components/save/GoogleDriveDownloadForm.svelte') };
framework['$components/save/AparatDownloadForm.svelte'] = { __esModule: true, default: await component('src/components/save/AparatDownloadForm.svelte') };
framework['$components/aparat/AparatDownloadPage.svelte'] = { __esModule: true, default: await component('src/components/aparat/AparatDownloadPage.svelte') };
framework['$components/save/SupportLink.svelte'] = { __esModule: true, default: await component('src/components/save/SupportLink.svelte') };
framework['$components/youtube/YouTubeDownloadPage.svelte'] = { __esModule: true, default: await component('src/components/youtube/YouTubeDownloadPage.svelte') };
for (const name of ['SourceDownloadForm', 'RedditDownloadPage', 'PinterestDownloadPage']) {
    framework[`$components/social/${name}.svelte`] = { __esModule: true, default: await component(`src/components/social/${name}.svelte`) };
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

framework['$components/home/PlatformMark.svelte'] = {
    __esModule: true,
    default: await component('src/components/home/PlatformMark.svelte'),
};

const escapeText = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const routes = load('src/lib/seo/route-locales.ts');
const links = load('src/lib/seo/internal-links.ts');
const { supportedLanguages } = load('src/lib/seo/language-routing.ts');
const { seoLandingSlugs, getSeoLandingPage, getSeoLandingLocale } = load('src/lib/seo/landing-pages.ts');

test('Aparat has real English and Persian pages without inventing Persian app routes', () => {
    const slug = 'aparat-video-downloader';
    assert.deepEqual(routes.getDownloadSeoLanguages(slug), ['en', 'fa']);
    assert.equal(links.isDownloadAvailableInLanguage(slug, 'zh'), false);
    assert.equal(links.isDownloadAvailableInLanguage('youtube-download', 'fa'), false);
    const routing = load('src/lib/seo/language-routing.ts');
    const indexing = load('src/lib/seo/indexing.ts');
    const path = '/fa/download/aparat-video-downloader';
    assert.equal(routing.isLangPrefixedPath(path), true);
    assert.deepEqual(indexing.getLocalizedRoute(path), { lang: 'fa', path: '/download/aparat-video-downloader' });
    assert.equal(indexing.getLocalizedRoute('/fa/download/youtube-download'), null);
    assert.equal(indexing.shouldNoindexLocalizedPath('/download/aparat-video-downloader', 'fa'), false);
});

test('Aparat input accepts page links while rejecting lookalikes, credentials and media URLs', () => {
    const { parseAparatInput: parse } = load('src/lib/seo/aparat-input.ts');
    assert.equal(parse('https://www.aparat.com/shorts/2112380547795222528?ref=share').url, 'https://www.aparat.com/shorts/2112380547795222528');
    assert.equal(parse('https://www.aparat.com/playlist/531891').playlist, true);
    assert.deepEqual(parse('https://www.aparat.com/v/7R9YB?playlist=531891'), {
        url: 'https://www.aparat.com/playlist/531891', playlist: true,
    });
    for (const input of ['https://aparat.com.evil.test/v/test', 'https://user:pass@aparat.com/v/test',
        'https://aparat.com:9000/v/test', 'https://aparat.com/channel', 'https://cdn.asset.aparat.com/test.mp4', 'https://aparat.com/shorts/not-a-number']) {
        assert.equal(parse(input), null, input);
    }
});

test('homepage sends Aparat playlist links to expansion before the single-video handler', () => {
    const { parseAparatInput } = load('src/lib/seo/aparat-input.ts');
    const source = readFileSync(resolve(root, 'src/components/save/Omnibox.svelte'), 'utf8');
    const gate = source.match(/\/\/ Only expand for services[^\n]*\n\s*if\s*\(([\s\S]*?)\)\s*\{/)[1];
    const bypassExpansion = new Function('url', 'parseAparatInput',
        'isBilibiliUrl', 'isDouyinUrl', 'isTikTokUrl', 'isYouTubePlaylistCandidateUrl', 'isPodcastFeedCandidateUrl',
        `return (${gate});`);
    const bypass = url => bypassExpansion(url, parseAparatInput, ...Array(5).fill(() => false));
    assert.equal(bypass('https://www.aparat.com/playlist/531891'), false);
    assert.equal(bypass('https://www.aparat.com/v/7R9YB?playlist=531891'), false);
    assert.equal(bypass('https://www.aparat.com/v/7R9YB'), true);
    assert.equal(bypass('https://www.aparat.com/shorts/2112380547795222528'), true);
    assert.equal(bypass('https://aparat.com.evil.test/playlist/531891'), true);
});

test('Aparat SSR localizes the whole landing and exposes honest matching machine-readable facts', async () => {
    const detail = await component('src/routes/[lang]/download/[slug]/+page.svelte');
    const landing = getSeoLandingPage('aparat-video-downloader');
    for (const lang of ['en', 'fa']) {
        setTestLocale(lang, 'download/aparat-video-downloader');
        const content = getSeoLandingLocale(landing, lang);
        const rendered = detail.render({ data: { lang, slug: landing.slug, landing, guideSlug: null, relatedPages: [], relatedLearnPages: [] } });
        assert.ok(rendered.html.includes(escapeText(content.h1)));
        assert.equal((rendered.html.match(/<h1\b/g) || []).length, 1);
        assert.ok(rendered.html.includes(`dir="${lang === 'fa' ? 'rtl' : 'ltr'}"`));
        assert.ok(rendered.html.includes('id="aparat-url"'));
        assert.ok(rendered.html.includes('dir="ltr"'));
        assert.ok(rendered.html.includes('/fa/download/aparat-video-downloader'));
        for (const faq of content.faqs) assert.ok(rendered.html.includes(escapeText(faq.a)));
        const data = [...rendered.head.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(([, text]) => JSON.parse(text));
        assert.equal(data.length, 1);
        const graph = data[0]['@graph'];
        assert.equal(graph.find(item => item['@type'] === 'WebPage').inLanguage, lang);
        assert.equal(graph.find(item => item['@type'] === 'WebPage').dateModified, '2026-10-25');
        assert.deepEqual(graph.find(item => item['@type'] === 'FAQPage').mainEntity.map(item => item.acceptedAnswer.text), content.faqs.map(item => item.a));
        assert.equal(graph.find(item => item['@type'] === 'WebApplication').offers, undefined);
        assert.equal(graph.find(item => item['@type'] === 'WebApplication').aggregateRating, undefined);
        assert.ok(!rendered.head.includes('"totalTime"'));
    }
});

test('social source inputs reject unrelated sites, feeds, resource URLs and batches', () => {
    const { parseSocialDownloadInput: parse } = load('src/lib/seo/social-download-input.ts');
    assert.equal(parse('reddit', 'https://www.reddit.com/r/videos/comments/abc123/a_title/'), 'https://www.reddit.com/r/videos/comments/abc123/a_title/');
    assert.equal(parse('reddit', 'https://old.reddit.com/comments/abc123'), 'https://old.reddit.com/comments/abc123');
    assert.equal(parse('reddit', 'https://www.reddit.com/r/videos/s/AbC123'), 'https://www.reddit.com/r/videos/s/AbC123');
    assert.equal(parse('reddit', 'https://redd.it/abc123'), 'https://redd.it/abc123');
    assert.equal(parse('pinterest', 'https://www.pinterest.com/pin/1129136937861945132/'), 'https://www.pinterest.com/pin/1129136937861945132/');
    assert.equal(parse('pinterest', 'https://pin.it/AbC123'), 'https://pin.it/AbC123');
    assert.equal(parse('pinterest', 'https://www.pinterest.ca/pin/70437485604616/'), 'https://www.pinterest.ca/pin/70437485604616/');
    assert.equal(parse('pinterest', 'https://www.pinterest.com/pin/a-video--1129136937861945132/'), 'https://www.pinterest.com/pin/a-video--1129136937861945132/');
    for (const platform of ['reddit', 'pinterest']) {
        for (const value of ['https://reddit.com.evil.test/comments/abc123', 'https://pinterest.com.evil.test/pin/123/', 'https://user:pass@reddit.com/comments/abc123', 'https://www.reddit.com/r/videos/', 'https://www.pinterest.com/person/board/', 'https://v.redd.it/abc123/DASH_720.mp4', 'https://i.pinimg.com/image.jpg', 'javascript:alert(1)', 'https://redd.it/abc123 https://pin.it/AbC123']) {
            assert.equal(parse(platform, value), null, `${platform}: ${value}`);
        }
    }
});

test('Reddit and Pinterest SSR expose distinct usable pages and only their visible claims in every locale', async () => {
    const detail = await component('src/routes/[lang]/download/[slug]/+page.svelte');
    for (const [slug, platform] of [['reddit-video-download', 'reddit'], ['pinterest-video-download', 'pinterest']]) {
        const landing = getSeoLandingPage(slug);
        for (const lang of routes.getDownloadSeoLanguages(slug)) {
            const content = getSeoLandingLocale(landing, lang);
            assert.equal(content.faqs.length, 3, `${slug}/${lang}`);
            assert.equal(content.facts.length, 3);
            if (lang !== 'en') {
                assert.notEqual(content.lede, landing.locales.en.lede, lang);
                assert.notEqual(content.facts[0], landing.locales.en.facts[0], lang);
            }
            setTestLocale(lang, `download/${slug}`);
            const result = detail.render({ data: { lang, slug, landing, guideSlug: null, relatedPages: [], relatedLearnPages: [] } });
            assert(result.html.includes(`class="${platform}-page `));
            assert(result.html.includes(`id="${platform}-source-url"`));
            assert(!result.html.includes('class="services"'));
            assert(!result.html.includes('hero-omnibox'));
            for (const text of [content.h1, content.lede, ...content.facts, ...content.faqs.map(faq => faq.a)]) {
                assert(result.html.includes(escapeText(text)), `${slug}/${lang}: ${text}`);
            }
            const schema = [...result.head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
            const application = schema.find(item => item['@type'] === 'WebPage').mainEntity;
            assert.deepEqual(application.featureList, content.features);
            assert(!application.knowsAbout.includes('playlist download'));
            assert(!application.knowsAbout.includes('batch download'));
            assert.equal(application.offers, undefined);
            assert.equal(schema.find(item => item['@type'] === 'HowTo').totalTime, undefined);
            assert.deepEqual(schema.find(item => item['@type'] === 'FAQPage').mainEntity.map(item => item.acceptedAnswer.text), content.faqs.map(faq => faq.a));
        }
    }
});

test('Dailymotion landing is fully localized in every supported language with accurate download limits', async () => {
    const slug = 'dailymotion-video-downloader';
    assert.deepEqual(routes.getDownloadSeoLanguages(slug), [...supportedLanguages]);
    assert(links.featuredDownloadLinks.some(item => item.slug === slug));
    const detail = await component('src/routes/[lang]/download/[slug]/+page.svelte');
    const landing = getSeoLandingPage(slug);
    const { dailymotionUiLocales } = load('src/lib/seo/dailymotion-ui.ts');
    assert.deepEqual(Object.keys(landing.locales).sort(), [...supportedLanguages].sort());
    assert.deepEqual(Object.keys(dailymotionUiLocales).sort(), [...supportedLanguages].sort());
    for (const lang of supportedLanguages) {
        const content = landing.locales[lang];
        const ui = dailymotionUiLocales[lang];
        assert.deepEqual(getSeoLandingLocale(landing, lang).faqs, content.faqs);
        assert.equal(content.faqs.length, 6, lang);
        assert.equal(content.steps.length, 4, lang);
        assert.equal(content.supportedLinks.length, 3, lang);
        if (lang !== 'en') {
            assert.notEqual(content.lede, landing.locales.en.lede, lang);
            for (const faq of content.faqs) assert(!landing.locales.en.faqs.some(item => item.a === faq.a), lang);
        }
        setTestLocale(lang, `download/${slug}`);
        const result = detail.render({ data: { lang, slug, landing, guideSlug: null, relatedPages: [], relatedLearnPages: [] } });
        assert(result.html.includes('id="dailymotion-url"'));
        assert(result.html.includes('name="u"'));
        assert(result.html.includes(escapeText(landing.locales[lang].h1)));
        assert(result.html.includes(escapeText(landing.locales[lang].faqs[2].a)), lang);
        for (const label of [ui.urlLabel, ui.continueLabel, ui.exampleTitle, ui.formatsTitle]) {
            assert(result.html.includes(escapeText(label)), `${lang}: ${label}`);
        }
        assert(result.head.includes(escapeText(content.metaTitle)), lang);
        if (lang !== 'en') {
            assert(!result.html.includes('Continue to download'), lang);
            assert(!result.html.includes('Supported video URL formats'), lang);
        }
        if (lang === 'fr') {
            assert(result.html.includes('Liens vid\u00e9o compatibles'));
            assert(result.html.includes('Continuer le t\u00e9l\u00e9chargement'));
            assert(!result.html.includes('Continue to download'));
            assert(!result.html.includes('Supported video URL formats'));
            assert(result.head.includes(escapeText(landing.locales.fr.metaTitle)));
        }
        const schema = [...result.head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
        assert.equal(schema.find(item => item['@type'] === 'WebPage').inLanguage, lang);
        assert.equal(schema.find(item => item['@type'] === 'WebPage').mainEntity.operatingSystem, ui.browserLabel);
        assert.deepEqual(schema.find(item => item['@type'] === 'FAQPage').mainEntity.map(item => item.acceptedAnswer.text), content.faqs.map(item => item.a));
        assert(!schema.find(item => item['@type'] === 'HowTo').totalTime);
        assert(!schema.find(item => item['@type'] === 'WebPage').mainEntity.offers);
        assert(!schema.find(item => item['@type'] === 'WebPage').mainEntity.knowsAbout.includes('playlist download'));
    }
    setTestLocale('en');
    const xml = await load('src/routes/sitemap.xml/+server.ts').GET().text();
    for (const lang of supportedLanguages) {
        assert(xml.includes(`<loc>https://freesavevideo.online/${lang}/download/${slug}</loc>`));
        assert(xml.includes(`hreflang="${lang}" href="https://freesavevideo.online/${lang}/download/${slug}"`));
    }
});

test('remux delegates its canonical link to the shared language layout', () => {
    const layout = readFileSync(resolve(root, 'src/routes/[lang]/+layout.svelte'), 'utf8');
    const remux = readFileSync(resolve(root, 'src/routes/[lang]/remux/+page.svelte'), 'utf8');
    const canonicalLinks = source => [...source.matchAll(/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/g)];
    assert.equal(canonicalLinks(remux).length, 0, 'remux must not duplicate the layout canonical');
    const layoutLinks = canonicalLinks(layout);
    assert.equal(layoutLinks.length, 1, 'the shared layout must own exactly one canonical');
    assert.match(layoutLinks[0][0], /href=\{canonicalUrl\}/);
    assert.match(remux, /url:\s*canonicalUrl/, 'keep the localized URL in WebApplication JSON-LD');
    // Render the real canonical declarations in isolation from the browser-only UI.
    // Remux is dynamic SSR, so this check must not depend on prerendered HTML files.
    const source = `<script>export let canonicalUrl;</script><svelte:head>${layoutLinks.map(match => match[0]).join('')}</svelte:head>`;
    const filename = resolve(root, 'src/routes/[lang]/+layout.svelte');
    const head = evaluate(compile(source, { filename, generate: 'ssr' }).js.code, filename).default;
    for (const lang of supportedLanguages) {
        const canonicalUrl = `https://freesavevideo.online/${lang}/remux`;
        const rendered = canonicalLinks(head.render({ canonicalUrl }).head);
        assert.equal(rendered.length, 1, lang);
        assert(rendered[0][0].includes(`href="${canonicalUrl}"`), lang);
    }
});

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

test('alternative articles replace the combined URL with independent indexable pages', async () => {
    const { learnSlugs, getLearnPage } = load('src/lib/seo/learn-pages.ts');
    const { getLegacyRedirectTarget } = load('src/lib/seo/indexing.ts');
    const route = load('src/routes/[lang]/learn/[slug]/+page.ts');
    const legacySlug = 'cobalt-tools-savefrom-alternative';
    assert(!learnSlugs.includes(legacySlug), 'The old article must leave the hub and sitemap');
    assert(route.entries().some(({ slug }) => slug === legacySlug), 'Prerender the permanent redirect');
    for (const suffix of ['', '/']) {
        assert.equal(getLegacyRedirectTarget(`/en/learn/${legacySlug}${suffix}`), '/en/learn/cobalt-tools-alternative');
    }
    await assert.rejects(route.load({ params: { lang: 'en', slug: legacySlug } }), {
        status: 308, location: '/en/learn/cobalt-tools-alternative',
    });
    await assert.rejects(route.load({ params: { lang: 'zh', slug: 'savefrom-alternative' } }), { status: 404 });
    const articleComponent = await component('src/routes/[lang]/learn/[slug]/+page.svelte');
    const sitemap = await load('src/routes/sitemap.xml/+server.ts').GET().text();
    assert(!sitemap.includes(`/learn/${legacySlug}`));
    for (const slug of ['cobalt-tools-alternative', 'savefrom-alternative']) {
        const article = getLearnPage(slug);
        assert(article);
        assert(sitemap.includes(`/en/learn/${slug}</loc>`));
        const result = await route.load({ params: { lang: 'en', slug } });
        assert.equal(result.article, article);
        const rendered = articleComponent.render({ data: result });
        assert(rendered.html.includes(article.title));
        const other = slug === 'cobalt-tools-alternative' ? 'savefrom-alternative' : 'cobalt-tools-alternative';
        assert(rendered.html.includes(`href="/en/learn/${other}"`));
        const structured = [...rendered.head.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
            .map(([, json]) => JSON.parse(json));
        assert(structured.some(item => item['@type'] === 'Article' && item.mainEntityOfPage.endsWith(`/learn/${slug}`)));
        assert(structured.some(item => item['@type'] === 'FAQPage' && item.mainEntity.length === article.faqs.length));
        if (slug === 'cobalt-tools-alternative') {
            assert(rendered.html.includes('href="https://api.cobalt.tools/"'));
            assert(rendered.html.includes('October 23, 2026'));
        }
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
        assert(!/yt-dlp/i.test(rendered.html));
        const schemas = [...rendered.head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
        const itemList = schemas.find(schema => schema['@type'] === 'ItemList');
        assert(itemList);
        for (const item of itemList.itemListElement) assert(rendered.html.includes(item.url.replace('https://freesavevideo.online', '')));
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

test('platform catalog matches the backend version and all logo references are local assets', () => {
    const catalog = load('src/lib/data/platform-directory.json');
    const dockerfile = readFileSync(resolve(root, '../Dockerfile'), 'utf8');
    assert.equal(catalog.sourceVersion, dockerfile.match(/ARG YTDLP_VERSION=([\d.]+)/)[1]);
    assert(catalog.primary.length >= 28);
    assert(catalog.additional.length > 500);
    const ids = new Set();
    for (const platform of [...catalog.primary, ...catalog.additional]) {
        assert(!ids.has(platform.id), platform.id);
        ids.add(platform.id);
        if (platform.logo) assert(existsSync(resolve(root, `static/platforms/${platform.logo}.svg`)));
        if (platform.image) assert(existsSync(resolve(root, `static${platform.image}`)));
    }
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
            setTestLocale(params.lang, `${kind}/${params.slug}`);
            const labels = getSeoRuntimeContent(params.lang).labels;
            const html = page.render({ data: await loader.load({ params }) }).html;
            const context = `${params.lang}/${kind}/${params.slug}`;
            const hasLabel = (tag, value) => [...html.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, 'g'))]
                .some(match => match[1] === escapeText(value));
            if (kind === 'download' && params.slug === 'youtube-download') {
                const copy = load('src/lib/youtube/copy.ts').getYouTubeCopy(params.lang);
                assert(html.includes(escapeText(copy.input)), context);
                assert(html.includes(escapeText(copy.placeholder)), context);
                assert(html.includes('id="youtube-query"'), context);
                assert(!html.includes('class="omnibox'), context);
            } else if (kind === 'download' && ['reddit-video-download', 'pinterest-video-download'].includes(params.slug)) {
                const platform = params.slug.startsWith('reddit') ? 'reddit' : 'pinterest';
                assert(html.includes(`id="${platform}-source-url"`), context);
                assert(!html.includes('class="omnibox'), context);
            } else if (kind === 'download' && params.slug === 'aparat-video-downloader') {
                const ui = load('src/lib/seo/aparat-landing.ts').aparatUi[params.lang];
                assert(html.includes(escapeText(ui.label)), context);
                assert(html.includes('id="aparat-url"'), context);
                assert(!html.includes('class="omnibox'), context);
            } else if (kind === 'download') {
                const focused = params.slug === 'dailymotion-video-downloader'
                    || params.slug === 'google-drive-video-downloader'
                    || load('src/lib/seo/tiktok-content.ts').isTiktokLanding(params.slug)
                    || (params.lang === 'en' && params.slug === 'vimeo-video-download')
                    || (params.lang === 'de' && load('src/lib/seo/de-priority-landings.ts').isDePriorityLanding(params.slug))
                    || (params.lang === 'th' && load('src/lib/seo/th-priority-landings.ts').isThPriorityLanding(params.slug));
                if (!focused) assert(hasLabel('h2', labels.toolsWithoutPoints), context);
                assert(hasLabel('h3', labels.corePages), context);
                assert(hasLabel('h3', labels.similarDownloads), context);
            } else {
                if (!params.slug.startsWith('tiktok-')) assert(hasLabel('h2', labels.toolsWithoutPoints), context);
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
    assert.deepEqual([...seenLanguages].sort(), [...supportedLanguages, 'fa'].sort());
    t.diagnostic(`Verified localized shared labels on ${renderedCount} detail pages across ${seenLanguages.size} languages`);
});

test('English Vimeo landing exposes a working SSR entry and accurate download schema', async () => {
    const page = await component('src/routes/[lang]/download/[slug]/+page.svelte');
    const loader = load('src/routes/[lang]/download/[slug]/+page.ts');
    const params = { lang: 'en', slug: 'vimeo-video-download' };
    setTestLocale(params.lang, `download/${params.slug}`);
    const data = await loader.load({ params });
    const rendered = page.render({ data });
    assert(rendered.html.includes('id="vimeo-url" name="u" type="url"'));
    assert(rendered.html.includes('action="/en" method="GET"') || rendered.html.includes('action="/en/" method="GET"'));
    assert(rendered.html.indexOf('id="vimeo-url"') < rendered.html.indexOf('How to download Vimeo videos'));
    assert(rendered.html.includes('Vimeo to MP4: what happens to your video?'));
    assert(!rendered.html.includes('Free tools without points'));
    const schemas = [...rendered.head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
    const faq = schemas.find(s => s['@type'] === 'FAQPage');
    assert.equal(faq.mainEntity.length, data.landing.locales.en.faqs.length);
    for (const question of faq.mainEntity) assert(rendered.html.includes(escapeText(question.name)));
    assert(!schemas.find(s => s['@type'] === 'HowTo').totalTime);
    const app = schemas.find(s => s['@type'] === 'WebPage').mainEntity;
    assert(!app.offers);
    assert(!app.knowsAbout.includes('playlist download'));
});

test('Google Drive landing has a focused download entry, discoverable English route and truthful schema', async () => {
    const slug = 'google-drive-video-downloader';
    assert.deepEqual(routes.getDownloadSeoLanguages(slug), ['en']);
    const loader = load('src/routes/[lang]/download/[slug]/+page.ts');
    assert.deepEqual(loader.entries().filter(entry => entry.slug === slug), [{lang:'en',slug}]);
    const directory = await load('src/routes/[lang]/download/+page.ts').load({params:{lang:'en'}});
    assert(directory.cards.some(card => card.slug === slug));
    assert(links.getRelatedDownloadLinks('vimeo-video-download', 6, 'international', 'en').some(link => link.slug === slug));
    const data = await loader.load({params:{lang:'en',slug}});
    setTestLocale('en', `download/${slug}`);
    const rendered = (await component('src/routes/[lang]/download/[slug]/+page.svelte')).render({data});
    assert(rendered.html.includes('id="google-drive-url" name="u" type="url"'));
    assert(rendered.html.includes('Download Google Drive video'));
    assert(rendered.html.indexOf('id="google-drive-url"') < rendered.html.indexOf('How to download a Google Drive video'));
    assert(!rendered.html.includes('Free tools without points'));
    assert(rendered.head.includes(data.landing.locales.en.metaTitle));
    assert(!rendered.html.includes('Other supported collection formats'));
    const schemas = [...rendered.head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
    const webpage = schemas.find(item => item['@type'] === 'WebPage');
    assert.equal(webpage.url, `https://freesavevideo.online/en/download/${slug}`);
    assert(!webpage.mainEntity.offers);
    assert(!webpage.mainEntity.knowsAbout.includes('playlist download'));
    assert(!schemas.find(item => item['@type'] === 'HowTo').totalTime);
    const faq = schemas.find(item => item['@type'] === 'FAQPage');
    assert.equal(faq.mainEntity.length, data.landing.locales.en.faqs.length);
    for (const question of faq.mainEntity) {
        assert(rendered.html.includes(escapeText(question.name)));
        assert(rendered.html.includes(escapeText(question.acceptedAnswer.text)));
    }
});

test('Google Drive form accepts video links, preserves access parameters and rejects unrelated targets', () => {
    const {parseGoogleDriveVideoInput:parse} = load('src/lib/seo/google-drive-input.ts');
    for (const suffix of ['view', 'preview']) {
        const url = `https://drive.google.com/file/d/example_ID-123/${suffix}?usp=sharing&resourcekey=example-key`;
        assert.equal(parse(` ${url} `), url);
    }
    for (const value of ['https://drive.google.com.evil.test/file/d/id/view', 'https://user:pass@drive.google.com/file/d/id/view', 'https://drive.google.com:8080/file/d/id/view', 'https://drive.google.com/drive/folders/id', 'https://docs.google.com/document/d/id/edit', 'javascript:alert(1)', 'http://drive.google.com/file/d/id/view', 'https://drive.google.com/file/d/id/view https://example.com']) assert.equal(parse(value), null, value);
});

test('dedicated YouTube workspace renders keyword controls and FAQ schema in every supported language', async () => {
    const page = await component('src/routes/[lang]/download/[slug]/+page.svelte');
    const loader = load('src/routes/[lang]/download/[slug]/+page.ts');
    const { getYouTubeCopy } = load('src/lib/youtube/copy.ts');
    const english = getYouTubeCopy('en');
    for (const lang of supportedLanguages) {
        const data = await loader.load({ params: { lang, slug: 'youtube-download' } });
        const rendered = page.render({ data });
        const copy = getYouTubeCopy(lang);
        assert(rendered.html.includes(escapeText(copy.placeholder)), lang);
        assert(rendered.html.includes('2026 top songs'), lang);
        if (lang !== 'en') assert.notEqual(copy.search, english.search, lang);
        for (const schema of rendered.head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
            const value = JSON.parse(schema[1]);
            if (value['@type'] === 'FAQPage') for (const question of value.mainEntity) {
                assert(rendered.html.includes(escapeText(question.name)), lang);
            }
        }
    }
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

test('TikTok pilot SSR separates download tasks from saving guides without duplicate FAQ or unrelated promotions', async () => {
    const download = await component('src/routes/[lang]/download/[slug]/+page.svelte');
    const guidePage = await component('src/routes/[lang]/guide/[slug]/+page.svelte');
    const { getGuidePage } = load('src/lib/seo/guide-pages.ts');
    const { tiktokLandingSlugs, getTiktokLandingContent, getTiktokGuideContent } = load('src/lib/seo/tiktok-content.ts');
    const loader = load('src/routes/[lang]/download/[slug]/+page.ts');
    const guideSlugs = ['tiktok-download-guide', 'tiktok-collection-download-guide', 'tiktok-mp3-download-guide'];
    for (const lang of ['en', 'zh']) for (const [index, slug] of tiktokLandingSlugs.entries()) {
        const content = getTiktokLandingContent(slug, lang);
        const guideContent = getTiktokGuideContent(guideSlugs[index], lang);
        assert.notEqual(content.lede, guideContent.lede);
        assert(!guideContent.faqs.some(faq => content.faqs.some(item => item.q === faq.q)), slug);
        setTestLocale(lang, `download/${slug}`);
        const renderedDownload = download.render({ data: await loader.load({ params: { lang, slug } }) });
        assert(renderedDownload.html.includes('id="tiktok-source-url"'));
        assert(renderedDownload.html.includes('name="u"'));
        assert(renderedDownload.html.includes(`action="/${lang}"`));
        assert(renderedDownload.html.includes(slug === 'tiktok-collection-download' ? '<textarea' : 'type="url"'));
        const webPage = [...renderedDownload.head.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
            .map(match => JSON.parse(match[1])).find(value => value['@type'] === 'WebPage');
        assert.equal(webPage.mainEntity.offers, undefined, 'do not advertise every TikTok task as a zero-price offer');
        const guide = getGuidePage(guideSlugs[index]);
        setTestLocale(lang, `guide/${guide.slug}`);
        const renderedGuide = guidePage.render({ data: { lang, slug: guide.slug, guide, landing: getSeoLandingPage(slug) } });
        for (const [result, expected] of [[renderedDownload, content], [renderedGuide, guideContent]]) {
            assert(result.html.includes(load('src/lib/extension/freesavevideo.ts').FREESAVEVIDEO_EXTENSION_STORE_URL));
            const summaries = [...result.html.matchAll(/<summary[^>]*>(.*?)<\/summary>/gs)].map(match => match[1]);
            assert.equal(summaries.length, expected.faqs.length, `${lang}/${slug}`);
            assert.equal(new Set(summaries).size, summaries.length);
            const schema = [...result.head.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
                .map(match => JSON.parse(match[1])).find(value => value['@type'] === 'FAQPage');
            assert.deepEqual(schema.mainEntity.map(value => value.name), expected.faqs.map(value => value.q));
            assert(!result.html.includes(`href="/${lang}/random-chat"`));
            assert(!result.html.includes(`href="/${lang}/discover"`));
            assert(!result.html.includes('Platform advantages'));
            for (const item of expected.faqs) assert(result.html.includes(escapeText(item.a)));
        }
        for (const section of guideContent.sections) assert(renderedGuide.html.includes(escapeText(section.title)));
    }
    assert.equal(getTiktokLandingContent('tiktok-no-watermark', 'fr'), null);
    assert.equal(getTiktokGuideContent('youtube-download-guide', 'en'), null);
});

test('TikTok sitemap dates track the edited pages without refreshing unrelated content', async () => {
    const { tiktokContentUpdatedAt } = load('src/lib/seo/tiktok-content.ts');
    const xml = await load('src/routes/sitemap.xml/+server.ts').GET().text();
    const entries = [...xml.matchAll(/<url>(.*?)<\/url>/gs)].map(match => match[1]);
    const tiktokEntries = entries.filter(entry => /\/(download|guide)\/tiktok-/.test(entry));
    assert.equal(tiktokEntries.length, 66);
    for (const entry of tiktokEntries) assert(entry.includes(`<lastmod>${tiktokContentUpdatedAt}</lastmod>`));
    for (const entry of entries.filter(entry => !tiktokEntries.includes(entry))) {
        assert(!entry.includes(`<lastmod>${tiktokContentUpdatedAt}</lastmod>`));
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
    assert(xml.includes('<loc>https://freesavevideo.online/en/download/google-drive-video-downloader</loc>'));
    assert(!xml.includes('/zh/download/google-drive-video-downloader'));
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
