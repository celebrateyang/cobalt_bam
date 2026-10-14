import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { Writable } from 'node:stream';
import { once } from 'node:events';
import ffmpeg from 'ffmpeg-static';
import renderer from './ffmpeg.js';

const fixture = format => {
    const result = spawnSync(ffmpeg, [
        '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=10',
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
        '-t', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac',
        '-f', format, 'pipe:1',
    ], { timeout: 15000, windowsHide: true });
    assert.equal(result.status, 0, result.stderr?.toString());
    return result.stdout;
};

for (const format of ['flv', 'mpegts']) {
    test(`remuxes a single iQIYI ${format} object to decodable MP4`, { timeout: 20000 }, async t => {
        const source = fixture(format);
        t.mock.method(globalThis, 'fetch', async () => new Response(source));
        const chunks = [];
        const response = new Writable({
            write(chunk, encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); },
        });
        response.headersSent = true;
        response.setHeader = () => {};
        const finished = once(response, 'finish');
        await renderer.remux({ service: 'iqiyi', type: 'remux', filename: 'test.mp4',
            urls: 'https://media.test/input', headers: {}, isHLS: false }, response);
        await finished;
        const output = Buffer.concat(chunks);
        assert.ok(output.length > 1000, 'must produce media bytes instead of an empty download');
        const decode = spawnSync(ffmpeg, ['-loglevel', 'error', '-i', 'pipe:0',
            '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'],
            { input: output, timeout: 15000, windowsHide: true });
        assert.equal(decode.status, 0, decode.stderr?.toString());
    });
}
