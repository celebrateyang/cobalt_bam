import * as Storage from "$lib/storage";

const TOTAL_TIMEOUT_MS = 15 * 60 * 1000;
const STALL_TIMEOUT_MS = 90 * 1000;
const STALL_CHECK_INTERVAL_MS = 5000;
const MAX_RETRIES = 10;
const INITIAL_RANGE_CHUNK_BYTES = 8 * 1024 * 1024;
const MIN_RANGE_CHUNK_BYTES = 1 * 1024 * 1024;
const MAX_RANGE_CHUNK_BYTES = 8 * 1024 * 1024;
const FAST_CHUNK_MS = 4000;
const SLOW_CHUNK_MS = 15000;
const RETRY_BASE_DELAY_MS = 700;

type FetchWorkerTuning = {
    initialChunkBytes?: number,
    maxChunkBytes?: number,
    fastChunkMs?: number,
    slowChunkMs?: number,
};

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

const isStorageWriteError = (e: unknown) => {
    const message = String(e).toLowerCase();
    return message.includes("storage_write");
};

const isRetryableHttpStatus = (status: number) => (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
);

const parseRetryAfterMs = (value: string | null) => {
    if (!value) return;

    const asSeconds = Number(value);
    if (Number.isFinite(asSeconds) && asSeconds >= 0) {
        return Math.floor(asSeconds * 1000);
    }

    const asDateMs = Date.parse(value);
    if (Number.isFinite(asDateMs)) {
        const remaining = asDateMs - Date.now();
        if (remaining > 0) {
            return Math.floor(remaining);
        }
    }
};

const clampChunkSize = (size: number, maxChunkBytes = MAX_RANGE_CHUNK_BYTES) => (
    Math.max(MIN_RANGE_CHUNK_BYTES, Math.min(maxChunkBytes, size))
);

const getBackoffDelayMs = (retryCount: number, retryAfterMs?: number) => {
    if (retryAfterMs && Number.isFinite(retryAfterMs)) {
        return Math.max(250, Math.min(15000, retryAfterMs));
    }

    const exponential = RETRY_BASE_DELAY_MS * (2 ** Math.max(0, retryCount - 1));
    const jitter = Math.floor(Math.random() * 250);
    return Math.max(250, Math.min(10000, exponential + jitter));
};

const waitForRetry = async (signal: AbortSignal, delayMs: number) => {
    if (delayMs <= 0) return;
    if (signal.aborted) {
        throw new DOMException("The operation was aborted", "AbortError");
    }

    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
        }, delayMs);

        const onAbort = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", onAbort);
            reject(new DOMException("The operation was aborted", "AbortError"));
        };

        signal.addEventListener("abort", onAbort, { once: true });
    });
};

const tuneChunkSizeOnSuccess = (
    currentChunkBytes: number,
    bytesReceived: number,
    expectedChunkBytes: number | undefined,
    elapsedMs: number,
    fastChunkMs: number,
    slowChunkMs: number,
    maxChunkBytes: number,
) => {
    if (!expectedChunkBytes || bytesReceived < expectedChunkBytes) {
        return currentChunkBytes;
    }

    if (elapsedMs <= fastChunkMs) {
        return clampChunkSize(currentChunkBytes * 2, maxChunkBytes);
    }

    if (elapsedMs >= slowChunkMs) {
        return clampChunkSize(Math.floor(currentChunkBytes / 2), maxChunkBytes);
    }

    return currentChunkBytes;
};

const parseContentRangeTotal = (value: string | null) => {
    if (!value) return;

    const match = /^bytes\s+\d+-\d+\/(\d+|\*)$/i.exec(value.trim());
    if (!match || match[1] === "*") return;

    const total = Number(match[1]);
    if (!Number.isFinite(total) || total <= 0) return;

    return total;
};

const normalizeTuning = (tuning?: FetchWorkerTuning) => {
    const normalizedMaxChunkBytes = clampChunkSize(
        Math.floor(
            Number.isFinite(tuning?.maxChunkBytes)
                ? Number(tuning?.maxChunkBytes)
                : MAX_RANGE_CHUNK_BYTES
        ),
    );

    const normalizedInitialChunkBytes = clampChunkSize(
        Math.floor(
            Number.isFinite(tuning?.initialChunkBytes)
                ? Number(tuning?.initialChunkBytes)
                : INITIAL_RANGE_CHUNK_BYTES
        ),
        normalizedMaxChunkBytes,
    );

    const normalizedFastChunkMs = (
        Number.isFinite(tuning?.fastChunkMs) && Number(tuning?.fastChunkMs) > 0
            ? Math.floor(Number(tuning?.fastChunkMs))
            : FAST_CHUNK_MS
    );

    const normalizedSlowChunkMs = Math.max(
        normalizedFastChunkMs + 1000,
        Number.isFinite(tuning?.slowChunkMs) && Number(tuning?.slowChunkMs) > 0
            ? Math.floor(Number(tuning?.slowChunkMs))
            : SLOW_CHUNK_MS,
    );

    return {
        maxChunkBytes: normalizedMaxChunkBytes,
        initialChunkBytes: normalizedInitialChunkBytes,
        fastChunkMs: normalizedFastChunkMs,
        slowChunkMs: normalizedSlowChunkMs,
    };
};

