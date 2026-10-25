import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/clipboard/large-file-transfer.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function runtime(quota = 4 * 1024 ** 3) {
    const exports = {};
    runInNewContext(compiled, { exports, crypto: webcrypto, Uint8Array, Date, setTimeout, clearTimeout,
        navigator: { storage: { estimate: async () => ({ quota, usage: 0 }) } } });
    return exports;
}

function disk() {
    let bytes = 0, writes = 0, closed = false, aborted = false, removed = false;
    const writer = {
        async write(buffer) {
            assert.ok(buffer.byteLength <= 32768, 'no full-file allocation');
            const view = new Uint8Array(buffer);
            assert.equal(view[0], writes % 251);
            bytes += view.length;
            writes++;
        },
        async close() { closed = true; },
        async abort() { aborted = true; },
    };
    const root = {
        async *keys() {},
        async getFileHandle() { return { createWritable: async () => writer, getFile: async () => ({ size: bytes, slice: () => ({ size: bytes, type: 'video/mp4' }) }) }; },
        async removeEntry() { removed = true; },
    };
    return { root, get bytes() { return bytes; }, get writes() { return writes; }, get closed() { return closed; }, get aborted() { return aborted; }, get removed() { return removed; } };
}

function fakeFile(size) {
    return { name: 'large.mp4', size, type: 'video/mp4', slice(start, end) {
        const length = Math.min(end, size) - start;
        return { async arrayBuffer() { return new Uint8Array(length).fill((start / 32768) % 251).buffer; } };
    } };
}

test('transfers 781 MiB through bounded windows, completes only after disk close, and releases disk storage', async () => {
    const { LargeFileTransfer } = runtime();
    const target = disk();
    const failures = [];
    let received, release, sender, receiver, inFlight = 0, maximum = 0;
    const options = { decrypt: async bytes => bytes, progress() {}, failed: () => failures.push(true) };
    receiver = new LargeFileTransfer({ ...options, getRoot: async () => target.root,
        send: message => { if (message.type === 'large_file_ack_v1') inFlight = 0; void sender.control(message); },
        received: (file, name, cleanup) => { assert.equal(target.closed, true); received = { file, name }; release = cleanup; },
    });
    sender = new LargeFileTransfer({ ...options, send: message => { void receiver.control(message); },
        sendChunk: async (id, index, total, bytes) => {
            maximum = Math.max(maximum, ++inFlight);
            assert.equal(receiver.chunk(id, index, total, bytes), true);
        },
    });
    const file = fakeFile(781 * 1024 ** 2 + 17);
    await sender.sendFile(file);
    assert.deepEqual(failures, []);
    assert.equal(target.bytes, file.size);
    assert.equal(received.file.size, file.size);
    assert.equal(received.name, file.name);
    assert.ok(maximum <= 16);
    await release();
    assert.equal(target.removed, true);
});

test('rejects insufficient quota before sending ready', async () => {
    const { LargeFileTransfer } = runtime(100);
    const messages = [];
    const receiver = new LargeFileTransfer({ getRoot: async () => disk().root, send: message => messages.push(message), failed() {}, progress() {} });
    await receiver.control({ type: 'large_file_start_v1', fileId: 'quota', name: 'x', size: 300 * 1024 ** 2 });
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, 'large_file_error_v1');
});

test('cancellation aborts the writer, deletes partial files and rejects pending sender waits', async () => {
    const { LargeFileTransfer } = runtime();
    const target = disk();
    const receiver = new LargeFileTransfer({ getRoot: async () => target.root, send() {}, failed() {}, progress() {} });
    await receiver.control({ type: 'large_file_start_v1', fileId: 'cancel', name: 'x', size: 300 * 1024 ** 2 });
    receiver.cancel();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(target.aborted, true);
    assert.equal(target.removed, true);
    const sender = new LargeFileTransfer({ send() {}, failed() {}, progress() {} });
    const sending = sender.sendFile(fakeFile(300 * 1024 ** 2));
    sender.cancel();
    await assert.rejects(sending, /cancelled/);
});

test('incomplete and out-of-order input never produces a completed file', async () => {
    const { LargeFileTransfer } = runtime();
    for (const endEarly of [true, false]) {
        const target = disk();
        let completed = false;
        const receiver = new LargeFileTransfer({ getRoot: async () => target.root, send() {}, failed() {}, progress() {}, received() { completed = true; }, decrypt: async bytes => bytes });
        const size = 300 * 1024 ** 2;
        await receiver.control({ type: 'large_file_start_v1', fileId: 'bad', name: 'x', size });
        if (endEarly) await receiver.control({ type: 'large_file_end_v1', fileId: 'bad' });
        else receiver.chunk('bad', 1, Math.ceil(size / 32768), new Uint8Array(32768));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(completed, false);
        assert.equal(target.aborted, true);
        assert.equal(target.removed, true);
    }
});
