import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { File } from 'node:buffer';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const mp4 = () => {
    const bytes = new Uint8Array(70 * 1024);
    bytes.set([0, 0, 0, 28, 102, 116, 121, 112, 105, 115, 111, 109]);
    return bytes;
};
const compile = source => ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function dialog(fetch) {
    let source = readFileSync(new URL('src/components/dialog/TikTokDownloadDialog.svelte', root), 'utf8')
        .split('<script lang="ts">')[1].split('</script>')[0].replace(/export let /g, 'let ');
    const ast = ts.createSourceFile('dialog.ts', source, ts.ScriptTarget.Latest, true);
    for (const node of [...ast.statements].reverse()) {
        if (ts.isImportDeclaration(node) || ts.isLabeledStatement(node)) {
            source = source.slice(0, node.pos) + source.slice(node.end);
        }
    }
    source += '\nexports.api = { start, save, downloadFromUrl, state: () => ({status, file, saveStarted}), setUrls: value => {urls = value;} };';
    const exports = {}, saved = [];
    vm.runInNewContext(compile(source), {
        exports, fetch, File, Blob, TextDecoder, Uint8Array, AbortController,
        URL: { createObjectURL: () => 'blob:video', revokeObjectURL() {} },
        get: value => value, t: key => key, onMount() {}, onDestroy() {},
        openFile: file => saved.push(file), console: { warn() {} },
    });
    return { ...exports.api, saved };
}

test('TikTok cannot save an unchecked remote URL after a failed download', () => {
    const d = dialog(() => { throw new Error('unexpected request'); });
    d.save();
    assert.equal(d.saved.length, 0);
    assert.equal(d.state().saveStarted, false);
    assert.equal(d.state().status, 'error');
});

test('TikTok rejects HTML labeled as video and accepts MP4 split over chunks', async () => {
    const bad = dialog(async () => new Response('<html>Access denied</html>'.padEnd(70000), {
        headers: { 'content-type': 'video/mp4' },
    }));
    await assert.rejects(bad.downloadFromUrl('https://v16.tokcdn.com/error', new AbortController().signal));
    assert.equal(bad.state().file, null);
    const bytes = mp4();
    const good = dialog(async () => new Response(new ReadableStream({ start(c) {
        c.enqueue(bytes.slice(0, 2)); c.enqueue(bytes.slice(2)); c.close();
    } }), { headers: { 'content-type': 'video/mp4', 'content-length': String(bytes.length) } }));
    await good.downloadFromUrl('https://v16.tokcdn.com/video', new AbortController().signal);
    assert.equal(good.saved.length, 1);
    assert.equal(good.state().saveStarted, true);
    assert.equal(good.saved[0].type, 'video/mp4');
});

test('TikTok rejects large non-video payloads with an octet-stream type', async () => {
    const d = dialog(async () => new Response('not video'.repeat(10000), {
        headers: { 'content-type': 'application/octet-stream' },
    }));
    await assert.rejects(d.downloadFromUrl('https://v16.tokcdn.com/error', new AbortController().signal), /invalid_mp4/);
});

test('TikTok tries the next candidate after receiving an HTML error page', async () => {
    const calls = [];
    const d = dialog(async url => {
        calls.push(url);
        return url.endsWith('/bad')
            ? new Response('<html>denied</html>', { headers: { 'content-type': 'text/html' } })
            : new Response(mp4(), { headers: { 'content-type': 'video/mp4' } });
    });
    d.setUrls(['https://v16.tokcdn.com/bad', 'https://v16.tokcdn.com/good']);
    await d.start();
    assert.equal(calls.length, 2);
    assert.equal(d.state().status, 'done');
});

const extensionModule = (path, dependencies, globals = {}) => {
    const exports = {};
    vm.runInNewContext(compile(readFileSync(new URL(`../extension/src/downloader/${path}.ts`, root), 'utf8')), {
        exports, URL, Blob, Uint8Array, ...globals,
        require: name => { assert.ok(name in dependencies, name); return dependencies[name]; },
    });
    return exports;
};
const jobs = extensionModule('tiktok-job', { './filename': { sanitizeDownloadPath: value => value } });

test('extension rejects non-TikTok hosts and HTML responses without starting a raw download', async () => {
    assert.equal(jobs.isTikTokMediaUrl('https://v16.tokcdn.com/video'), true);
    assert.equal(jobs.isTikTokMediaUrl('https://tokcdn.com.evil.example/video'), false);
    for (const type of ['text/html', 'video/mp4', 'application/octet-stream']) {
        const helper = extensionModule('tiktok-fetch', { './tiktok-job': jobs }, {
            fetch: async () => new Response('<html>denied</html>'.padEnd(70000), { headers: { 'content-type': type } }),
        });
        await assert.rejects(helper.fetchTikTokBlob('https://v16.tokcdn.com/video', new AbortController().signal));
    }
});

test('extension saves verified MP4 bytes and rejects incomplete downloads', async () => {
    for (const truncated of [false, true]) {
        const helper = extensionModule('tiktok-fetch', { './tiktok-job': jobs }, {
            fetch: async () => new Response(mp4(), { headers: {
                'content-type': 'application/octet-stream; charset=binary',
                'content-length': String(mp4().length + Number(truncated)),
            } }),
        });
        const result = helper.fetchTikTokBlob('https://v16.tokcdn.com/video', new AbortController().signal);
        if (truncated) await assert.rejects(result, /incomplete/);
        else assert.equal((await result).type, 'video/mp4');
    }
});

test('extension sends the TikTok referer only for the selected CDN URL and removes the rule', async () => {
    const updates = [];
    const helper = extensionModule('tiktok-fetch', { './tiktok-job': jobs }, {
        chrome: { declarativeNetRequest: { updateSessionRules: async update => updates.push(update) } },
        fetch: async () => new Response(mp4(), { headers: { 'content-type': 'video/mp4' } }),
    });
    const url = 'https://v16.tiktokcdn.com/video/file.mp4?token=abc';
    await helper.fetchTikTokBlob(url, new AbortController().signal);
    assert.equal(updates[0].addRules[0].condition.urlFilter, `|${url}|`);
    assert.equal(updates[0].addRules[0].action.requestHeaders[0].value, 'https://www.tiktok.com/');
    assert.equal(updates[1].removeRuleIds[0], updates[0].addRules[0].id);
});

test('extension routes TikTok video to verification while retaining photo downloads', async () => {
    const verified = [], raw = [];
    const downloader = extensionModule('chrome-downloads', {
        './filename': { sanitizeDownloadPath: value => value },
        './probe': { planDownloadStrategy: () => ({ strategy: 'chrome-downloads' }) },
        '../adapters/xinpianchang': { isXinpianchangMedia: () => false },
        './xinpianchang-job': {},
        '@freesavevideo/amazon-direct/hls': { isAmazonMediaUrl: () => false },
        './amazon-job': {},
        './tiktok-job': { isTikTokMediaUrl: jobs.isTikTokMediaUrl, openTikTokDownload: (...args) => verified.push(args) },
    }, { chrome: { downloads: { download: value => raw.push(value) } } });
    await downloader.downloadWithChrome({ url: 'https://v16.tokcdn.com/video', filename: 'video.mp4', media: { kind: 'video' } });
    await downloader.downloadWithChrome({ url: 'https://p16.tiktokcdn.com/photo', filename: 'photo.jpg', media: { kind: 'image' } });
    assert.equal(verified.length, 1);
    assert.equal(raw.length, 1);
    assert.equal(raw[0].filename, 'photo.jpg');
});
