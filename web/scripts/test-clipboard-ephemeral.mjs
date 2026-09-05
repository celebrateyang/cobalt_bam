import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Exercise the real manager in two isolated browser contexts, with real AES-GCM,
// deterministic time and an in-memory transport. No browser or API is contacted.
const source = readFileSync(new URL('../src/lib/clipboard/clipboard-manager.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function storage() {
    const values = new Map();
    const writes = [];
    return {
        writes,
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value); writes.push(value); },
        removeItem: key => values.delete(key),
    };
}

function events() {
    const listeners = new Map();
    return {
        addEventListener(type, callback) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(callback);
        },
        removeEventListener: (type, callback) => listeners.get(type)?.delete(callback),
        fire: type => listeners.get(type)?.forEach(callback => callback()),
        count: type => listeners.get(type)?.size ?? 0,
    };
}

function clock() {
    let now = 100_000;
    let id = 0;
    const timers = new Map();
    const schedule = (fn, delay, repeat) => {
        timers.set(++id, { fn, at: now + delay, delay, repeat });
        return id;
    };
    return {
        Date: class extends Date { static now() { return now; } },
        setTimeout: (fn, delay) => schedule(fn, delay, false),
        setInterval: (fn, delay) => schedule(fn, delay, true),
        clearTimeout: id => timers.delete(id),
        clearInterval: id => timers.delete(id),
        advance(ms, run = true) {
            now += ms;
            if (!run) return;
            for (const [id, timer] of [...timers]) {
                if (!timers.has(id) || timer.at > now) continue;
                if (timer.repeat) timer.at = now + timer.delay;
                else timers.delete(id);
                timer.fn();
            }
        },
    };
}

function client(time) {
    const sessionStorage = storage();
    const localStorage = storage();
    const document = { ...events(), visibilityState: 'visible' };
    const window = { ...events(), crypto: webcrypto };
    const exports = {};
    const errors = [];
    const writable = initial => {
        let value = initial;
        const subscribers = new Set();
        return {
            subscribe(fn) { subscribers.add(fn); fn(value); return () => subscribers.delete(fn); },
            update(fn) { value = fn(value); subscribers.forEach(fn => fn(value)); },
        };
    };
    runInNewContext(compiled, {
        exports, window, document, sessionStorage, localStorage, crypto: webcrypto,
        navigator: { userAgent: 'Desktop protocol test' },
        ArrayBuffer, Uint8Array, TextEncoder, TextDecoder, ...time,
        console: { log() {}, warn() {}, error: (...args) => errors.push(args) },
        require(name) {
            if (name === 'svelte/store') return { writable };
            if (name === '$lib/i18n/translations') return { t: { get: key => key } };
            if (name === 'qrcode' || name === '$lib/api/clipboard-personal') return {};
            if (name === '$lib/api/api-url') return { currentApiURL: () => { throw Error('Unexpected API access'); } };
            throw Error(`Unexpected import: ${name}`);
        },
    });
    const { ClipboardManager, clipboardState } = exports;
    // Connection establishment is outside this protocol test; lifecycle handlers
    // added for disappearing messages still run through the real constructor.
    ClipboardManager.prototype.startStatusCheck = () => {};
    ClipboardManager.prototype.setupVisibilityChangeHandler = () => {};
    const manager = new ClipboardManager();
    clipboardState.update(state => ({ ...state, sessionId: 'test-session', peerConnected: true }));
    return {
        manager, store: clipboardState, sessionStorage, localStorage, document, window, errors,
        state() { let state; clipboardState.subscribe(value => { state = value; })(); return state; },
    };
}

