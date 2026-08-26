import type { FileInfo } from "$lib/types/libav";
import type { UUID } from "./queue";

export const resultFileTypes = ["video", "audio", "image", "file"] as const;

export type CobaltPipelineResultFileType = typeof resultFileTypes[number];

export type CobaltWorkerProgress = {
    percentage?: number,
    speed?: number,
    size: number,
    networkStalled?: boolean,
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
    useRangeRequests?: boolean,
};

export type CobaltFetchResume = {
    enabled?: boolean,
    slot?: number,
    fileName?: string,
    receivedBytes?: number,
    expectedSize?: number,
    contentType?: string,
};

export type CobaltFetchValidation = {
    expectedContentTypePrefixes?: string[],
    minBytes?: number,
    requireReliableSize?: boolean,
};

export type CobaltFetchFailureDiagnostic = {
    candidateHost?: string;
    candidateIndex?: number;
    candidateCount?: number;
    httpStatus?: number;
    contentType?: string;
    failureKind?: "http_status" | "html_response" | "content_type" | "network";
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
        urlCandidates?: string[],
        tuning?: CobaltFetchTuning,
        resume?: CobaltFetchResume,
        validation?: CobaltFetchValidation,
    },
}

type CobaltHlsFetchPipelineItem = CobaltPipelineItemBase & {
    worker: "hls-fetch",
    workerArgs: {
        url: string,
        mimeType?: string,
    },
}

export type CobaltPipelineItem = CobaltEncodePipelineItem
                               | CobaltRemuxPipelineItem
                               | CobaltFetchPipelineItem
                               | CobaltHlsFetchPipelineItem;
