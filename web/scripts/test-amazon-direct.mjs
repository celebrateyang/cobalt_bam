import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const load = (name, globals = {}) => {
    const source = readFileSync(new URL(`../../packages/amazon-direct/src/${name}.ts`, import.meta.url), 'utf8');
    const exports = {};
    vm.runInNewContext(ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, { exports, URL, Error, Blob, Uint8Array, TextDecoder, AbortController, DOMException,
        setTimeout, clearTimeout, ...globals });
    return exports;
};
const mediaUrl = 'https://m.media-amazon.com/replay/720.m3u8';
const vod = '#EXTM3U\n#EXTINF:3,\npart1.ts\n#EXTINF:2,\npart2.ts\n#EXT-X-ENDLIST\n';

test('accepts complete Amazon TS playlists and rejects unsafe or unsupported playlists', () => {
    const { parseAmazonPlaylist, isAmazonMediaUrl } = load('hls');
    assert.deepEqual(Array.from(parseAmazonPlaylist(mediaUrl, vod)), [
        'https://m.media-amazon.com/replay/part1.ts', 'https://m.media-amazon.com/replay/part2.ts',
    ]);
    for (const value of ['https://media-amazon.com.evil.test/720.m3u8', 'http://m.media-amazon.com/a.m3u8', 'https://user@m.media-amazon.com/a.m3u8']) {
        assert.equal(isAmazonMediaUrl(value), false);
    }
    for (const text of [vod.replace('#EXT-X-ENDLIST', ''), vod.replace('part1.ts', 'https://evil.test/part1.ts'),
        vod.replace('#EXTINF:3,', '#EXT-X-KEY:METHOD=AES-128'), vod.replace('#EXTINF:3,', '#EXT-X-BYTERANGE:188@0'), '<html>Access denied</html>']) {
        assert.throws(() => parseAmazonPlaylist(mediaUrl, text));
    }
});

test('fetches ordered segments directly from Amazon and reports progress', async () => {
    const calls = [], progress = [];
    const packet = new Uint8Array(188); packet[0] = 0x47;
    const { fetchAmazonReplay } = load('hls', { fetch: async url => {
        calls.push(url);
        return new Response(url === mediaUrl ? vod : packet);
    } });
    const result = await fetchAmazonReplay(mediaUrl, new AbortController().signal, (...args) => progress.push(args));
    assert.equal(result.type, 'video/mp2t');
    assert.equal(result.size, 376);
    assert.equal(calls.length, 3);
    assert.equal(progress.at(-1)[1], 80);
});

test('selects the highest bandwidth master variant before downloading segments', async () => {
    const calls = [];
    const packet = new Uint8Array(188); packet[0] = 0x47;
    const { fetchAmazonReplay } = load('hls', { fetch: async url => {
        calls.push(url);
        return new Response(calls.length === 1
            ? '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\n360.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=200\n720.m3u8\n'
            : calls.length === 2 ? vod : packet);
    } });
    await fetchAmazonReplay('https://m.media-amazon.com/replay/master.m3u8', new AbortController().signal, () => {});
    assert.equal(calls[1], mediaUrl);
});

test('aborts before any request and rejects HTML/truncated segments', async () => {
    let calls = 0;
    const { fetchAmazonReplay } = load('hls', { fetch: async () => new Response(++calls === 1 ? vod : '<html>Denied</html>') });
    const controller = new AbortController(); controller.abort();
    await assert.rejects(fetchAmazonReplay(mediaUrl, controller.signal, () => {}), { name: 'AbortError' });
    assert.equal(calls, 0);
    await assert.rejects(fetchAmazonReplay(mediaUrl, new AbortController().signal, () => {}), /invalid video segment/);
});

test('direct download runner returns MP4 bytes and terminates on success or cancellation', async () => {
    const { downloadAmazonMp4 } = load('runner');
    const worker = { postMessage() {}, terminate() { this.terminated = true; } };
    const controller = new AbortController();
    const pending = downloadAmazonMp4(() => worker, mediaUrl, controller.signal, () => {});
    worker.onmessage({ data: { amazonDirect: { buffer: new Uint8Array([1, 2, 3]).buffer } } });
    const result = await pending;
    assert.equal(result.type, 'video/mp4');
    assert.equal(result.size, 3);
    assert.equal(worker.terminated, true);
    worker.terminated = false;
    const cancelled = downloadAmazonMp4(() => worker, mediaUrl, controller.signal, () => {});
    controller.abort();
    await assert.rejects(cancelled, { name: 'AbortError' });
    assert.equal(worker.terminated, true);
});

test('direct download runner reports worker failures and releases the worker', async () => {
    const { downloadAmazonMp4 } = load('runner');
    const worker = { postMessage() {}, terminate() { this.terminated = true; } };
    const pending = downloadAmazonMp4(() => worker, mediaUrl, new AbortController().signal, () => {});
    worker.onmessage({ data: { amazonDirect: { error: 'Invalid segment' } } });
    await assert.rejects(pending, /Invalid segment/);
    assert.equal(worker.terminated, true);
});

test('MP4 headers clear live duration sentinels without changing finite durations', () => {
    const { normalizeMp4Durations } = load('mp4');
    const box = (type, payload) => {
        const bytes = new Uint8Array(8 + payload.length);
        new DataView(bytes.buffer).setUint32(0, bytes.length);
        bytes.set(new TextEncoder().encode(type), 4); bytes.set(payload, 8);
        return bytes;
    };
    const payload = new Uint8Array(24);
    new DataView(payload.buffer).setUint32(16, 0xffffffff);
    const original = box('moov', box('mvhd', payload));
    const result = normalizeMp4Durations(original);
    assert.equal(new DataView(result.buffer).getUint32(32), 0);
    assert.equal(new DataView(original.buffer).getUint32(32), 0xffffffff);
    new DataView(payload.buffer).setUint32(16, 12345);
    const finite = normalizeMp4Durations(box('moov', box('mdhd', payload)));
    assert.equal(new DataView(finite.buffer).getUint32(32), 12345);
});
