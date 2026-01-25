import type { CobaltSaveRequestBody } from "$lib/types/api";
import type { CobaltPipelineItem, CobaltPipelineResultFileType } from "$lib/types/workers";

export type UUID = string;

export type CobaltQueueItemPoints = {
    holdId?: string | null;
    required?: number | null;
    charged?: number | null;
    before?: number | null;
    after?: number | null;
    status?: string | null;
};

export type CobaltQueueItemCollectionMemory = {
    collectionKey: string;
    title?: string;
    sourceUrl?: string;
    itemKey: string;
    itemUrl?: string;
    itemTitle?: string;
};

type CobaltQueueItemBase = {
    id: UUID;
    state: "waiting" | "running" | "done" | "error";
    pipeline: CobaltPipelineItem[];
    filename: string;
    mimeType: string;
    mediaType: CobaltPipelineResultFileType;
    canRetry?: boolean;
    originalRequest?: CobaltSaveRequestBody;
    points?: CobaltQueueItemPoints;
    collectionMemory?: CobaltQueueItemCollectionMemory;
};

export type CobaltQueueItemWaiting = CobaltQueueItemBase & {
    state: "waiting";
    pipelineResults?: Record<UUID, File>;
    resultFile?: File;
    errorCode?: string;
};

export type CobaltQueueItemRunning = CobaltQueueItemBase & {
    state: "running";
    pipelineResults: Record<UUID, File>;
};

export type CobaltQueueItemDone = CobaltQueueItemBase & {
    state: "done";
    resultFile: File;
    pipelineResults?: Record<UUID, File>;
};

export type CobaltQueueItemError = CobaltQueueItemBase & {
    state: "error";
    errorCode: string;
    pipelineResults?: Record<UUID, File>;
};

export type CobaltQueueItem =
    | CobaltQueueItemWaiting
    | CobaltQueueItemRunning
    | CobaltQueueItemDone
    | CobaltQueueItemError;

export type CobaltQueue = Record<UUID, CobaltQueueItem>;
