import assert from 'node:assert/strict';
import test from 'node:test';
import { COLLECTION_PAGE_SIZE, collectionVideoIdentity, selectCollectionPage, collectionItemOrder } from '../src/lib/collection-selection.js';

test('title sorting uses numeric order and keeps original item indices for selection', () => {
    const items = [101, 100, 99, 20, 9, 2].map(number => ({ title: `Series (${number}) [1080P]`, url: `https://example.com/${number}` }));
    const asc = collectionItemOrder(items, 'title-asc', 'zh');
    assert.deepEqual(asc.map(index => items[index].title), [2, 9, 20, 99, 100, 101].map(number => `Series (${number}) [1080P]`));
    assert.deepEqual(collectionItemOrder(items, 'original', 'zh'), [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(collectionItemOrder(items, 'title-desc', 'zh'), [0, 1, 2, 3, 4, 5]);
    const selection = [true, false, false, false, false, false];
    const selected = selectCollectionPage(selection, asc.slice(0, 2), true);
    assert.deepEqual(selected, [true, false, false, false, true, true]);
    assert.deepEqual(selectCollectionPage(selected, asc.slice(0, 2), false), selection);
    assert.equal(items[0].title, 'Series (101) [1080P]');
});

test('title sorting is stable for equal titles and handles missing titles', () => {
    const items = [{ title: 'Episode 2', url: 'b' }, { title: 'Episode 2', url: 'a' }, { url: 'Episode 10' }];
    assert.deepEqual(collectionItemOrder(items, 'title-asc', 'en'), [0, 1, 2]);
    assert.deepEqual(collectionItemOrder(items, 'title-desc', 'en'), [2, 0, 1]);
});

test('page selection preserves other pages and enforces a global limit of 20', () => {
    const original = Array(184).fill(false);
    original[2] = true;
    original[7] = true;
    const pageTwo = Array.from({ length: COLLECTION_PAGE_SIZE }, (_, i) => 20 + i);
    const selected = selectCollectionPage(original, pageTwo, true);
    assert.equal(selected.filter(Boolean).length, 20);
    assert.equal(selected[2], true);
    assert.equal(selected[7], true);
    assert.equal(selected[37], true);
    assert.equal(selected[38], false);
    assert.equal(original.filter(Boolean).length, 2);
    const cleared = selectCollectionPage(selected, pageTwo, false);
    assert.deepEqual(cleared, original);
    assert.equal(selectCollectionPage(cleared, [183], true)[183], true);
});

test('selecting a full page does not replace selections elsewhere', () => {
    const original = Array.from({ length: 40 }, (_, i) => i < 20);
    assert.deepEqual(selectCollectionPage(original, [20, 21], true), original);
    const cleared = selectCollectionPage(original, [0], false);
    const next = selectCollectionPage(cleared, [20, 21], true);
    assert.equal(next[20], true);
    assert.equal(next[21], false);
});

test('downloaded records can be selected across pages without a download limit', () => {
    const selected = selectCollectionPage(Array(40).fill(true), [20, 21], false, Infinity);
    assert.equal(selected.filter(Boolean).length, 38);
    assert.equal(selectCollectionPage(selected, [20, 21], true, Infinity).filter(Boolean).length, 40);
});

test('shared video URLs match canonical collection items without matching a pure playlist', () => {
    const canonical = collectionVideoIdentity('https://www.youtube.com/watch?v=djPBIF-urEY');
    for (const url of [
        'https://www.youtube.com/watch?v=djPBIF-urEY&list=PLexample&index=10',
        'https://youtu.be/djPBIF-urEY?list=PLexample',
        'https://m.youtube.com/shorts/djPBIF-urEY',
    ]) assert.equal(collectionVideoIdentity(url), canonical);
    assert.equal(collectionVideoIdentity('https://www.youtube.com/playlist?list=PLexample'), null);
    assert.equal(collectionVideoIdentity('https://www.bilibili.com/video/BVexample?vd_source=x'),
        collectionVideoIdentity('https://www.bilibili.com/video/BVexample?p=1'));
    assert.notEqual(collectionVideoIdentity('https://www.bilibili.com/video/BVexample?p=2'),
        collectionVideoIdentity('https://www.bilibili.com/video/BVexample?p=1'));
    assert.equal(collectionVideoIdentity('https://www.tiktok.com/@i/video/123?share=x'),
        collectionVideoIdentity('https://www.tiktok.com/@creator/video/123'));
    assert.equal(collectionVideoIdentity('https://www.douyin.com/note/123'),
        collectionVideoIdentity('https://www.douyin.com/video/123'));
});
