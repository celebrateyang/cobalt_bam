import test from 'node:test';
import assert from 'node:assert/strict';
import { selectYoutubeClipFormats } from './youtube-clip-formats.js';

const source = { ext: 'webm', protocol: 'https', filesize: 5000, url: 'https://cdn.example/video' };
const video = { ...source, vcodec: 'vp9', acodec: 'none', height: 360 };
const audio = { ...source, vcodec: 'none', acodec: 'opus', abr: 128 };

test('selects compatible separate progressive tracks within requested height', () => {
    const better = { ...video, height: 720 };
    assert.deepEqual(selectYoutubeClipFormats([better, audio, video], 360), { video, audio });
    assert.deepEqual(selectYoutubeClipFormats([better, audio, video], 720), { video: better, audio });
    const drc = { ...audio, format_id: '251-drc', abr: 140 };
    assert.deepEqual(selectYoutubeClipFormats([video, drc, audio], 360), { video, audio });
    const tooLarge = { ...better, height: 1080, filesize: 0x80000000 };
    assert.deepEqual(selectYoutubeClipFormats([tooLarge, better, audio], 1080), { video: better, audio });
});

test('does not accept incompatible or unverifiable source tracks', () => {
    for (const bad of [
        { ...video, vcodec: 'avc1.4d401e' },
        { ...video, protocol: 'm3u8_native' },
        { ...video, filesize: undefined, filesize_approx: 5000 },
        { ...video, url: 'http://cdn.example/video' },
        { ...video, height: 1080 },
    ]) assert.equal(selectYoutubeClipFormats([bad, audio], 360), null);
    assert.equal(selectYoutubeClipFormats([video, { ...audio, acodec: 'aac' }], 360), null);
});
