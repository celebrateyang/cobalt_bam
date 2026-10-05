import FFmpegWorker from "$lib/task-manager/workers/ffmpeg?worker";
import { updateWorkerProgress } from "$lib/state/task-manager/current-tasks";
import { pipelineTaskDone, itemError, queue } from "$lib/state/task-manager/queue";
import type { FileInfo } from "$lib/types/libav";
import type { CobaltFetchFailureDiagnostic } from "$lib/types/workers";

// Loading the ~10 MB encoder and compiling WASM takes longer than starting
// the outer Worker. Give each initialization phase its own deadline.
const PHASE_TIMEOUTS = { worker: 15_000, initializing: 120_000, probing: 60_000 };

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
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let unsubscribe = () => {};
        const cleanup = () => {
            settled = true;
            clearTimeout(timer);
            unsubscribe();
            worker?.terminate();
        };
        const fail = (code: string, errorName?: string) => {
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
            // Retry initialization once in a fresh, single-threaded Worker.
            // Input/probe/render failures are not initialization failures.
            if (attempt === 0 && (stage === "worker" || stage === "initializing")) {
                startAttempt(1, false);
                return;
            }
            itemError(parentId, workerId, code, diagnostic);
        };
        const armDeadline = () => {
            clearTimeout(timer);
            if (stage === "encoding") return;
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
    startAttempt(0, yesthreads);
};
