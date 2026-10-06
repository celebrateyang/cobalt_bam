import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const load = (path, dependencies, globals = {}) => {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    const context = { exports, Error, URL, console: { error() {}, warn() {}, log() {} }, ...globals,
        require(name) { assert.ok(name in dependencies, name); return dependencies[name]; } };
    vm.runInNewContext(compiled, context);
    return { exports, context };
};
const fixture = () => {
    let now = 0, nextTimer = 0;
    const timers = new Map(), workers = [], errors = [], results = [], subscribers = new Set();
    const items = { task: { state: "running" } };
    class Worker {
        constructor() { workers.push(this); }
        postMessage(data) { this.request = data; }
        terminate() { this.terminated = true; }
        message(data) { this.onmessage?.({ data: { cobaltFFmpegWorker: data } }); }
    }
    const clock = {
        Date: { now: () => now },
        setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id; },
        clearTimeout(id) { timers.delete(id); },
    };
    const { exports } = load("../src/lib/task-manager/runners/ffmpeg.ts", {
        "$lib/task-manager/workers/ffmpeg?worker": { default: Worker },
        "$lib/state/task-manager/current-tasks": { updateWorkerProgress() {} },
        "$lib/state/task-manager/queue": {
            queue: { subscribe(fn) { subscribers.add(fn); fn(items); return () => subscribers.delete(fn); } },
            itemError: (...args) => errors.push(args), pipelineTaskDone: (...args) => results.push(args),
        },
    }, clock);
    const advance = delta => {
        const end = now + delta;
        while (true) {
            const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!due) break;
            now = due[1].at; timers.delete(due[0]); due[1].fn();
        }
        now = end;
    };
    const run = (workerId = "encode", parentId = "task") => exports.runFFmpegWorker(workerId, parentId, [], [], {}, "encode", true);
    return { run, advance, workers, errors, results, timers, subscribers, items,
        notify: () => [...subscribers].forEach(fn => fn(items)) };
};

test("slow WASM loading survives the old five-second deadline and completes", async () => {
    const f = fixture(); await f.run();
    f.workers[0].message({ stage: "initializing" });
    f.advance(90_000);
    assert.equal(f.workers.length, 1); assert.equal(f.errors.length, 0);
    f.workers[0].message({ stage: "probing", initializationMs: 90_000 });
    f.advance(20_000);
    f.workers[0].message({ stage: "encoding" });
    f.advance(300_000); // Encoding itself is not an initialization timeout.
    f.workers[0].message({ render: "output" });
    assert.equal(f.results.length, 1);
    assert.equal(f.results[0][3].initializationMs, 90_000);
    assert.equal(f.timers.size, 0); assert.equal(f.subscribers.size, 0);
});

test("initialization failure retries once in single-thread mode without failing the item", async () => {
    const f = fixture(); await f.run();
    const old = f.workers[0];
    old.message({ stage: "initializing" });
    old.message({ error: "queue.generic_error", errorName: "TypeError" });
    assert.equal(old.terminated, true);
    assert.equal(f.workers[1].request.cobaltFFmpegWorker.yesthreads, false);
    assert.equal(f.errors.length, 0);
    old.message({ error: "queue.generic_error" }); // A late callback cannot fail the retry.
    f.workers[1].message({ stage: "probing", initializationMs: 10 });
    f.workers[1].message({ stage: "encoding" });
    f.workers[1].message({ render: "output" });
    assert.equal(f.results.length, 1); assert.equal(f.results[0][3].attempt, 2);
    assert.equal(f.errors.length, 0);
});

