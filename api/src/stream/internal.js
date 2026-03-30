import { request } from "undici";
import { Readable } from "node:stream";
import { closeRequest, getHeaders, pipe } from "./shared.js";
import { handleHlsPlaylist, isHlsResponse, probeInternalHLSTunnel } from "./internal-hls.js";
import {
    classifyBilibiliStreamRoute,
    reportBilibiliRouteStreamEvent,
} from "../processing/services/bilibili-route-state.js";

const CHUNK_SIZE = BigInt(8e6); // 8 MB
const min = (a, b) => a < b ? a : b;

const serviceNeedsChunks = new Set(["youtube", "vk"]);
const transplantRetryableStatuses = new Set([
    401,
    403,
    404,
    408,
    410,
    412,
    416,
    429,
    500,
    502,
    503,
    504,
]);

const getTargetForLog = (rawUrl) => {
    try {
        const u = new URL(String(rawUrl));
        return `${u.protocol}//${u.host}${u.pathname}`;
    } catch {
        return "invalid";
    }
};

const parseRangeSpanBytes = (rangeHeader) => {
    if (!rangeHeader || typeof rangeHeader !== "string") return null;
    const match = /bytes=(\d+)-(\d+)/i.exec(rangeHeader);
    if (!match) return null;
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    return end - start + 1;
};

const toResponseHeaderValue = (value) => {
    if (Array.isArray(value)) return value[0];
    return value;
};

const normalizeCandidateUrls = (streamInfo) => {
    const unique = [];
    const push = (value) => {
        if (typeof value !== "string") return;
        const url = value.trim();
        if (!url || unique.includes(url)) return;
        unique.push(url);
    };

    push(streamInfo.url);
    if (Array.isArray(streamInfo.urlCandidates)) {
        for (const candidate of streamInfo.urlCandidates) {
            push(candidate);
        }
    }

    return unique;
};

const safeDestroyBody = (body) => {
    if (!body?.destroy) return;

    try {
        // undici BodyReadable may emit an `error` during destroy() (e.g. UND_ERR_ABORTED).
        // Ensure there's always at least one error listener before destroying, to avoid
        // process-level "Unhandled 'error' event" crashes.
        body.once("error", () => { });
        body.destroy();
    } catch {
        // ignore destroy failures
    }
};

