import assert from 'node:assert/strict';
import test from 'node:test';
import HLS from 'hls-parser';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { execFileSync, spawn } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import { setupTunnelHandler } from '../core/itunnel.js';
import { createInternalStream } from './manage.js';
import { handleHlsPlaylist, isHlsResponse } from './internal-hls.js';
import { getInternalTunnelFromURL } from './manage.js';

test('recognizes HLS MIME parameters, casing and extensionless Youku playlists', () => {
    assert.equal(isHlsResponse({ headers: { 'content-type': 'Application/X-MpegURL; charset=UTF-8' } }, {}), true);
    assert.equal(isHlsResponse({ headers: {} }, { isHLS: true, url: 'https://cdn.example.com/playlist/m3u8?vid=1' }), true);
    assert.equal(isHlsResponse({ headers: { 'content-type': 'video/mp2t' } }, { isHLS: true, url: 'https://cdn.example.com/segment.ts' }), false);
});

test('encrypted HLS keys, maps and segments all retain CDN authentication headers', async t => {
    const controller = new AbortController();
    t.after(() => controller.abort());
    const headers = new Map([['Cookie', 'token=test'], ['Referer', 'https://example.com/video']]);
    const info = { url: 'https://cdn.example.com/path/video.m3u8', service: 'example.com', headers, controller, isHLS: true };
    const playlist = '#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-TARGETDURATION:5\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x00000000000000000000000000000001\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:5,\nsegment.m4s\n#EXT-X-ENDLIST\n';
    let result;
    await handleHlsPlaylist(info, { body: { text: async () => playlist } }, { send: value => { result = value; } });
    const segment = HLS.parse(result).segments[0];
    for (const [object, filename] of [[segment, 'segment.m4s'], [segment.map, 'init.mp4'], [segment.key, 'key.bin']]) {
        const input = getInternalTunnelFromURL(object.uri);
        assert.ok(new URL(object.uri).pathname.endsWith(`.${filename.split('.').pop()}`));
        assert.equal(input.url, `https://cdn.example.com/path/${filename}`);
        assert.deepEqual(input.headers, headers);
    }
});

test('extensionless segments and nested playlists have FFmpeg-compatible local URL paths', async t => {
    const controller = new AbortController();
    t.after(() => controller.abort());
    const info = { url: 'https://cdn.example.com/playlist/m3u8?vid=test', service: 'example.com', controller, isHLS: true };
    let result;
    await handleHlsPlaylist(info, { body: { text: async () => '#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXTINF:5,\nhttps://cdn.example.com/file/segment?id=1\n#EXT-X-ENDLIST\n' } }, { send: value => { result = value; } });
    const segment = HLS.parse(result).segments[0];
    assert.equal(new URL(segment.uri).pathname, '/itunnel/segment.ts');
    assert.equal(getInternalTunnelFromURL(segment.uri).url, 'https://cdn.example.com/file/segment?id=1');
    await handleHlsPlaylist(info, { body: { text: async () => '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nhttps://cdn.example.com/playlist?quality=720\n' } }, { send: value => { result = value; } });
    assert.equal(new URL(HLS.parse(result).variants[0].uri).pathname, '/itunnel/playlist.m3u8');
});

test('rewritten HLS resources are served through the real filename tunnel route', async t => {
    const controller = new AbortController();
    const media = execFileSync(ffmpeg, [
        '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=size=64x64:rate=10',
        '-t', '1', '-c:v', 'libx264', '-f', 'mpegts', 'pipe:1',
    ], { windowsHide: true });
    const source = createServer((req, res) => {
        assert.equal(req.headers.cookie, 'token=test');
        if (req.url === '/video.m3u8') {
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.end('#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXTINF:5,\nsegment.ts\n#EXT-X-ENDLIST\n');
        } else {
            res.setHeader('Content-Type', 'video/mp2t');
            res.end(media);
        }
    });
    source.listen(0, '0.0.0.0');
    await once(source, 'listening');
    const tunnel = setupTunnelHandler();
    await once(tunnel, 'listening');
    t.after(() => {
        controller.abort();
        for (const server of [source, tunnel]) {
            server.closeAllConnections();
            server.close();
        }
    });
    const url = createInternalStream(`http://127.0.0.2:${source.address().port}/video.m3u8`, {
        controller, service: 'example.com', isHLS: true,
        headers: { Cookie: 'token=test' },
    });
    assert.equal(new URL(url).pathname, '/itunnel/playlist.m3u8');
    const playlistResponse = await fetch(url, { signal: AbortSignal.timeout(5000) });
    assert.equal(playlistResponse.status, 200);
    const segment = HLS.parse(await playlistResponse.text()).segments[0];
    const response = await fetch(segment.uri, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), media);
    const legacyUrl = new URL(segment.uri);
    legacyUrl.pathname = '/itunnel';
    assert.equal((await fetch(legacyUrl, { signal: AbortSignal.timeout(5000) })).status, 200);
    const child = spawn(ffmpeg, [
        '-loglevel', 'error', '-protocol_whitelist', 'file,http,https,tcp,tls,crypto',
        '-allowed_extensions', 'ALL', '-f', 'hls', '-i', url, '-map', '0:v:0',
        '-c:v', 'copy', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1',
    ], { windowsHide: true, signal: AbortSignal.timeout(10000) });
    const chunks = [];
    let stderr = '';
    child.stdout.on('data', chunk => chunks.push(chunk));
    child.stderr.on('data', chunk => { stderr += chunk; });
    const [code] = await once(child, 'close');
    assert.equal(code, 0, stderr);
    assert.equal(Buffer.concat(chunks).subarray(4, 8).toString(), 'ftyp');
});
