import HlsFetchWorker from "$lib/task-manager/workers/hls-fetch?worker";

import { killWorker } from "$lib/task-manager/run-worker";
import { updateWorkerProgress } from "$lib/state/task-manager/current-tasks";
import { pipelineTaskDone, itemError, queue } from "$lib/state/task-manager/queue";

import type { CobaltQueue, UUID } from "$lib/types/queue";

export const runHlsFetchWorker = async (
    workerId: UUID,
    parentId: UUID,
    url: string,
    mimeType?: string,
    startAttempt = 0,
) => {
    const worker = new HlsFetchWorker();
    const MAX_START_RETRIES = 2;
    const WORKER_START_TIMEOUT_MS = 15000;
    let started = false;

    const unsubscribe = queue.subscribe((queueData: CobaltQueue) => {
        if (!queueData[parentId]) {
            killWorker(worker, unsubscribe, startTimeout);
        }
    });

    const restartOrFail = async (errorCode = "queue.worker_didnt_start") => {
        killWorker(worker, unsubscribe, startTimeout);

        if (startAttempt < MAX_START_RETRIES) {
            return await runHlsFetchWorker(
                workerId,
                parentId,
                url,
                mimeType,
                startAttempt + 1,
            );
        }

        return itemError(parentId, workerId, errorCode);
    };

    const startTimeout = setTimeout(() => {
        if (started) return;
        void restartOrFail("queue.worker_didnt_start");
    }, WORKER_START_TIMEOUT_MS);

    worker.postMessage({
        cobaltHlsFetchWorker: {
            url,
            mimeType,
        },
    });

    worker.onerror = () => {
        void restartOrFail("queue.generic_error");
    };

    worker.onmessageerror = () => {
        void restartOrFail("queue.generic_error");
    };

    worker.onmessage = (event) => {
        const eventData = event.data?.cobaltHlsFetchWorker;
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
            });
        }

        if (eventData.result) {
            killWorker(worker, unsubscribe, startTimeout);
            return pipelineTaskDone(parentId, workerId, eventData.result);
        }

        if (eventData.error) {
            killWorker(worker, unsubscribe, startTimeout);
            return itemError(parentId, workerId, eventData.error);
        }
    };
};
