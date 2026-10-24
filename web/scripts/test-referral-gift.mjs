import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import { get, writable } from "svelte/store";
import ts from "typescript";

const load = (path, dependencies, globals = {}) => {
    const source = readFileSync(new URL(`../src/lib/${path}.ts`, import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    vm.runInNewContext(compiled, { exports, ...globals, require: name => {
        assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
        return dependencies[name];
    } });
    return exports;
};
const policy = load("points/referral-gift-policy", {});
const { GIFT_DAY_MS: DAY, GIFT_STORAGE_KEY: KEY, isGiftQueueSettled } = policy;
const storage = map => ({
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: key => map.delete(key),
});
const fixture = ({ local = new Map(), session = new Map(), start = 1_800_000_000_000, blocked = false } = {}) => {
    let now = start, nextId = 0;
    const timers = new Map();
    class ClockDate extends Date { static now() { return now; } }
    const api = load("state/referral-gift", {
        "svelte/store": { writable }, "$lib/points/referral-gift-policy": policy,
    }, {
        Date: ClockDate,
        window: {
            get localStorage() { if (blocked) throw new Error("storage denied"); return storage(local); },
            sessionStorage: storage(session),
        },
        setTimeout: (fn, ms) => { const id = ++nextId; timers.set(id, { fn, due: now + ms }); return id; },
        clearTimeout: id => timers.delete(id),
    });
    const tick = ms => {
        const target = now + ms;
        while (true) {
            const next = [...timers.entries()].filter(([, timer]) => timer.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
            if (!next) break;
            now = next[1].due;
            timers.delete(next[0]);
            next[1].fn();
        }
        now = target;
    };
    return { api, local, session, tick, now: () => now,
        state: () => get(api.referralGiftState), history: () => JSON.parse(local.get(KEY)),
        save: key => api.offerReferralGift("browser_handoff", key),
    };
};
const show = f => {
    f.save("first"); f.save("second");
    assert.equal(f.api.showReferralGift(), "started");
};

test("first invitation waits for two distinct saves and survives refresh", () => {
    const f = fixture();
    f.save("task-1"); f.save("task-1");
    assert.equal(f.history().downloads, 1);
    assert.equal(f.state().candidate, false);
    const refreshed = fixture(f);
    refreshed.save("task-2");
    assert.equal(refreshed.state().candidate, true);
    assert.equal(refreshed.history().lastShownAt, 0);
    refreshed.tick(60_000); // Offscreen candidates do not count as impressions.
    assert.equal(refreshed.api.showReferralGift(), "started");
    assert.equal(refreshed.api.showReferralGift(), "active");
    assert.equal(refreshed.history().downloadsAtLastShown, 2);
});

test("repeat invitation needs both seven elapsed days and three more saves", () => {
    const f = fixture(); show(f); f.api.closeReferralGift("timeout");
    const early = fixture({ local: f.local, start: f.now() + 6 * DAY });
    for (let n = 0; n < 3; n++) early.save(`early-${n}`);
    assert.equal(early.state().candidate, false);
    const later = fixture({ local: f.local, start: f.now() + 7 * DAY });
    later.save("later");
    assert.equal(later.api.showReferralGift(), "started");

    const g = fixture(); show(g); g.api.closeReferralGift("timeout");
    const notEnough = fixture({ local: g.local, start: g.now() + 7 * DAY });
    notEnough.save("third"); notEnough.save("fourth");
    assert.equal(notEnough.state().candidate, false);
    notEnough.save("fifth");
    assert.equal(notEnough.api.showReferralGift(), "started");
});

test("dismiss, returned sharing and successful copying each silence for thirty days", () => {
    for (const reason of ["dismiss", "shared", "copied"]) {
        const f = fixture(); show(f); f.api.closeReferralGift(reason);
        assert.equal(f.history().quietUntil, f.now() + 30 * DAY);
        assert.equal(f.state().active, false);
        const early = fixture({ local: f.local, start: f.now() + 29 * DAY });
        for (let n = 0; n < 4; n++) early.save(`early-${n}`);
        assert.equal(early.state().candidate, false);
        const later = fixture({ local: f.local, start: f.now() + 30 * DAY });
        later.save("later");
        assert.equal(later.api.showReferralGift(), "started");
    }
});

test("one invitation per visit persists across refresh even after cooldown expires", () => {
    const f = fixture(); show(f); f.api.closeReferralGift("timeout");
    const refreshed = fixture({ local: f.local, session: f.session, start: f.now() + 31 * DAY });
    for (let n = 0; n < 5; n++) refreshed.save(`new-${n}`);
    assert.equal(refreshed.state().candidate, false);
    assert.equal(refreshed.api.showReferralGift(), false);
});

test("twenty visible seconds pause for interaction, hidden surfaces and page/queue changes", () => {
    const f = fixture(); show(f);
    const page = {}, queue = {};
    f.api.setReferralGiftVisible(page, true);
    f.tick(8_000);
    f.api.setReferralGiftInteracting(page, true);
    f.tick(60_000);
    assert.equal(f.state().active, true);
    f.api.setReferralGiftInteracting(page, false);
    f.tick(2_000);
    f.api.setReferralGiftVisible(page, false);
    f.tick(60_000);
    f.api.setReferralGiftInteracting(page, true); // A hidden surface must not pause another surface.
    f.api.setReferralGiftVisible(queue, true);
    f.tick(9_999);
    assert.equal(f.state().active, true);
    f.tick(1);
    assert.equal(f.state().active, false);
    f.save("third");
    assert.equal(f.state().candidate, false);
});

test("a new download interrupts the card without imposing an extra thirty-day penalty", () => {
    const f = fixture(); show(f);
    f.api.setReferralGiftVisible({}, true);
    f.api.closeReferralGift("interrupted");
    f.tick(60_000);
    assert.equal(f.state().active, false);
    assert.equal(f.history().quietUntil, 0);
    f.save("third");
    assert.equal(f.state().candidate, false);
});

test("queue gates cover processing, errors, pending saves, folder writes and incomplete batches", () => {
    const saved = { state: "done", saveRequested: true, saveOutcome: "download" };
    assert.equal(isGiftQueueSettled({}), true);
    assert.equal(isGiftQueueSettled({ a: saved }), true);
    for (const state of ["waiting", "running", "error"]) {
        assert.equal(isGiftQueueSettled({ a: saved, b: { state } }), false);
    }
    for (const saveOutcome of [undefined, "failed", "cancelled", "dialog", "copied"]) {
        assert.equal(isGiftQueueSettled({ a: { ...saved, saveOutcome } }), false);
    }
    assert.equal(isGiftQueueSettled({ a: { state: "done" } }), false);
    for (const state of ["pending", "saving", "error"]) {
        assert.equal(isGiftQueueSettled({ a: { ...saved, autoSave: { enabled: true, state } } }), false);
    }
    assert.equal(isGiftQueueSettled({ a: { state: "done", autoSave: { enabled: true, state: "saved" } } }), true);
    const batch = { ...saved, batchSessionId: "batch", batchSelectionTotal: 2 };
    assert.equal(isGiftQueueSettled({ a: batch }), false);
    assert.equal(isGiftQueueSettled({ a: batch, b: batch }), true);
});

test("blocked storage never breaks saving or causes repeated invitations", () => {
    const f = fixture({ blocked: true });
    assert.doesNotThrow(() => { f.save("a"); f.save("b"); });
    assert.equal(f.state().candidate, false);
    assert.equal(f.api.showReferralGift(), false);
});

test("legacy dismissal migrates to thirty-day silence and media identifiers stay out of storage", () => {
    const now = new Date(2026, 9, 24).getTime();
    const local = new Map([["fsv-referral-gift-dismissed", "2026-10-24"]]);
    const f = fixture({ local, start: now });
    f.save("https://private.example/video.mp4"); f.save("second");
    assert.equal(f.history().quietUntil, now + 30 * DAY);
    assert.equal(f.state().candidate, false);
    assert.equal(local.has("fsv-referral-gift-dismissed"), false);
    assert.equal(local.get(KEY).includes("private.example"), false);
});

test("another tab's cooldown is rechecked before a pending invitation becomes visible", () => {
    const a = fixture(); a.save("a"); a.save("b");
    const b = fixture({ local: a.local }); b.save("c"); b.api.showReferralGift(); b.api.closeReferralGift("dismiss");
    assert.equal(a.api.showReferralGift(), false);
    assert.equal(a.state().candidate, false);
});
