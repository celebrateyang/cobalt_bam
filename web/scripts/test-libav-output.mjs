import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { File } from 'node:buffer';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/libav.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

const fixture = exitCode => {
    const exports = {};
    const events = [];
    const chunks = [];
    const storage = {
        async write(bytes) { chunks.push(Buffer.from(bytes)); return bytes.length; },
        async res() { return new File(chunks, 'out.mp4', { type: 'video/mp4' }); },
        async destroy() { events.push('destroy'); },
    };
    vm.runInNewContext(code, {
        exports, File, TextDecoder, Uint8Array, console,
        require(name) {
            if (name === '$lib/storage') return { init: async () => storage, retype: file => file };
            if (name.startsWith('@imput/libav.js-')) return { default: {} };
            throw new Error(`Unexpected import: ${name}`);
        },
    });
    const instance = new exports.default();
    const libav = {
        async mkreadaheadfile() {}, async mkwriterdev() {}, async unlink() {}, async unlinkreadaheadfile() {},
        async ffmpeg() { this.onwrite('output.mp4', 0, Uint8Array.from([1, 2, 3])); return exitCode; },
    };
    instance.libav = Promise.resolve(libav);
    return { instance, events };
};

test('client remux discards partial output if LibAV exits with an error', async () => {
    const f = fixture(1);
    await assert.rejects(f.instance.render({ files: [new File(['in'], 'in.mp4')], output: { format: 'mp4', type: 'video/mp4' }, args: [] }), /ffmpeg_exit_1/);
    assert.deepEqual(f.events, ['destroy']);
});

test('client remux returns output after a successful LibAV exit', async () => {
    const f = fixture(0);
    const output = await f.instance.render({ files: [new File(['in'], 'in.mp4')], output: { format: 'mp4', type: 'video/mp4' }, args: [] });
    assert.equal(output.size, 3);
    assert.deepEqual(f.events, []);
});
