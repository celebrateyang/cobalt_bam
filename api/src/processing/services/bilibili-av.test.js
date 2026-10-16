import assert from 'node:assert/strict';
import test from 'node:test';
import bilibili from './bilibili.js';
import { env } from '../../config.js';

for (const id of ['av488102331', 'AV972033666', 'BV1ZvS4YqE4R']) {
    for (const progressive of [false, true]) {
        test(`${id}: correct video identifier for metadata and ${progressive ? 'progressive' : 'DASH'} playback`, async () => {
            const original = globalThis.fetch;
            const upstreams = env.upstreamURLs;
            env.upstreamURLs = [];
            const calls = [];
            globalThis.fetch = async input => {
                const url = new URL(input);
                calls.push(url);
                const av = /^av(\d+)$/i.exec(id);
                const avParameter = url.pathname.endsWith('/view') ? 'aid' : 'avid';
                assert.equal(url.searchParams.get(av ? avParameter : 'bvid'), av ? av[1] : id);
                assert.equal(url.searchParams.has('bvid'), !av);
                assert.equal(url.searchParams.has('aid'), Boolean(av && avParameter === 'aid'));
                assert.equal(url.searchParams.has('avid'), Boolean(av && avParameter === 'avid'));
                if (url.pathname.endsWith('/view')) return Response.json({code:0,data:{cid:42,title:'fixture',duration:60,pages:[{page:1,cid:42,duration:60}]}});
                assert.equal(url.searchParams.get('cid'), '42');
                return Response.json({code:0,data:{timelength:60000,
                    dash:{video:[{id:80,baseUrl:'https://media.test/video.m4s',codecs:'avc1',width:1280,height:720}],audio:[{id:30280,baseUrl:'https://media.test/audio.m4s',codecs:'mp4a'}]},
                    durl:[{url:'https://media.test/video.mp4',size:1000,length:60000}],
                }});
            };
            try {
                const result = await bilibili({comId:id,preferProgressiveMp4:progressive,forceProgressiveMp4:progressive});
                assert.equal(result.error, undefined);
                assert.ok(calls.some(url => url.pathname.endsWith('/view')));
                assert.ok(calls.some(url => url.pathname.endsWith('/playurl')));
                assert.equal(progressive ? typeof result.urls : result.urls.length, progressive ? 'string' : 2);
            } finally { globalThis.fetch = original; env.upstreamURLs = upstreams; }
        });
    }
}