async function* readChunks(streamInfo, size) {
    let read = 0n, chunksSinceTransplant = 0;    // console.log(`[readChunks] Starting chunk download - Total size: ${size}, URL: ${streamInfo.url}`);
    // console.log(`======> [readChunks] YouTube chunk download with authentication started`);

    while (read < size) {
        if (streamInfo.controller.signal.aborted) {
            // console.log(`[readChunks] Controller aborted at read=${read}/${size}`);
            throw new Error("controller aborted");
        }

        const rangeStart = read;
        const rangeEnd = read + CHUNK_SIZE;
        // console.log(`[readChunks] Requesting chunk: bytes=${rangeStart}-${rangeEnd}, read=${read}/${size}`);

        const headers = {
            ...getHeaders('youtube'),
            Range: `bytes=${read}-${read + CHUNK_SIZE}`
        };
        // console.log(`======> [readChunks] Chunk request using authenticated headers: ${!!headers.Cookie}`);

        const chunk = await request(streamInfo.url, {
            headers: {
                ...getHeaders(streamInfo.service),
                Range: `bytes=${read}-${read + CHUNK_SIZE}`
            },
            dispatcher: streamInfo.dispatcher,
            signal: streamInfo.controller.signal,
            maxRedirections: 4
        });

        // console.log(`[readChunks] Chunk response: status=${chunk.statusCode}, content-length=${chunk.headers['content-length']}`);
        // console.log(`======> [readChunks] Authenticated chunk request result: status=${chunk.statusCode}`);

        if (chunk.statusCode === 403 && chunksSinceTransplant >= 3 && streamInfo.originalRequest) {
            chunksSinceTransplant = 0;
            // console.log(`[readChunks] 403 error after 3+ chunks, attempting fresh YouTube API call`);
            // console.log(`======> [readChunks] 403 error detected, attempting fresh authenticated API call`);
            try {
                // Import YouTube service dynamically
                const handler = await import(`../processing/services/youtube.js`);
                // console.log(`[readChunks] Calling YouTube service for fresh URLs`);

                const response = await handler.default({
                    ...streamInfo.originalRequest,
                    dispatcher: streamInfo.dispatcher
                });

                /*
                console.log(`[readChunks] Fresh API response:`, {
                    hasUrls: !!response.urls,
                    urlsLength: response.urls ? [response.urls].flat().length : 0,
                    error: response.error,
                    type: response.type
                });
                console.log(`======> [readChunks] Fresh authenticated API call result:`, { hasUrls: !!response.urls, error: response.error });
                */

                if (response.urls) {
                    response.urls = [response.urls].flat();

                    // Update the URL for this stream based on audio/video selection
                    if (streamInfo.originalRequest.isAudioOnly && response.urls.length > 1) {
                        streamInfo.url = response.urls[1];
                        // console.log(`[readChunks] Updated to fresh audio URL`);
                    } else if (streamInfo.originalRequest.isAudioMuted) {
                        streamInfo.url = response.urls[0];
                        // console.log(`[readChunks] Updated to fresh video URL`);
                    } else {
                        // For video streams, use the first URL
                        streamInfo.url = response.urls[0];
                        // console.log(`[readChunks] Updated to fresh video URL`);
                    }

                    // console.log(`[readChunks] Fresh URL obtained, retrying chunk request`);
                    continue; // Retry with fresh URL
                } else {
                    // console.log(`[readChunks] Fresh API call failed, falling back to transplant`);
                    if (streamInfo.transplant) {
                        await streamInfo.transplant(streamInfo.dispatcher);
                        // console.log(`[readChunks] Transplant successful, retrying`);
                        continue;
                    }
                }
            } catch (error) {
                // console.log(`[readChunks] Fresh API call failed:`, error);
                // Fallback to transplant
                if (streamInfo.transplant) {
                    try {
                        await streamInfo.transplant(streamInfo.dispatcher);
                        // console.log(`[readChunks] Transplant successful, retrying`);
                        continue;
                    } catch (transplantError) {
                        console.log(`[readChunks] Both fresh API and transplant failed:`, transplantError);
                    }
                }
            }
        }

        chunksSinceTransplant++;

        const expected = min(CHUNK_SIZE, size - read);
        const received = BigInt(chunk.headers['content-length']);

        console.log(`[readChunks] Chunk validation: expected=${expected}, received=${received}, threshold=${expected / 2n}`);

        if (received < expected / 2n) {
            console.log(`[readChunks] CRITICAL: Received size (${received}) < expected/2 (${expected / 2n}), closing controller`);
            closeRequest(streamInfo.controller);
        }

        let chunkDataSize = 0;
        for await (const data of chunk.body) {
            chunkDataSize += data.length;
            yield data;
        }

        console.log(`[readChunks] Chunk processed: data size=${chunkDataSize}, header size=${received}, read progress=${read + received}/${size}`);
        read += received;
    }
    console.log(`[readChunks] Download completed: total read=${read}/${size}`);
}

