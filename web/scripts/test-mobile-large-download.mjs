import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/api/mobile-large-download.ts', import.meta.url), 'utf8');
const exports = {};
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, URL });
const warn = exports.needsMobileLargeDownloadWarning;
const storageWarning = exports.youtubeStorageWarning;
const url = 'https://youtube.com/watch?v=HB8CZzDnKHI';
const big = { status: 'tunnel', estimatedSizeBytes: 500 * 1024 * 1024 };
test('warns mobile YouTube before redirect, tunnel or browser processing, at the threshold', () => {
    for (const status of ['redirect', 'tunnel', 'local-processing']) assert.equal(warn(true, { ...big, status }, url), true);
});

test('checks browser storage for large queued YouTube downloads without guessing unavailable quota', async () => {
    const response = { ...big, type: 'merge', service: 'youtube' };
    assert.equal(await storageWarning(false, response, url, undefined), 'storage_unavailable');
    assert.equal(await storageWarning(false, response, url, { getDirectory() {}, estimate: async () => ({ quota: 800, usage: 400 }) }), 'storage_low');
    assert.equal(await storageWarning(false, response, url, { getDirectory() {}, estimate: async () => { throw new Error('denied'); } }), null);
    assert.equal(await storageWarning(false, response, url, { getDirectory() {} }, async () => false), 'storage_unavailable');
    assert.equal(await storageWarning(false, { ...response, status: 'local-processing' }, url, {
        getDirectory() {}, estimate: async () => ({ quota: big.estimatedSizeBytes * 1.5, usage: 0 }),
    }), 'storage_low');
    assert.equal(await storageWarning(true, response, url, undefined), null);
    assert.equal(await storageWarning(false, { ...response, status: 'redirect' }, url, undefined), null);
    assert.equal(await storageWarning(false, { ...response, estimatedSizeBytes: undefined, duration: 3700 }, url, undefined), 'storage_unavailable');
});
test('does not warn desktop, other services, errors, unknown or small sizes', () => {
    assert.equal(warn(false, big, url), false);
    assert.equal(warn(true, big, 'https://vimeo.com/123'), false);
    assert.equal(warn(true, { ...big, status: 'error' }, url), false);
    for (const estimatedSizeBytes of [undefined, -1, Infinity, NaN, big.estimatedSizeBytes - 1]) {
        assert.equal(warn(true, { ...big, estimatedSizeBytes }, url), false);
    }
    assert.equal(warn(true, { ...big, estimatedSizeBytes: undefined, duration: 3600 }, url), true);
    assert.equal(warn(true, big, 'https://youtube.com.attacker.example/video'), false);
});
