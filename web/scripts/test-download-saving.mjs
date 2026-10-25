import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { File } from "node:buffer";
import { test } from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const load = (path, dependencies, globals = {}) => {
    const source = readFileSync(new URL(path, root), "utf8");
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    vm.runInNewContext(compiled, {
        exports, Error, File, ...globals,
        require: name => {
            assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
            return dependencies[name];
        },
    }, { filename: fileURLToPath(new URL(path, root)) });
    return exports;
};

const fixture = (pref = "download", browserWindow) => {
    const settings = { save: { savingMethod: pref } };
    const device = { is: { iOS: false }, supports: { share: true, directDownload: true } };
    const dialogs = [], events = [], callbacks = [], timers = [], dom = [];
    const navigator = {
        userActivation: { isActive: true },
        share: async () => {},
        canShare: () => true,
        clipboard: { writeText: async () => {} },
    };
    const deps = {
        "svelte/store": { get: store => store },
        "$lib/state/settings": { default: settings },
        "$lib/device": { device },
        "$lib/i18n/translations": { t: key => key },
        "$lib/state/dialogs": { createDialog: dialog => dialogs.push(dialog) },
        "$lib/analytics/saving": { trackSave: (...args) => events.push(args) },
        "$lib/state/referral-gift": { offerReferralGift: (...args) => events.push(["gift", ...args]) },
    };
    class MockURL extends URL {
        static createObjectURL() { dom.push("create"); return "blob:media"; }
        static revokeObjectURL(url) { dom.push(`revoke:${url}`); }
    }
    const api = load("src/lib/download.ts", deps, {
        navigator, URL: MockURL,
        document: {
            body: { appendChild: () => dom.push("append") },
            createElement: () => ({ click: () => dom.push("click"), remove: () => dom.push("remove") }),
        },
        window: browserWindow ?? { location: { href: "https://example.com/en" }, open: () => ({}) },
        setTimeout: (callback, delay) => timers.push({ callback, delay }),
    });
    const file = new File(["media"], "video.mp4", { type: "video/mp4" });
    const params = { file, onSaveResult: result => callbacks.push(result) };
    return { api, params, device, navigator, dialogs, callbacks, timers, dom, events };
};

const tunnelFixture = (mobile = false) => {
    const pipelines = [], downloads = [], states = [], dialogs = [];
    const releases = [];
    let probes = 0;
    const source = readFileSync(new URL('src/lib/api/saving-handler.ts', root), 'utf8');
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    const dependencies = {
        '$lib/device': { device: { is: { mobile } } },
        '$lib/api/mobile-large-download': load('src/lib/api/mobile-large-download.ts', {}, { URL }),
        '$app/stores': { page: { params: { lang: 'en' } } },
        '$lib/i18n/translations': { t: key => key, loadTranslations: async () => {} },
        '$lib/api/points': { releasePointsHold: async (...args) => releases.push(args) },
        'svelte/store': { get: value => value },
        '$lib/state/clerk': { clerkEnabled: false },
        '$lib/state/omnibox': { downloadButtonState: { set: state => states.push(state) } },
        '$lib/state/task-manager/queue': { queue: {}, updateItem: () => {} },
        '$lib/task-manager/queue': { createSavePipeline: (...args) => pipelines.push(args) },
        '$lib/download': { downloadFile: (...args) => downloads.push(args) },
        '$lib/history': { addToHistory: () => {} },
        '$lib/state/dialogs': { createDialog: dialog => dialogs.push(dialog) },
        '$lib/util': { uuid: () => 'task-test' },
        '$lib/api/api-url': { currentApiURL: () => 'https://api.example.com/' },
        '$lib/api/api': { default: { probeCobaltTunnel: async () => { probes++; return 200; } } },
    };
    vm.runInNewContext(compiled, {
        exports, URL, console: { log: () => {} },
        window: { location: { origin: 'https://example.com' } },
        require: name => dependencies[name] || {},
    });
    return { savingHandler: exports.savingHandler, pipelines, downloads, states, dialogs, releases, probes: () => probes };
};