test("two initialization timeouts produce one terminal error with durable diagnostic fields", async () => {
    const f = fixture(); await f.run();
    f.workers[0].message({ stage: "initializing" }); f.advance(120_000);
    f.workers[1].message({ stage: "initializing" }); f.advance(120_000);
    f.advance(1_000_000);
    assert.equal(f.workers.length, 2); assert.equal(f.errors.length, 1);
    const d = f.errors[0][3];
    assert.equal(d.workerStage, "initializing"); assert.equal(d.elapsedMs, 240_000);
    assert.equal(d.attempt, 2); assert.equal(d.threaded, false); assert.equal(d.errorName, "TimeoutError");
    assert.equal(f.subscribers.size, 0);
});

test("a worker that never starts has a bounded retry", async () => {
    const f = fixture(); await f.run(); f.advance(30_000);
    assert.equal(f.workers.length, 2); assert.equal(f.errors.length, 1);
    assert.equal(f.errors[0][3].workerStage, "worker");
});

test("probe timeout and render failure do not retry initialization", async () => {
    const f = fixture(); await f.run();
    f.workers[0].message({ stage: "probing", initializationMs: 2 }); f.advance(60_000);
    assert.equal(f.workers.length, 1); assert.equal(f.errors[0][2], "queue.ffmpeg.probe_failed");
    const g = fixture(); await g.run();
    g.workers[0].message({ stage: "encoding" });
    g.workers[0].message({ error: "queue.ffmpeg.crashed" });
    assert.equal(g.workers.length, 1); assert.equal(g.errors.length, 1);
});

test("removal or terminal state cancels timers, subscriptions and late worker callbacks", async () => {
    for (const state of [undefined, "error", "done", "waiting"]) {
        const f = fixture(); await f.run();
        if (state) f.items.task.state = state; else delete f.items.task;
        f.notify(); f.advance(500_000);
        f.workers[0].message({ error: "queue.generic_error" });
        assert.equal(f.workers[0].terminated, true);
        assert.equal(f.workers.length, 1); assert.equal(f.errors.length, 0);
        assert.equal(f.subscribers.size, 0);
    }
    const f = fixture(); delete f.items.task; await f.run();
    assert.equal(f.subscribers.size, 0); assert.equal(f.timers.size, 0);
});

test("independent tasks cannot share or reset each other's retry count", async () => {
    const f = fixture(); f.items.second = { state: "running" };
    await f.run(); await f.run("encode2", "second");
    f.workers[0].message({ error: "queue.generic_error" });
    f.workers[1].message({ error: "queue.generic_error" });
    assert.equal(f.workers.length, 4);
    f.workers[2].message({ error: "queue.generic_error" });
    f.workers[3].message({ error: "queue.generic_error" });
    assert.equal(f.errors.length, 2);
});

test("the actual worker separates initialization from probing and supports single-thread fallback", async () => {
    const events = [], options = [];
    let ready;
    class LibAV {
        init(o) { options.push(o); this.libav = new Promise(resolve => { ready = resolve; }); }
        async probe() { return { format: { duration: 2 }, streams: [{ codec_type: "audio" }] }; }
        async render() { return "output"; }
        async terminate() {}
    }
    const self = { postMessage: e => events.push(e.cobaltFFmpegWorker) };
    load("../src/lib/task-manager/workers/ffmpeg.ts", { "$lib/libav": { default: LibAV } }, { self });
    const pending = self.onmessage({ data: { cobaltFFmpegWorker: {
        variant: "encode", files: [{ type: "audio/webm" }], args: [], output: { type: "audio/mpeg" }, yesthreads: false,
    } } });
    assert.equal(events[0].stage, "initializing"); assert.equal(events.length, 1);
    assert.equal(options[0].noworker, true); ready({}); await pending;
    assert.deepEqual(events.filter(e => e.stage).map(e => e.stage), ["initializing", "probing", "encoding"]);
    assert.equal(events.at(-1).render, "output");
});