async function pair() {
    const time = clock();
    const a = client(time);
    const b = client(time);
    const key = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const queue = [];
    const sent = [];
    for (const [from, to] of [[a, b], [b, a]]) {
        from.manager.sharedKey = key;
        from.channel = {
            readyState: 'open', bufferedAmount: 0,
            send(data) {
                if (this.readyState !== 'open') throw Error('Closed');
                const payload = JSON.parse(data);
                sent.push({ from, payload });
                queue.push({ to, payload });
            },
            close() { this.readyState = 'closed'; this.onclose?.(); },
        };
        from.manager.dataChannel = from.channel;
    }
    const flush = async () => {
        while (queue.length) {
            const { to, payload } = queue.shift();
            await to.manager.handleDataChannelMessage(payload);
        }
        assert.equal(a.errors.length + b.errors.length, 0, 'Protocol handler reported an error');
    };
    a.manager.setupDataChannel();
    b.manager.setupDataChannel();
    await flush();
    return { a, b, time, flush, sent, queue };
}

test('ordinary text still persists and acknowledges delivery', async () => {
    const { a, b, flush } = await pair();
    await a.manager.sendText('ordinary-text');
    await flush();
    assert.equal(a.state().messages[0].status, 'delivered');
    assert.equal(b.state().messages[0].text, 'ordinary-text');
    for (const c of [a, b]) assert.ok(c.sessionStorage.writes.some(value => value.includes('ordinary-text')));
});

test('old/unconfirmed clients cannot receive disappearing texts as ordinary text', async () => {
    const { a, sent } = await pair();
    a.store.update(state => ({ ...state, peerSupportsEphemeral: false }));
    const count = sent.length;
    await a.manager.sendText('must-not-send', true);
    assert.equal(sent.length, count);
    assert.equal(a.state().messages.length, 0);
    assert.equal(a.state().errorMessage, 'clipboard.chat.burn_unavailable');
});

test('read starts both timers; plaintext never persists; expired retries cannot resurrect it', async () => {
    const { a, b, time, flush, sent } = await pair();
    await a.manager.sendText('secret-text-marker', true);
    await flush();
    const packet = sent.find(({ payload }) => payload.type === 'text_ephemeral_v1').payload;
    assert.ok(!JSON.stringify(packet).includes('secret-text-marker'));
    const id = packet.messageId;
    time.advance(90_000);
    assert.equal(b.state().messages[0].expiresAt, undefined, 'Delivery is not a read');
    b.document.visibilityState = 'hidden';
    b.manager.revealText(id);
    assert.equal(b.state().messages[0].expiresAt, undefined);
    b.document.visibilityState = 'visible';
    b.manager.revealText(id);
    await flush();
    const deadline = b.state().messages[0].expiresAt;
    assert.equal(a.state().messages[0].expiresAt, deadline);
    time.advance(29_000);
    b.manager.revealText(id);
    await b.manager.handleDataChannelMessage(packet);
    await flush();
    assert.equal(a.state().messages[0].expiresAt, deadline, 'Duplicate receipts cannot extend expiry');
    time.advance(1_000);
    assert.equal(a.state().messages.length + b.state().messages.length, 0);
    await b.manager.handleDataChannelMessage(packet);
    await b.manager.handleDataChannelMessage({ ...packet, type: 'text' });
    await a.manager.retryText(id);
    assert.equal(a.state().messages.length + b.state().messages.length, 0);
    for (const c of [a, b]) {
        assert.ok([...c.sessionStorage.writes, ...c.localStorage.writes].every(value => !value.includes('secret-text-marker')));
    }
});

test('return from a suspended background tab prunes expired messages', async () => {
    const { a, b, time, flush } = await pair();
    await a.manager.sendText('background-secret', true);
    await flush();
    b.manager.revealText(b.state().messages[0].id);
    await flush();
    time.advance(31_000, false);
    a.document.fire('visibilitychange');
    b.window.fire('pageshow');
    assert.equal(a.state().messages.length + b.state().messages.length, 0);
});

