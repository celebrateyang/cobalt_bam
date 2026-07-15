import { writable } from "svelte/store";

const MIN_RETRY_START_GAP_MS = 4_000;
const MAX_ITEM_BACKOFF_MS = 30_000;

let tail: Promise<void> = Promise.resolve();
let lastStartedAt = 0;
const retryCounts = new Map<string, number>();
let pendingOperations = 0;

export const retrySchedulerBusy = writable(false);

const wait = (delayMs: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, delayMs));

/**
 * Serializes manual queue retries and spaces their API requests apart.
 * Repeated retries of the same item receive exponential backoff.
 */
export const scheduleQueueRetry = <T>(
    queueId: string,
    operation: () => Promise<T>,
): Promise<T> => {
    pendingOperations += 1;
    retrySchedulerBusy.set(true);

    const run = async () => {
        const retryCount = (retryCounts.get(queueId) ?? 0) + 1;
        retryCounts.set(queueId, retryCount);

        const itemBackoff = retryCount <= 1
            ? 0
            : Math.min(
                MAX_ITEM_BACKOFF_MS,
                MIN_RETRY_START_GAP_MS * (2 ** (retryCount - 2)),
            );
        const earliestStart = Math.max(
            lastStartedAt + MIN_RETRY_START_GAP_MS,
            Date.now() + itemBackoff,
        );
        const delayMs = Math.max(0, earliestStart - Date.now());
        if (delayMs > 0) {
            await wait(delayMs);
        }

        lastStartedAt = Date.now();
        return operation();
    };

    const result = tail.then(run, run).finally(() => {
        pendingOperations = Math.max(0, pendingOperations - 1);
        retrySchedulerBusy.set(pendingOperations > 0);
    });
    tail = result.then(() => undefined, () => undefined);
    return result;
};
