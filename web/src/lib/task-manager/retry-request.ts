import type { CobaltSaveRequestBody } from "$lib/types/api";

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
