import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const template = readFileSync(new URL('../src/app.html', import.meta.url), 'utf8');
const bootstrap = [...template.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map(([, source]) => source).find(source => source.includes('window.dataLayer'));
assert(bootstrap, 'Analytics bootstrap must exist');

function visit(pathname) {
    const scripts = [];
    const listeners = new Map();
    const timers = [];
    const window = {
        location: { pathname },
        addEventListener(name, callback) { listeners.set(name, callback); },
        setTimeout(callback) { timers.push(callback); },
        requestIdleCallback(callback) { callback(); },
    };
    const document = {
        referrer: '', hidden: false,
        createElement() { return { setAttribute() {}, addEventListener() {} }; },
        head: { appendChild(script) { scripts.push(script); } },
    };
    runInNewContext(bootstrap, { window, document, URL });
    return {
        scripts, window, listeners, timers,
        configCount: () => window.dataLayer.filter(args => args[0] === 'config').length,
    };
}

test('comparison landing visits load analytics without requiring interaction or advertising', () => {
    for (const path of ['en', 'zh', 'de', 'es', 'fr', 'ja', 'ko', 'ru', 'th', 'vi', 'id'].flatMap(lang => [
        `/${lang}/learn/savefrom-alternative`, `/${lang}/learn/cobalt-tools-alternative`, `/${lang}/learn/savefrom-alternative/`,
    ])) {
        const page = visit(path);
        assert.equal(page.configCount(), 1);
        assert.equal(page.scripts.length, 1);
        assert(page.scripts[0].src.startsWith('https://www.googletagmanager.com/gtag/'));
        page.listeners.get('pointerdown')();
        page.listeners.get('keydown')();
        page.listeners.get('load')();
        page.timers.forEach(callback => callback());
        assert.equal(page.configCount(), 1, 'Later interactions must not configure GA twice');
        assert.equal(page.scripts.filter(script => script.src.includes('googletagmanager.com')).length, 1);
        assert.equal(page.scripts.filter(script => script.src.includes('googlesyndication.com')).length, 1);
    }
});

test('other pages retain deferred analytics and disabled advertising stays disabled', () => {
    for (const path of ['/en', '/en/download', '/en/learn/unrelated-guide']) {
        const page = visit(path);
        assert.equal(page.scripts.length, 0);
        page.window.__disableThirdPartyAds = true;
        page.listeners.get('pointerdown')();
        assert.equal(page.configCount(), 1);
        assert.equal(page.scripts.length, 1);
        assert(page.scripts[0].src.includes('googletagmanager.com'));
    }
});
