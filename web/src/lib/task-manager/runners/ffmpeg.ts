import FFmpegWorker from "$lib/task-manager/workers/ffmpeg?worker";
import { updateWorkerProgress } from "$lib/state/task-manager/current-tasks";
import { pipelineTaskDone, itemError, queue } from "$lib/state/task-manager/queue";
import type { FileInfo } from "$lib/types/libav";
import type { CobaltFetchFailureDiagnostic } from "$lib/types/workers";

// Loading the ~10 MB encoder and compiling WASM takes longer than starting
// the outer Worker. Give each initialization phase its own deadline.
const PHASE_TIMEOUTS = { worker: 15_000, initializing: 120_000, probing: 60_000 };
const REMUX_IDLE_TIMEOUT = 120_000;

export const runFFmpegWorker = async (
    workerId: string,
    parentId: string,
    files: File[],
    args: string[],
    output: FileInfo,
    variant: 'remux' | 'encode',
    yesthreads: boolean,
) => {
    const taskStartedAt = Date.now();
    const startAttempt = (attempt: number, threaded: boolean) => {
        let worker: Worker | undefined;
        let stage: NonNullable<CobaltFetchFailureDiagnostic["workerStage"]> = "worker";
        let initializationMs: number | undefined;
        let processedDuration = 0;
        let outputSize = 0;
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let unsubscribe = () => {};
        const cleanup = () => {
            settled = true;
            clearTimeout(timer);
            unsubscribe();
            worker?.terminate();
        };
        const fail = (code: string, errorName?: string, retryRemux = false) => {
            if (settled) return;
            const diagnostic: CobaltFetchFailureDiagnostic = {
                workerStage: stage,
                elapsedMs: Date.now() - taskStartedAt,
                initializationMs,
                attempt: attempt + 1,
                threaded,
                errorName,
            };
            cleanup();
            // Retry initialization or a remux idle timeout once in a fresh
            // Worker. Other input/probe/render errors remain terminal.
            if (attempt === 0 && (stage === "worker" || stage === "initializing" || retryRemux)) {
                startAttempt(1, false);
                return;
            }
            itemError(parentId, workerId, code, diagnostic);
        };
        const armDeadline = () => {
            clearTimeout(timer);
            if (stage === "encoding") {
                // Stream copying should keep advancing. Reuse the downloaded
                // inputs once if LibAV's render/IO path stops responding.
                // Transcoding can legitimately take much longer without progress.
                if (variant === "remux") {
                    timer = setTimeout(() => fail("queue.ffmpeg.crashed", "TimeoutError", true), REMUX_IDLE_TIMEOUT);
                }
                return;
            }
            timer = setTimeout(() => fail(stage === "probing" ? "queue.ffmpeg.probe_failed" : "queue.worker_didnt_start", "TimeoutError"), PHASE_TIMEOUTS[stage]);
        };
        try {
            worker = new FFmpegWorker();
            armDeadline();
            unsubscribe = queue.subscribe((items) => {
                if (items[parentId]?.state !== "running") cleanup();
            });
            // Svelte subscriptions run immediately, before assignment finishes.
            if (settled) { unsubscribe(); return; }
            worker.onerror = (event) => {
                console.error("ffmpeg worker crashed:", event);
                fail("queue.generic_error", "WorkerError");
            };
            worker.onmessageerror = () => fail("queue.generic_error", "DataCloneError");
            let totalDuration: number | null = null;
            worker.onmessage = (event) => {
                if (settled) return;
                const data = event.data?.cobaltFFmpegWorker;
                if (!data) return;
                if (data.stage === "initializing" || data.stage === "probing" || data.stage === "encoding") {
                    stage = data.stage;
                    if (Number.isFinite(data.initializationMs)) initializationMs = data.initializationMs;
                    armDeadline();
                }
                if (data.error) { fail(data.error, data.errorName); return; }
                if (data.progress) {
                    if (stage === "encoding" && variant === "remux") {
                        const advanced = data.progress.durationProcessed > processedDuration || data.progress.size > outputSize;
                        processedDuration = Math.max(processedDuration, data.progress.durationProcessed || 0);
                        outputSize = Math.max(outputSize, data.progress.size || 0);
                        if (advanced) armDeadline();
                    }
                    if (data.progress.duration) totalDuration = data.progress.duration;
                    updateWorkerProgress(workerId, {
                        percentage: totalDuration && Number.isFinite(data.progress.durationProcessed)
                            ? (data.progress.durationProcessed / totalDuration) * 100 : 0,
                        size: data.progress.size ?? 0,
                    });
                }
                if (data.render) {
                    cleanup();
                    pipelineTaskDone(parentId, workerId, data.render, {
                        workerStage: stage, elapsedMs: Date.now() - taskStartedAt,
                        initializationMs, attempt: attempt + 1, threaded,
                    });
                }
            };
            worker.postMessage({ cobaltFFmpegWorker: { variant, files, args, output, yesthreads: threaded } });
        } catch (error) {
            fail("queue.generic_error", error instanceof Error ? error.name : "UnknownError");
        }
    };
    // LibAV pthread mode can deadlock while reading multiple readahead inputs.
    // Remux only copies packets; it does not benefit from codec threading.
    startAttempt(0, variant === "remux" ? false : yesthreads);
};
