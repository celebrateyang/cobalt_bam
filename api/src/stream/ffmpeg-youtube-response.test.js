import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import test from 'node:test';
import ffmpeg from 'ffmpeg-static';
import { render } from './ffmpeg.js';

test('YouTube remux reports failure after partial output and ends cleanly only on success', async t => {
    const server = createServer((req, res) => {
        const child = new EventEmitter();
        const output = new PassThrough();
        child.stdio = [null, null, new PassThrough(), output];
        child.exitCode = null;
        child.kill = () => true;
        void render(res, { service: 'youtube', type: 'merge', filename: 'video.mp4', urls: [] }, [], undefined, undefined, () => {
            setTimeout(() => {
                if (req.url !== '/empty') output.write('partial media');
                setTimeout(() => {
                    child.exitCode = req.url === '/ok' ? 0 : 1;
                    output.end();
                    child.emit('close', child.exitCode, null);
                }, 50);
            }, 10);
            return child;
        });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => { server.close(); server.closeAllConnections(); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const ok = await fetch(`${base}/ok`);
    assert.equal(await ok.text(), 'partial media');
    const partial = await fetch(`${base}/partial`);
    await assert.rejects(partial.text());
    const empty = await fetch(`${base}/empty`);
    assert.equal(empty.status, 502);
});

test('real FFmpeg emits a complete playable YouTube response', async t => {
    const server = createServer((req, res) => {
        void render(res, { service: 'youtube', type: 'merge', filename: 'video.mp4', urls: [] }, [
            '-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=5',
            '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=44100', '-t', '2',
            '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
            '-movflags', 'frag_keyframe+empty_moov',
            '-f', 'mp4', 'pipe:3',
        ]);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => { server.close(); server.closeAllConnections(); });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(response.status, 200);
    const media = Buffer.from(await response.arrayBuffer());
    assert.ok(media.length > 1000);
    const decoder = spawn(ffmpeg, ['-v', 'error', '-i', 'pipe:0', '-f', 'null', '-'], { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
    decoder.stdin.end(media);
    const [code] = await once(decoder, 'close');
    assert.equal(code, 0);
});