async function handleChunkedStream(streamInfo, res) {
    const { signal } = streamInfo.controller;
    const cleanup = () => {
        console.log(`[handleYoutubeStream] Cleanup called`);
        res.end();
        closeRequest(streamInfo.controller);
    };

    console.log(`[handleYoutubeStream] Starting YouTube stream for URL: ${streamInfo.url}`);
    console.log(`======> [handleYoutubeStream] YouTube stream processing initiated with authentication`);

    try {
        let req, attempts = 3;
        console.log(`[handleYoutubeStream] Starting HEAD request with ${attempts} attempts`);
        console.log(`======> [handleYoutubeStream] Using authenticated headers for HEAD request`);

        while (attempts--) {
            const headers = getHeaders('youtube');
            console.log(`======> [handleYoutubeStream] HEAD request headers prepared with auth: ${!!headers.Cookie}`);

            req = await fetch(streamInfo.url, {
                headers: getHeaders(streamInfo.service),
                method: 'HEAD',
                dispatcher: streamInfo.dispatcher,
                signal
            });

            console.log(`[handleYoutubeStream] HEAD response: status=${req.status}, url=${req.url}`);
            console.log(`======> [handleYoutubeStream] Authenticated HEAD request completed: status=${req.status}`);

            streamInfo.url = req.url; if (req.status === 403 && streamInfo.originalRequest && attempts > 0) {
                console.log(`[handleYoutubeStream] Got 403, attempting fresh YouTube API call (attempts left: ${attempts})`);
                try {
                    // Import YouTube service dynamically
                    const handler = await import(`../processing/services/youtube.js`);
                    console.log(`[handleYoutubeStream] Calling YouTube service for fresh URLs`);

                    const response = await handler.default({
                        ...streamInfo.originalRequest,
                        dispatcher: streamInfo.dispatcher
                    });

                    console.log(`[handleYoutubeStream] Fresh API response:`, {
                        hasUrls: !!response.urls,
                        urlsLength: response.urls ? [response.urls].flat().length : 0,
                        error: response.error,
                        type: response.type
                    });

                    if (response.urls) {
                        response.urls = [response.urls].flat();

                        // Update the URL for this stream based on audio/video selection
                        if (streamInfo.originalRequest.isAudioOnly && response.urls.length > 1) {
                            streamInfo.url = response.urls[1];
                            console.log(`[handleYoutubeStream] Updated to fresh audio URL`);
                        } else if (streamInfo.originalRequest.isAudioMuted) {
                            streamInfo.url = response.urls[0];
                            console.log(`[handleYoutubeStream] Updated to fresh video URL`);
                        } else {
                            // For video streams, use the first URL
                            streamInfo.url = response.urls[0];
                            console.log(`[handleYoutubeStream] Updated to fresh video URL`);
                        }

                        console.log(`[handleYoutubeStream] Fresh URL obtained, retrying HEAD request`);
                        continue; // Retry with fresh URL
                    } else {
                        console.log(`[handleYoutubeStream] Fresh API call failed, falling back to transplant`);
                        if (streamInfo.transplant) {
                            await streamInfo.transplant(streamInfo.dispatcher);
                            // console.log(`[handleYoutubeStream] Transplant completed as fallback`);
                        }
                    }
                } catch (error) {
                    // console.log(`[handleYoutubeStream] Fresh API call failed:`, error);
                    // Fallback to transplant
                    if (streamInfo.transplant) {
                        try {
                            await streamInfo.transplant(streamInfo.dispatcher);
                            // console.log(`[handleYoutubeStream] Transplant completed as fallback`);
                        } catch (transplantError) {
                            // console.log(`[handleYoutubeStream] Both fresh API and transplant failed:`, transplantError);
                        }
                    }
                }
            } else break;
        }

        const size = BigInt(req.headers.get('content-length'));
        // console.log(`[handleYoutubeStream] Content length: ${size}, status: ${req.status}`);

        if (req.status !== 200 || !size) {
            // console.log(`[handleYoutubeStream] Invalid response - status: ${req.status}, size: ${size}, calling cleanup`);
            return cleanup();
        }

        // console.log(`[handleYoutubeStream] Creating generator for size: ${size}`);
        const generator = readChunks(streamInfo, size);

        const abortGenerator = () => {
            // console.log(`[handleYoutubeStream] Abort generator called`);
            generator.return();
            signal.removeEventListener('abort', abortGenerator);
        }

        signal.addEventListener('abort', abortGenerator);

        const stream = Readable.from(generator);
        // console.log(`[handleYoutubeStream] Created readable stream`);

        // Set response headers
        for (const headerName of ['content-type', 'content-length']) {
            const headerValue = req.headers.get(headerName);
            if (headerValue) {
                res.setHeader(headerName, headerValue);
                // console.log(`[handleYoutubeStream] Set header ${headerName}: ${headerValue}`);
            }
        }

        // console.log(`[handleYoutubeStream] Starting pipe operation`);
        pipe(stream, res, cleanup);
    } catch (error) {
        // console.log(`[handleYoutubeStream] Error occurred: ${error}`);
        cleanup();
    }
}

