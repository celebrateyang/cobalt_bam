import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const workerCode = ts.transpileModule(
    readFileSync(new URL('../src/lib/task-manager/workers/fetch.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

const download = async (responses, onWrite = () => {}, tuning) => {
    const messages = [], calls = [], chunks = [];
    const storage = {
        async write(data) { onWrite(messages); chunks.push(Buffer.from(data)); return data.length; },
        async res() { return new Blob(chunks); },
        async destroy() { chunks.length = 0; },
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
    await self.onmessage({ data: { cobaltFetchWorker: { url: 'https://api.test/tunnel', tuning } } });
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

test('stops immediately when an interrupted YouTube stream cannot resume', async () => {
    const f = await download(index => {
        if (index === 0) {
            let sent = false;
            return new Response(new ReadableStream({ pull(controller) {
                if (!sent) { sent = true; controller.enqueue(new TextEncoder().encode('old')); }
                else controller.error(new TypeError('network error'));
            } }));
        }
        return new Response('new complete media');
    }, () => {}, { failOnUnverifiableResume: true });
    assert.equal(f.messages.some(message => message.result), false);
    assert.equal(f.messages.at(-1).error, 'queue.fetch.cannot_resume');
    assert.equal(f.calls.length, 1);
});

test('does not splice a full response onto a prior YouTube range', async () => {
    const f = await download(index => index === 0
        ? new Response('abc', { status: 206, headers: { 'Content-Range': 'bytes 0-2/10', 'Content-Length': '3' } })
        : new Response('different content'), () => {}, { failOnUnverifiableResume: true });
    assert.equal(f.messages.some(message => message.result), false);
    assert.equal(f.messages.at(-1).error, 'queue.fetch.cannot_resume');
    assert.equal(f.calls.length, 2);
});

test('continues a valid YouTube byte range after a transport interruption', async () => {
    const f = await download(index => {
        if (index === 0) {
            let sent = false;
            return new Response(new ReadableStream({ pull(controller) {
                if (!sent) { sent = true; controller.enqueue(new TextEncoder().encode('abc')); }
                else controller.error(new TypeError('network error'));
            } }), { status: 206, headers: { 'Content-Range': 'bytes 0-9/10', 'Content-Length': '10' } });
        }
        return new Response('defghij', { status: 206, headers: { 'Content-Range': 'bytes 3-9/10', 'Content-Length': '7' } });
    }, () => {}, { failOnUnverifiableResume: true });
    assert.equal(Buffer.from(await f.messages.find(message => message.result).result.arrayBuffer()).toString(), 'abcdefghij');
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1].options.headers.Range, 'bytes=3-9');
});

test('rejects missing, malformed or inconsistent YouTube range responses', async () => {
    for (const headers of [
        {},
        { 'Content-Range': 'bytes 0-2/*' },
        { 'Content-Range': 'bytes 0-10/10' },
        { 'Content-Range': 'bytes 1-3/10' },
        { 'Content-Range': 'bytes 0-2/10', 'Content-Length': '4' },
    ]) {
        const f = await download(() => new Response('abc', { status: 206, headers }), () => {}, { failOnUnverifiableResume: true });
        assert.equal(f.messages.at(-1).error, 'queue.fetch.unverifiable_range');
        assert.equal(f.messages.some(message => message.result), false);
        assert.equal(f.calls.length, 1);
    }
    const oversized = await download(() => new Response('abcd', { status: 206, headers: { 'Content-Range': 'bytes 0-2/10' } }), () => {}, { failOnUnverifiableResume: true });
    assert.equal(oversized.messages.at(-1).error, 'queue.fetch.unverifiable_range');
});

test('continues after a clean but short response instead of accepting a truncated file', async () => {
    const f = await download(index => index === 0
        ? new Response('abc', { status: 206, headers: { 'Content-Range': 'bytes 0-9/10' } })
        : new Response('defghij', { status: 206, headers: { 'Content-Range': 'bytes 3-9/10' } }),
        () => {}, { failOnUnverifiableResume: true });
    assert.equal(Buffer.from(await f.messages.find(message => message.result).result.arrayBuffer()).toString(), 'abcdefghij');
    assert.equal(f.calls.length, 2);
});

test('stops instead of restarting when the YouTube media length changes', async () => {
    const f = await download(index => index === 0
        ? new Response('abc', { status: 206, headers: { 'Content-Range': 'bytes 0-2/10' } })
        : new Response('defghij', { status: 206, headers: { 'Content-Range': 'bytes 3-9/11' } }),
        () => {}, { failOnUnverifiableResume: true });
    assert.equal(f.messages.at(-1).error, 'queue.fetch.cannot_resume');
    assert.equal(f.messages.some(message => message.result), false);
    assert.equal(f.calls.length, 2);
});

test('reports received bytes before a chunked stream completes', async () => {
    let sawProgressDuringTransfer = false;
    const payload = new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode('first chunk'));
            controller.enqueue(new TextEncoder().encode('second chunk'));
            controller.close();
        },
    });
    const f = await download(() => new Response(payload, {
        headers: { 'Content-Type': 'video/mp4', 'Estimated-Content-Length': '-1' },
    }), messages => {
        if (messages.some(message => message.size === 11 && message.progress === undefined)) {
            assert.equal(messages.some(message => message.result), false);
            sawProgressDuringTransfer = true;
        }
    });
    assert.equal(sawProgressDuringTransfer, true);
    assert.ok(f.messages.some(message => message.result));
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
