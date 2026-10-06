import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Exercise the production generator with injected transport. No network,
// credentials, extraction or environment initialization is required.
const fixture = (responses) => {
    const source = readFileSync(new URL('./internal.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function* readChunks(');
    const end = source.indexOf('\nasync function handleChunkedStream(', start);
    const calls = [], discarded = [];
    const readChunks = vm.runInNewContext(source.slice(start, end) + '\nreadChunks', {
        CHUNK_SIZE: 2n, min: (a, b) => a < b ? a : b,
        getHeaders: () => ({}), safeDestroyBody: body => discarded.push(body),
        parseBigIntHeaderValue: value => BigInt(value ?? 0),
        tunnelDebugLog() {}, tunnelDebugWarn() {},
        request: async (url, options) => {
            calls.push({ url, range: options.headers.Range });
            const next = responses.shift(); assert.ok(next, 'unexpected extra request'); return next;
        },
    });
    return { readChunks, calls, discarded };
};
const response = (statusCode, data = []) => ({
    statusCode, headers: {}, body: (async function* () { for (const value of data) yield Buffer.from(value); })(),
});
const stream = () => ({ url: 'https://cdn.test/audio-old', service: 'youtube', controller: new AbortController() });

test('an internal stream without originalRequest refreshes a 403 and preserves the track and offset', async () => {
    const f = fixture([response(206, ['ab']), response(403, ['error']), response(206, ['cd'])]);
    const info = stream(); let refreshes = 0;
    info.transplant = async () => { refreshes++; info.url = 'https://cdn.test/audio-new'; };
    const output = [];
    for await (const part of f.readChunks(info, 4n)) output.push(part);
    assert.equal(Buffer.concat(output).toString(), 'abcd');
    assert.equal(refreshes, 1); assert.equal(f.discarded.length, 1);
    assert.deepEqual(f.calls.map(call => call.range), ['bytes=0-1', 'bytes=2-3', 'bytes=2-3']);
    assert.equal(f.calls[2].url, 'https://cdn.test/audio-new');
});

test('persistent 403 stops after four refreshes without forwarding error bodies', async () => {
    const f = fixture(Array.from({ length: 5 }, () => response(403, ['error'])));
    const info = stream(); let refreshes = 0; info.transplant = async () => { refreshes++; };
    const output = [];
    await assert.rejects(async () => { for await (const part of f.readChunks(info, 2n)) output.push(part); }, /youtube_chunk_forbidden/);
    assert.equal(refreshes, 4); assert.equal(f.calls.length, 5); assert.equal(output.length, 0);
});

test('unrecoverable HTTP responses cannot become media data', async () => {
    for (const status of [403, 404, 429, 502]) {
        const f = fixture([response(status, ['error'])]); const output = [];
        await assert.rejects(async () => { for await (const part of f.readChunks(stream(), 2n)) output.push(part); }, new RegExp(`youtube_chunk_http_${status}`));
        assert.equal(output.length, 0); assert.equal(f.discarded.length, 1);
    }
});

test('refresh failure terminates the generator and abort does not make another request', async () => {
    const f = fixture([response(403)]); const info = stream();
    info.transplant = async () => { throw new Error('refresh failed'); };
    await assert.rejects(async () => { for await (const part of f.readChunks(info, 2n)) {} }, /refresh failed/);
    const g = fixture([]); const cancelled = stream(); cancelled.controller.abort();
    await assert.rejects(async () => { for await (const part of g.readChunks(cancelled, 2n)) {} }, /controller aborted/);
    assert.equal(g.calls.length, 0);
});
