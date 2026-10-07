import assert from 'node:assert/strict';
import test from 'node:test';
import { extract, normalizeURL } from './url.js';

const enabled = new Set(['naver']);
const mediaId = 'B78A5E6BF9601402786363ED024C0AF9FA84';

test('NAVER embedded and share links resolve through the dedicated adapter', () => {
    for (const input of [
        `https://m.naver.com/shorts/oembed?mediaId=${mediaId}&serviceType=NTV`,
        `https://m.naver.com/shorts/oembed/?seedMediaId=${mediaId}&serviceType=NTV&recType=AIRS&panelType=share`,
        `https://m.naver.com/shorts/oembed/?serviceType=NTV&seedMediaType=LONG_FORM&seedMediaId=${mediaId}&utm_source=chatgpt.com`,
    ]) {
        const url = normalizeURL(input);
        const result = extract(url, enabled);
        assert.equal(url.pathname, '/shorts');
        assert.equal(result.host, 'naver');
        assert.equal(result.patternMatch.mediaId, mediaId);
        assert.equal(result.patternMatch.serviceType, 'NTV');
        assert.equal(url.searchParams.has('recType'), false);
        assert.equal(url.searchParams.has('utm_source'), false);
        if (input.includes('seedMediaType')) assert.equal(result.patternMatch.mediaType, 'LONG_FORM');
    }
});

test('existing NAVER shorts, contents and short links keep working', () => {
    for (const path of ['shorts', 'contents']) {
        const result = extract(normalizeURL(`https://clip.naver.com/${path}?mediaId=${mediaId}&serviceType=MOMENT`), enabled);
        assert.equal(result.host, 'naver');
        assert.equal(result.patternMatch.serviceType, 'MOMENT');
    }
    assert.equal(extract(normalizeURL('https://naver.me/test123'), enabled).patternMatch.shortLink, 'test123');
    assert.ok(extract(normalizeURL(`https://m.naver.com/shorts/comment?mediaId=${mediaId}`), enabled).error);
});
