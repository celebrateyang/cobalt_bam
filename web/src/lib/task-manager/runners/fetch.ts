import FetchWorker from "$lib/task-manager/workers/fetch?worker";

import {
    updateWorkerNetworkStalled,
    updateWorkerProgress,
} from "$lib/state/task-manager/current-tasks";
import { pipelineTaskDone, itemError, queue } from "$lib/state/task-manager/queue";
import {
    clearFetchResumeState,
    getFetchResumeState,
    setFetchResumeState,
} from "$lib/state/task-manager/fetch-resume";

import type { CobaltQueue, UUID } from "$lib/types/queue";
import type { CobaltFetchResume, CobaltFetchTuning, CobaltFetchValidation } from "$lib/types/workers";

export const runFetchWorker = async (
    workerId: UUID,
    parentId: UUID,
    url: string,
    urlCandidates?: string[],
    tuning?: CobaltFetchTuning,
    resume?: CobaltFetchResume,
    validation?: CobaltFetchValidation,
    startAttempt = 0,
) => {
    const MAX_START_RETRIES = 2;
    const WORKER_START_TIMEOUT_MS = 15000;
    const attemptStartedAt = Date.now();
    let worker: Worker | undefined;
    let unsubscribe: (() => void) | undefined;
    let startTimeout: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    let started = false;

    const cleanup = () => {
        settled = true;
        if (startTimeout !== undefined) clearTimeout(startTimeout);
        unsubscribe?.();
        if (worker) {
            worker.onmessage = worker.onerror = worker.onmessageerror = null;
            worker.terminate();
        }
    };

    const restartOrFail = async (errorCode: string, errorName: string) => {
        if (settled) return;
        const diagnostic = {
            workerStage: "worker" as const,
            elapsedMs: Date.now() - attemptStartedAt,
            attempt: startAttempt + 1,
            errorName,
        };
        cleanup();

        // Retrying after download starts can discard received data. Only a
        // failed startup gets an automatic fresh worker.
        if (!started && startAttempt < MAX_START_RETRIES) {
            return await runFetchWorker(
                workerId,
                parentId,
                url,
                urlCandidates,
                tuning,
                resume,
                validation,
                startAttempt + 1,
            );
        }

        return itemError(parentId, workerId, errorCode, diagnostic);
    };

    unsubscribe = queue.subscribe((queue: CobaltQueue) => {
        if (queue[parentId]?.state !== "running") cleanup();
    });
    // Svelte subscriptions run synchronously, before assignment completes.
    if (settled) {
        unsubscribe();
        return;
    }

    startTimeout = setTimeout(() => {
        if (started) return;
        void restartOrFail("queue.worker_didnt_start", "TimeoutError");
    }, WORKER_START_TIMEOUT_MS);

    const resumeSlot = resume?.enabled && Number.isFinite(resume.slot)
        ? Number(resume.slot)
        : undefined;
    const savedResume = resumeSlot === undefined
        ? undefined
        : getFetchResumeState(parentId, resumeSlot);

    try {
        worker = new FetchWorker();
        worker.onerror = (event) => {
            console.error("fetch worker failed:", event.message, event.filename, event.lineno);
            void restartOrFail("queue.generic_error", "WorkerError");
        };

        worker.onmessageerror = () => {
            void restartOrFail("queue.generic_error", "DataCloneError");
        };

        worker.onmessage = (event) => {
            if (settled) return;
            const eventData = event.data?.cobaltFetchWorker;
            if (!eventData) return;
            started = true;
            clearTimeout(startTimeout);

            if (eventData.started) {
                return;
            }

            if (eventData.networkStalled !== undefined) {
                updateWorkerNetworkStalled(workerId, eventData.networkStalled === true);
            }

            if (eventData.progress !== undefined) {
                updateWorkerProgress(workerId, {
                    percentage: eventData.progress,
                    size: eventData.size,
                })
            }

            if (eventData.result) {
                if (resumeSlot !== undefined) {
                    clearFetchResumeState(parentId, resumeSlot);
                }
                cleanup();
                return pipelineTaskDone(
                    parentId,
                    workerId,
                    eventData.result,
                );
            }

            if (eventData.error) {
                if (
                    resumeSlot !== undefined &&
                    eventData.resume?.fileName &&
                    Number.isFinite(eventData.resume?.receivedBytes) &&
                    eventData.resume.receivedBytes > 0
                ) {
                    setFetchResumeState(parentId, resumeSlot, {
                        fileName: eventData.resume.fileName,
                        receivedBytes: eventData.resume.receivedBytes,
                        expectedSize: Number.isFinite(eventData.resume.expectedSize)
                            ? eventData.resume.expectedSize
                            : undefined,
                        contentType: typeof eventData.resume.contentType === "string"
                            ? eventData.resume.contentType
                            : undefined,
                    });
                } else if (resumeSlot !== undefined) {
                    clearFetchResumeState(parentId, resumeSlot);
                }
                cleanup();
                return itemError(parentId, workerId, eventData.error, eventData.diagnostic);
            }
        }
        // Install handlers before posting: constructor and clone errors also
        // need to release the queue's points hold via itemError.
        worker.postMessage({ cobaltFetchWorker: {
            url, urlCandidates, tuning, validation,
            resume: { ...resume, ...(savedResume ?? {}) },
        } });
    } catch (error) {
        console.error("fetch worker startup failed:", error);
        void restartOrFail("queue.generic_error", error instanceof Error ? error.name : "UnknownError");
    }
}
