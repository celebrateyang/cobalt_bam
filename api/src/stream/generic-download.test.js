import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { downloadGenericFile } from './generic-download.js';

const info = { filename: 'video.mp4', genericDownload: { url: 'https://example.com/video', videoQuality: '720' } };
const writeOutput = `
    const fs = require('node:fs');
    const args = process.argv;
    const output = args[args.indexOf('--output') + 1].replace('%(ext)s', 'mp4');
    if (!args.includes('--abort-on-unavailable-fragments')) process.exit(2);
    fs.writeFileSync(output, 'video');
`;
async function options(t, script) {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'cobalt-download-test-'));
    t.after(() => rm(tempRoot, { recursive: true, force: true }));
    return {
        tempRoot, validateURL: async () => true,
        validateMedia: async () => true,
        getRunner: async () => ({ command: process.execPath, prefixArgs: ['-e', script, '--'] }),
    };
}

test('yt-dlp fallback returns a completed file and cleans it after delivery', async t => {
    const opts = await options(t, writeOutput);
    const file = await downloadGenericFile(info, opts);
    assert.equal(file.size, 5);
    let data = '';
    for await (const chunk of file.stream()) data += chunk;
    assert.equal(data, 'video');
    await file.cleanup();
    assert.deepEqual(await readdir(opts.tempRoot), []);
});

test('a non-video output is rejected even when yt-dlp exits successfully', async t => {
    const opts = await options(t, writeOutput);
    await assert.rejects(downloadGenericFile(info, { ...opts, validateMedia: async () => false }), /Invalid video output/);
    assert.deepEqual(await readdir(opts.tempRoot), []);
});

test('a failed subprocess never delivers its partial file', async t => {
    const opts = await options(t, writeOutput + '\nprocess.exit(1);');
    await assert.rejects(downloadGenericFile(info, opts), /download failed/);
    assert.deepEqual(await readdir(opts.tempRoot), []);
});

test('empty and oversized fallback files are rejected and removed', async t => {
    for (const script of [writeOutput.replace("'video'", "''"), writeOutput]) {
        const opts = await options(t, script);
        await assert.rejects(downloadGenericFile(info, { ...opts, maxBytes: 4 }), /Invalid download output/);
        assert.deepEqual(await readdir(opts.tempRoot), []);
    }
});

test('fallback timeout terminates the child and removes temporary files', async t => {
    const opts = await options(t, writeOutput + '\nsetInterval(() => {}, 1000);');
    await assert.rejects(downloadGenericFile(info, { ...opts, timeoutMs: 100 }), /timed out/);
    assert.deepEqual(await readdir(opts.tempRoot), []);
});

test('user cancellation terminates fallback and removes temporary files', async t => {
    const opts = await options(t, writeOutput + '\nsetInterval(() => {}, 1000);');
    const controller = new AbortController();
    const promise = downloadGenericFile(info, { ...opts, signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    await assert.rejects(promise, /aborted/);
    assert.deepEqual(await readdir(opts.tempRoot), []);
});

test('fallback concurrency stays bounded until downloaded files are cleaned', async t => {
    const opts = await options(t, writeOutput);
    const first = await downloadGenericFile(info, opts);
    const second = await downloadGenericFile(info, opts);
    try {
        await assert.rejects(downloadGenericFile(info, opts), /fallback is busy/);
    } finally {
        await first.cleanup();
        await second.cleanup();
    }
    assert.deepEqual(await readdir(opts.tempRoot), []);
});
