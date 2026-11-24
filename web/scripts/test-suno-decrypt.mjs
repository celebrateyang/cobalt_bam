import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const source = readFileSync(new URL('../src/lib/task-manager/suno-decrypt.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(code, { exports, crypto: webcrypto, atob, Uint8Array, String, File });
const b64 = value => Buffer.from(value).toString('base64');

test('decrypts the playback file and rejects wrong or malformed keys', async () => {
    const key = webcrypto.getRandomValues(new Uint8Array(16));
    const counter = webcrypto.getRandomValues(new Uint8Array(16));
    const plain = Uint8Array.from([0, 0, 0, 16, 102, 116, 121, 112, ...Array(40).fill(7)]);
    const cipher = await webcrypto.subtle.importKey('raw', key, 'AES-CTR', false, ['encrypt']);
    const bytes = await webcrypto.subtle.encrypt({ name: 'AES-CTR', counter, length: 128 }, cipher, plain);
    const encrypted = new File([bytes], 'source.m4a', { type: 'audio/mp4' });
    const result = await exports.decryptSunoFile(encrypted, { key: b64(key), counter: b64(counter) });
    assert.deepEqual(new Uint8Array(await result.arrayBuffer()), plain);
    await assert.rejects(exports.decryptSunoFile(encrypted, { key: b64(new Uint8Array(16)), counter: b64(counter) }));
    await assert.rejects(exports.decryptSunoFile(encrypted, { key: 'bad', counter: b64(counter) }));
    await assert.rejects(exports.decryptSunoFile({ size: 128 * 1024 * 1024 + 1 }, { key: b64(key), counter: b64(counter) }));
});
