import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const base = dirname(fileURLToPath(import.meta.url));
const url = 'https://us-xpc5-l2.xpccdn.com/video.mp4?e=9999999999&s=signature';
const sourcePageUrl = 'https://www.xinpianchang.com/a13690233';
const mp4 = new Uint8Array([0, 0, 0, 16, 102, 116, 121, 112, 109, 112, 52, 50, 0, 0, 0, 0]);
const uuid = '00000000-0000-4000-8000-000000000001';
const key = `xpc-job-${uuid}`;

async function setup(payload = mp4, options = {}) {
    const rules = [], downloads = [], tabs = [], requests = [], listeners = [], revoked = [];
    const values = {}, elements = new Map();
    let savedBlob;
    class TestURL extends URL {
        static createObjectURL(blob) { savedBlob = blob; return 'blob:chrome-extension://fsv/local-video'; }
        static revokeObjectURL(url) { revoked.push(url); }
    }
    const bytes = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
    const context = vm.createContext({ URL: TestURL, Date, Math, console, Blob, AbortController,
        crypto: { randomUUID: () => uuid },
        location: { hash: `#${key}` },
        window: { addEventListener() {}, close() {} },
        document: { querySelector(selector) {
            if (!elements.has(selector)) elements.set(selector, { textContent: '', addEventListener() {} });
            return elements.get(selector);
        } },
        fetch: async (target, request) => {
            requests.push({ target, request });
            if (options.fetchError) throw new Error('Network disconnected');
            return new Response(bytes, { status: 206,
                headers: { 'content-type': 'video/mp4', 'content-range': `bytes 0-${bytes.length - 1}/${bytes.length}`, ...options.headers } });
        },
        chrome: {
            runtime: { getURL: path => `chrome-extension://fsv/${path}` },
            tabs: { create: async tab => { if (options.tabError) throw new Error('Tab creation failed'); tabs.push(tab); return { id: 5 }; } },
            declarativeNetRequest: { updateSessionRules: async rule => rules.push(rule) },
            downloads: {
                download: async request => {
                    // Model the observed failure: a second CDN request gives HTML.
                    if (request.url.includes('xpccdn.com')) throw new Error('Direct CDN download returned HTML');
                    downloads.push(request); return 42;
                },
                search: async () => [{ id: 42, state: options.downloadState || 'in_progress' }],
                cancel: async () => {},
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
        if (path.endsWith('.css')) {
            const module = new vm.SyntheticModule([], () => {}, { context });
            cache.set(path, module); return module;
        }
        const source = ts.transpileModule(await readFile(path, 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        }).outputText;
        const module = new vm.SourceTextModule(source, { context, identifier: path });
        cache.set(path, module);
        await module.link((specifier, parent) => load(resolve(dirname(parent.identifier), specifier.endsWith('.css') ? specifier : specifier + '.ts')));
        return module;
    }
    async function entry(name) {
        const module = await load(resolve(base, name));
        if (module.status !== 'evaluated') await module.evaluate();
        return module.namespace;
    }
    return { entry, rules, downloads, tabs, requests, values, listeners, revoked, elements, get savedBlob() { return savedBlob; } };
}
async function settle(predicate) {
    for (let i = 0; i < 50; i++) {
        if (predicate()) return;
        await new Promise(resolve => setImmediate(resolve));
    }
    assert.fail('Download page did not settle');
}

test('fetches the complete MP4 once, preserving bytes and scoped headers', async () => {
    const s = await setup();
    const m = await s.entry('xinpianchang-fetch.ts');
    const blob = await m.fetchXinpianchangBlob(url, sourcePageUrl);
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), mp4);
    assert.equal(blob.type, 'video/mp4');
    assert.equal(s.requests.length, 1);
    assert.equal(s.requests[0].request.headers.Range, 'bytes=0-');
    const rule = s.rules[0].addRules[0];
    assert.equal(rule.condition.urlFilter, `|${url}|`);
    assert.equal(rule.action.requestHeaders[0].value, sourcePageUrl);
    assert.equal(s.rules.at(-1).removeRuleIds[0], rule.id);
});

test('hands off from worker to persistent page, saves the exact fetched Blob and releases it on completion', async () => {
    const s = await setup();
    const m = await s.entry('chrome-downloads.ts');
    await m.downloadWithChrome({ url, filename: 'FreeSaveVideo/work.mp4', media: { sourcePageUrl } });
    assert.equal(s.requests.length, 0);
    assert.equal(s.downloads.length, 0);
    assert.equal(s.tabs[0].url, `chrome-extension://fsv/download/index.html#${key}`);
    assert.ok(!s.tabs[0].url.includes('signature'));
    await s.entry('../download/main.ts');
    await settle(() => s.downloads.length === 1);
    assert.deepEqual(new Uint8Array(await s.savedBlob.arrayBuffer()), mp4);
    assert.equal(s.downloads[0].url, 'blob:chrome-extension://fsv/local-video');
    assert.equal(s.downloads[0].filename, 'FreeSaveVideo/work.mp4');
    assert.equal(s.requests.length, 1);
    assert.equal(s.values[key], undefined);
    assert.deepEqual(s.revoked, []);
    for (const listener of s.listeners) listener({ id: 42, state: { current: 'complete' } });
    assert.deepEqual(s.revoked, ['blob:chrome-extension://fsv/local-video']);
    assert.equal(s.elements.get('#status').textContent, 'Video saved successfully.');
});

test('download page displays HTML errors without creating a download', async () => {
    const s = await setup('<html>denied</html>', { headers: { 'content-type': 'text/html' } });
    const m = await s.entry('chrome-downloads.ts');
    await m.downloadWithChrome({ url });
    await s.entry('../download/main.ts');
    await settle(() => s.elements.get('#status').textContent.startsWith('Download failed:'));
    assert.match(s.elements.get('#status').textContent, /text\/html/);
    assert.equal(s.downloads.length, 0);
    assert.ok(s.rules.at(-1).removeRuleIds);
});

test('rejects HTML disguised as binary before saving', async () => {
    const s = await setup('<html>denied</html>', { headers: { 'content-type': 'application/octet-stream' } });
    const m = await s.entry('xinpianchang-fetch.ts');
    await assert.rejects(m.fetchXinpianchangBlob(url), /did not return an MP4/);
    assert.ok(s.rules.at(-1).removeRuleIds);
});

test('rejects partial and truncated responses instead of saving an incomplete MP4', async () => {
    for (const range of ['bytes 0-15/32', 'bytes 0-31/32']) {
        const s = await setup(mp4, { headers: { 'content-range': range } });
        const m = await s.entry('xinpianchang-fetch.ts');
        await assert.rejects(m.fetchXinpianchangBlob(url), /part of the video|incomplete/);
        assert.ok(s.rules.at(-1).removeRuleIds);
    }
});

test('removes the header rule when the network fails', async () => {
    const s = await setup(mp4, { fetchError: true });
    const m = await s.entry('xinpianchang-fetch.ts');
    await assert.rejects(m.fetchXinpianchangBlob(url), /Network disconnected/);
    assert.ok(s.rules.at(-1).removeRuleIds);
});

test('rejects expired URLs and invalid source pages without network requests or rules', async () => {
    const s = await setup();
    const m = await s.entry('xinpianchang-fetch.ts');
    await assert.rejects(m.fetchXinpianchangBlob(url.replace('9999999999', '1')), /expired/);
    await assert.rejects(m.fetchXinpianchangBlob(url, 'https://evil.test/'), /Invalid/);
    assert.equal(s.requests.length, 0);
    assert.equal(s.rules.length, 0);
});

test('cleans up the task if opening the download page fails', async () => {
    const s = await setup(mp4, { tabError: true });
    const m = await s.entry('chrome-downloads.ts');
    await assert.rejects(m.downloadWithChrome({ url }), /Tab creation failed/);
    assert.equal(Object.keys(s.values).length, 0);
});

test('ordinary media keeps the existing Chrome download behavior', async () => {
    const s = await setup();
    const m = await s.entry('chrome-downloads.ts');
    await m.downloadWithChrome({ url: 'https://example.com/video.mp4', filename: 'video.mp4' });
    assert.equal(s.downloads.length, 1);
    assert.equal(s.tabs.length, 0);
    assert.equal(s.requests.length, 0);
});

test('uses existing scoped permissions without adding offscreen access', async () => {
    const manifest = JSON.parse(await readFile(resolve(base, '../../manifest.json'), 'utf8'));
    assert.ok(manifest.permissions.includes('declarativeNetRequestWithHostAccess'));
    assert.ok(!manifest.permissions.includes('offscreen'));
    assert.ok(manifest.host_permissions.includes('https://*.xpccdn.com/*'));
    assert.ok(!manifest.host_permissions.includes('<all_urls>'));
});
