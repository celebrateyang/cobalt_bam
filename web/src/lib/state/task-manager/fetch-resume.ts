import { removeFromFileStorage } from "$lib/storage/opfs";
import type { UUID } from "$lib/types/queue";

export type FetchResumeState = {
    fileName: string;
    receivedBytes: number;
    expectedSize?: number;
    contentType?: string;
    updatedAt: number;
};

const resumeState = new Map<string, FetchResumeState>();

const makeKey = (taskId: UUID, slot: number) => `${taskId}:${slot}`;

export const getFetchResumeState = (taskId: UUID, slot: number) => (
    resumeState.get(makeKey(taskId, slot))
);

export const setFetchResumeState = (taskId: UUID, slot: number, state: Omit<FetchResumeState, "updatedAt">) => {
    const key = makeKey(taskId, slot);
    const previous = resumeState.get(key);
    const next: FetchResumeState = {
        ...state,
        updatedAt: Date.now(),
    };

    resumeState.set(key, next);

    if (previous?.fileName && previous.fileName !== next.fileName) {
        void removeFromFileStorage(previous.fileName);
    }
};

export const clearFetchResumeState = (taskId: UUID, slot: number) => {
    const key = makeKey(taskId, slot);
    const previous = resumeState.get(key);
    resumeState.delete(key);
    if (previous?.fileName) {
        void removeFromFileStorage(previous.fileName);
    }
};

export const clearFetchResumeStateForTask = (taskId: UUID) => {
    const prefix = `${taskId}:`;
    for (const [key, state] of resumeState.entries()) {
        if (!key.startsWith(prefix)) continue;
        resumeState.delete(key);
        if (state.fileName) {
            void removeFromFileStorage(state.fileName);
        }
    }
};

export const hasFetchResumeStateForTask = (taskId: UUID) => {
    const prefix = `${taskId}:`;
    for (const [key, state] of resumeState.entries()) {
        if (!key.startsWith(prefix)) continue;
        if (state.fileName && Number.isFinite(state.receivedBytes) && state.receivedBytes > 0) {
            return true;
        }
    }

    return false;
};