test("original-audio retry is explicit, YouTube-only and gets its own billing identity", () => {
    const { exports: api } = load("../src/lib/task-manager/retry-request.ts", {});
    const original = { url: "https://www.youtube.com/watch?v=abc", audioFormat: "mp3", queueId: "old" };
    const item = { state: "error", mediaType: "audio", canRetry: true,
        failureDiagnostic: { workerStage: "initializing" }, originalRequest: original };
    assert.equal(api.canRetryOriginalAudio(item), true);
    assert.equal(api.canRetryOriginalAudio({ ...item, originalRequest: { ...original, url: "https://youtube.com.evil.test/video" } }), false);
    assert.equal(api.canRetryOriginalAudio({ ...item, originalRequest: { ...original, audioFormat: "best" } }), false);
    const request = api.buildOriginalAudioRetryRequest(original, "new");
    assert.equal(request.audioFormat, "best"); assert.equal(request.disableMetadata, true);
    assert.equal(request.localProcessing, "forced"); assert.equal(request.queueId, "new");
    assert.equal(original.audioFormat, "mp3"); assert.equal(original.queueId, "old");
});

test("browser outcomes only update an exact attempt owned by the signed-in user", async () => {
    const calls = [];
    const { exports: api } = load("../../api/src/db/download-attempts.js", {
        "../config.js": { env: { dbType: "postgresql" } },
        "./pg-client.js": { query: async (...args) => { calls.push(args); return { rowCount: 1, rows: [{}] }; } },
    });
    assert.equal(await api.recordBrowserDownloadOutcome({ requestId: "attempt", clerkUserId: "owner", outcome: { state: "failed" } }), true);
    assert.match(calls[0][0], /request_id = \$1 AND clerk_user_id = \$2/);
    assert.equal(calls[0][1][0], "attempt"); assert.equal(calls[0][1][1], "owner");
    assert.deepEqual(JSON.parse(calls[0][1][2]), { state: "failed" });
    await api.completeDownloadAttempt({ requestId: "attempt", status: "success" });
    assert.match(calls[1][0], /COALESCE\(metadata, '\{\}'::jsonb\) \|\|/);
});

const queueFixture = () => {
    const releases = [], finalizes = [], reports = [], automaticSaves = [];
    const store = { value: {} };
    const { exports: api } = load("../src/lib/state/task-manager/queue.ts", {
        "svelte/store": {
            get: s => s === store ? store.value : s,
            readable: (initial, start) => {
                store.value = initial;
                start(null, update => { store.value = update(store.value); });
                return store;
            },
        },
        "$lib/i18n/translations": { t: key => key },
        "$lib/state/dialogs": { createDialog() {} },
        "$lib/task-manager/scheduler": { schedule() {} },
        "$lib/storage/opfs": { clearFileStorage() {}, removeFromFileStorage() {} },
        "$lib/state/task-manager/current-tasks": { clearCurrentTasks() {}, removeWorkerFromQueue() {} },
        "$lib/state/task-manager/fetch-resume": { clearFetchResumeStateForTask() {} },
        "$lib/api/points": {
            releasePointsHold: async (...args) => { releases.push(args); return { ok: true, status: "released" }; },
            finalizePointsHold: async (...args) => { finalizes.push(args); return { ok: true, status: "finalized", charged: 14 }; },
        },
        "$lib/api/download-outcome": { reportDownloadOutcome: async (...args) => { reports.push(args); } },
        "$lib/api/collection-memory": { markCollectionDownloadedItems: async () => true },
        "$lib/storage/auto-save": { saveFileToAutoSaveDirectory: async () => ({ directoryName: "Downloads", filename: "output" }) },
        "$lib/task-manager/save-file": { saveQueueFile: async (...args) => automaticSaves.push(args) },
    }, { setTimeout, clearTimeout, Map, DOMException });
    api.addItem({ id: "task", state: "running", pipeline: [], pipelineResults: {},
        downloadRequestId: "exact-attempt", points: { holdId: "hold", required: 14, status: "held" } });
    return { api, store, releases, finalizes, reports, automaticSaves };
};

