import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const token = 'header.' + Buffer.from(JSON.stringify({ sub: 'user_test' })).toString('base64url') + '.signature';

const fixture = ({ tokenStalled = false, syncFailed = false } = {}) => {
    const timers = new Map();
    let nextTimer = 0, listener, syncCalls = 0, resolveSync;
    const writable = value => ({ value, set(next) { this.value = next; } });
    const session = { getToken: () => tokenStalled ? new Promise(() => {}) : Promise.resolve(token) };
    const instance = {
        user: { id: 'user_test' }, session,
        load: async () => {},
        addListener(fn) { listener = fn; },
    };
    const dependencies = {
        '$app/environment': { browser: true },
        'svelte/store': { writable, get: store => store.value, derived() {} },
        '$lib/env': { default: { CLERK_PUBLISHABLE_KEY: 'pk_test' } },
        '$lib/i18n/translations': { INTERNAL_locale: writable('en') },
        '$lib/api/api-url': { currentApiURL: () => 'https://api.test' },
        '$lib/auth/sign-up-guidance': {},
        '@clerk/clerk-js': { Clerk: function () { return instance; } },
        '@clerk/localizations': { enUS: {} },
    };
    const exports = {};
    const code = ts.transpileModule(readFileSync(new URL('../src/lib/state/clerk.ts', import.meta.url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
        exports, Date, AbortSignal, atob, console: { debug() {} },
        window: { location: { pathname: '/en/account' }, localStorage: { getItem() {}, setItem() {} } },
        require(name) { assert.ok(name in dependencies, name); return dependencies[name]; },
        fetch() { syncCalls++; return syncFailed ? Promise.resolve({ ok: false, status: 503 }) : new Promise(resolve => { resolveSync = resolve; }); },
        setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
        clearTimeout(id) { timers.delete(id); },
    });
    return {
        exports, instance, timers,
        setSyncFailed(value) { syncFailed = value; },
        completeSync() { resolveSync({ ok: true, json: async () => ({ data: { user: {} } }) }); },
        get listener() { return listener; }, get syncCalls() { return syncCalls; },
    };
};

test('stalled profile sync does not block initialization, tokens, or auth listener', async () => {
    const f = fixture();
    const initialized = await Promise.race([
        f.exports.initClerk(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('initialization blocked by sync')), 100)),
    ]);
    assert.equal(initialized, f.instance);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert.equal(f.syncCalls, 1);
    assert.equal(await f.exports.getClerkToken(), token);
    assert.equal(typeof f.listener, 'function');
    f.listener({ user: null, session: null });
    assert.equal(f.exports.clerkUser.value, null);
});

test('stalled token retrieval settles as unavailable after its deadline', async () => {
    const f = fixture({ tokenStalled: true });
    await f.exports.initClerk();
    const token = f.exports.getClerkToken();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const deadlines = [...f.timers.values()].filter(timer => timer.ms === 10000);
    assert.equal(deadlines.length, 2);
    for (const timer of deadlines) timer.fn();
    assert.equal(await token, null);
    assert.equal(f.exports.clerkUser.value.id, 'user_test');
});

test('failed background synchronization can be retried by an auth update', async () => {
    const f = fixture({ syncFailed: true });
    await f.exports.initClerk();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert.equal(f.syncCalls, 1);
    f.listener({ user: f.instance.user, session: f.instance.session });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert.equal(f.syncCalls, 2);
});

test('missing-user recovery restarts failed sync and shares it among concurrent callers', async () => {
    const f = fixture({ syncFailed: true });
    await f.exports.initClerk();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(f.syncCalls, 1);
    f.setSyncFailed(false);
    const first = f.exports.syncMissingUser(token);
    const second = f.exports.syncMissingUser(token);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(f.syncCalls, 2);
    f.completeSync();
    assert.equal(await first, token);
    assert.equal(await second, token);
});

test('new-user recovery joins the pending registration sync', async () => {
    const f = fixture();
    await f.exports.initClerk();
    const recovered = f.exports.syncMissingUser(token);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(f.syncCalls, 1);
    f.completeSync();
    assert.equal(await recovered, token);
});

test('failed recovery returns no retry token and permits a later recovery attempt', async () => {
    const f = fixture({ syncFailed: true });
    await f.exports.initClerk();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(await f.exports.syncMissingUser(token), null);
    assert.equal(await f.exports.syncMissingUser(token), null);
    assert.equal(f.syncCalls, 3);
});

test('switching accounts while synchronization is pending cancels request recovery', async () => {
    const f = fixture();
    await f.exports.initClerk();
    const recovered = f.exports.syncMissingUser(token);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    f.instance.user = { id: 'other_user' };
    f.completeSync();
    assert.equal(await recovered, null);
});

test('a synchronous token error does not leave recovery stuck on a cached failure', async () => {
    const f = fixture({ syncFailed: true });
    await f.exports.initClerk();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    f.instance.session.getToken = () => { throw new Error('token unavailable'); };
    assert.equal(await f.exports.syncMissingUser(token), null);
    f.instance.session.getToken = async () => token;
    f.setSyncFailed(false);
    const recovered = f.exports.syncMissingUser(token);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(f.syncCalls, 2);
    f.completeSync();
    assert.equal(await recovered, token);
});
