import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const fixture = ({ constructorError = false, cloneError = false, missing = false } = {}) => {
    const workers = [], errors = [], results = [], timers = new Map(), subscribers = new Set();
    const items = missing ? {} : { task: { state: 'running' } };
    let timerId = 0;
    class Worker {
        constructor() { if (constructorError) throw new Error('blocked'); workers.push(this); }
        postMessage() { if (cloneError) throw new Error('clone failed'); }
        terminate() { this.terminated = true; }
        message(data) { this.onmessage?.({ data: { cobaltFetchWorker: data } }); }
    }
    const dependencies = {
        '$lib/task-manager/workers/fetch?worker': { default: Worker },
        '$lib/state/task-manager/current-tasks': { updateWorkerProgress() {}, updateWorkerNetworkStalled() {} },
        '$lib/state/task-manager/queue': {
            queue: { subscribe(fn) { subscribers.add(fn); fn(items); return () => subscribers.delete(fn); } },
            itemError: (...args) => errors.push(args), pipelineTaskDone: (...args) => results.push(args),
        },
        '$lib/state/task-manager/fetch-resume': {
            clearFetchResumeState() {}, getFetchResumeState() {}, setFetchResumeState() {},
        },
    };
    const exports = {};
    const code = ts.transpileModule(readFileSync(new URL('../src/lib/task-manager/runners/fetch.ts', import.meta.url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
        exports, Error, Date, console: { error() {} },
        require: name => { assert.ok(name in dependencies, name); return dependencies[name]; },
        setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
        clearTimeout: id => timers.delete(id),
    });
    return { workers, errors, results, timers, subscribers, items,
        run: () => exports.runFetchWorker('fetch', 'task', 'https://media.test/file'),
        notify: () => [...subscribers].forEach(fn => fn(items)),
    };
};

test('constructor and postMessage failures settle once and clean up', async () => {
    for (const options of [{ constructorError: true }, { cloneError: true }]) {
        const f = fixture(options); await f.run();
        assert.equal(f.errors.length, 1);
        assert.equal(f.errors[0][3].attempt, 3);
        assert.equal(f.errors[0][3].workerStage, 'worker');
        assert.equal(f.timers.size, 0); assert.equal(f.subscribers.size, 0);
        assert.ok(f.workers.every(w => w.terminated));
    }
});

test('late startup callbacks cannot trigger duplicate retries', async () => {
    const f = fixture(); await f.run();
    const oldError = f.workers[0].onerror;
    oldError({ message: 'load failed' }); oldError({ message: 'late error' });
    assert.equal(f.workers.length, 2);
    f.workers[1].onerror({}); f.workers[2].onmessageerror({});
    assert.equal(f.errors.length, 1); assert.equal(f.errors[0][3].errorName, 'DataCloneError');
    assert.equal(f.timers.size, 0); assert.equal(f.subscribers.size, 0);
});

test('runtime crash after startup does not redownload and successful completion cancels deadline', async () => {
    const f = fixture(); await f.run(); f.workers[0].message({ started: true });
    assert.equal(f.timers.size, 0); f.workers[0].onerror({});
    assert.equal(f.workers.length, 1); assert.equal(f.errors.length, 1);
    const g = fixture(); await g.run(); g.workers[0].message({ result: 'file' });
    assert.equal(g.results.length, 1); assert.equal(g.subscribers.size, 0); assert.equal(g.timers.size, 0);
});

test('missing and cancelled tasks cannot create or restart workers', async () => {
    const f = fixture({ missing: true }); await f.run();
    assert.equal(f.workers.length, 0); assert.equal(f.subscribers.size, 0);
    const g = fixture(); await g.run(); const lateError = g.workers[0].onerror;
    g.items.task.state = 'error'; g.notify(); lateError({});
    assert.equal(g.workers.length, 1); assert.equal(g.errors.length, 0);
    assert.equal(g.subscribers.size, 0); assert.equal(g.timers.size, 0);
});

test('startup deadlines stop after three attempts with a diagnostic', async () => {
    const f = fixture(); await f.run();
    for (let i = 0; i < 3; i++) [...f.timers.values()][0]();
    assert.equal(f.errors.length, 1); assert.equal(f.errors[0][3].errorName, 'TimeoutError');
    assert.equal(f.workers.length, 3); assert.equal(f.timers.size, 0);
});

test('Pages routes send LibAV to static assets even when excludes exceed 100 rules', () => {
    const config = readFileSync(new URL('../svelte.config.js', import.meta.url), 'utf8');
    const excludes = config.match(/routes:\s*\{\s*exclude:\s*(\[[^\]]+\])/)[1];
    const adapter = readFileSync(new URL('../node_modules/@sveltejs/adapter-cloudflare/index.js', import.meta.url), 'utf8');
    const start = adapter.indexOf('function get_routes_json(');
    const end = adapter.indexOf('\n/**', start);
    const getRoutes = vm.runInNewContext(adapter.slice(start, end) + '\nget_routes_json');
    const routes = getRoutes({
        getAppPath: () => '_app',
        config: { kit: { appDir: '_app', paths: { base: '' } } },
        prerendered: { paths: ['/zh/'] }, log: { warn() {} },
    }, Array.from({ length: 150 }, (_, i) => `file-${i}.svg`), {
        exclude: vm.runInNewContext(excludes),
    });
    assert.equal(routes.exclude[0], '/_libav/*');
    assert.ok(routes.exclude.includes('/_app/*'));
    assert.equal(routes.include.length + routes.exclude.length, 100);
});
