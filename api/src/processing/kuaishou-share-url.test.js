import assert from 'node:assert/strict';
import test from 'node:test';
import { extract, normalizeURL } from './url.js';

const enabled = new Set(['kuaishou']);
for (const input of [
    'https://kuaishou.com/_shortLink/nRiEEcxb@%E7%BE%8E%E5%A3%B3',
    'https://v.kuaishou.com/nRiEEcxb@author/',
    'https://v.kuaishou.com/nRiEEcxb%40author',
    'https://v.kuaishou.com/nRiEEcxb/',
]) {
    test(`extracts the short ID from ${input}`, () => {
        const r = extract(normalizeURL(input), enabled);
        assert.equal(r.host, 'kuaishou');
        assert.equal(r.patternMatch.shortLink, 'nRiEEcxb');
    });
}
test('does not rewrite labeled photo paths or unrelated hosts', () => {
    for (const input of [
        'https://kuaishou.com/short-video/3xutn5xk36vikpw@author',
        'https://example.com/nRiEEcxb@author',
        'https://kuaishou.com/_shortLink/nRiEEcxb@author/extra',
    ]) assert.equal(normalizeURL(input).pathname, new URL(input).pathname);
});