test('a delayed read receipt does not grant another 30 seconds', async () => {
    const { a, b, time, flush } = await pair();
    await a.manager.sendText('delayed-receipt-secret', true);
    await flush();
    b.manager.revealText(b.state().messages[0].id);
    time.advance(40_000);
    await flush();
    assert.equal(a.state().messages.length + b.state().messages.length, 0);
});

test('page departure clears both sides but preserves ordinary text', async () => {
    const { a, b, flush } = await pair();
    await a.manager.sendText('keep-ordinary');
    await a.manager.sendText('clear-secret', true);
    await flush();
    a.window.fire('pagehide');
    await flush();
    for (const c of [a, b]) {
        assert.equal(c.state().messages.length, 1);
        assert.equal(c.state().messages[0].text, 'keep-ordinary');
    }
});

test('closed connection clears unread texts and disables support until renegotiated', async () => {
    const { a, b, flush } = await pair();
    await a.manager.sendText('unread-secret', true);
    await flush();
    a.channel.close();
    b.channel.close();
    for (const c of [a, b]) {
        assert.equal(c.state().messages.length, 0);
        assert.equal(c.state().peerSupportsEphemeral, false);
    }
});

test('pending decryption cannot restore a message after page departure', async () => {
    const { a, b, queue } = await pair();
    await a.manager.sendText('late-secret', true);
    const packet = queue.shift().payload;
    let release;
    b.manager.decryptData = () => new Promise(resolve => { release = resolve; });
    const receiving = b.manager.handleDataChannelMessage(packet);
    b.window.fire('pagehide');
    release('late-secret');
    await receiving;
    assert.equal(b.state().messages.length, 0);
});

test('pending encryption cannot send a cleared message', async () => {
    const { a, sent } = await pair();
    let release;
    a.manager.encryptData = () => new Promise(resolve => { release = resolve; });
    const sending = a.manager.sendText('pending-secret', true);
    a.window.fire('pagehide');
    release(new ArrayBuffer(1));
    await sending;
    assert.ok(!sent.some(({ payload }) => payload.type === 'text_ephemeral_v1'));
});

test('a departed page rejects late incoming disappearing messages', async () => {
    const { a, b, queue } = await pair();
    await a.manager.sendText('late-network-secret', true);
    const packet = queue.shift().payload;
    b.window.fire('pagehide');
    await b.manager.handleDataChannelMessage(packet);
    assert.equal(b.state().messages.length, 0);
    assert.ok(b.sessionStorage.writes.every(value => !value.includes('late-network-secret')));
});

test('reveal fails closed when the read receipt cannot be sent', async () => {
    const { a, b, flush } = await pair();
    await a.manager.sendText('secret', true);
    await flush();
    b.channel.send = () => { throw Error('Network failure'); };
    b.manager.revealText(b.state().messages[0].id);
    assert.equal(b.state().messages[0].expiresAt, undefined);
});

test('read controls cannot expire ordinary texts and restore ignores ephemeral content', async () => {
    const { a, flush } = await pair();
    await a.manager.sendText('ordinary');
    await flush();
    const ordinary = a.state().messages[0];
    await a.manager.handleDataChannelMessage({ type: 'text_ephemeral_read_v1', messageId: ordinary.id, remainingMs: 0 });
    assert.equal(a.state().messages[0].expiresAt, undefined);
    a.sessionStorage.setItem('clipboard_messages:restore-test', JSON.stringify([{ ...ordinary, ephemeral: true }]));
    assert.equal(a.manager.loadMessages('restore-test').length, 0);
});

test('disposing removes ephemeral content and its lifecycle listeners', async () => {
    const { a, b, flush } = await pair();
    await a.manager.sendText('dispose-secret', true);
    await flush();
    a.manager.dispose();
    await flush();
    assert.equal(a.state().messages.length + b.state().messages.length, 0);
    assert.equal(a.window.count('pagehide'), 0);
    assert.equal(a.window.count('pageshow'), 0);
    assert.equal(a.document.count('visibilitychange'), 0);
});
