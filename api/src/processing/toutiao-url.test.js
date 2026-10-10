import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeURL, extract } from './url.js';

const id = '7488588638192665127';
const enabled = new Set(['toutiao']);

test('Toutiao legacy article links expose the video ID for page fallback', () => {
    for (const input of [
        `https://www.toutiao.com/i${id}`,
        `https://www.toutiao.com/i${id}/?from=share`,
        `https://m.toutiao.com/i${id}/`,
        `https://m.toutiaoimg.cn/a${id}`,
        `https://www.toutiao.com/video/${id}/`,
        `https://m.toutiao.com/item/${id}/`,
    ]) {
        const result = extract(normalizeURL(input), enabled);
        assert.equal(result.host, 'toutiao', input);
        assert.deepEqual(result.patternMatch, { id }, input);
    }
});

test('Toutiao is share links remain short links', () => {
    for (const input of [
        'https://m.toutiao.com/is/ak5hTd8QN2o/',
        'https://www.toutiao.com/is/ak5hTd8QN2o',
    ]) {
        const result = extract(normalizeURL(input), enabled);
        assert.equal(result.host, 'toutiao');
        assert.deepEqual(result.patternMatch, { shortLink: 'ak5hTd8QN2o' });
    }
});