const mobileLargeArgs = {
    request: { url: 'https://youtube.com/watch?v=HB8CZzDnKHI', queueId: 'large-test', localProcessing: 'disabled' },
    response: { status: 'tunnel', type: 'merge', service: 'youtube', url: 'https://api.example.com/tunnel?id=large', filename: 'large.mp4',
        estimatedSizeBytes: 780700000, points: { holdId: 'hold-large' } },
};

test('large mobile downloads wait for confirmation, then keep the same server pipeline and skip repeat prompts', async () => {
    const f = tunnelFixture(true);
    const pending = f.savingHandler(mobileLargeArgs);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.pipelines.length, 0);
    assert.equal(f.dialogs[0].type, 'mobile-large-download');
    assert.equal(f.dialogs[0].transferPath, '/en/clipboard');
    f.dialogs[0].onDecision(true);
    await pending;
    assert.equal(f.pipelines.length, 1);
    assert.equal(f.releases.length, 0);
    await f.savingHandler(mobileLargeArgs);
    assert.equal(f.dialogs.length, 1);
});

test('declining large mobile download releases its hold and starts no download', async () => {
    const f = tunnelFixture(true);
    const pending = f.savingHandler(mobileLargeArgs);
    await new Promise(resolve => setImmediate(resolve));
    f.dialogs[0].onDecision(false);
    assert.equal(await pending, null);
    assert.equal(f.pipelines.length, 0);
    assert.equal(f.downloads.length, 0);
    assert.equal(f.releases[0][0], 'hold-large');
    assert.equal(f.states.at(-1), 'idle');
});

test('desktop large downloads do not show a warning', async () => {
    const f = tunnelFixture(false);
    await f.savingHandler(mobileLargeArgs);
    assert.equal(f.dialogs.length, 0);
    assert.equal(f.pipelines.length, 1);
});

test('Amazon Direct Bridge opens a download dialog without a queue task', async () => {
    const f = tunnelFixture();
    const url = 'https://m.media-amazon.com/replay/720.m3u8';
    await f.savingHandler({
        request: { url: 'https://www.amazon.com/live/video/example', localProcessing: 'forced' },
        response: { status: 'redirect', service: 'amazon', url, directUrl: url, directUrlCandidates: [url], filename: 'replay.mp4' },
    });
    assert.equal(f.pipelines.length, 0);
    assert.equal(f.downloads.length, 0);
    assert.equal(f.dialogs.length, 1);
    assert.equal(f.dialogs[0].type, 'preview-download');
    assert.equal(f.dialogs[0].amazonHls, true);
    assert.deepEqual(Array.from(f.dialogs[0].urls), [url]);
});

test('server processing tunnels enter the visible queue without opening a blank tab', async () => {
    for (const type of ['remux', 'merge', 'mute', 'audio', 'gif']) {
        const f = tunnelFixture();
        await f.savingHandler({
            request: { url: 'https://v.youku.com/v_show/id_test.html', localProcessing: 'never' },
            response: { status: 'tunnel', type, isHLS: true, url: 'https://api.example.com/tunnel?id=test', filename: 'video.mp4' },
        });
        assert.equal(f.pipelines.length, 1);
        assert.equal(f.pipelines[0][0].tunnel[0], 'https://api.example.com/tunnel?id=test');
        assert.equal(f.downloads.length, 0);
        assert.equal(f.probes(), 0);
    }
});

test('ordinary proxy tunnels retain the existing browser handoff', async () => {
    const f = tunnelFixture();
    await f.savingHandler({
        request: { url: 'https://example.com/video', localProcessing: 'never' },
        response: { status: 'tunnel', type: 'proxy', url: 'https://api.example.com/tunnel?id=test', filename: 'video.mp4' },
    });
    assert.equal(f.pipelines.length, 0);
    assert.equal(f.downloads.length, 1);
    assert.equal(f.probes(), 1);
});

