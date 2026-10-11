import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';

import { setupTunnelHandler } from '../core/itunnel.js';
import { createInternalStream } from './manage.js';
import proxy from './proxy.js';

// Real public proxy -> localhost itunnel -> deterministic media source.
// Verifies headers and bytes together, including a fresh tunnel after retry.
test('YouTube tunnel resumes without repeating the prefix and preserves HTTP range responses', async t => {
    const media = Buffer.alloc(8_000_217);
    for (let i = 0; i < media.length; i++) media[i] = (i * 17 + Math.floor(i / 251)) % 256;
    const sourceRanges = [];
    let sourceMode = 'normal';
    const source = createServer((req, res) => {
        res.setHeader('Content-Type', 'video/mp4');
        if (req.method === 'HEAD') {
            res.setHeader('Content-Length', media.length);
            return res.end();
        }
        sourceRanges.push(req.headers.range);
        if (sourceMode === 'ignore-range') {
            res.setHeader('Content-Length', media.length);
            return res.end(media);
        }
        const match = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
        assert.ok(match);
        const start = Number(match[1]), end = Number(match[2]);
        res.writeHead(206, {
            'Content-Range': sourceMode === 'wrong-offset'
                ? `bytes 0-${end - start}/${media.length}`
                : `bytes ${start}-${end}/${media.length}`,
            'Content-Length': end - start + 1,
        });
        res.end(media.subarray(start, end + 1));
    });
    source.listen(0, '127.0.0.1');
    await once(source, 'listening');
    const internal = setupTunnelHandler();
    await once(internal, 'listening');
    const app = express();
    app.get('/tunnel', (req, res) => proxy({
        service: 'youtube', filename: 'video.mp4', range: req.headers.range,
        urls: createInternalStream(`http://127.0.0.1:${source.address().port}/media`, { service: 'youtube' }),
    }, res));
    const publicServer = app.listen(0, '127.0.0.1');
    await once(publicServer, 'listening');
    t.after(async () => {
        await Promise.all([source, internal, publicServer].map(server => new Promise(resolve => {
            server.close(resolve);
            server.closeAllConnections();
        })));
    });
    const url = `http://127.0.0.1:${publicServer.address().port}/tunnel`;
    const get = async range => {
        const response = await fetch(url, { headers: range ? { Range: range } : {} });
        return { response, bytes: Buffer.from(await response.arrayBuffer()) };
    };

    const first = await get('bytes=0-4194303');
    const resumed = await get('bytes=4194304-');
    assert.equal(first.response.status, 206);
    assert.equal(resumed.response.status, 206);
    assert.equal(resumed.response.headers.get('content-range'), `bytes 4194304-${media.length - 1}/${media.length}`);
    assert.equal(resumed.response.headers.get('content-length'), String(media.length - 4194304));
    assert.equal(resumed.response.headers.get('accept-ranges'), 'bytes');
    assert.deepEqual(Buffer.concat([first.bytes, resumed.bytes]), media);
    assert.deepEqual(sourceRanges.splice(0), ['bytes=0-4194303', `bytes=4194304-${media.length - 1}`]);

    for (const [range, start, end] of [
        ['bytes=7-12', 7, 12], ['bytes=-9', media.length - 9, media.length - 1],
        [`bytes=${media.length - 2}-${media.length + 100}`, media.length - 2, media.length - 1],
    ]) {
        const { response, bytes } = await get(range);
        assert.equal(response.status, 206);
        assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/${media.length}`);
        assert.deepEqual(bytes, media.subarray(start, end + 1));
    }
    sourceRanges.length = 0;
    const invalid = await get(`bytes=${media.length}-`);
    assert.equal(invalid.response.status, 416);
    assert.equal(invalid.response.headers.get('content-range'), `bytes */${media.length}`);
    assert.equal(invalid.bytes.length, 0);
    assert.equal(sourceRanges.length, 0);

    const full = await get();
    assert.equal(full.response.status, 200);
    assert.equal(full.response.headers.get('content-range'), null);
    assert.deepEqual(full.bytes, media);
    assert.deepEqual(sourceRanges, ['bytes=0-7999999', `bytes=8000000-${media.length - 1}`]);

    // Cancel a live response and resume at the number of bytes actually read.
    const interrupted = await fetch(url);
    const reader = interrupted.body.getReader();
    const prefix = Buffer.from((await reader.read()).value);
    assert.ok(prefix.length > 0 && prefix.length < media.length);
    await reader.cancel();
    const retry = await get(`bytes=${prefix.length}-`);
    assert.equal(retry.response.status, 206);
    assert.deepEqual(Buffer.concat([prefix, retry.bytes]), media);

    for (const mode of ['ignore-range', 'wrong-offset']) {
        sourceMode = mode;
        const rejected = await get('bytes=100-199');
        assert.equal(rejected.response.status, 502);
        assert.equal(rejected.response.headers.get('content-range'), null);
        assert.equal(rejected.bytes.length, 0);
    }
});
