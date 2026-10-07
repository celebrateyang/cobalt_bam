import assert from 'node:assert/strict';
import test from 'node:test';
import HLS from 'hls-parser';
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
        assert.equal(input.url, `https://cdn.example.com/path/${filename}`);
        assert.deepEqual(input.headers, headers);
    }
});