test("single completed download automatically saves once without a second points request", async () => {
    const f = queueFixture();
    f.api.itemDone("task", { name: "output" });
    await new Promise(setImmediate);
    assert.equal(f.automaticSaves.length, 1);
    assert.equal(f.automaticSaves[0][0], "task");
    assert.equal(f.automaticSaves[0][2], true);
    assert.equal(f.finalizes.length, 1);
    f.api.itemDone("task", { name: "output" });
    await new Promise(setImmediate);
    assert.equal(f.automaticSaves.length, 1);
});

test("batch and already saved queue items do not start another automatic save", async () => {
    for (const meta of [{ batchSessionId: "batch" }, { batchSelectionTotal: 2 }, { saveRequested: true }, { saveAttempts: 1 }]) {
        const f = queueFixture(); Object.assign(f.store.value.task, meta);
        f.api.itemDone("task", { name: "output" });
        await new Promise(setImmediate);
        assert.equal(f.automaticSaves.length, 0);
    }
});

test("an authorized output folder takes priority over automatic browser saving", async () => {
    const f = queueFixture();
    f.store.value.task.autoSave = { enabled: true, state: "pending" };
    f.api.itemDone("task", { name: "output" });
    await new Promise(setImmediate);
    assert.equal(f.automaticSaves.length, 0);
    assert.equal(f.store.value.task.autoSave.state, "saved");
    assert.equal(f.store.value.task.saveRequested, true);
});

test("terminal encoder failure persists diagnostics and releases its hold without charging", async () => {
    const f = queueFixture();
    const diagnostic = { workerStage: "initializing", elapsedMs: 240_000, attempt: 2, threaded: false };
    f.api.itemError("task", "encoder", "queue.worker_didnt_start", diagnostic);
    await f.api.waitForPointsRelease("task");
    assert.equal(f.store.value.task.state, "error");
    assert.equal(f.store.value.task.points.status, "released");
    assert.equal(f.releases.length, 1); assert.equal(f.finalizes.length, 0);
    assert.equal(f.releases[0][2].failureDiagnostic, diagnostic);
    assert.equal(f.reports[0][0], "exact-attempt"); assert.equal(f.reports[0][1], "failed");
    assert.equal(f.reports[0][3], diagnostic);
});

test("successful single-thread recovery charges only on final completion and reports processing", async () => {
    const f = queueFixture();
    const diagnostic = { workerStage: "encoding", attempt: 2, threaded: false, initializationMs: 90_000 };
    f.api.pipelineTaskDone("task", "encoder", { name: "output" }, diagnostic);
    assert.equal(f.finalizes.length, 0); assert.equal(f.releases.length, 0);
    delete f.store.value.task.pipelineResults.encoder;
    f.api.itemDone("task", { name: "output" });
    await new Promise(setImmediate);
    assert.equal(f.finalizes.length, 1); assert.equal(f.releases.length, 0);
    assert.equal(f.store.value.task.points.status, "finalized");
    assert.equal(f.reports[0][1], "processed"); assert.equal(f.reports[0][3], diagnostic);
});

test("outcome reporting retries a pending database audit without blocking download completion", async () => {
    const calls = [];
    const { exports: api } = load("../src/lib/api/download-outcome.ts", {
        "$lib/api/api-url": { currentApiURL: () => "https://api.test" },
        "$lib/state/clerk": { getClerkToken: async () => "token" },
    }, {
        setTimeout: fn => { fn(); return 1; }, AbortSignal,
        fetch: async (url, options) => {
            calls.push({ url, options });
            return calls.length < 3 ? { ok: false, status: 404 } : { ok: true, status: 200 };
        },
    });
    await api.reportDownloadOutcome("exact-attempt", "failed", "queue.generic_error", { workerStage: "worker" });
    assert.equal(calls.length, 3);
    assert.equal(JSON.parse(calls[2].options.body).requestId, "exact-attempt");
    assert.equal(calls[2].options.headers.Authorization, "Bearer token");
});
