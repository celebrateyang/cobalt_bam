import type { CobaltSaveRequestBody } from "$lib/types/api";
import type { CobaltQueueItem } from "$lib/types/queue";

export const canRetryOriginalAudio = (item: CobaltQueueItem) => {
    if (item.state !== "error" || item.mediaType !== "audio" || !item.canRetry
        || !item.failureDiagnostic?.workerStage || !item.originalRequest
        || item.originalRequest.audioFormat === "best") return false;
    try {
        const host = new URL(item.originalRequest.url).hostname.toLowerCase();
        return host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com");
    } catch { return false; }
};

export const buildOriginalAudioRetryRequest = (
    request: CobaltSaveRequestBody,
    queueId: string,
): CobaltSaveRequestBody => ({
    ...request,
    queueId,
    downloadMode: "audio",
    audioFormat: "best",
    disableMetadata: true,
    localProcessing: "forced",
});

export const buildQueueRetryRequest = (
    request: CobaltSaveRequestBody,
    taskId: string,
    _pointsStatus?: string | null,
): CobaltSaveRequestBody => ({
    ...request,
    // The API can reactivate a released hold for the same URL. Reusing the
    // logical task identity prevents repeated queue attempts from creating
    // separate charges or duplicate audit identities.
    queueId: request.queueId || taskId,
});
