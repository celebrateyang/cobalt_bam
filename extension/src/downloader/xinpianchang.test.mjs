import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

async function setup(payload = new Uint8Array([0, 0, 0, 32, 102, 116, 121, 112])) {
    const rules = [], downloads = [], values = {}, listeners = [];
    const context = vm.createContext({ URL, Date, Math, console, AbortSignal,
        fetch: async (_url, options) => {
            assert.equal(options.headers.Range, 'bytes=0-31');
            return new Response(payload, { status: 206 });
        },
        chrome: {
            declarativeNetRequest: {
                updateSessionRules: async rule => { rules.push(rule); },
            },
            downloads: {
                download: async options => { downloads.push(options); return 42; },
                search: async () => [{ id: 42, state: 'in_progress' }],
                onChanged: { addListener: fn => listeners.push(fn) },
            },
            storage: { session: {
                set: async data => Object.assign(values, data),
                get: async key => ({ [key]: values[key] }),
                remove: async key => { delete values[key]; },
            } },
        },
    });
    const cache = new Map();
    async function load(path) {
        if (cache.has(path)) return cache.get(path);
        const source = ts.transpileModule(await readFile(path, 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        }).outputText;
        const module = new vm.SourceTextModule(source, { context, identifier: path });
        cache.set(path, module);
        await module.link((specifier, parent) => load(resolve(dirname(parent.identifier), specifier + '.ts')));
        return module;
    }
    const module = await load(resolve(dirname(fileURLToPath(import.meta.url)), 'chrome-downloads.ts'));
    await module.evaluate();
    return { download: module.namespace.downloadWithChrome, rules, downloads, values, listeners };
}

const url = 'https://us-xpc5-l2.xpccdn.com/video.mp4?e=9999999999&s=signature';
const media = { id: '1', kind: 'video', url, label: 'Work', source: 'dom',
    sourcePageUrl: 'https://www.xinpianchang.com/a13690233' };

test('scopes Referer to selected media, probes MP4, sends Range and cleans up on completion', async () => {
    const s = await setup();
    await s.download({ url, filename: 'work.mp4', media });
    const rule = s.rules[0].addRules[0];
    assert.equal(rule.condition.urlFilter, `|${url}|`);
    assert.equal(rule.action.requestHeaders[0].value, media.sourcePageUrl);
    assert.equal(s.downloads[0].headers[0].value, 'bytes=0-');
    s.listeners[0]({ id: 42, state: { current: 'complete' } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(s.rules.at(-1).removeRuleIds[0], rule.id);
    assert.equal(s.values['xpc-download-42'], undefined);
});

test('rejects HTML instead of saving it as video, and removes header rule', async () => {
    const s = await setup('<html>verification required</html>');
    await assert.rejects(s.download({ url, media }), /did not return an MP4/);
    assert.equal(s.downloads.length, 0);
    assert.ok(s.rules.at(-1).removeRuleIds);
});

test('rejects expired media and untrusted source pages without installing rules', async () => {
    const s = await setup();
    await assert.rejects(s.download({ url: url.replace('9999999999', '1'), media }), /expired/);
    await assert.rejects(s.download({ url, media: { ...media, sourcePageUrl: 'https://evil.test/' } }), /Invalid/);
    assert.equal(s.rules.length, 0);
});

test('ordinary media keeps the existing download behavior without header rules', async () => {
    const s = await setup();
    await s.download({ url: 'https://example.com/video.mp4', filename: 'video.mp4' });
    assert.equal(s.rules.length, 0);
    assert.equal(s.downloads[0].headers, undefined);
});

test('manifest packages the scoped permissions required for native Xinpianchang downloads', async () => {
    const manifestPath = resolve(dirname(fileURLToPath(import.meta.url)), '../..', 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.ok(manifest.permissions.includes('declarativeNetRequestWithHostAccess'));
    assert.ok(manifest.host_permissions.includes('https://*.xpccdn.com/*'));
    assert.ok(manifest.content_scripts.some(script => script.matches.includes('https://www.xinpianchang.com/*')));
    assert.ok(!manifest.host_permissions.includes('<all_urls>'));
});
