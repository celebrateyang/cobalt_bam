import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveByteRange } from './byte-range.js';

test('resolves bounded, open, suffix and clamped single byte ranges', () => {
    for (const [header, start, end] of [
        ['bytes=4-7', 4n, 7n], ['bytes=4-', 4n, 9n],
        ['bytes=-3', 7n, 9n], ['bytes=4-99', 4n, 9n],
        ['bytes=-99', 0n, 9n], ['BYTES=0-0', 0n, 0n],
    ]) assert.deepEqual(resolveByteRange(header, 10n), { start, end });
    assert.deepEqual(resolveByteRange('bytes=9007199254740993-', 9007199254741000n), {
        start: 9007199254740993n, end: 9007199254740999n,
    });
});

test('distinguishes unsatisfiable ranges from ignored unsupported or malformed ranges', () => {
    for (const header of ['bytes=10-', 'bytes=20-30', 'bytes=-0']) {
        assert.deepEqual(resolveByteRange(header, 10n), { unsatisfiable: true });
    }
    for (const header of [undefined, '', 'bytes=-', 'bytes=7-4', 'items=0-1', 'bytes=0-1,4-5', 'bytes=x-1']) {
        assert.equal(resolveByteRange(header, 10n), null);
    }
});
