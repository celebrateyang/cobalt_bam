import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeURL, extract, identifyService } from './url.js';
import { normalizeRequest } from './request.js';
import { normalizeTikTokShortLinkAlias } from './tiktok-short-link.js';

const enabled = new Set(['tiktok']);

test('tt.site share links enter the TikTok extractor through the API schema', async () => {
    for (const host of ['tt.site', 'www.tt.site']) {
        for (const suffix of ['', '/', '/?share=1']) {
            const result = await normalizeRequest({ url: `https://${host}/t/ZSgNyrhsL${suffix}` });
            assert.equal(result.success, true);
            assert.equal(result.data.url.toString(), 'https://www.tiktok.com/t/ZSgNyrhsL');
            const parsed = extract(result.data.url, enabled);
            assert.equal(parsed.host, 'tiktok');
            assert.deepEqual(parsed.patternMatch, { shortLink: 'ZSgNyrhsL' });
            assert.equal(identifyService(`https://${host}/t/ZSgNyrhsL`, enabled).service, 'tiktok');
        }
    }
});

test('tt.site normalization preserves share context without mutating the input', () => {
    const input = new URL('https://www.tt.site/t/ZSgNyrhsL/?share=1');
    assert.equal(normalizeTikTokShortLinkAlias(input).toString(), 'https://www.tiktok.com/t/ZSgNyrhsL/?share=1');
    assert.equal(input.hostname, 'www.tt.site');
});

test('does not treat unrelated domains or tt.site paths as TikTok share links', () => {
    for (const input of [
        'https://www.tt.site.example.com/t/ZSgNyrhsL',
        'https://other.tt.site/t/ZSgNyrhsL',
        'https://www.tt.site/',
        'https://www.tt.site/not-a-share',
        'https://www.tt.site/t/code/extra',
        'https://www.tt.site/t/',
    ]) {
        assert.equal(normalizeURL(input).hostname, new URL(input).hostname);
        assert.notEqual(extract(normalizeURL(input), enabled).host, 'tiktok');
    }
});
