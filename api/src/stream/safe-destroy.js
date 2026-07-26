const ignoreStreamError = () => {};

/**
 * Destroy a stream without allowing its asynchronous `error` event to become
 * an uncaught exception. Undici BodyReadable emits UND_ERR_ABORTED after
 * destroy(), so a synchronous try/catch alone is not sufficient.
 */
export const safeDestroyStream = (stream) => {
    if (!stream) return;

    try {
        stream.on?.("error", ignoreStreamError);
        stream.destroy?.();
    } catch {
        // Destruction is best-effort during response cleanup.
    }
};
