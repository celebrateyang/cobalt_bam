import test from 'node:test';
import assert from 'node:assert/strict';
import extract, { readVideoData, selectProgressive, safeMediaUrl } from './xinpianchang.js';

const media = 'https://us-xpc5-l2.xpccdn.com/example.mp4?e=9999999999&s=signature';
const html = '<script type="application/json" id="__NEXT_DATA__">' + JSON.stringify({
    props: { pageProps: { detail: { video: { vid: 'media/id', appKey: 'key&value' } } } },
}) + '</script>';

test('reads Next data and selects available progressive quality safely', () => {
    assert.equal(readVideoData(html).vid, 'media/id');
    assert.equal(readVideoData('<html>challenge</html>'), undefined);
    const resource = { progressive: [
        { height: 1080, url: media }, { height: 720, url: media.replace('example', '720') },
        { height: 2160, url: 'https://xpccdn.com.evil.test/fake.mp4' },
    ] };
    assert.equal(selectProgressive(resource, 'max').height, 1080);
    assert.equal(selectProgressive(resource, '720').height, 720);
    assert.equal(selectProgressive(resource, '360').height, 720);
    assert.equal(safeMediaUrl('http://127.0.0.1/a.mp4'), undefined);
});

test('page verification produces the extension fallback error', async () => {
    for (const status of [403, 429]) {
        const result = await extract({ id: '13690233', fetchImpl: async () => new Response('', { status }) });
        assert.equal(result.error, 'xinpianchang.browser_required');
    }
    const result = await extract({ id: '13690233', fetchImpl: async () => new Response('<html>captcha</html>') });
    assert.equal(result.error, 'xinpianchang.browser_required');
});

test('deleted works do not incorrectly prompt extension installation', async () => {
    const result = await extract({ id: '13690233', fetchImpl: async () => new Response('', { status: 404 }) });
    assert.equal(result.error, 'content.video.unavailable');
});

test('native extraction encodes API parameters, probes MP4 and preserves download headers', async () => {
    const calls = [];
    const result = await extract({ id: '13690233', quality: '720', fetchImpl: async (url, options) => {
        calls.push({ url: String(url), options });
        if (calls.length === 1) return new Response(html);
        if (calls.length === 2) return Response.json({ data: {
            title: 'Test video', duration: 132.31, owner: { username: 'Author' },
            resource: { progressive: [{ height: 720, url: media }] },
        } });
        return new Response(new Uint8Array([0, 0, 0, 32, 102, 116, 121, 112]), { status: 206 });
    } });
    assert.equal(new URL(calls[1].url).searchParams.get('appKey'), 'key&value');
    assert.ok(calls[1].url.includes('media%2Fid'));
    assert.equal(calls[2].options.headers.Range, 'bytes=0-31');
    assert.equal(calls[2].options.headers.Referer, 'https://www.xinpianchang.com/a13690233');
    assert.equal(result.urls, media);
    assert.deepEqual(result.headers, { referer: 'https://www.xinpianchang.com/a13690233', Range: 'bytes=0-' });
    assert.equal(result.filenameAttributes.qualityLabel, '720p');
});

test('media auth failures prompt the browser flow; HTML payloads are rejected', async () => {
    for (const status of [403, 200]) {
        let count = 0;
        const result = await extract({ id: '13690233', fetchImpl: async () => {
            count++;
            if (count === 1) return new Response(html);
            if (count === 2) return Response.json({ data: { resource: { progressive: [{ url: media }] } } });
            return new Response('<html>denied</html>', { status });
        } });
        assert.equal(result.error, status === 403 ? 'xinpianchang.browser_required' : 'fetch.fail');
    }
});
