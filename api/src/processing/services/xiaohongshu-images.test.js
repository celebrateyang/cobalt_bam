import assert from 'node:assert/strict';
import test from 'node:test';
import xiaohongshu from './xiaohongshu.js';
import { verifyStream, getInternalTunnelFromURL } from '../../stream/manage.js';

const id = '67ee794b000000001c02b668';
const extract = async imageList => {
    const previous = globalThis.fetch;
    globalThis.fetch = async () => ({text:async () => `<script>window.__INITIAL_STATE__=${JSON.stringify({noteData:{data:{noteData:{imageList}}}})}</script>`});
    try { return await xiaohongshu({id,url:new URL(`https://www.xiaohongshu.com/explore/${id}`)}); }
    finally { globalThis.fetch = previous; }
};

test('mobile single image prefers the default scene over a preview and upgrades HTTP', async () => {
    const result = await extract([{url:'https://cdn.example/preview.jpg',infoList:[{imageScene:'WB_PRV',url:'https://cdn.example/thumb.jpg'},{imageScene:'WB_DFT',url:'http://cdn.example/full.jpg?keep=value'}]}]);
    assert.equal(result.isPhoto, true);
    assert.equal(result.urls, 'https://cdn.example/full.jpg?keep=value');
});

test('legacy urlDefault remains preferred, with url and infoList fallbacks', async () => {
    for (const [image,url] of [[{urlDefault:'https://cdn.example/legacy.jpg',url:'https://cdn.example/other.jpg'},'https://cdn.example/legacy.jpg'],[{url:'https://cdn.example/mobile.jpg'},'https://cdn.example/mobile.jpg'],[{infoList:[{url:'https://cdn.example/info.jpg'}]},'https://cdn.example/info.jpg']]) {
        assert.equal((await extract([image])).urls,url);
    }
});

test('mixed image schemas retain gallery order and actual stream targets', async () => {
    const urls=['https://cdn.example/first.jpg','https://cdn.example/second.jpg'];
    const result=await extract([{url:urls[0]},{urlDefault:urls[1]}]);
    assert.equal(result.picker.length,2);
    for(const [index,item] of result.picker.entries()) {
        const p=new URL(item.url).searchParams;
        const stream=await verifyStream(p.get('id'),p.get('sig'),p.get('exp'),p.get('sec'),p.get('iv'));
        assert.equal(getInternalTunnelFromURL(stream.urls).url,urls[index]);
    }
});

test('missing or non-HTTP image URLs return an error instead of crashing or dropping a gallery item', async () => {
    for(const images of [[{}],[{url:'javascript:alert(1)'}],[{url:'https://cdn.example/one.jpg'},{}]]) {
        assert.equal((await extract(images)).error,'fetch.empty');
    }
});