test("CDN downloads open once without a false blocked-popup dialog or Referer", async () => {
    for (const host of ["video.twimg.com", "v.tiktokcdn.com", "v.tiktokcdn-us.com", "v.tiktokcdn-eu.com"]) {
        const url = `https://${host}/video.mp4`;
        const calls = [], navigation = [], links = [];
        const opened = {
            opener: {},
            document: {
                createElement: tag => {
                    assert.equal(tag, "a");
                    return {
                        click() {
                            assert.equal(opened.opener, null);
                            assert.equal(this.target, "_self");
                            assert.equal(this.rel, "noreferrer");
                            assert.equal(this.referrerPolicy, "no-referrer");
                            assert.equal(links[0], this);
                            navigation.push(this.href);
                        },
                        remove() { links.splice(links.indexOf(this), 1); },
                    };
                },
                body: { appendChild: link => links.push(link) },
            },
        };
        const f = fixture("download", {
            location: { href: "https://example.com/en" },
            // Model the actual browser behavior that caused the false warning.
            open: (...args) => { calls.push(args); return args[2]?.includes("noopener") ? null : opened; },
        });
        assert.equal(await f.api.downloadFile({ url, onSaveResult: f.params.onSaveResult }), "download");
        assert.deepEqual(calls, [["", "_blank"]]);
        assert.deepEqual(navigation, [url]);
        assert.equal(links.length, 0);
        assert.equal(f.dialogs.length, 0);
        assert.deepEqual(f.callbacks, ["download"]);
    }
});

test("genuinely blocked tabs keep the manual download fallback", async () => {
    for (const url of ["https://video.twimg.com/video.mp4", "https://example.com/video.mp4"]) {
        const calls = [];
        const f = fixture("download", {
            location: { href: "https://example.com/en" },
            open: (...args) => { calls.push(args); return null; },
        });
        assert.equal(await f.api.downloadFile({ url, onSaveResult: f.params.onSaveResult }), "dialog");
        assert.equal(calls.length, 1);
        assert.equal(f.dialogs.length, 1);
        assert.equal(f.dialogs[0].url, url);
        assert.equal(f.dialogs[0].bodyText, "dialog.saving.blocked");
        assert.deepEqual(f.callbacks, ["dialog"]);
    }
});

test("ordinary URLs open directly without an extra tab or dialog", () => {
    const calls = [];
    const f = fixture("download", {
        location: { href: "https://example.com/en" },
        open: (...args) => { calls.push(args); return {}; },
    });
    assert.equal(f.api.openURL("https://example.com/video.mp4"), true);
    assert.deepEqual(calls, [["https://example.com/video.mp4", "_blank"]]);
    assert.equal(f.dialogs.length, 0);
});

test("browser handoff does not release a blob before the browser consumes it", async () => {
    const f = fixture();
    assert.equal(await f.api.downloadFile(f.params), "download");
    assert.deepEqual(f.dom, ["create", "append", "click", "remove"]);
    assert.deepEqual(f.callbacks, ["download"]);
    assert.equal(f.timers[0].delay, 60_000);
    f.timers[0].callback();
    assert.equal(f.dom.at(-1), "revoke:blob:media");
});

test("share feedback waits for the native share operation", async () => {
    const f = fixture("share");
    let finish;
    f.navigator.share = () => new Promise(resolve => { finish = resolve; });
    const pending = f.api.downloadFile(f.params);
    assert.deepEqual(f.callbacks, []);
    finish();
    assert.equal(await pending, "shared");
    assert.deepEqual(f.callbacks, ["shared"]);
});

test("share cancellation is handled and never marked as a download", async () => {
    const f = fixture("share");
    f.navigator.share = async () => { throw Object.assign(new Error("cancel"), { name: "AbortError" }); };
    assert.equal(await f.api.downloadFile(f.params), "cancelled");
    assert.deepEqual(f.callbacks, ["cancelled"]);
});

test("file-specific sharing support is checked", async () => {
    const f = fixture("share");
    let called = false;
    f.navigator.canShare = () => false;
    f.navigator.share = async () => { called = true; };
    assert.equal(await f.api.downloadFile(f.params), "failed");
    assert.equal(called, false);
});

test("a missing clipboard cannot report a copied link", async () => {
    const f = fixture("copy");
    f.navigator.clipboard = undefined;
    assert.equal(await f.api.downloadFile({ url: "https://example.com/video" }), "failed");
});