const fetchFile = async (url: string, tuning?: FetchWorkerTuning) => {
    const runtimeTuning = normalizeTuning(tuning);
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
        let largestExpectedSize = 0;
        let highestReportedProgress = 0;
        let contentType = "application/octet-stream";
        let rangeChunkBytes = runtimeTuning.initialChunkBytes;

        const reportProgress = () => {
            if (!expectedSize) return;
            if (!expectedSizeReliable && expectedSize <= receivedBytes) return;

            largestExpectedSize = Math.max(largestExpectedSize, expectedSize, receivedBytes);
            if (largestExpectedSize <= 0) return;

            const percentage = Math.max(
                0,
                Math.min(100, Math.round((receivedBytes / largestExpectedSize) * 100))
            );
            const stablePercentage = Math.max(highestReportedProgress, percentage);
            highestReportedProgress = stablePercentage;

            self.postMessage({
                cobaltFetchWorker: {
                    progress: stablePercentage,
                    size: receivedBytes,
                }
            });
        };

        markProgress();
        startStallMonitor();

        while (true) {
            const headers: Record<string, string> = {};
            const rangeStart = receivedBytes;
            let requestedRangeEnd: number | undefined;

            if (expectedSizeReliable && expectedSize) {
                if (receivedBytes >= expectedSize) {
                    break;
                }

                requestedRangeEnd = Math.min(
                    expectedSize - 1,
                    receivedBytes + rangeChunkBytes - 1,
                );
                headers.Range = `bytes=${receivedBytes}-${requestedRangeEnd}`;
            } else if (receivedBytes > 0) {
                requestedRangeEnd = receivedBytes + rangeChunkBytes - 1;
                headers.Range = `bytes=${receivedBytes}-${requestedRangeEnd}`;
            } else {
                // Start with a bounded range to avoid one fragile long-lived connection.
                requestedRangeEnd = rangeChunkBytes - 1;
                headers.Range = `bytes=0-${requestedRangeEnd}`;
            }

            const expectedChunkBytes =
                requestedRangeEnd != null
                    ? requestedRangeEnd - rangeStart + 1
                    : undefined;

            let response: Response;
            const requestStartedAt = Date.now();
            try {
                response = await fetch(url, {
                    signal: controller.signal,
                    headers,
                });
            } catch (e) {
                if (isRetryableNetworkError(e) && retries < MAX_RETRIES) {
                    retries++;
                    rangeChunkBytes = clampChunkSize(Math.floor(rangeChunkBytes / 2), runtimeTuning.maxChunkBytes);
                    await waitForRetry(controller.signal, getBackoffDelayMs(retries));
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
            const partialResponse = response.status === 206;
            let bytesToSkip = 0;

            if (!response.ok && !partialResponse) {
                if (retries < MAX_RETRIES && isRetryableHttpStatus(response.status)) {
                    retries++;
                    rangeChunkBytes = clampChunkSize(Math.floor(rangeChunkBytes / 2), runtimeTuning.maxChunkBytes);
                    const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
                    await waitForRetry(controller.signal, getBackoffDelayMs(retries, retryAfterMs));
                    continue;
                }
                return error("queue.fetch.bad_response");
            }

            if (resumedRequest && response.status === 200) {
                // Some upstreams ignore Range and return the full file (200).
                // Keep already written bytes and discard the duplicated prefix
                // from this response instead of restarting from zero.
                bytesToSkip = receivedBytes;

                const fullLength = Number(response.headers.get("Content-Length"));
                if (Number.isFinite(fullLength) && fullLength > 0) {
                    expectedSize = Math.max(expectedSize ?? 0, fullLength);
                    expectedSizeReliable = true;
                    if (receivedBytes >= fullLength) {
                        break;
                    }
                }
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
                    const candidateExpected = partialResponse
                        ? (
                            requestedRangeEnd != null
                                ? requestedRangeEnd + 1
                                : receivedBytes + contentLength
                        )
                        : contentLength;
                    expectedSize = Math.max(expectedSize ?? 0, candidateExpected);

                    if (!partialResponse) {
                        expectedSizeReliable =
                            !resumedRequest ||
                            contentLength >= receivedBytes;
                    }
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
            let bytesReceivedThisResponse = 0;

            while (true) {
                let chunk;
                try {
                    chunk = await reader.read();
                } catch (e) {
                    if (isRetryableNetworkError(e) && retries < MAX_RETRIES) {
                        retries++;
                        rangeChunkBytes = clampChunkSize(Math.floor(rangeChunkBytes / 2), runtimeTuning.maxChunkBytes);
                        await waitForRetry(controller.signal, getBackoffDelayMs(retries));
                        break;
                    }
                    throw e;
                }

                const { done, value } = chunk;
                if (done) break;
                if (!value) continue;

                markProgress();
                let chunkData = value;

                if (bytesToSkip > 0) {
                    if (chunkData.length <= bytesToSkip) {
                        bytesToSkip -= chunkData.length;
                        continue;
                    }

                    chunkData = chunkData.subarray(bytesToSkip);
                    bytesToSkip = 0;
                }

                if (chunkData.length === 0) {
                    continue;
                }

                madeProgress = true;

                let writtenTotal = 0;
                while (writtenTotal < chunkData.length) {
                    const bytesWritten = await storage.write(
                        chunkData.subarray(writtenTotal),
                        receivedBytes + writtenTotal,
                    );

                    if (
                        !Number.isFinite(bytesWritten) ||
                        bytesWritten <= 0
                    ) {
                        throw new Error("storage_write_no_progress");
                    }

                    writtenTotal += Math.min(
                        chunkData.length - writtenTotal,
                        bytesWritten,
                    );
                    markProgress();
                }

                receivedBytes += writtenTotal;
                bytesReceivedThisResponse += writtenTotal;
                retries = 0;
                reportProgress();
            }

            if (bytesToSkip > 0) {
                if (retries >= MAX_RETRIES) {
                    return error("queue.fetch.network_error");
                }
                retries++;
                rangeChunkBytes = clampChunkSize(Math.floor(rangeChunkBytes / 2), runtimeTuning.maxChunkBytes);
                await waitForRetry(controller.signal, getBackoffDelayMs(retries));
                continue;
            }

            const elapsedMs = Date.now() - requestStartedAt;
            rangeChunkBytes = tuneChunkSizeOnSuccess(
                rangeChunkBytes,
                bytesReceivedThisResponse,
                expectedChunkBytes,
                elapsedMs,
                runtimeTuning.fastChunkMs,
                runtimeTuning.slowChunkMs,
                runtimeTuning.maxChunkBytes,
            );

            if (expectedSizeReliable && expectedSize && receivedBytes >= expectedSize) {
                break;
            }

            if (expectedChunkBytes != null) {
                // A zero-byte chunk for a ranged request is typically transient
                // transport failure, not a valid end-of-file signal.
                if (bytesReceivedThisResponse === 0) {
                    if (retries >= MAX_RETRIES) {
                        return error("queue.fetch.network_error");
                    }
                    retries++;
                    rangeChunkBytes = clampChunkSize(Math.floor(rangeChunkBytes / 2), runtimeTuning.maxChunkBytes);
                    await waitForRetry(controller.signal, getBackoffDelayMs(retries));
                    continue;
                }

                // For chunked range mode without reliable total size,
                // a short chunk indicates we've reached the end.
                if (bytesReceivedThisResponse < expectedChunkBytes) {
                    if (!expectedSizeReliable) {
                        break;
                    }

                    if (retries >= MAX_RETRIES) {
                        return error("queue.fetch.network_error");
                    }

                    retries++;
                    rangeChunkBytes = clampChunkSize(Math.floor(rangeChunkBytes / 2), runtimeTuning.maxChunkBytes);
                    await waitForRetry(controller.signal, getBackoffDelayMs(retries));
                    continue;
                }
                continue;
            }

            if (!madeProgress) {
                if (retries >= MAX_RETRIES) {
                    return error("queue.fetch.network_error");
                }
                retries++;
                rangeChunkBytes = clampChunkSize(Math.floor(rangeChunkBytes / 2), runtimeTuning.maxChunkBytes);
                await waitForRetry(controller.signal, getBackoffDelayMs(retries));
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

        highestReportedProgress = 100;
        self.postMessage({
            cobaltFetchWorker: {
                progress: 100,
                size: receivedBytes,
            }
        });

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

        if (isStorageWriteError(e)) {
            return error("queue.fetch.corrupted_file");
        }

        console.error("error from the fetch worker:");
        console.error(e);
        return error("queue.fetch.crashed");
    }
}

self.onmessage = async (event: MessageEvent) => {
    if (event.data.cobaltFetchWorker) {
        await fetchFile(
            event.data.cobaltFetchWorker.url,
            event.data.cobaltFetchWorker.tuning,
        );
        self.close();
    }
}
