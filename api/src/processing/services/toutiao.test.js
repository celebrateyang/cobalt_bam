import test from 'node:test';
import assert from 'node:assert/strict';
import toutiao from './toutiao.js';
import { normalizeURL, extract } from '../url.js';

test('legacy Toutiao link falls back to the mobile video page and extracts media', async (t) => {
    const id = '7488588638192665127';
    const url = normalizeURL(`https://www.toutiao.com/i${id}`);
    const { patternMatch } = extract(url, new Set(['toutiao']));
    const mediaUrl = 'https://v.example.com/video.mp4';
    const calls = [];
    const articleInfo = {
        gid: id,
        title: 'Example video',
        videoId: 'video-id',
        videoDuration: 30,
        playAuthTokenV2: Buffer.from(JSON.stringify({
            GetPlayInfoToken: 'Action=GetPlayInfo&token=test',
        })).toString('base64'),
    };
    t.mock.method(globalThis, 'fetch', async (input) => {
        const requested = String(input);
        calls.push(requested);
        if (requested === url.toString()) return new Response('<html>legacy page</html>');
        if (requested === `https://m.toutiao.com/video/${id}/`) {
            return new Response(`<script id="RENDER_DATA">${encodeURIComponent(JSON.stringify({ articleInfo }))}</script>`);
        }
        if (requested === 'https://vod.bytedanceapi.com/?Action=GetPlayInfo&token=test') {
            return Response.json({ Result: { Data: { PlayInfoList: [
                { Height: 720, MainPlayUrl: mediaUrl },
            ] } } });
        }
        throw new Error(`Unexpected request: ${requested}`);
    });

    const result = await toutiao({ ...patternMatch, url, quality: 'max' });
    assert.equal(result.type, 'video');
    assert.equal(result.urls, mediaUrl);
    assert.equal(result.original_url, `https://m.toutiao.com/video/${id}/`);
    assert.equal(result.duration, 30);
    assert.equal(calls.length, 3);
});
