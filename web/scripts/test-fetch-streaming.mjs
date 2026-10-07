import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const workerCode = ts.transpileModule(
    readFileSync(new URL('../src/lib/task-manager/workers/fetch.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

const download = async (responses) => {
    const messages = [], calls = [], chunks = [];
    const storage = {
        async write(data) { chunks.push(Buffer.from(data)); return data.length; },
        async res() { return new Blob(chunks); },
        async destroy() {},
    };
    const self = { postMessage(message) { messages.push(message.cobaltFetchWorker); }, close() {} };
    vm.runInNewContext(workerCode, {
        exports: {}, self, console, URL, Date, Error, TypeError, DOMException, AbortController,
        require(name) {
            assert.equal(name, '$lib/storage');
            return { init: async () => storage, retype: file => file };
        },
        async fetch(url, options) {
            calls.push({ url, options });
            assert.ok(calls.length <= 12, 'worker must not loop indefinitely');
            return responses(Math.min(calls.length - 1, 11));
        },
        setTimeout(fn, delay) { if (delay < 60000) queueMicrotask(fn); return 1; },
        clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    });
    await self.onmessage({ data: { cobaltFetchWorker: { url: 'https://api.test/tunnel' } } });
    return { messages, calls, chunks };
};

test('downloads a chunked remux tunnel without Content-Length in one request', async () => {
    const payload = Buffer.from('streamed video bytes');
    const f = await download(() => new Response(payload, {
        headers: { 'Content-Type': 'video/mp4', 'Estimated-Content-Length': '-1' },
    }));
    assert.equal(f.calls.length, 1);
    assert.equal(f.messages.some(message => message.error), false);
    const result = f.messages.find(message => message.result)?.result;
    assert.ok(result);
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), payload);
});

test('retries an explicitly empty 200 and then consumes the valid stream', async () => {
    const f = await download(index => index === 0
        ? new Response(null, { headers: { 'Content-Length': '0' } })
        : new Response('video bytes', { headers: { 'Content-Type': 'video/mp4' } }));
    assert.equal(f.calls.length, 2);
    assert.ok(f.messages.some(message => message.result));
    assert.equal(Buffer.concat(f.chunks).toString(), 'video bytes');
});

test('stops after bounded retries when the tunnel explicitly remains empty', async () => {
    const f = await download(() => new Response(null, { headers: { 'Content-Length': '0' } }));
    assert.equal(f.calls.length, 11);
    assert.equal(f.messages.at(-1).error, 'queue.fetch.empty_tunnel');
});
