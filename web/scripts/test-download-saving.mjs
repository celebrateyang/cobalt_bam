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

const fixture = (pref = "download") => {
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
        window: { location: { href: "https://example.com/en" }, open: () => ({}) },
        setTimeout: (callback, delay) => timers.push({ callback, delay }),
    });
    const file = new File(["media"], "video.mp4", { type: "video/mp4" });
    const params = { file, onSaveResult: result => callbacks.push(result) };
    return { api, params, device, navigator, dialogs, callbacks, timers, dom, events };
};

const tunnelFixture = () => {
    const pipelines = [], downloads = [], states = [];
    let probes = 0;
    const source = readFileSync(new URL('src/lib/api/saving-handler.ts', root), 'utf8');
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    const dependencies = {
        'svelte/store': { get: value => value },
        '$lib/state/clerk': { clerkEnabled: false },
        '$lib/state/omnibox': { downloadButtonState: { set: state => states.push(state) } },
        '$lib/state/task-manager/queue': { queue: {}, updateItem: () => {} },
        '$lib/task-manager/queue': { createSavePipeline: (...args) => pipelines.push(args) },
        '$lib/download': { downloadFile: (...args) => downloads.push(args) },
        '$lib/history': { addToHistory: () => {} },
        '$lib/util': { uuid: () => 'task-test' },
        '$lib/api/api-url': { currentApiURL: () => 'https://api.example.com/' },
        '$lib/api/api': { default: { probeCobaltTunnel: async () => { probes++; return 200; } } },
    };
    vm.runInNewContext(compiled, {
        exports, URL, console: { log: () => {} },
        window: { location: { origin: 'https://example.com' } },
        require: name => dependencies[name] || {},
    });
    return { savingHandler: exports.savingHandler, pipelines, downloads, states, probes: () => probes };
};

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

test("expired user activation shows a dialog without marking a file saved", async () => {
    const f = fixture();
    f.navigator.userActivation.isActive = false;
    assert.equal(await f.api.downloadFile(f.params), "dialog");
    assert.equal(f.dialogs.length, 1);
    assert.deepEqual(f.callbacks, ["dialog"]);
    assert.deepEqual(f.dom, []);
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
    trackSave("cancelled", "share", { source: "queue", repeat: true });
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
