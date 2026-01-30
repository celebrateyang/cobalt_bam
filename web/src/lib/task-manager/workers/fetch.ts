import * as Storage from "$lib/storage";

const networkErrors = [
    "TypeError: Failed to fetch",
    "TypeError: network error",
];

const TOTAL_TIMEOUT_MS = 15 * 60 * 1000;
const STALL_TIMEOUT_MS = 60 * 1000;
const STALL_CHECK_INTERVAL_MS = 5000;

let attempts = 0;

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

    const error = async (code: string, retry: boolean = true) => {
        stopTimers();
        if (storage) {
            await storage.destroy().catch(() => undefined);
        }
        attempts++;

        // try 3 more times before actually failing
        if (retry && attempts <= 3) {
            await fetchFile(url);
        } else {
            self.postMessage({
                cobaltFetchWorker: {
                    error: code,
                }
            });
            return self.close();
        }
    };

    try {
        const response = await fetch(url, { signal: controller.signal });

        if (!response.ok) {
            return error("queue.fetch.bad_response");
        }

        const contentType = response.headers.get('Content-Type')
            || 'application/octet-stream';

        const contentLength = response.headers.get('Content-Length');
        const estimatedLength = response.headers.get('Estimated-Content-Length');

        let expectedSize;

        if (contentLength) {
            expectedSize = +contentLength;
        } else if (estimatedLength) {
            expectedSize = +estimatedLength;
        }

        const reader = response.body?.getReader();
        storage = await Storage.init(expectedSize);

        if (!reader) {
            return error("queue.fetch.no_file_reader");
        }

        let receivedBytes = 0;
        markProgress();
        startStallMonitor();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            await storage.write(value, receivedBytes);
            receivedBytes += value.length;
            markProgress();

            if (expectedSize) {
                self.postMessage({
                    cobaltFetchWorker: {
                        progress: Math.round((receivedBytes / expectedSize) * 100),
                        size: receivedBytes,
                    }
                });
            }
        }

        if (receivedBytes === 0) {
            return error("queue.fetch.empty_tunnel");
        }

        stopTimers();
        const file = Storage.retype(await storage.res(), contentType);

        if (contentLength && Number(contentLength) !== file.size) {
            return error("queue.fetch.corrupted_file", false);
        }

        self.postMessage({
            cobaltFetchWorker: {
                result: file
            }
        });
    } catch (e) {
        stopTimers();
        const isAbort =
            (typeof e === "object" && e && "name" in e && e.name === "AbortError") ||
            String(e).includes("AbortError");
        if (isAbort) {
            return error(
                abortReason === "stalled"
                    ? "queue.fetch.stalled"
                    : "queue.fetch.timeout"
            );
        }
        // retry several times if the error is network-related
        if (networkErrors.includes(String(e))) {
            return error("queue.fetch.network_error");
        }
        console.error("error from the fetch worker:");
        console.error(e);
        return error("queue.fetch.crashed", false);
    }
}

self.onmessage = async (event: MessageEvent) => {
    if (event.data.cobaltFetchWorker) {
        await fetchFile(event.data.cobaltFetchWorker.url);
        self.close();
    }
}
