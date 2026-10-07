import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough, Readable } from 'node:stream';
import express from 'express';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { renderGenericDownload } from './generic-render.js';
import { validateDownloadedVideo } from './generic-download.js';

const info = {
    service: 'v.youku.com', type: 'remux', filename: 'video.mp4',
    urls: 'https://cdn.example.com/video.m3u8',
    genericDownload: { url: 'https://v.youku.com/v_show/id_test.html' },
};

async function start(t, behavior, fallback, extra = {}) {
    const app = express();
    let calls = 0;
    app.get('/', (req, res) => renderGenericDownload(res, info, ['ffmpeg', []], {
        spawnProcess: () => {
            const child = new EventEmitter();
            child.stderr = new PassThrough();
            child.stdio = [null, null, child.stderr, new PassThrough()];
            child.exitCode = null;
            child.signalCode = null;
            child.kill = () => {
                child.signalCode = 'SIGKILL';
                child.stdio[3].end();
                child.emit('close', null, 'SIGKILL');
            };
            setImmediate(() => behavior(child));
            return child;
        },
        downloadFile: async (...args) => { calls++; return fallback(...args); },
        ...extra,
    }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => { server.closeAllConnections(); server.close(); });
    return { url: `http://127.0.0.1:${server.address().port}/`, calls: () => calls };
}

test('zero-byte SIGSEGV falls back to a complete yt-dlp file', async t => {
    let cleaned = false;
    const server = await start(t, child => {
        child.stdio[3].end();
        child.signalCode = 'SIGSEGV';
        child.emit('close', null, 'SIGSEGV');
    }, async () => ({ size: 5, stream: () => Readable.from(['video']), cleanup: async () => { cleaned = true; } }));
    const response = await fetch(server.url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-length'), '5');
    assert.equal(await response.text(), 'video');
    assert.equal(server.calls(), 1);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(cleaned, true);
});

test('empty successful FFmpeg exit cannot produce a successful empty download', async t => {
    const server = await start(t, child => {
        child.stdio[3].end(); child.exitCode = 0; child.emit('close', 0);
    }, async () => { throw new Error('Unavailable'); });
    const response = await fetch(server.url);
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('content-disposition'), null);
    assert.equal(server.calls(), 1);
});

test('partial output followed by a failed exit rejects the body instead of appending fallback bytes', async t => {
    const server = await start(t, child => {
        child.stdio[3].write('partial');
        setTimeout(() => {
            child.stdio[3].end(); child.exitCode = 1; child.emit('close', 1);
        }, 50);
    }, async () => { throw new Error('Must not run'); });
    const response = await fetch(server.url);
    await assert.rejects(response.text());
    assert.equal(server.calls(), 0);
});

test('pipe EOF waits for FFmpeg success before completing the response', async t => {
    let closed = false;
    const server = await start(t, child => {
        child.stdio[3].end('complete');
        setTimeout(() => {
            closed = true; child.exitCode = 0; child.emit('close', 0);
        }, 50);
    }, async () => { throw new Error('Must not run'); });
    const response = await fetch(server.url);
    assert.equal(await response.text(), 'complete');
    assert.equal(closed, true);
    assert.equal(server.calls(), 0);
});

test('a stalled FFmpeg is killed and may use fallback before any output', async t => {
    const server = await start(t, () => {}, async () => ({
        size: 5, stream: () => Readable.from(['video']), cleanup: async () => {},
    }), { idleTimeoutMs: 20 });
    const response = await fetch(server.url);
    assert.equal(await response.text(), 'video');
    assert.equal(server.calls(), 1);
});

test('real FFmpeg output is delivered as a playable video', async t => {
    const server = await start(t, () => {}, async () => { throw new Error('Must not run'); }, {
        spawnProcess: () => spawn(ffmpeg, [
            '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=160x120:r=10',
            '-t', '0.3', '-c:v', 'libx264', '-movflags', 'frag_keyframe+empty_moov',
            '-f', 'mp4', 'pipe:3',
        ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'pipe'] }),
    });
    const response = await fetch(server.url);
    assert.equal(response.status, 200);
    const data = Buffer.from(await response.arrayBuffer());
    assert.ok(data.length > 0);
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cobalt-render-test-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const filename = path.join(directory, 'video.mp4');
    await writeFile(filename, data);
    assert.equal(await validateDownloadedVideo(filename), true);
    await writeFile(filename, 'not a video');
    assert.equal(await validateDownloadedVideo(filename), false);
    assert.equal(server.calls(), 0);
});
