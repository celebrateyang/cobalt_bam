import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/api/mobile-large-download.ts', import.meta.url), 'utf8');
const exports = {};
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, URL });
const warn = exports.needsMobileLargeDownloadWarning;
const url = 'https://youtube.com/watch?v=HB8CZzDnKHI';
const big = { status: 'tunnel', estimatedSizeBytes: 500 * 1024 * 1024 };
test('warns mobile YouTube before redirect, tunnel or browser processing, at the threshold', () => {
    for (const status of ['redirect', 'tunnel', 'local-processing']) assert.equal(warn(true, { ...big, status }, url), true);
});
test('does not warn desktop, other services, errors, unknown or small sizes', () => {
    assert.equal(warn(false, big, url), false);
    assert.equal(warn(true, big, 'https://vimeo.com/123'), false);
    assert.equal(warn(true, { ...big, status: 'error' }, url), false);
    for (const estimatedSizeBytes of [undefined, -1, Infinity, NaN, big.estimatedSizeBytes - 1]) {
        assert.equal(warn(true, { ...big, estimatedSizeBytes }, url), false);
    }
    assert.equal(warn(true, big, 'https://youtube.com.attacker.example/video'), false);
});
