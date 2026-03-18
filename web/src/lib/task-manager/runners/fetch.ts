import FetchWorker from "$lib/task-manager/workers/fetch?worker";

import { killWorker } from "$lib/task-manager/run-worker";
import { updateWorkerProgress } from "$lib/state/task-manager/current-tasks";
import { pipelineTaskDone, itemError, queue } from "$lib/state/task-manager/queue";
import {
    clearFetchResumeState,
    getFetchResumeState,
    setFetchResumeState,
} from "$lib/state/task-manager/fetch-resume";

import type { CobaltQueue, UUID } from "$lib/types/queue";
import type { CobaltFetchResume, CobaltFetchTuning } from "$lib/types/workers";

export const runFetchWorker = async (
    workerId: UUID,
    parentId: UUID,
    url: string,
    tuning?: CobaltFetchTuning,
    resume?: CobaltFetchResume,
    startAttempt = 0,
) => {
    const worker = new FetchWorker();
    const MAX_START_RETRIES = 2;
    const WORKER_START_TIMEOUT_MS = 15000;
    let started = false;

    const unsubscribe = queue.subscribe((queue: CobaltQueue) => {
        if (!queue[parentId]) {
            killWorker(worker, unsubscribe, startTimeout);
        }
    });

    const restartOrFail = async (errorCode = "queue.worker_didnt_start") => {
        killWorker(worker, unsubscribe, startTimeout);

        if (startAttempt < MAX_START_RETRIES) {
            return await runFetchWorker(
                workerId,
                parentId,
                url,
                tuning,
                resume,
                startAttempt + 1,
            );
        }

        return itemError(parentId, workerId, errorCode);
    };

    const startTimeout = setTimeout(() => {
        if (started) return;
        void restartOrFail("queue.worker_didnt_start");
    }, WORKER_START_TIMEOUT_MS);

    const resumeSlot = resume?.enabled && Number.isFinite(resume.slot)
        ? Number(resume.slot)
        : undefined;
    const savedResume = resumeSlot === undefined
        ? undefined
        : getFetchResumeState(parentId, resumeSlot);

    worker.postMessage({
        cobaltFetchWorker: {
            url,
            tuning,
            resume: {
                ...resume,
                ...(savedResume
                    ? {
                        fileName: savedResume.fileName,
                        receivedBytes: savedResume.receivedBytes,
                        expectedSize: savedResume.expectedSize,
                        contentType: savedResume.contentType,
                    }
                    : {}),
            },
        }
    });

    worker.onerror = () => {
        void restartOrFail("queue.generic_error");
    };

    worker.onmessageerror = () => {
        void restartOrFail("queue.generic_error");
    };

    worker.onmessage = (event) => {
        const eventData = event.data.cobaltFetchWorker;
        if (!eventData) return;
        started = true;
        clearTimeout(startTimeout);

        if (eventData.started) {
            return;
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
            killWorker(worker, unsubscribe, startTimeout);
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
            killWorker(worker, unsubscribe, startTimeout);
            return itemError(parentId, workerId, eventData.error);
        }
    }
}
