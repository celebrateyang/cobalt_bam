import * as Storage from "$lib/storage";

const TOTAL_TIMEOUT_MS = 15 * 60 * 1000;
const STALL_TIMEOUT_MS = 90 * 1000;
const STALL_CHECK_INTERVAL_MS = 5000;
const MAX_RETRIES = 6;
const RANGE_CHUNK_BYTES = 8 * 1024 * 1024;

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
        let largestExpectedSize = 0;
        let highestReportedProgress = 0;
        let contentType = "application/octet-stream";

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
                    receivedBytes + RANGE_CHUNK_BYTES - 1,
                );
                headers.Range = `bytes=${receivedBytes}-${requestedRangeEnd}`;
            } else if (receivedBytes > 0) {
                requestedRangeEnd = receivedBytes + RANGE_CHUNK_BYTES - 1;
                headers.Range = `bytes=${receivedBytes}-${requestedRangeEnd}`;
            } else {
                // Start with a bounded range to avoid one fragile long-lived connection.
                requestedRangeEnd = RANGE_CHUNK_BYTES - 1;
                headers.Range = `bytes=0-${requestedRangeEnd}`;
            }

            const expectedChunkBytes =
                requestedRangeEnd != null
                    ? requestedRangeEnd - rangeStart + 1
                    : undefined;

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
            const partialResponse = response.status === 206;
            let bytesToSkip = 0;

            if (!response.ok && !partialResponse) {
                if (resumedRequest && retries < MAX_RETRIES && response.status >= 500) {
                    retries++;
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
                await storage.write(chunkData, receivedBytes);
                receivedBytes += chunkData.length;
                bytesReceivedThisResponse += chunkData.length;
                retries = 0;
                reportProgress();
            }

            if (bytesToSkip > 0) {
                if (retries >= MAX_RETRIES) {
                    return error("queue.fetch.network_error");
                }
                retries++;
                continue;
            }

            if (expectedSizeReliable && expectedSize && receivedBytes >= expectedSize) {
                break;
            }

            if (expectedChunkBytes != null) {
                // For chunked range mode without reliable total size,
                // a short chunk indicates we've reached the end.
                if (bytesReceivedThisResponse < expectedChunkBytes) {
                    break;
                }
                continue;
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
