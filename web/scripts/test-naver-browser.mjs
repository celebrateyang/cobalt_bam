import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const packageRequire = createRequire(new URL('../../packages/amazon-direct/package.json', import.meta.url));
const apiRequire = createRequire(new URL('../../api/package.json', import.meta.url));
const loadTransmux = name => {
    const exports = {};
    vm.runInNewContext(compile(`../../packages/amazon-direct/src/${name}.ts`), {
        exports, Uint8Array, DataView, Error,
        require: name => name === 'mux.js' ? {default:packageRequire(name)} : loadTransmux('mp4'),
    });
    return exports;
};
const transmux = loadTransmux('transmux');

test('Naver pipelines fetch CDN media directly and remux HLS without a server fallback', () => {
    const items = [];
    let id = 0;
    const dependencies = {
        'svelte/store': { get: () => key => key },
        '$lib/i18n/translations': { t: {} },
        '$lib/util': { uuid: () => `id-${++id}`, ffmpegMetadataArgs: () => [] },
        '$lib/state/dialogs': { createDialog: () => assert.fail('unexpected dialog') },
        '$lib/state/task-manager/queue': { addItem: item => items.push(item) },
        '$lib/state/queue-visibility': { openQueuePopover() {} },
        '$lib/types/workers': { resultFileTypes: ['video', 'audio', 'image'] },
    };
    const exports = {};
    vm.runInNewContext(compile('../src/lib/task-manager/queue.ts'), {
        exports, console, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; },
    });
    for (const kind of ['direct', 'hls']) {
        const source = `https://cdn.example.com/video.${kind === 'hls' ? 'm3u8' : 'mp4'}`;
        exports.createSavePipeline({ status:'local-processing', service:'naver',
            type:kind === 'hls' ? 'remux' : 'proxy', tunnel:[], source:{kind,urls:[source]},
            output:{type:'video/mp4',filename:'video.mp4'} }, {});
        const item = items.at(-1);
        assert.equal(item.pipeline[0].worker, kind === 'hls' ? 'hls-fetch' : 'fetch');
        assert.equal(item.pipeline[0].workerArgs.url, source);
        assert.equal(item.fallback, undefined);
        if (kind === 'hls') {
            assert.equal(item.pipeline[1].worker, 'remux');
            assert.ok(item.pipeline[1].workerArgs.ffargs.includes('aac_adtstoasc'));
        } else {
            assert.equal(item.pipeline.length, 1);
            assert.equal(item.pipeline[0].workerArgs.tuning.useRangeRequests, false);
        }
    }
});

const runHls = async ({ failLast = false, invalid = false, tsPacket } = {}) => {
    const calls = [], messages = [], chunks = [];
    let destroyed = false;
    const storage = {
        async write(data) { chunks.push(Buffer.from(data)); return data.length; },
        async res() { return new Blob(chunks); },
        async destroy() { destroyed = true; },
    };
    const self = { postMessage: value => messages.push(value.cobaltHlsFetchWorker), close() {} };
    vm.runInNewContext(compile('../src/lib/task-manager/workers/hls-fetch.ts'), {
        exports:{}, self, URL, Date, Error, DOMException, AbortController, console:{error(){}},
        setTimeout:()=>1, clearTimeout(){}, setInterval:()=>1, clearInterval(){},
        require: name => {
            if (name === '@freesavevideo/amazon-direct/transmux') return transmux;
            assert.equal(name,'$lib/storage'); return {init:async()=>storage,retype:file=>file};
        },
        fetch:async(url, options)=>{
            calls.push(url);
            assert.equal(options.referrerPolicy,'no-referrer');
            assert.ok(!url.includes('/tunnel'));
            if (url.endsWith('.m3u8')) return new Response(invalid ? '<html>denied</html>'
                : '#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXTINF:5,\na.ts?token=a\n#EXTINF:5,\nb.ts?token=b\n#EXT-X-ENDLIST\n');
            if (failLast && url.includes('b.ts')) throw new TypeError('Failed to fetch');
            return new Response(tsPacket || (url.includes('a.ts') ? 'first' : 'last'));
        },
    });
    await self.onmessage({data:{cobaltHlsFetchWorker:{url:'https://cdn.example.com/hls/video.m3u8'}}});
    return {calls,messages,destroyed};
};

test('HLS worker downloads relative signed segments straight from the CDN', async () => {
    const result = await runHls();
    assert.deepEqual(result.calls,['https://cdn.example.com/hls/video.m3u8',
        'https://cdn.example.com/hls/a.ts?token=a','https://cdn.example.com/hls/b.ts?token=b']);
    assert.equal(await result.messages.find(m=>m.result).result.text(),'firstlast');
    assert.equal(result.destroyed,false);
});

test('HLS errors destroy partial local storage and never fetch a server fallback', async () => {
    const result = await runHls({failLast:true});
    assert.equal(result.destroyed,true);
    assert.equal(result.messages.at(-1).error,'queue.fetch.network_error');
    assert.equal(result.messages.some(m=>m.result),false);
});

test('HLS worker rejects an HTML error page before downloading segments', async () => {
    const result = await runHls({invalid:true});
    assert.equal(result.calls.length,1);
    assert.equal(result.messages.at(-1).error,'queue.fetch.network_error');
});

test('real H.264/AAC TS becomes MP4 fragments that the browser remuxer can read', async () => {
    const input = spawnSync(apiRequire('ffmpeg-static'), ['-v','error',
        '-f','lavfi','-i','color=c=black:s=160x120:r=25','-f','lavfi','-i','sine=frequency=1000',
        '-t','1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-f','mpegts','pipe:1']);
    assert.equal(input.status,0,input.stderr.toString());
    const output = transmux.createTsTransmuxer().push(new Uint8Array(input.stdout));
    const mp4 = Buffer.concat(output.map(part=>Buffer.from(part)));
    assert.equal(mp4.subarray(4,8).toString(),'ftyp');
    const probe = spawnSync(apiRequire('ffprobe-static').path,['-v','error','-show_entries',
        'stream=codec_name,width,height','-of','json','-i','pipe:0'],{input:mp4});
    assert.equal(probe.status,0,probe.stderr.toString());
    const streams = JSON.parse(probe.stdout.toString()).streams;
    assert.ok(streams.some(s=>s.codec_name === 'h264' && s.height === 120));
    assert.ok(streams.some(s=>s.codec_name === 'aac'));
    const decode = spawnSync(apiRequire('ffmpeg-static'),['-v','error','-i','pipe:0','-f','null','-'],{input:mp4});
    assert.equal(decode.status,0,decode.stderr.toString());
});