test("expired user activation on a remote URL keeps the manual download fallback", async () => {
    const f = fixture();
    f.navigator.userActivation.isActive = false;
    assert.equal(await f.api.downloadFile({ url: 'https://example.com/video', onSaveResult: f.params.onSaveResult }), "dialog");
    assert.equal(f.dialogs.length, 1);
    assert.deepEqual(f.callbacks, ["dialog"]);
    assert.deepEqual(f.dom, []);
});

test("ready desktop files download without a second prompt after activation expires", async () => {
    const f = fixture();
    f.navigator.userActivation.isActive = false;
    assert.equal(await f.api.downloadFile(f.params), "download");
    assert.equal(f.dialogs.length, 0);
    assert.deepEqual(f.callbacks, ["download"]);
    assert.equal(f.dom.filter(value => value === "click").length, 1);
    const forced = fixture();
    assert.equal(await forced.api.downloadFile({ ...forced.params, forceDialog: true }), "dialog");
    assert.deepEqual(forced.dom, []);
});

test("iPhone queue saving and repeat saving reuse the result and dialog callback", async () => {
    const f = fixture();
    f.device.is.iOS = true;
    const queue = { one: { state: "done", resultFile: f.params.file, filename: "ready.mp4", mimeType: "video/mp4" } };
    const { saveQueueFile } = load("src/lib/task-manager/save-file.ts", {
        "svelte/store": { get: store => store },
        "$lib/device": { device: f.device },
        "$lib/download": f.api,
        "$lib/state/task-manager/queue": {
            queue, updateItem: (id, update) => { queue[id] = update(queue[id]); },
        },
    });
    assert.equal(await saveQueueFile("one", "bulk"), "dialog");
    assert.equal(queue.one.saveRequested, false);
    assert.equal(f.dialogs[0].file.name, "ready.mp4");
    f.dialogs[0].onSaveResult("cancelled");
    assert.equal(queue.one.saveRequested, false);
    await saveQueueFile("one");
    assert.equal(f.dialogs[1].saveContext.repeat, true);
    assert.equal(queue.one.saveAttempts, 2);
    f.dialogs[1].onSaveResult("download");
    assert.equal(queue.one.saveRequested, true);
    assert.equal(queue.one.saveOutcome, "download");
    assert.equal(await f.dialogs[1].file.text(), "media");
    assert.deepEqual(f.dom, []);
});

test("saving telemetry does not include filenames, links or account data", () => {
    const calls = [];
    const { trackSave } = load("src/lib/analytics/saving.ts", {}, {
        window: { gtag: (...args) => calls.push(args), clarity: (...args) => calls.push(args) },
    });
    trackSave("cancelled", "share", { source: "queue", repeat: true, taskId: "private-task" });
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0][2])), {
        action: "cancelled", method: "share", source: "queue", repeat: true,
    });
});

test("mobile bulk saving selects one pending file and excludes active folder writes", () => {
    const f = fixture();
    const { getQueueSaveCandidates } = load("src/lib/task-manager/save-file.ts", {
        "svelte/store": { get: store => store },
        "$lib/device": { device: f.device },
        "$lib/download": f.api,
        "$lib/state/task-manager/queue": { queue: {}, updateItem: () => {} },
    });
    const done = { state: "done", resultFile: f.params.file };
    const items = {
        handedOff: { ...done, saveRequested: true },
        pending: done,
        next: done,
        writing: { ...done, autoSave: { state: "saving" } },
        saved: { ...done, autoSave: { state: "saved" } },
        failed: { state: "error" },
    };
    const ids = (individual) => Array.from(getQueueSaveCandidates(items, individual), ([id]) => id);
    assert.deepEqual(ids(true), ["pending"]);
    assert.deepEqual(ids(false), ["handedOff", "pending", "next"]);
    items.pending = { ...done, saveRequested: true };
    assert.deepEqual(ids(true), ["next"]);
    items.next = { ...done, saveRequested: true };
    assert.deepEqual(ids(true), ["handedOff"]);
});

test("campaigns do not interrupt overseas users, processing, saving or errors", () => {
    const { canShowCampaign } = load("src/lib/curious-cat/visibility.ts", {});
    assert.equal(canShowCampaign("en", {}), false);
    assert.equal(canShowCampaign("zh", {}), true);
    for (const state of ["waiting", "running", "error", "done"]) {
        assert.equal(canShowCampaign("zh", { one: { state } }), false);
    }
    // A browser handoff is not proof that the user has saved the file.
    assert.equal(canShowCampaign("zh", { one: { state: "done", saveRequested: true } }), false);
    assert.equal(canShowCampaign("zh", { one: { state: "done", autoSave: { state: "saved" } } }), true);
});

