const text = (value, max) => typeof value === "string" ? value.slice(0, max) : null;
const integer = (value, max) => Number.isInteger(value) && value >= 0 && value <= max ? value : null;

export const normalizeBrowserDownloadOutcome = (body, userAgent) => {
    if (!body || !["processed", "failed"].includes(body.state)
        || typeof body.requestId !== "string"
        || !/^[a-z0-9_.:-]{1,128}$/i.test(body.requestId)) return null;
    const d = body.diagnostic ?? {};
    return {
        requestId: body.requestId,
        outcome: {
            state: body.state,
            reportedAt: Date.now(),
            userAgent: text(userAgent, 300),
            errorCode: body.state === "failed" ? text(body.errorCode, 120) : null,
            diagnostic: {
                workerStage: ["worker", "initializing", "probing", "encoding"].includes(d.workerStage) ? d.workerStage : null,
                elapsedMs: integer(d.elapsedMs, 86_400_000),
                initializationMs: integer(d.initializationMs, 86_400_000),
                attempt: integer(d.attempt, 10),
                threaded: typeof d.threaded === "boolean" ? d.threaded : null,
                errorName: text(d.errorName, 80),
                candidateHost: text(d.candidateHost, 120),
                candidateIndex: integer(d.candidateIndex, 100),
                candidateCount: integer(d.candidateCount, 100),
                httpStatus: integer(d.httpStatus, 599),
                contentType: text(d.contentType, 120),
                failureKind: text(d.failureKind, 40),
            },
        },
    };
};
