import assert from 'node:assert/strict';
import test from 'node:test';
import reddit, { extractRedditImages, extractRedditImagesFromRss } from './reddit.js';
import { extract, normalizeURL } from '../url.js';
import matchAction from '../match-action.js';

test('single Reddit image becomes a photo download instead of fetch.empty', async t => {
    t.mock.method(globalThis,'fetch',async input => {
        assert.ok(String(input).endsWith('/comments/abc123.json'));
        return Response.json([{data:{children:[{data:{post_hint:'image',url:'https://i.redd.it/photo.png'}}]}}]);
    });
    const result=await reddit({id:'abc123',sub:'pics'});
    assert.equal(result.isPhoto,true);
    assert.equal(result.urls,'https://i.redd.it/photo.png');
    assert.equal(result.filename,'reddit_pics_abc123_1.png');
    const response=matchAction({host:'reddit',r:result,filenameStyle:'classic',audioFormat:'best'});
    assert.equal(response.body.status,'tunnel');
    assert.equal(response.body.filename,result.filename);
});

test('gallery preserves post order and signed original image URLs', async t => {
    const post={gallery_data:{items:[{media_id:'b'},{media_id:'a'}]},media_metadata:{
        a:{status:'valid',e:'Image',s:{u:'https://preview.redd.it/a.jpg?width=2000&amp;s=signature'}},
        b:{status:'valid',e:'Image',s:{u:'https://i.redd.it/b.png'}},
    }};
    assert.deepEqual(extractRedditImages(post),[
        {url:'https://i.redd.it/b.png',index:1},
        {url:'https://preview.redd.it/a.jpg?width=2000&s=signature',index:2},
    ]);
    t.mock.method(globalThis,'fetch',async()=>Response.json([{data:{children:[{data:post}]}}]));
    const result=await reddit({id:'abc123'});
    assert.deepEqual(result.picker.map(p=>p.filename),['reddit_abc123_1.png','reddit_abc123_2.jpg']);
    assert.ok(result.picker.every(p=>p.type==='photo'&&new URL(p.url).pathname==='/tunnel'));
    const response=matchAction({host:'reddit',r:result,filenameStyle:'classic',audioFormat:'best'});
    assert.equal(response.body.status,'picker');
    assert.equal(response.body.picker.length,2);
});

test('blocked JSON can recover original photo from the matching public RSS entry',async t=>{
    const rss='<feed><entry><id>t3_other</id><content>https://i.redd.it/wrong.jpg</content></entry>'
        +'<entry><id>t3_abc123</id><content>&lt;a href=&quot;https://i.redd.it/right.jpg&quot;&gt;image&lt;/a&gt;'
        +'https://preview.redd.it/thumbnail.jpg</content></entry></feed>';
    assert.deepEqual(extractRedditImagesFromRss(rss,'abc123'),[{url:'https://i.redd.it/right.jpg',index:1}]);
    t.mock.method(globalThis,'fetch',async input=>String(input).endsWith('.json')
        ? new Response('blocked',{status:403}) : new Response(rss));
    const result=await reddit({id:'abc123'});
    assert.equal(result.isPhoto,true);
    assert.equal(result.urls,'https://i.redd.it/right.jpg');
});

test('invalid or off-domain gallery URLs are not turned into download proxies',()=>{
    for(const url of ['http://i.redd.it/a.jpg','https://evil.test/a.jpg','https://i.redd.it.evil.test/a.jpg','https://user:password@i.redd.it/a.jpg','https://i.redd.it:444/a.jpg','https://i.redd.it/a.svg']){
        assert.deepEqual(extractRedditImages({url}),[]);
    }
    assert.deepEqual(extractRedditImages({gallery_data:{items:{}},media_metadata:{}}),[]);
    assert.deepEqual(extractRedditImages({gallery_data:{items:[{media_id:'removed'}]},media_metadata:{removed:{status:'failed'}}}),[]);
});

test('existing Reddit video behavior survives photo support',async t=>{
    t.mock.method(globalThis,'fetch',async(input,options)=>options?.method==='HEAD'
        ? new Response(null,{status:200})
        : Response.json([{data:{children:[{data:{secure_media:{reddit_video:{fallback_url:'https://v.redd.it/video/DASH_720.mp4',duration:10}}}}]}}]));
    const result=await reddit({id:'abc123'});
    assert.equal(result.type,'merge');
    assert.equal(result.urls[0],'https://v.redd.it/video/DASH_720.mp4');
    assert.equal(result.isPhoto,undefined);
});

test('Reddit gallery URLs identify the post without broadening unrelated paths',()=>{
    const enabled=new Set(['reddit']);
    assert.deepEqual(extract(normalizeURL('https://www.reddit.com/gallery/abc123'),enabled),{host:'reddit',patternMatch:{id:'abc123'}});
    assert.ok(extract(normalizeURL('https://www.reddit.com/gallery/abc123/other'),enabled).error);
});
