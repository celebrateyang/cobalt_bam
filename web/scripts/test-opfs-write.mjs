import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/storage/opfs.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(compiled, {
    exports,
    require(name) {
        if (name === './storage') return { AbstractStorage: class {} };
        if (name === '$lib/util') return { uuid: () => 'test' };
        throw new Error(`Unexpected import: ${name}`);
    },
});

test('disk storage completes short writes at the correct offsets', async () => {
    const bytes = new Uint8Array(10);
    const calls = [];
    const io = { write(data, { at }) { const count = Math.min(2, data.length); bytes.set(data.subarray(0, count), at); calls.push(at); return count; } };
    const storage = new exports.OPFSStorage({}, {}, io);
    assert.equal(await storage.write(new Uint8Array([1, 2, 3, 4, 5]), 3), 5);
    assert.deepEqual(calls, [3, 5, 7]);
    assert.deepEqual(Array.from(bytes), [0, 0, 0, 1, 2, 3, 4, 5, 0, 0]);
});

test('disk storage rejects a stalled write', async () => {
    const storage = new exports.OPFSStorage({}, {}, { write: () => 0 });
    await assert.rejects(storage.write(new Uint8Array([1]), 0), /storage_write_no_progress/);
});
