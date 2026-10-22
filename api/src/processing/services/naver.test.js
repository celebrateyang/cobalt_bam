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
const hls = (height) => ({
    ...progressive(height, 'https://cdn.example.com/hls/'),
    '@mimeType': 'video/mp2t', '@bandwidth': '9000000',
    '@codecs': 'avc1.4d401f,mp4a.40.2',
    '@nvod:m3u': `https://cdn.example.com/hls/${height}.m3u8?token=test`,
    SegmentTemplate: [{}],
});
const playlist = '#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXTINF:5,\nfirst.ts?token=test\n#EXTINF:5,\nmiddle.ts?token=test\n#EXTINF:5,\nlast.ts?token=test\n#EXT-X-ENDLIST\n';
const videoResponse = () => new Response(new Uint8Array([0]), {
    status: 206, headers: { 'content-type': 'video/mp4' },
});

test('resolves a blog Clip document to its real video ID before fetching the card', async t => {
    const videoId = '8F4CFCFE018CD586CD6DE82CA354D88CBB1D';
    t.mock.method(globalThis, 'fetch', async url => {
        if (url === 'https://m.blog.naver.com/gkalwod/clip/15806609') {
            const state = {queries:[{queryKey:['GetClipDocument','guest','gkalwod',15806609],
                state:{data:{blogId:'gkalwod',docNo:15806609,videoId}}}]};
            return new Response(`<script>window.__REACT_QUERY_STATE__ = ${JSON.stringify(state)};</script>`);
        }
        if (url instanceof URL) {
            assert.equal(url.searchParams.get('seedMediaId'), videoId);
            assert.equal(url.searchParams.get('serviceType'), 'MOMENT');
            return { ok:true,json:async()=>card([progressive(720,'https://cdn.example.com/720.mp4')]) };
        }
        return videoResponse();
    });
    const result = await naver({blogId:'gkalwod',clipId:'15806609',quality:'720'});
    assert.equal(result.filenameAttributes.id,videoId);
    assert.equal(result.filenameAttributes.qualityLabel,'720p');
});

test('does not extract another clip or execute scripts from an unavailable blog page', async t => {
    for (const response of [new Response('',{status:404}), new Response('<html>no video</html>'),
        new Response('<script>window.__REACT_QUERY_STATE__ = {"queries":[]};</script>'),
        new Response('<script>window.__REACT_QUERY_STATE__ = (()=>{throw Error("never execute")})();</script>')]) {
        let calls = 0;
        t.mock.method(globalThis,'fetch',async()=>{calls++;return response;});
        assert.ok((await naver({blogId:'gkalwod',clipId:'15806609'})).error);
        assert.equal(calls,1);
        t.mock.restoreAll();
    }
});

test('prefers a readable MP4 over the same-resolution HLS even at a higher HLS bitrate', async t => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async url => {
        if (url instanceof URL) return { ok: true, json: async () => card([
            hls(720), progressive(720, 'https://cdn.example.com/720.mp4'),
        ]) };
        calls.push(url);
        return videoResponse();
    });
    const result = await naver(params);
    assert.equal(result.isHLS, false);
    assert.deepEqual(calls, Array(2).fill('https://cdn.example.com/720.mp4'));
});

test('uses 720p HLS before a lower-resolution MP4 and checks first, middle and last segments', async t => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        if (url instanceof URL) return { ok: true, json: async () => card([
            progressive(480, 'https://cdn.example.com/480.mp4'),
            hls(720), progressive(720, 'https://cdn.example.com/720.mp4'),
        ]) };
        calls.push(url);
        assert.equal(options.headers.origin, 'https://m.naver.com');
        if (url.endsWith('/720.mp4')) return new Response('Forbidden', { status: 403 });
        if (url.includes('.m3u8')) return new Response(playlist);
        assert.equal(options.headers.range, 'bytes=0-0');
        return new Response(new Uint8Array([0x47]), { status: 206, headers: { 'content-type': 'video/MP2T' } });
    });
    const result = await naver({ ...params, quality: 'max' });
    assert.equal(result.isHLS, true);
    assert.equal(result.hlsAudioCodec, 'mp4a.40.2');
    assert.equal(result.urls, 'https://cdn.example.com/hls/720.m3u8?token=test');
    assert.equal(result.filenameAttributes.qualityLabel, '720p');
    assert.equal(result.filenameAttributes.extension, 'mp4');
    assert.deepEqual(calls, ['https://cdn.example.com/720.mp4',
        'https://cdn.example.com/hls/720.m3u8?token=test',
        ...['first', 'middle', 'last'].map(name => `https://cdn.example.com/hls/${name}.ts?token=test`)]);
});

