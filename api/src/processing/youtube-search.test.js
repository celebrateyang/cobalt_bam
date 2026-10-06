import test from 'node:test';
import assert from 'node:assert/strict';
import { createYouTubeSearch, normalizeSearchResults, validateSearchQuery } from './youtube-search.js';

test('search validates untrusted input and normalizes whitespace', () => {
    assert.equal(validateSearchQuery('  2026   top songs '), '2026 top songs');
    for (const input of [null, {}, '', 'x', 'a'.repeat(121), 'songs\nmore', 'https://youtube.com/watch?v=8bMDez423MU']) {
        assert.throws(() => validateSearchQuery(input), { status: 400 });
    }
    assert.equal(validateSearchQuery('--exec anything'), '--exec anything');
});

test('results exclude live videos and duplicates and construct trusted URLs', () => {
    const items = normalizeSearchResults({ entries: [
        null, { id: 'bad' }, { id: '8bMDez423MU', title: 'Song', channel: 'Artist', duration: 180, url: 'https://evil.example' },
        { id: '8bMDez423MU' }, { id: 'fTKqtvXjkvo', live_status: 'is_live' },
        { id: 'abcdefghijk', live_status: 'is_upcoming' }, { id: '12345678901', duration: -1 },
    ] });
    assert.equal(items.length, 2);
    assert.equal(items[0].url, 'https://www.youtube.com/watch?v=8bMDez423MU');
    assert.equal(items[0].thumbnail, 'https://i.ytimg.com/vi/8bMDez423MU/hqdefault.jpg');
    assert.equal(items[1].duration, null);
});

test('identical searches share work, reuse cache and expire after three minutes', async () => {
    let time = 0;
    let calls = 0;
    let finish;
    const search = createYouTubeSearch({ now: () => time, run: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
    const first = search('Top songs');
    const second = search('top songs');
    await Promise.resolve();
    finish([]);
    await Promise.all([first, second]);
    assert.equal(calls, 1);
    assert.equal((await search('TOP SONGS')).query, 'TOP SONGS');
    assert.equal(calls, 1);
    time = 180_001;
    const expired = search('top songs');
    await Promise.resolve();
    finish([]);
    await expired;
    assert.equal(calls, 2);
});

test('concurrency is bounded and failed searches release capacity without caching failures', async () => {
    let reject;
    let calls = 0;
    const search = createYouTubeSearch({ maxConcurrent: 1, run: () => { calls++; return new Promise((resolve, fail) => { reject = fail; }); } });
    const first = search('first');
    await assert.rejects(search('second'), { status: 429 });
    reject(new Error('upstream failed'));
    await assert.rejects(first);
    const retry = search('first');
    await Promise.resolve();
    reject(new Error('retry failed'));
    await assert.rejects(retry);
    assert.equal(calls, 2);
});
