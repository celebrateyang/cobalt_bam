import * as Storage from "$lib/storage";

const TOTAL_TIMEOUT_MS = 15 * 60 * 1000;
const STALL_TIMEOUT_MS = 3 * 60 * 1000;
const STALL_CHECK_INTERVAL_MS = 5000;
const MAX_RETRIES = 6;

const isAbortError = (e: unknown) => (
    (typeof e === "object" && e && "name" in e && e.name === "AbortError") ||
    String(e).includes("AbortError")
);

const isRetryableNetworkError = (e: unknown) => {
    if (isAbortError(e)) return false;

    if (e instanceof TypeError) {
        return true;
    }

    const message = String(e).toLowerCase();
    return [
        "failed to fetch",
        "network error",
        "networkerror",
        "terminated",
        "load failed",
    ].some((pattern) => message.includes(pattern));
};

const parseContentRangeTotal = (value: string | null) => {
    if (!value) return;

    const match = /^bytes\s+\d+-\d+\/(\d+|\*)$/i.exec(value.trim());
    if (!match || match[1] === "*") return;

    const total = Number(match[1]);
    if (!Number.isFinite(total) || total <= 0) return;

    return total;
};

const fetchFile = async (url: string) => {
    let storage: Awaited<ReturnType<typeof Storage.init>> | null = null;
    let abortReason: "timeout" | "stalled" | null = null;
    const controller = new AbortController();
    const startedAt = Date.now();
    let lastProgressAt = startedAt;
    let stallInterval: ReturnType<typeof setInterval> | null = null;
    const totalTimeout = setTimeout(() => {
        abortReason = "timeout";
        controller.abort();
    }, TOTAL_TIMEOUT_MS);

    const markProgress = () => {
        lastProgressAt = Date.now();
    };

    const startStallMonitor = () => {
        stallInterval = setInterval(() => {
            if (Date.now() - lastProgressAt > STALL_TIMEOUT_MS) {
                abortReason = "stalled";
                controller.abort();
            }
        }, STALL_CHECK_INTERVAL_MS);
    };

    const stopTimers = () => {
        clearTimeout(totalTimeout);
        if (stallInterval) {
            clearInterval(stallInterval);
            stallInterval = null;
        }
    };

    const error = async (code: string) => {
        stopTimers();
        if (storage) {
            await storage.destroy().catch(() => undefined);
        }

        self.postMessage({
            cobaltFetchWorker: {
                error: code,
            }
        });
        return self.close();
    };

    try {
        let receivedBytes = 0;
        let retries = 0;
        let expectedSize: number | undefined;
        let expectedSizeReliable = false;
        let contentType = "application/octet-stream";

        markProgress();
        startStallMonitor();

        while (true) {
            const headers: Record<string, string> = {};
            if (receivedBytes > 0) {
                headers.Range = `bytes=${receivedBytes}-`;
            }

            let response: Response;
            try {
                response = await fetch(url, {
                    signal: controller.signal,
                    headers,
                });
            } catch (e) {
                if (isRetryableNetworkError(e) && retries < MAX_RETRIES) {
                    retries++;
                    continue;
                }
                throw e;
            }

            if (response.status === 416 && receivedBytes > 0) {
                if (!expectedSizeReliable || (expectedSize && receivedBytes >= expectedSize)) {
                    break;
                }
            }

            const resumedRequest = receivedBytes > 0;
            const partialResponse = resumedRequest && response.status === 206;

            if (!response.ok && !partialResponse) {
                if (resumedRequest && retries < MAX_RETRIES && response.status >= 500) {
                    retries++;
                    continue;
                }
                return error("queue.fetch.bad_response");
            }

            if (resumedRequest && response.status === 200) {
                if (retries < MAX_RETRIES) {
                    retries++;
                    receivedBytes = 0;
                    expectedSize = undefined;
                    expectedSizeReliable = false;
                    if (storage) {
                        await storage.destroy().catch(() => undefined);
                        storage = null;
                    }
                    continue;
                }
                return error("queue.fetch.bad_response");
            }

            const nextContentType = response.headers.get("Content-Type");
            if (nextContentType) {
                contentType = nextContentType;
            }

            const totalFromRange = parseContentRangeTotal(response.headers.get("Content-Range"));
            if (totalFromRange) {
                expectedSize = totalFromRange;
                expectedSizeReliable = true;
            } else {
                const contentLength = Number(response.headers.get("Content-Length"));
                if (Number.isFinite(contentLength) && contentLength > 0) {
                    expectedSize = partialResponse
                        ? receivedBytes + contentLength
                        : contentLength;
                    expectedSizeReliable = true;
                } else if (!expectedSize) {
                    const estimatedLength = Number(response.headers.get("Estimated-Content-Length"));
                    if (Number.isFinite(estimatedLength) && estimatedLength > 0) {
                        expectedSize = estimatedLength;
                    }
                }
            }

            if (!storage) {
                storage = await Storage.init(expectedSize);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                return error("queue.fetch.no_file_reader");
            }

            let madeProgress = false;

            while (true) {
                let chunk;
                try {
                    chunk = await reader.read();
                } catch (e) {
                    if (isRetryableNetworkError(e) && retries < MAX_RETRIES) {
                        retries++;
                        break;
                    }
                    throw e;
                }

                const { done, value } = chunk;
                if (done) break;
                if (!value) continue;

                madeProgress = true;
                await storage.write(value, receivedBytes);
                receivedBytes += value.length;
                retries = 0;
                markProgress();

                if (expectedSize) {
                    const percentage = Math.max(
                        0,
                        Math.min(100, Math.round((receivedBytes / expectedSize) * 100))
                    );

                    self.postMessage({
                        cobaltFetchWorker: {
                            progress: percentage,
                            size: receivedBytes,
                        }
                    });
                }
            }

            if (expectedSize && receivedBytes >= expectedSize) {
                break;
            }

            if (!expectedSizeReliable) {
                break;
            }

            if (!madeProgress) {
                if (retries >= MAX_RETRIES) {
                    return error("queue.fetch.network_error");
                }
                retries++;
            }
        }

        if (receivedBytes === 0) {
            return error("queue.fetch.empty_tunnel");
        }

        if (!storage) {
            return error("queue.fetch.empty_tunnel");
        }

        stopTimers();
        const file = Storage.retype(await storage.res(), contentType);

        if (expectedSizeReliable && expectedSize && expectedSize !== file.size) {
            return error("queue.fetch.corrupted_file");
        }

        if (expectedSize) {
            self.postMessage({
                cobaltFetchWorker: {
                    progress: 100,
                    size: receivedBytes,
                }
            });
        }

        self.postMessage({
            cobaltFetchWorker: {
                result: file
            }
        });
    } catch (e) {
        stopTimers();
        if (isAbortError(e)) {
            return error(
                abortReason === "stalled"
                    ? "queue.fetch.stalled"
                    : "queue.fetch.timeout"
            );
        }

        if (isRetryableNetworkError(e)) {
            return error("queue.fetch.network_error");
        }

        console.error("error from the fetch worker:");
        console.error(e);
        return error("queue.fetch.crashed");
    }
}

self.onmessage = async (event: MessageEvent) => {
    if (event.data.cobaltFetchWorker) {
        await fetchFile(event.data.cobaltFetchWorker.url);
        self.close();
    }
}
