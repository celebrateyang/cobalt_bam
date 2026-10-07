import assert from 'node:assert/strict';
import test from 'node:test';
import naver from './naver.js';

const params = { mediaId: 'B78A5E6BF9601402786363ED024C0AF9FA84', serviceType: 'NTV', quality: '720' };
const progressive = (height, url) => ({
    BaseURL: [url], '@mimeType': 'video/mp4', '@height': String(height),
    '@bandwidth': '2400000', 'nvod:Label': [{ '@kind': 'resolution', '#text': String(height) }],
});
const card = (representations, playable = true) => ({
    header: { code: 0 }, body: { card: { content: {
        title: 'Video title', description: 'Long description', profile: { nickname: 'Creator' },
        vod: { playable, playback: { MPD: [{ Period: [{
            '@duration': 'PT3M45.2S', AdaptationSet: [{ Representation: representations }],
        }] }] } },
    } } },
});

test('uses the current NAVER v7 API and selects a progressive MP4 instead of a DASH directory', async t => {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url.pathname, '/api/v7.0/clipviewer/card');
        assert.equal(url.searchParams.get('seedMediaId'), params.mediaId);
        assert.equal(url.searchParams.get('serviceType'), 'NTV');
        assert.ok(options.signal instanceof AbortSignal);
        return { ok: true, json: async () => card([
            { ...progressive(720, 'https://cdn.example.com/hls/'), SegmentTemplate: [{}] },
            progressive(1080, 'https://cdn.example.com/1080.mp4?token=test'),
            progressive(720, 'https://cdn.example.com/720.mp4?token=test'),
        ]) };
    });
    const result = await naver(params);
    assert.equal(result.urls, 'https://cdn.example.com/720.mp4?token=test');
    assert.equal(result.filenameAttributes.title, 'Video title');
    assert.equal(result.filenameAttributes.qualityLabel, '720p');
    assert.equal(result.duration, 225.2);
    assert.equal(result.headers.origin, 'https://m.naver.com');
});

test('reports unavailable content separately from API failures', async t => {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => card([], false) }));
    assert.equal((await naver(params)).error, 'content.video.unavailable');
});

test('API version, HTTP and malformed JSON failures are extraction failures', async t => {
    for (const response of [
        { ok: false },
        { ok: true, json: async () => ({ header: { code: -2013 } }) },
        { ok: true, json: async () => { throw new Error('Invalid JSON'); } },
    ]) {
        t.mock.method(globalThis, 'fetch', async () => response);
        assert.equal((await naver(params)).error, 'fetch.fail');
        t.mock.restoreAll();
    }
});

test('does not download a segment directory when no progressive video exists', async t => {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => card([
        { ...progressive(1080, 'https://cdn.example.com/hls/'), SegmentTemplate: [{}] },
    ]) }));
    assert.equal((await naver(params)).error, 'fetch.empty');
});
