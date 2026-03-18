import type { FileInfo } from "$lib/types/libav";
import type { UUID } from "./queue";

export const resultFileTypes = ["video", "audio", "image", "file"] as const;

export type CobaltPipelineResultFileType = typeof resultFileTypes[number];

export type CobaltWorkerProgress = {
    percentage?: number,
    speed?: number,
    size: number,
};

type CobaltFFmpegWorkerArgs = {
    files: File[],
    ffargs: string[],
    output: FileInfo,
};

export type CobaltFetchTuning = {
    initialChunkBytes?: number,
    maxChunkBytes?: number,
    fastChunkMs?: number,
    slowChunkMs?: number,
};

export type CobaltFetchResume = {
    enabled?: boolean,
    slot?: number,
    fileName?: string,
    receivedBytes?: number,
    expectedSize?: number,
    contentType?: string,
};

type CobaltPipelineItemBase = {
    workerId: UUID,
    parentId: UUID,
    dependsOn?: UUID[],
};

type CobaltRemuxPipelineItem = CobaltPipelineItemBase & {
    worker: "remux",
    workerArgs: CobaltFFmpegWorkerArgs,
}

type CobaltEncodePipelineItem = CobaltPipelineItemBase & {
    worker: "encode",
    workerArgs: CobaltFFmpegWorkerArgs,
}

type CobaltFetchPipelineItem = CobaltPipelineItemBase & {
    worker: "fetch",
    workerArgs: {
        url: string,
        tuning?: CobaltFetchTuning,
        resume?: CobaltFetchResume,
    },
}

export type CobaltPipelineItem = CobaltEncodePipelineItem
                               | CobaltRemuxPipelineItem
                               | CobaltFetchPipelineItem;
