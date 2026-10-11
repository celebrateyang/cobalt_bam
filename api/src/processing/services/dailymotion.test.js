import assert from 'node:assert/strict';
import test from 'node:test';
import dailymotion from './dailymotion.js';
import matchAction from '../match-action.js';
import { verifyStream } from '../../stream/manage.js';
import { selectHlsAudioArgs } from '../../stream/ffmpeg.js';

test('Dailymotion manifest audio codec survives extraction and tunnel creation', async t => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    let codec = 'mp4a.40.2,';
    globalThis.fetch = async url => {
        if (url.endsWith('/oauth/token')) {
            const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
            return Response.json({ access_token: `header.${payload}.signature` });
        }
        if (url.includes('graphql.api.dailymotion.com')) {
            return Response.json({ data: { media: { __typename: 'Video', xid: 'test',
                hlsURL: 'https://cdn.example/master.m3u8', duration: 60,
                title: 'test', channel: { displayName: 'test' } } } });
        }
        return new Response('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="audio",DEFAULT=YES,URI="https://cdn.example/audio.m3u8"\n'
            + `#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=848x480,CODECS="${codec}avc1.64001f",AUDIO="audio"\n`
            + 'https://cdn.example/video.m3u8\n');
    };
    for (const advertised of ['mp4a.40.2,', '']) {
        codec = advertised;
        const extracted = await dailymotion({ id: 'test' });
        assert.equal(extracted.hlsAudioCodec, advertised ? 'mp4a.40.2' : undefined);
        const response = matchAction({ r: extracted, host: 'dailymotion',
            audioFormat: 'best', filenameStyle: 'basic', localProcessing: 'disabled', requestIP: '127.0.0.1' });
        assert.equal(response.body.status, 'tunnel');
        const params = new URL(response.body.url).searchParams;
        const stream = await verifyStream(params.get('id'), params.get('sig'), params.get('exp'), params.get('sec'), params.get('iv'));
        assert.equal(stream.hlsAudioCodec, extracted.hlsAudioCodec);
        assert.deepEqual(stream.urls, extracted.urls);
        assert.equal(selectHlsAudioArgs(stream, 'mp4')[1], advertised ? 'copy' : 'aac');
    }
});
