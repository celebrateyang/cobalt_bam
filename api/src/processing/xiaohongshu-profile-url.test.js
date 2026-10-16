import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeURL, extract } from './url.js';

const user = '5f4f489800000000010022b0';
const note = '6ad0bcd1000000000b004127';
const enabled = new Set(['xiaohongshu']);

test('profile note URL preserves its note identity and access token', () => {
    for (const host of ['www.xiaohongshu.com', 'xiaohongshu.com']) {
        const normalized = normalizeURL(`https://${host}/user/profile/${user}/${note}/?xsec_token=sample%2Btoken%3D`);
        assert.equal(normalized.pathname, `/explore/${note}`);
        const result = extract(normalized, enabled);
        assert.equal(result.host, 'xiaohongshu');
        assert.equal(result.patternMatch.id, note);
        assert.equal(decodeURIComponent(result.patternMatch.token), 'sample+token=');
    }
});

test('profile note without token follows the existing explore path', () => {
    const result = extract(normalizeURL(`https://www.xiaohongshu.com/user/profile/${user}/${note}`), enabled);
    assert.deepEqual(result.patternMatch, {id: note});
});

test('profiles, malformed IDs and extra path segments are not promoted to notes', () => {
    for (const path of [`/user/profile/${user}`, `/user/profile/${user}/bad`, `/user/profile/bad/${note}`, `/user/profile/${user}/${note}/extra`]) {
        const normalized = normalizeURL(`https://www.xiaohongshu.com${path}`);
        assert.equal(normalized.pathname.startsWith('/explore/'), false);
        assert.ok(extract(normalized, enabled).error);
    }
});

test('existing explore and discovery note URLs retain their token', () => {
    for (const path of [`/explore/${note}`, `/discovery/item/${note}`]) {
        const result = extract(normalizeURL(`https://www.xiaohongshu.com${path}?xsec_token=sample%3D`), enabled);
        assert.equal(result.patternMatch.id, note);
        assert.equal(decodeURIComponent(result.patternMatch.token), 'sample=');
    }
});