test("automatic local download works after user activation expires and keeps manual fallback", async () => {
    const f = fixture(); f.navigator.userActivation.isActive = false;
    assert.equal(await f.api.downloadFile({ ...f.params, automatic: true }), "download");
    assert.equal(f.dialogs.length, 0); assert.ok(f.dom.includes("click"));
    for (const pref of ["ask", "share"]) {
        const g = fixture(pref); g.navigator.userActivation.isActive = false;
        assert.equal(await g.api.downloadFile({ ...g.params, automatic: true }), "dialog");
        assert.deepEqual(g.dom, []);
    }
    const iphone = fixture(); iphone.device.is.iOS = true;
    iphone.navigator.userActivation.isActive = false;
    assert.equal(await iphone.api.downloadFile({ ...iphone.params, automatic: true }), "dialog");
    assert.deepEqual(iphone.dom, []);
});

test("automatic queue saving reuses the result, allows manual repeat and skips a manual-save race", async () => {
    const f = fixture(); f.navigator.userActivation.isActive = false;
    const queue = { one: { state: "done", resultFile: f.params.file, filename: "ready.mp4", mimeType: "video/mp4" } };
    const { saveQueueFile } = load("src/lib/task-manager/save-file.ts", {
        "svelte/store": { get: store => store }, "$lib/device": { device: f.device }, "$lib/download": f.api,
        "$lib/state/task-manager/queue": { queue, updateItem: (id, update) => { queue[id] = update(queue[id]); } },
    });
    assert.equal(await saveQueueFile("one", "queue", true), "download");
    assert.equal(queue.one.saveRequested, true); assert.equal(queue.one.saveAttempts, 1);
    await saveQueueFile("one", "queue", true);
    assert.equal(queue.one.saveAttempts, 1);
    f.navigator.userActivation.isActive = true;
    assert.equal(await saveQueueFile("one"), "download");
    assert.equal(queue.one.saveAttempts, 2); assert.equal(await queue.one.resultFile.text(), "media");
});

test("tracking failure cannot block saving", () => {
    const { trackSave } = load("src/lib/analytics/saving.ts", {}, {
        window: { gtag: () => { throw new Error("analytics unavailable"); } },
    });
    assert.doesNotThrow(() => trackSave("download", "download"));
});

test("gift invitations follow successful handoffs, never cancelled, blocked or copy-only actions", async () => {
    const gifts = f => f.events.filter(event => event[0] === "gift").map(event => event[1]);
    const local = fixture();
    await local.api.downloadFile(local.params);
    assert.deepEqual(gifts(local), ["browser_handoff"]);

    const shared = fixture("share");
    await shared.api.downloadFile(shared.params);
    assert.deepEqual(gifts(shared), ["file_shared"]);

    const cancelled = fixture("share");
    cancelled.navigator.share = async () => { throw Object.assign(new Error("cancel"), { name: "AbortError" }); };
    await cancelled.api.downloadFile(cancelled.params);
    assert.deepEqual(gifts(cancelled), []);

    const blocked = fixture("download", { location: { href: "https://example.com/en" }, open: () => null });
    await blocked.api.downloadFile({ url: "https://example.com/video" });
    assert.deepEqual(gifts(blocked), []);

    const copied = fixture("copy");
    await copied.api.downloadFile({ url: "https://example.com/video" });
    assert.deepEqual(gifts(copied), []);
});

test("queue saving carries one task identity through repeated file wrappers and native sharing", async () => {
    const f = fixture();
    for (const method of ["download", "share"]) {
        await f.api.saveWithFeedback(method, {
            file: new File(["media"], "video.mp4"), saveContext: { taskId: "same-task", repeat: true },
        });
    }
    const identities = f.events.filter(event => event[0] === "gift").map(event => event[2]);
    assert.deepEqual(identities, ["same-task", "same-task"]);
});