async function handleGenericStream(streamInfo, res) {
    const { signal } = streamInfo.controller;
    const internalId = streamInfo.internalTunnelId || "unknown";
    const startedAt = Date.now();
    const cleanup = () => res.end();
    const failWithStatus = (statusCode, reason, extra = "") => {
        if (!res.headersSent) {
            res.status(statusCode);
            res.setHeader("Cache-Control", "no-store");
        }
        console.warn(
            `[ITUNNEL] id=${internalId} service=${streamInfo.service} reason=${reason} status=${statusCode} elapsed_ms=${Date.now() - startedAt}${extra}`,
        );
        closeRequest(streamInfo.controller);
        cleanup();
    };
    const reportBilibiliStream = (route, event, elapsedMs, bytes) => {
        if (streamInfo.service !== "bilibili" || !route) return;
        reportBilibiliRouteStreamEvent({
            route,
            event,
            elapsedMs,
            bytes: bytes || 0,
        });
    };
    let candidateUrls =
        streamInfo.service === "bilibili"
            ? normalizeCandidateUrls(streamInfo)
            : [streamInfo.url];
    if (!candidateUrls.length) {
        candidateUrls = [streamInfo.url];
    }
    let candidateIndex = Math.max(0, candidateUrls.indexOf(streamInfo.url));
    if (candidateIndex >= candidateUrls.length) {
        candidateIndex = 0;
    }

    const refreshCandidateState = () => {
        const refreshed =
            streamInfo.service === "bilibili"
                ? normalizeCandidateUrls(streamInfo)
                : [streamInfo.url];
        candidateUrls = refreshed.length ? refreshed : [streamInfo.url];
        candidateIndex = Math.max(0, candidateUrls.indexOf(streamInfo.url));
        if (candidateIndex >= candidateUrls.length) {
            candidateIndex = 0;
        }
    };

    const switchToNextCandidate = (attempt, detail) => {
        if (candidateIndex + 1 >= candidateUrls.length) {
            return false;
        }

        candidateIndex += 1;
        streamInfo.url = candidateUrls[candidateIndex];
        console.warn(
            `[ITUNNEL] id=${internalId} service=${streamInfo.service} reason=candidate_retry attempt=${attempt} detail=${detail} next_target=${getTargetForLog(streamInfo.url)} candidate_index=${candidateIndex + 1}/${candidateUrls.length}`,
        );
        return true;
    };

    const baseAttempts = streamInfo.transplant ? 3 : 1;
    const maxAttempts = baseAttempts + Math.max(0, candidateUrls.length - 1);

    const rawHeaders = Object.fromEntries(streamInfo.headers || []);
    const rangeHeader = String(rawHeaders.range || rawHeaders.Range || "none");
    const requestedRange = rangeHeader !== "none";
    const requestedSpan = parseRangeSpanBytes(rangeHeader);

    console.log(
        `[ITUNNEL] id=${internalId} service=${streamInfo.service} reason=prepare target=${getTargetForLog(streamInfo.url)} range=${rangeHeader} requested_span=${requestedSpan ?? "n/a"} max_attempts=${maxAttempts} candidates=${candidateUrls.length}`,
    );

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const target = getTargetForLog(streamInfo.url);
        const attemptRoute =
            streamInfo.service === "bilibili"
                ? classifyBilibiliStreamRoute(streamInfo.url)
                : null;

        try {
            const requestStartedAt = Date.now();
            const fileResponse = await request(streamInfo.url, {
                headers: {
                    ...rawHeaders,
                    host: undefined
                },
                dispatcher: streamInfo.dispatcher,
                signal,
                maxRedirections: 16
            });

            const status = fileResponse.statusCode;
            const contentLengthHeader = toResponseHeaderValue(fileResponse.headers["content-length"]);
            const contentRangeHeader = toResponseHeaderValue(fileResponse.headers["content-range"]);
            const acceptRangesHeader = toResponseHeaderValue(fileResponse.headers["accept-ranges"]);
            const contentLengthNum = Number(contentLengthHeader);
            const elapsedMs = Date.now() - requestStartedAt;

            console.log(
                `[ITUNNEL] id=${internalId} service=${streamInfo.service} reason=response attempt=${attempt}/${maxAttempts} status=${status} elapsed_ms=${elapsedMs} range=${rangeHeader} content_length=${contentLengthHeader ?? "n/a"} content_range=${contentRangeHeader ?? "n/a"} accept_ranges=${acceptRangesHeader ?? "n/a"} target=${target}`,
            );

            if (requestedRange && status !== 206 && status !== 416) {
                console.warn(
                    `[ITUNNEL ANALYZE] id=${internalId} service=${streamInfo.service} reason=range_status_mismatch range=${rangeHeader} requested_span=${requestedSpan ?? "n/a"} status=${status} content_range=${contentRangeHeader ?? "none"} content_length=${contentLengthHeader ?? "n/a"} target=${target}`,
                );
            }

            if (status === 206 && !contentRangeHeader) {
                console.warn(
                    `[ITUNNEL ANALYZE] id=${internalId} service=${streamInfo.service} reason=missing_content_range range=${rangeHeader} content_length=${contentLengthHeader ?? "n/a"} target=${target}`,
                );
            }

            if (requestedRange && Number.isFinite(contentLengthNum) && contentLengthNum === 0) {
                console.warn(
                    `[ITUNNEL ANALYZE] id=${internalId} service=${streamInfo.service} reason=zero_length_range range=${rangeHeader} requested_span=${requestedSpan ?? "n/a"} status=${status} target=${target}`,
                );

                if (status === 200) {
                    safeDestroyBody(fileResponse.body);

                    return failWithStatus(
                        502,
                        "invalid_empty_range_response",
                        ` range=${rangeHeader} target=${target}`,
                    );
                }
            }

            const canRetryStatus =
                attempt < maxAttempts &&
                transplantRetryableStatuses.has(status);
            const canRetryWithCandidate =
                canRetryStatus &&
                streamInfo.service === "bilibili" &&
                switchToNextCandidate(attempt, `status_${status}`);

            if (canRetryWithCandidate) {
                safeDestroyBody(fileResponse.body);

                reportBilibiliStream(attemptRoute, "error", elapsedMs, 0);

                continue;
            }

            const canRetryWithTransplant =
                canRetryStatus &&
                !!streamInfo.transplant;

            if (canRetryWithTransplant) {
                safeDestroyBody(fileResponse.body);

                console.warn(
                    `[ITUNNEL] service=${streamInfo.service} reason=transplant_retry status=${status} attempt=${attempt}/${maxAttempts}`,
                );

                reportBilibiliStream(attemptRoute, "error", elapsedMs, 0);
                await streamInfo.transplant(streamInfo.dispatcher);
                refreshCandidateState();
                continue;
            }

            res.status(status);
            fileResponse.body.on('error', () => { });
            let bytesForwarded = 0;
            fileResponse.body.on("data", (chunk) => {
                if (chunk?.length) {
                    bytesForwarded += chunk.length;
                }
            });

            const isHls = isHlsResponse(fileResponse, streamInfo);

            for (const [name, value] of Object.entries(fileResponse.headers)) {
                if (!isHls || name.toLowerCase() !== 'content-length') {
                    res.setHeader(name, value);
                }
            }

            if (status < 200 || status > 299) {
                console.warn(
                    `[ITUNNEL] id=${internalId} service=${streamInfo.service} reason=non_2xx status=${status} elapsed_ms=${Date.now() - startedAt} target=${target}`,
                );
                reportBilibiliStream(
                    attemptRoute,
                    "error",
                    Date.now() - requestStartedAt,
                    0,
                );
                return cleanup();
            }

            if (isHls) {
                await handleHlsPlaylist(streamInfo, fileResponse, res);
            } else {
                let endLogged = false;
                const logEnd = (reason) => {
                    if (endLogged) return;
                    endLogged = true;
                    const totalElapsedMs = Math.max(1, Date.now() - startedAt);
                    const avgKbps = ((bytesForwarded * 8) / (totalElapsedMs / 1000) / 1024).toFixed(1);
                    console.log(
                        `[ITUNNEL] id=${internalId} service=${streamInfo.service} reason=${reason} status=${status} elapsed_ms=${totalElapsedMs} bytes_forwarded=${bytesForwarded} avg_kbps=${avgKbps} range=${rangeHeader} target=${target}`,
                    );

                    if (reason === "upstream_error") {
                        reportBilibiliStream(attemptRoute, "error", totalElapsedMs, bytesForwarded);
                    } else if (bytesForwarded > 0) {
                        reportBilibiliStream(attemptRoute, "success", totalElapsedMs, bytesForwarded);
                    }
                };

                res.once("finish", () => logEnd("finish"));
                res.once("close", () => logEnd("close"));
                fileResponse.body.once("end", () => logEnd("upstream_end"));
                fileResponse.body.once("close", () => logEnd("upstream_close"));
                fileResponse.body.once("error", () => logEnd("upstream_error"));
                pipe(fileResponse.body, res, cleanup);
            }
            return;
        } catch (error) {
            if (signal.aborted) {
                reportBilibiliStream(
                    attemptRoute,
                    "error",
                    Date.now() - startedAt,
                    0,
                );
                return failWithStatus(
                    502,
                    "aborted",
                    ` attempt=${attempt}/${maxAttempts} range=${rangeHeader} target=${target}`,
                );
            }

            const canRetryWithCandidate =
                attempt < maxAttempts &&
                streamInfo.service === "bilibili" &&
                switchToNextCandidate(attempt, "request_failed");

            if (canRetryWithCandidate) {
                reportBilibiliStream(
                    attemptRoute,
                    "error",
                    Date.now() - startedAt,
                    0,
                );
                continue;
            }

            const canRetryWithTransplant =
                !!streamInfo.transplant && attempt < maxAttempts;

            if (canRetryWithTransplant) {
                console.warn(
                    `[ITUNNEL] service=${streamInfo.service} reason=transplant_retry error=request_failed attempt=${attempt}/${maxAttempts}`,
                );

                try {
                    reportBilibiliStream(
                        attemptRoute,
                        "error",
                        Date.now() - startedAt,
                        0,
                    );
                    await streamInfo.transplant(streamInfo.dispatcher);
                    refreshCandidateState();
                    continue;
                } catch {
                    // if transplant also fails, fall through to cleanup
                }
            }

            console.warn(
                `[ITUNNEL] id=${internalId} service=${streamInfo.service} reason=error attempt=${attempt}/${maxAttempts} elapsed_ms=${Date.now() - startedAt} message=${error?.message || "unknown"} target=${target} range=${rangeHeader}`,
            );
            const message = String(error?.message || "").toLowerCase();
            const statusCode = message.includes("timeout") ? 504 : 502;
            reportBilibiliStream(
                attemptRoute,
                "error",
                Date.now() - startedAt,
                0,
            );
            return failWithStatus(
                statusCode,
                "request_failed",
                ` attempt=${attempt}/${maxAttempts} range=${rangeHeader} target=${target} message=${error?.message || "unknown"}`,
            );
        }
    }

    return failWithStatus(
        502,
        "max_attempts_exhausted",
        ` range=${rangeHeader} target=${getTargetForLog(streamInfo.url)}`,
    );
}

export function internalStream(streamInfo, res) {

    if (streamInfo.headers) {
        streamInfo.headers.delete('icy-metadata');
    }

    if (serviceNeedsChunks.has(streamInfo.service) && !streamInfo.isHLS) {
        return handleChunkedStream(streamInfo, res);
    }

    return handleGenericStream(streamInfo, res);
}

export async function probeInternalTunnel(streamInfo) {
    try {
        const signal = AbortSignal.timeout(3000);
        const headers = {
            ...Object.fromEntries(streamInfo.headers || []),
            ...getHeaders(streamInfo.service),
            host: undefined,
            range: undefined
        };

        if (streamInfo.isHLS) {
            return probeInternalHLSTunnel({
                ...streamInfo,
                signal,
                headers
            });
        }

        const response = await request(streamInfo.url, {
            method: 'HEAD',
            headers,
            dispatcher: streamInfo.dispatcher,
            signal,
            maxRedirections: 16
        });

        if (response.statusCode !== 200)
            throw "status is not 200 OK";

        const size = +response.headers['content-length'];
        if (isNaN(size))
            throw "content-length is not a number";

        return size;
    } catch { }
}
