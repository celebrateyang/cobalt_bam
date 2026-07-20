import { uuid } from "$lib/util";

import type { CobaltSaveRequestBody } from "$lib/types/api";

export const buildQueueRetryRequest = (
    request: CobaltSaveRequestBody,
    taskId: string,
    pointsStatus?: string | null,
): CobaltSaveRequestBody => ({
    ...request,
    // Member usage is committed by the API before the queue starts, so replay
    // the original request identity to avoid counting the retry twice. A points
    // hold is released after a queue failure; its retry needs a fresh billing
    // identity while retaining taskId separately for the partial-file resume.
    queueId: pointsStatus === "member"
        ? request.queueId || taskId
        : uuid(),
});
