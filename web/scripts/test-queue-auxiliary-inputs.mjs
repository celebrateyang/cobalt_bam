import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const transpile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const queueCode = transpile('../src/lib/task-manager/queue.ts');
const fetchCode = transpile('../src/lib/task-manager/workers/fetch.ts');

function pipeline(info) {
    let item, serial = 0;
    const exports = {};
    vm.runInNewContext(queueCode, {
        exports, console,
        require(name) {
            const modules = {
                'svelte/store': { get: value => value },
                '$lib/i18n/translations': { t: value => value },
                '$lib/util': { uuid: () => `id-${++serial}`, ffmpegMetadataArgs: () => [] },
                '$lib/state/dialogs': { createDialog: () => assert.fail('unexpected dialog') },
                '$lib/state/task-manager/queue': { addItem: value => { item = value; } },
                '$lib/state/queue-visibility': { openQueuePopover() {} },
                '$lib/types/workers': { resultFileTypes: ['video', 'audio', 'image'] },
            };
            assert.ok(name in modules, `unexpected import ${name}`);
            return modules[name];
        },
    });
    exports.createSavePipeline(info, { url: 'https://source.test/video' });
    return item.pipeline;
}

async function download(workerArgs, contentType, payload = 'auxiliary bytes') {
    const messages = [], chunks = [];
    const self = { postMessage: value => messages.push(value.cobaltFetchWorker), close() {} };
    vm.runInNewContext(fetchCode, {
        exports: {}, self, console: { ...console, debug() {} }, URL, Date, Error, TypeError, DOMException, AbortController,
        require(name) {
            assert.equal(name, '$lib/storage');
            return { init: async () => ({
                async write(data) { chunks.push(Buffer.from(data)); return data.length; },
                async res() { return new Blob(chunks); }, async destroy() {},
            }), retype: value => value };
        },
        fetch: async () => new Response(payload, { headers: {
            'Content-Type': contentType, 'Content-Length': String(Buffer.byteLength(payload)),
        } }),
        setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    });
    await self.onmessage({ data: { cobaltFetchWorker: workerArgs } });
    return messages;
}

for (const fixture of [
    { name: 'TikTok JPEG cover', service: 'tiktok', subtitles: false, cover: true, assets: [['cover', 'image/jpeg']] },
    { name: 'Bilibili JSON subtitles', service: 'bilibili', subtitles: true, cover: false, assets: [['subtitles', 'application/json']] },
    { name: 'cover and subtitles together', service: 'bilibili', subtitles: true, cover: true, assets: [['subtitles', 'application/json'], ['cover', 'image/jpeg']] },
]) {
    test(`${fixture.name} downloads while media MIME validation remains enabled`, async () => {
        const info = {
            type: 'proxy', service: fixture.service,
            tunnel: ['https://api.test/video', ...fixture.assets.map(([name]) => `https://api.test/${name}`)],
            output: { filename: 'video.mp4', type: 'video/mp4', subtitles: fixture.subtitles },
            audio: { cover: fixture.cover },
        };
        const original = [...info.tunnel];
        const workers = pipeline(info);
        assert.deepEqual(info.tunnel, original, 'building a retry must not mutate the API response');
        for (const [name, mime] of fixture.assets) {
            const asset = workers.find(w => w.workerArgs.url.endsWith(`/${name}`));
            const messages = await download(asset.workerArgs, mime);
            assert.ok(messages.some(m => m.result), `${name} must reach processing`);
            assert.equal(messages.some(m => m.error), false);
        }
        const video = workers.find(w => w.workerArgs.url.endsWith('/video'));
        const rejected = await download(video.workerArgs, 'image/jpeg');
        assert.equal(rejected.at(-1).error, 'queue.fetch.bad_response', 'images must still fail in a media slot');
    });
}

test('media-only response without optional audio retains validation', () => {
    const workers = pipeline({ type: 'proxy', service: 'tiktok', tunnel: ['https://api.test/video'],
        output: { filename: 'video.mp4', type: 'video/mp4' } });
    assert.deepEqual(Array.from(workers[0].workerArgs.validation.expectedContentTypePrefixes), ['video/']);
});
