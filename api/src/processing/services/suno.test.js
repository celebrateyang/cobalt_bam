import test from 'node:test';
import assert from 'node:assert/strict';
import suno from './suno.js';
import { extract, normalizeURL } from '../url.js';
import matchAction from '../match-action.js';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';

const id = 'afdb217c-fc39-453a-965d-17ed6e8efcfd';
const media = `https://cdn1.suno.ai/${id}.mp4`;
const page = (video = media) => `<meta property="og:title" content="A song"/><script>${JSON.stringify({ id, entity_type: 'song_schema', video_url: video }).replaceAll('"', '\\"')}</script>`;

test('resolves public Suno links and returns a direct MP4 even with forced local processing', async t => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    const calls = [];
    globalThis.fetch = async url => {
        calls.push(String(url));
        return calls.length === 1
            ? new Response(null, { status: 307, headers: { location: `/song/${id}?sh=abc` } })
            : new Response(page());
    };
    assert.equal(extract(normalizeURL('https://suno.com/s/abc'), new Set(['suno'])).host, 'suno');
    assert.equal(extract(normalizeURL(`https://suno.com/song/${id}`), new Set(['suno'])).patternMatch.id, id);
    const result = await suno({ shortLink: 'abc' });
    assert.equal(result.urls, media);
    assert.equal(result.filename, 'A song.mp4');
    const response = matchAction({ r: result, host: 'suno', alwaysProxy: true, localProcessing: 'forced' });
    assert.equal(response.body.status, 'redirect');
    assert.equal(response.body.directUrl, media);
    assert.equal(response.body.tunnelUrl, undefined);
    for (const format of ['mp3', 'wav', 'ogg', 'opus', 'best']) {
        const audio = matchAction({ r: result, host: 'suno', isAudioOnly: true, audioFormat: format, audioBitrate: '128', alwaysProxy: true, localProcessing: 'disabled' });
        assert.equal(audio.body.status, 'local-processing');
        assert.equal(audio.body.type, 'audio');
        assert.deepEqual(audio.body.source.urls, [media]);
        assert.deepEqual(audio.body.tunnel, []);
        assert.equal(audio.body.fallback, undefined);
        assert.equal(audio.body.audio.format, format === 'best' ? 'm4a' : format);
        assert.equal(audio.body.output.filename, `A song.${format === 'best' ? 'm4a' : format}`);
    }
});

test('rejects unsafe redirects and unrelated or missing media', async t => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    let count = 0;
    globalThis.fetch = async () => { count++; return new Response(null, { status: 302, headers: { location: 'https://example.com/' } }); };
    assert.equal((await suno({ shortLink: 'abc' })).error, 'fetch.fail');
    assert.equal(count, 1);
    for (const body of [page('https://evil.example/video.mp4'), page(`https://cdn1.suno.ai/00000000-0000-0000-0000-000000000000.mp4`), '<html>no video</html>']) {
        globalThis.fetch = async () => new Response(body);
        assert.equal((await suno({ id })).error, 'fetch.empty');
    }
});

test('audio-only songs use the matching public player resource without creating a tunnel', async t => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    const key = randomBytes(16), counter = randomBytes(16), glt = 'test-guest-token';
    const wrap = input => {
        const nonce = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(glt).digest(), nonce);
        cipher.setAAD(Buffer.from(id));
        return Buffer.concat([nonce, cipher.update(input), cipher.final(), cipher.getAuthTag()]).toString('base64');
    };
    const resource = `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${id}.m4a`;
    const body = `<meta property="og:title" content="A song"/><script>${JSON.stringify({ id, entity_type: 'song_schema', video_url: '', audio_url: 'forbidden', media_urls: [{ url: resource, content_type: 'm4a-opus', delivery: 'progressive', encoding: '1.0.0' }] }).replaceAll('"', '\\"')}</script>`;
    let calls = 0;
    globalThis.fetch = async (url, options) => {
        calls++;
        if (String(url).includes('/mango/rights')) {
            assert.equal(options.redirect, 'error');
            assert.equal(JSON.parse(options.body).content_params.content_id, id);
            return Response.json({ key: wrap(key), iv: wrap(counter), glt });
        }
        return new Response(body);
    };
    assert.equal((await suno({ id })).error, 'fetch.empty');
    assert.equal(calls, 1, 'video requests must not retrieve audio rights');
    const result = await suno({ id, isAudioOnly: true });
    assert.equal(result.urls, resource);
    assert.equal(result.sunoEncryption.key, key.toString('base64'));
    assert.equal(result.sunoEncryption.counter, counter.toString('base64'));
    for (const format of ['mp3', 'best']) {
        const response = matchAction({ r: result, host: 'suno', isAudioOnly: true, audioFormat: format, audioBitrate: '128' });
        assert.equal(response.body.status, 'local-processing');
        assert.equal(response.body.source.urls[0], resource);
        assert.deepEqual(response.body.source.sunoEncryption, result.sunoEncryption);
        assert.deepEqual(response.body.tunnel, []);
        assert.equal(response.body.fallback, undefined);
        assert.equal(response.body.output.filename, `A song.${format === 'best' ? 'opus' : 'mp3'}`);
        assert.equal(response.body.audio.copy, format === 'best');
    }
});

test('rejects unrelated or unsupported audio resources before requesting playback rights', async t => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    for (const entry of [
        { url: `https://evil.test/1/clip/${id}.m4a`, content_type: 'm4a-opus', delivery: 'progressive', encoding: '1.0.0' },
        { url: 'https://d2lwuy8qc234o3.cloudfront.net/1/clip/00000000-0000-0000-0000-000000000000.m4a', content_type: 'm4a-opus', delivery: 'progressive', encoding: '1.0.0' },
        { url: `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${id}.m4a`, content_type: 'm4a-opus', delivery: 'progressive', encoding: '2.0.0' },
    ]) {
        const object = { id, entity_type: 'song_schema', video_url: '', media_urls: [entry] };
        let calls = 0;
        globalThis.fetch = async () => { calls++; return new Response(JSON.stringify(object).replaceAll('"', '\\"')); };
        assert.equal((await suno({ id, isAudioOnly: true })).error, 'fetch.empty');
        assert.equal(calls, 1);
    }
});
