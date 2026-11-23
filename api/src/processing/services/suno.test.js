import test from 'node:test';
import assert from 'node:assert/strict';
import suno from './suno.js';
import { extract, normalizeURL } from '../url.js';
import matchAction from '../match-action.js';

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
    const audio = matchAction({ r: result, host: 'suno', isAudioOnly: true });
    assert.equal(audio.body.error.code, 'error.api.service.audio_not_supported');
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
