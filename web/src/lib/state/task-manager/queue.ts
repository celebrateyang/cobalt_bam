import { get, readable, type Updater } from "svelte/store";

import { schedule } from "$lib/task-manager/scheduler";
import { clearFileStorage, removeFromFileStorage } from "$lib/storage/opfs";
import { clearCurrentTasks, removeWorkerFromQueue } from "$lib/state/task-manager/current-tasks";
import { finalizePointsHold, releasePointsHold } from "$lib/api/points";
import { markCollectionDownloadedItems } from "$lib/api/collection-memory";

import type { CobaltQueue, CobaltQueueItem, CobaltQueueItemRunning, UUID } from "$lib/types/queue";

const clearPipelineCache = (queueItem: CobaltQueueItem) => {
    if (queueItem.state === "running") {
        for (const [ workerId, item ] of Object.entries(queueItem.pipelineResults)) {
            removeFromFileStorage(item.name);
            delete queueItem.pipelineResults[workerId];
        }
    } else if (queueItem.state === "done") {
        removeFromFileStorage(queueItem.resultFile.name);
    }

    return queueItem;
}

let update: (_: Updater<CobaltQueue>) => void;

export const queue = readable<CobaltQueue>(
    {},
    (_, _update) => { update = _update }
);

const updateItemPoints = (
    id: UUID,
    patch: Partial<NonNullable<CobaltQueueItem["points"]>>,
) => {
    update(queueData => {
        if (queueData[id]) {
            queueData[id] = {
                ...queueData[id],
                points: {
                    ...queueData[id].points,
                    ...patch,
                },
            };
        }
        return queueData;
    });
};

const markQueueItemMemory = async (item: CobaltQueueItem) => {
    const memory = item.collectionMemory;
    if (!memory?.collectionKey || !memory?.itemKey) return;

    await markCollectionDownloadedItems({
        collectionKey: memory.collectionKey,
        title: memory.title,
        sourceUrl: memory.sourceUrl,
        items: [
            {
                itemKey: memory.itemKey,
                url: memory.itemUrl,
                title: memory.itemTitle,
            },
        ],
    }).catch(() => false);
};

const finalizeQueueHold = async (id: UUID) => {
    const item = get(queue)[id];
    if (!item) return;

    const holdId = item.points?.holdId;
    const required = item.points?.required ?? null;
    const currentStatus = item.points?.status;

    if (currentStatus === "finalized" || currentStatus === "released") {
        return;
    }

    if (!holdId && required) {
        console.warn("[queue] finalize skipped; missing holdId", {
            id,
            required,
        });
        return;
    }


    let result = holdId
        ? await finalizePointsHold(holdId, "queue_done")
        : { ok: true, status: "skipped" };

    if (!result?.ok && holdId) {
        await new Promise((r) => setTimeout(r, 500));
        result = await finalizePointsHold(holdId, "queue_done_retry");
    }

    if (result?.ok) {
        updateItemPoints(id, {
            holdId,
            required,
            charged: result.charged ?? required ?? null,
            before: result.before ?? null,
            after: result.after ?? null,
            status: result.status ?? (holdId ? "finalized" : "skipped"),
        });
        await markQueueItemMemory(item);
    } else {
        updateItemPoints(id, {
            holdId,
            required,
            status: "error",
        });
        if (holdId) {
            await releasePointsHold(holdId, "finalize_failed").catch(() => false);
        }
    }
};

const releaseQueueHold = async (id: UUID, reason: string) => {
    const item = get(queue)[id];
    if (!item) return;

    const holdId = item.points?.holdId;
    if (!holdId) return;

    const result = await releasePointsHold(holdId, reason).catch(() => null);
    if (result?.ok) {
        updateItemPoints(id, {
            holdId,
            status: result.status ?? "released",
        });
    } else {
        updateItemPoints(id, {
            holdId,
            status: "error",
        });
    }
};

const releaseHoldForItem = (item: CobaltQueueItem, reason: string) => {
    const holdId = item.points?.holdId;
    const status = item.points?.status;
    if (!holdId || status === "finalized" || status === "released") return;
    void releasePointsHold(holdId, reason).catch(() => false);
};

export function addItem(item: CobaltQueueItem) {
    update(queueData => {
        const existing = queueData[item.id];
        queueData[item.id] = {
            ...item,
            collectionMemory: item.collectionMemory ?? existing?.collectionMemory,
            points: item.points ?? existing?.points,
        };
        return queueData;
    });

    schedule();
}

export function itemError(id: UUID, workerId: UUID, error: string) {
    update(queueData => {
        if (queueData[id]) {
            queueData[id] = clearPipelineCache(queueData[id]);

            queueData[id] = {
                ...queueData[id],
                state: "error",
                errorCode: error,
            }
        }
        return queueData;
    });

    removeWorkerFromQueue(workerId);
    schedule();
    void releaseQueueHold(id, "queue_error");
}

export function itemDone(id: UUID, file: File) {
    update(queueData => {
        if (queueData[id]) {
            queueData[id] = clearPipelineCache(queueData[id]);

            queueData[id] = {
                ...queueData[id],
                state: "done",
                resultFile: file,
            }
        }
        return queueData;
    });

    schedule();
}

export function pipelineTaskDone(id: UUID, workerId: UUID, file: File) {
    update(queueData => {
        const item = queueData[id];

        if (item && item.state === 'running') {
            item.pipelineResults[workerId] = file;
        }

        return queueData;
    });

    removeWorkerFromQueue(workerId);
    schedule();
}

export function itemRunning(id: UUID) {
    update(queueData => {
        const data = queueData[id] as CobaltQueueItemRunning;

        if (data) {
            data.state = 'running';
            data.pipelineResults ??= {};
        }

        return queueData;
    });

    schedule();
}

export function removeItem(id: UUID) {
    update(queueData => {
        const item = queueData[id];

        if (item) {
            releaseHoldForItem(item, "queue_removed");
        }
        for (const worker of item.pipeline) {
            removeWorkerFromQueue(worker.workerId);
        }
        clearPipelineCache(item);

        delete queueData[id];
        return queueData;
    });

    schedule();
    void finalizeQueueHold(id);
}

export function updateItem(id: UUID, updater: (item: CobaltQueueItem) => CobaltQueueItem) {
    update(queueData => {
        const item = queueData[id];
        if (item) {
            queueData[id] = updater(item);
        }
        return queueData;
    });

    schedule();
    void finalizeQueueHold(id);
}

export function clearQueue() {
    const items = get(queue);
    for (const item of Object.values(items)) {
        releaseHoldForItem(item, "queue_cleared");
    }
    update(() => ({}));
    clearCurrentTasks();
    clearFileStorage();
}
