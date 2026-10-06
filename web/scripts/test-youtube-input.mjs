import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/youtube/input.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { parseYouTubeInput: parse, formatYouTubeDuration: duration } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('keywords and supported YouTube links route to the correct operation', () => {
    assert.deepEqual(parse('2026 top songs'), { kind: 'search', query: '2026 top songs' });
    for (const url of ['https://www.youtube.com/watch?v=8bMDez423MU&t=30', 'youtu.be/8bMDez423MU', 'https://m.youtube.com/shorts/8bMDez423MU', 'https://youtube.com/embed/8bMDez423MU']) {
        assert.deepEqual(parse(url), { kind: 'video', id: '8bMDez423MU', url: 'https://www.youtube.com/watch?v=8bMDez423MU' });
    }
    assert.equal(parse('https://youtube.com/watch?v=8bMDez423MU&list=PL12345678901').kind, 'playlist');
});

test('foreign URLs, spoofed hosts, credentials and malformed inputs are rejected', () => {
    for (const input of ['', 'x', 'a'.repeat(121), 'javascript:alert(1)', 'ftp://youtube.com/watch?v=8bMDez423MU', 'https://youtube.com.evil.example/watch?v=8bMDez423MU', 'https://evil.example', 'https://user@youtube.com/watch?v=8bMDez423MU', 'https://youtube.com/watch?v=bad']) {
        assert.equal(parse(input), null, input);
    }
    assert.equal(duration(8958), '2:29:18');
    assert.equal(duration(180), '3:00');
    assert.equal(duration(null), '');
});