test('only lowers quality after the same-resolution MP4 and HLS have failed', async t => {
    for (const failure of ['http', 'html', 'empty', 'master', 'segment']) {
        const calls = [];
        t.mock.method(globalThis, 'fetch', async url => {
            if (url instanceof URL) return { ok: true, json: async () => card([
                progressive(720, 'https://cdn.example.com/720.mp4'), hls(720),
                progressive(480, 'https://cdn.example.com/480.mp4'),
            ]) };
            calls.push(url);
            if (url.endsWith('/720.mp4')) return new Response('Forbidden', { status: 403 });
            if (url.includes('.m3u8')) {
                if (failure === 'http') return new Response('', { status: 403 });
                if (failure === 'html') return new Response('<html>error</html>');
                if (failure === 'empty') return new Response('#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXT-X-ENDLIST\n');
                if (failure === 'master') return new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1280x720\n720.m3u8\n');
                return new Response(playlist);
            }
            if (url.includes('middle.ts')) return new Response('Forbidden', { status: 403 });
            return videoResponse();
        });
        const result = await naver(params);
        assert.equal(result.isHLS, false, failure);
        assert.equal(result.filenameAttributes.qualityLabel, '480p', failure);
        assert.deepEqual(calls.slice(0,2), ['https://cdn.example.com/720.mp4',
            'https://cdn.example.com/hls/720.m3u8?token=test']);
        t.mock.restoreAll();
    }
});

test('supports a representation HLS playlist even when there is no progressive MP4', async t => {
    t.mock.method(globalThis, 'fetch', async url => {
        if (url instanceof URL) return { ok: true, json: async () => card([hls(720)]) };
        return url.includes('.m3u8') ? new Response(playlist) : videoResponse();
    });
    const result = await naver(params);
    assert.equal(result.isHLS, true);
    assert.equal(result.filenameAttributes.qualityLabel, '720p');
});

test('uses the current NAVER v7 API and selects a progressive MP4 instead of a DASH directory', async t => {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        if (typeof url === 'string') {
            assert.equal(url, 'https://cdn.example.com/720.mp4?token=test');
            assert.ok(['bytes=0-0', 'bytes=-1'].includes(options.headers.range));
            return new Response(new Uint8Array([0]), { status: 206, headers: { 'content-type': 'video/mp4' } });
        }
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

test('SPORTS falls back from forbidden 720p and 480p to a readable 360p MP4', async t => {
    const probes = [];
    let cancelled = 0;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        if (url instanceof URL) return { ok: true, json: async () => card([
            progressive(270, 'https://cdn.example.com/270.mp4'),
            progressive(720, 'https://cdn.example.com/720.mp4'),
            progressive(360, 'https://cdn.example.com/360.mp4'),
            progressive(480, 'https://cdn.example.com/480.mp4'),
        ]) };
        probes.push([url, options.headers.range]);
        assert.equal(options.headers.origin, 'https://m.naver.com');
        return {
            ok: url.endsWith('/360.mp4'),
            headers: new Headers({ 'content-type': 'video/mp4' }),
            body: { getReader: () => ({
                read: async () => ({ value: new Uint8Array([0]) }),
                cancel: async () => { cancelled++; },
            }) },
        };
    });
    const result = await naver({ ...params, serviceType: 'SPORTS', quality: 'max' });
    assert.deepEqual(probes, [
        ['https://cdn.example.com/720.mp4', 'bytes=0-0'],
        ['https://cdn.example.com/480.mp4', 'bytes=0-0'],
        ['https://cdn.example.com/360.mp4', 'bytes=0-0'],
        ['https://cdn.example.com/360.mp4', 'bytes=-1'],
    ]);
    assert.equal(cancelled, 4);
    assert.equal(result.urls, 'https://cdn.example.com/360.mp4');
    assert.equal(result.filenameAttributes.qualityLabel, '360p');
});

test('skips an encode with a readable header but a broken tail', async t => {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        if (url instanceof URL) return { ok: true, json: async () => card([
            progressive(360, 'https://cdn.example.com/360.mp4'),
            progressive(144, 'https://cdn.example.com/144.mp4'),
        ]) };
        if (url.endsWith('/360.mp4') && options.headers.range === 'bytes=-1') {
            return new Response(new ReadableStream({ start(controller) {
                controller.error(new Error('terminated'));
            } }), { status: 206, headers: { 'content-type': 'video/mp4' } });
        }
        return new Response(new Uint8Array([0]), { status: 206, headers: { 'content-type': 'video/mp4' } });
    });
    const result = await naver({ ...params, quality: 'max' });
    assert.equal(result.filenameAttributes.qualityLabel, '144p');
});

test('rejects unreadable media, empty bodies and HTML responses before creating a tunnel', async t => {
    for (const mediaResponse of [
        () => new Response('Forbidden', { status: 403 }),
        () => new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } }),
        () => new Response(null, { headers: { 'content-type': 'video/mp4', 'content-length': '0' } }),
        () => { throw new Error('timeout'); },
    ]) {
        t.mock.method(globalThis, 'fetch', async url => url instanceof URL
            ? { ok: true, json: async () => card([progressive(720, 'https://cdn.example.com/720.mp4')]) }
            : mediaResponse());
        assert.deepEqual(await naver(params), { error: 'fetch.fail' });
        t.mock.restoreAll();
    }
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
