import * as Storage from "$lib/storage";

const TOTAL_TIMEOUT_MS = 60 * 60 * 1000;
const STALL_TIMEOUT_MS = 90 * 1000;
const STALL_CHECK_INTERVAL_MS = 5000;

type HlsSegment = {
    url: string,
};

const isAbortError = (error: unknown) => (
    (typeof error === "object" && error && "name" in error && error.name === "AbortError") ||
    String(error).includes("AbortError")
);

const fetchText = async (url: string, signal: AbortSignal) => {
    const response = await fetch(url, {
        signal,
        referrerPolicy: "no-referrer",
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return {
        response,
        text: await response.text(),
    };
};

const fetchBinary = async (url: string, signal: AbortSignal) => {
    const response = await fetch(url, {
        signal,
        referrerPolicy: "no-referrer",
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return response;
};

const parseAttributeList = (line: string) => {
    const attributes: Record<string, string> = {};
    const regex = /([A-Z0-9-]+)=((?:"[^"]*")|[^,]*)/gi;
    let match = regex.exec(line);

    while (match) {
        attributes[match[1]] = match[2].replace(/^"|"$/g, "");
        match = regex.exec(line);
    }

    return attributes;
};

const resolveUrl = (value: string, baseUrl: string) => new URL(value, baseUrl).toString();

const parseMediaPlaylist = (playlistUrl: string, body: string) => {
    const lines = body
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const segments: HlsSegment[] = [];
    let initSegmentUrl: string | undefined;

    for (const line of lines) {
        if (line.startsWith("#EXT-X-KEY")) {
            throw new Error("unsupported_hls_encryption");
        }

        if (line.startsWith("#EXT-X-MAP:")) {
            const attributes = parseAttributeList(line.slice(line.indexOf(":") + 1));
            if (attributes.URI) {
                initSegmentUrl = resolveUrl(attributes.URI, playlistUrl);
            }
            continue;
        }

        if (line.startsWith("#")) {
            continue;
        }

        segments.push({
            url: resolveUrl(line, playlistUrl),
        });
    }

    return {
        initSegmentUrl,
        segments,
    };
};

const hlsFetch = async (url: string, mimeType?: string) => {
    self.postMessage({
        cobaltHlsFetchWorker: {
            started: true,
        },
    });

    const controller = new AbortController();
    const startedAt = Date.now();
    let lastProgressAt = startedAt;
    let stallInterval: ReturnType<typeof setInterval> | null = null;
    const totalTimeout = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);

    const stopTimers = () => {
        clearTimeout(totalTimeout);
        if (stallInterval) {
            clearInterval(stallInterval);
            stallInterval = null;
        }
    };

    const markProgress = () => {
        lastProgressAt = Date.now();
    };

    const startStallMonitor = () => {
        stallInterval = setInterval(() => {
            if (Date.now() - lastProgressAt > STALL_TIMEOUT_MS) {
                controller.abort();
            }
        }, STALL_CHECK_INTERVAL_MS);
    };

    const error = async (code: string, storage?: Awaited<ReturnType<typeof Storage.init>>) => {
        stopTimers();
        if (storage) {
            await storage.destroy().catch(() => undefined);
        }

        self.postMessage({
            cobaltHlsFetchWorker: {
                error: code,
            },
        });

        return self.close();
    };

    try {
        markProgress();
        startStallMonitor();

        const {
            response: playlistResponse,
            text: playlistBody,
        } = await fetchText(url, controller.signal);
        markProgress();

        const { initSegmentUrl, segments } = parseMediaPlaylist(
            playlistResponse.url || url,
            playlistBody,
        );

        if (!initSegmentUrl && segments.length === 0) {
            return error("queue.fetch.bad_response");
        }

        const allUrls = [
            ...(initSegmentUrl ? [initSegmentUrl] : []),
            ...segments.map((segment) => segment.url),
        ];

        const storage = await Storage.init();
        let offset = 0;
        let downloadedBytes = 0;
        const totalParts = allUrls.length;
        let detectedMimeType = mimeType || "";

        for (let index = 0; index < allUrls.length; index += 1) {
            const segmentResponse = await fetchBinary(allUrls[index], controller.signal);
            if (!detectedMimeType) {
                detectedMimeType = segmentResponse.headers.get("content-type") || "";
            }

            const buffer = new Uint8Array(await segmentResponse.arrayBuffer());
            markProgress();

            const written = await storage.write(buffer, offset);
            if (!Number.isFinite(written) || written <= 0) {
                return error("queue.fetch.network_error", storage);
            }

            offset += written;
            downloadedBytes += buffer.byteLength;

            self.postMessage({
                cobaltHlsFetchWorker: {
                    progress: Math.max(
                        0,
                        Math.min(100, Math.round(((index + 1) / totalParts) * 100)),
                    ),
                    size: downloadedBytes,
                },
            });
        }

        stopTimers();

        const result = Storage.retype(
            await storage.res(),
            detectedMimeType || mimeType || "video/mp4",
        );

        self.postMessage({
            cobaltHlsFetchWorker: {
                result,
            },
        });
    } catch (errorReason) {
        if (isAbortError(errorReason)) {
            return error("queue.fetch.timeout");
        }

        console.error("hls fetch worker failed:", errorReason);
        return error("queue.fetch.network_error");
    }
};

self.onmessage = async (event: MessageEvent) => {
    const payload = event.data?.cobaltHlsFetchWorker;
    if (payload?.url) {
        await hlsFetch(payload.url, payload.mimeType);
    }
};
