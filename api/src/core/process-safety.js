const installedKey = Symbol.for("fsv.processSafetyHandlersInstalled");

export const isExpectedAbortError = (error) => {
    const code = String(error?.code || error?.cause?.code || "");
    const name = String(error?.name || "");
    const message = String(error?.message || "").toLowerCase();

    return code === "UND_ERR_ABORTED" ||
        name === "AbortError" ||
        message === "request aborted";
};

const terminateAfterUnexpectedFatalError = (kind, error) => {
    console.error(`[PROCESS FATAL] kind=${kind}`, error);
    process.exitCode = 1;
    setImmediate(() => process.exit(1));
};

export const installProcessSafetyHandlers = () => {
    if (globalThis[installedKey]) return;
    globalThis[installedKey] = true;

    process.on("uncaughtException", (error, origin) => {
        if (isExpectedAbortError(error)) {
            console.warn(
                `[PROCESS RECOVERED] kind=uncaughtException origin=${origin} code=${error?.code || error?.name || "unknown"} message=${error?.message || "Request aborted"}`,
            );
            return;
        }

        terminateAfterUnexpectedFatalError("uncaughtException", error);
    });

    process.on("unhandledRejection", (reason) => {
        if (isExpectedAbortError(reason)) {
            console.warn(
                `[PROCESS RECOVERED] kind=unhandledRejection code=${reason?.code || reason?.name || "unknown"} message=${reason?.message || "Request aborted"}`,
            );
            return;
        }

        terminateAfterUnexpectedFatalError("unhandledRejection", reason);
    });
};
