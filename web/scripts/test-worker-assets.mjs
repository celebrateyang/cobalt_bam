import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const worker = '/_app/immutable/workers/fetch-test.js';
const libav = '/_libav/libav-test.wasm.mjs';
const chunk = '/_app/immutable/chunks/test.js';
const fixture = () => {
    const handlers = {}, reads = [], precaches = [];
    const source = readFileSync(new URL('../src/service-worker.ts', import.meta.url), 'utf8');
    vm.runInNewContext(ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, {
        exports: {}, URL, console,
        require: name => {
            assert.equal(name, '$service-worker');
            return { build: [worker, libav, chunk], files: [], version: 'test' };
        },
        self: { location: { origin: 'https://site.test' }, skipWaiting() {},
            addEventListener: (name, handler) => { handlers[name] = handler; } },
        caches: { open: async () => ({
            addAll: async paths => precaches.push([...paths]),
            // Simulate a cache entry created before the header fix.
            match: async request => { reads.push(request.url); return { oldHeaders: true }; },
        }) },
    });
    return { handlers, reads, precaches };
};

test('old cached processing responses are never used for worker startup', async () => {
    const f = fixture();
    for (const path of [worker, libav]) {
        let intercepted = false;
        f.handlers.fetch({ request: { method: 'GET', url: `https://site.test${path}`, destination: 'worker', mode: 'same-origin' },
            respondWith() { intercepted = true; } });
        assert.equal(intercepted, false);
    }
    assert.equal(f.reads.length, 0);
    let response;
    f.handlers.fetch({ request: { method: 'GET', url: `https://site.test${chunk}`, destination: 'script', mode: 'cors' },
        respondWith(promise) { response = promise; } });
    assert.equal((await response).oldHeaders, true); // Other immutable caching still works.
});

test('new deployments do not precache processing assets with obsolete response policies', async () => {
    const f = fixture(); let installed;
    f.handlers.install({ waitUntil(promise) { installed = promise; } });
    await installed;
    assert.deepEqual(f.precaches[0], [chunk]);
});

test('Pages worker and LibAV responses carry compatible isolation policies', () => {
    const source = readFileSync(new URL('../static/_headers', import.meta.url), 'utf8');
    const policies = {};
    let route;
    for (const line of source.split(/\r?\n/)) {
        if (line.startsWith('/')) { route = line; policies[route] = {}; }
        else if (/^\s+[^#]/.test(line)) {
            const [, name, value] = line.match(/^\s+([^:]+):\s*(.*)$/) ?? [];
            if (name) policies[route][name.toLowerCase()] = value;
        }
    }
    for (const path of ['/_app/immutable/workers/*', '/_libav/*']) {
        assert.equal(policies[path]['cross-origin-embedder-policy'], 'require-corp');
        assert.equal(policies[path]['cross-origin-resource-policy'], 'same-origin');
    }
    assert.equal(policies['/*']['cross-origin-embedder-policy'], undefined);
});
