import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeURL, extract, identifyService } from './url.js';

test('recognizes Xinpianchang work URLs with share parameters and trailing slash', () => {
    const enabled = new Set(['xinpianchang']);
    for (const input of ['https://www.xinpianchang.com/a13690233?from=share', 'https://xinpianchang.com/a13690233/']) {
        const result = extract(normalizeURL(input), enabled);
        assert.equal(result.host, 'xinpianchang');
        assert.equal(result.patternMatch.id, '13690233');
    }
    assert.equal(identifyService('https://www.xinpianchang.com/a13690233', enabled)?.enabled, true);
    assert.equal(extract(normalizeURL('https://www.xinpianchang.com/user/123'), enabled).error, 'link.unsupported');
});
