import { Agent, request } from "undici";
import { create as contentDisposition } from "content-disposition-header";

import { destroyInternalStream } from "./manage.js";
import { getHeaders, closeRequest, closeResponse, pipe } from "./shared.js";

const defaultAgent = new Agent();
const BILIBILI_HEADERS_TIMEOUT_MS = 30_000;
const BILIBILI_BODY_TIMEOUT_MS = 120_000;
const BILIBILI_IDLE_TIMEOUT_MS = 45_000;
const BILIBILI_MIN_REQUEST_TIMEOUT_MS = 60_000;
const BILIBILI_MAX_REQUEST_TIMEOUT_MS = 240_000;
const BILIBILI_MIN_BYTES_PER_SECOND = 40 * 1024;

const shouldApplyBilibiliFastFail = (streamInfo) => {
    if (streamInfo.service !== "bilibili") return false;

    try {
        const target = new URL(streamInfo.urls);
        // If current hop already goes through an upstream tunnel endpoint,
        // avoid stacking aggressive timers on top of upstream-side retries.
        if (target.pathname === "/tunnel") {
            return false;
        }
    } catch {
        // Fallback to applying safeguards when URL parsing fails.
    }

    return true;
};

const estimateBilibiliMaxRequestMs = (contentLengthHeader) => {
    const bytes = Number(contentLengthHeader);
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return BILIBILI_MAX_REQUEST_TIMEOUT_MS;
    }

    const estimatedMs = Math.floor((bytes / BILIBILI_MIN_BYTES_PER_SECOND) * 1000);
    return Math.max(
        BILIBILI_MIN_REQUEST_TIMEOUT_MS,
        Math.min(BILIBILI_MAX_REQUEST_TIMEOUT_MS, estimatedMs),
    );
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

const getRouteInfo = (rawUrl) => {
    try {
        const target = new URL(String(rawUrl));
        const isTunnelTarget = target.pathname === "/tunnel";
        return {
            host: target.host || "n/a",
            path: target.pathname || "/",
            protocol: target.protocol || "n/a",
            isTunnelTarget,
            route: isTunnelTarget ? "api->upstream->origin" : "api->origin",
        };
    } catch {
        return {
            host: "invalid",
            path: "invalid",
            protocol: "invalid",
            isTunnelTarget: false,
            route: "api->origin",
        };
    }
};

export default async function (streamInfo, res) {
    const shouldFastFailBilibili = shouldApplyBilibiliFastFail(streamInfo);
    const abortController = new AbortController();
    const startedAt = Date.now();
    const routeInfo = getRouteInfo(streamInfo.urls);
    const tunnelId = streamInfo.tunnelId || "unknown";
    const rangeHeader = streamInfo.range || "none";
    const requestedRangeSpanBytes = parseRangeSpanBytes(streamInfo.range);
    let upstreamStatusCode;
    let upstreamContentLength;
    let upstreamContentRange;
    let upstreamAcceptRanges;
    let bytesForwarded = 0;
    let idleTimer;
    let maxRequestTimer;
    let endLogged = false;
    const logEnd = (reason, extra = "") => {
        if (endLogged) return;
        endLogged = true;
        const elapsedMs = Math.max(1, Date.now() - startedAt);
        const avgKbps = ((bytesForwarded * 8) / (elapsedMs / 1000) / 1024).toFixed(1);
        const range = streamInfo.range ? ` range=${streamInfo.range}` : "";
        const upstream =
            upstreamStatusCode || upstreamContentLength
                ? ` upstream_status=${upstreamStatusCode ?? "n/a"} upstream_len=${upstreamContentLength ?? "n/a"} upstream_range=${upstreamContentRange ?? "n/a"} upstream_accept_ranges=${upstreamAcceptRanges ?? "n/a"}`
                : "";
        console.log(
            `[TUNNEL] id=${tunnelId} service=${streamInfo.service} type=proxy reason=${reason} status=${res.statusCode ?? "n/a"} elapsed_ms=${elapsedMs} bytes_forwarded=${bytesForwarded} avg_kbps=${avgKbps}${range}${upstream}${extra}`,
        );
    };

    const clearBilibiliTimers = () => {
        if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = undefined;
        }
        if (maxRequestTimer) {
            clearTimeout(maxRequestTimer);
            maxRequestTimer = undefined;
        }
    };

    const setupBilibiliTimers = (stream) => {
        if (!shouldFastFailBilibili) return;

        const restartIdleTimer = () => {
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                console.warn(
                    `[TUNNEL] id=${tunnelId} service=bilibili type=proxy reason=upstream_idle_timeout elapsed_ms=${Date.now() - startedAt} range=${rangeHeader}`,
                );
                closeRequest(abortController);
            }, BILIBILI_IDLE_TIMEOUT_MS);
        };

        const maxRequestMs = estimateBilibiliMaxRequestMs(upstreamContentLength);
        maxRequestTimer = setTimeout(() => {
            console.warn(
                `[TUNNEL] id=${tunnelId} service=bilibili type=proxy reason=upstream_request_timeout elapsed_ms=${Date.now() - startedAt} limit_ms=${maxRequestMs} range=${rangeHeader} route=${routeInfo.route}`,
            );
            closeRequest(abortController);
        }, maxRequestMs);

        stream.on("data", restartIdleTimer);
        stream.once("end", clearBilibiliTimers);
        stream.once("close", clearBilibiliTimers);
        stream.once("error", clearBilibiliTimers);

        restartIdleTimer();
    };

    const shutdown = () => (
        clearBilibiliTimers(),
        logEnd("shutdown"),
        closeRequest(abortController),
        closeResponse(res),
        destroyInternalStream(streamInfo.urls)
    );

    try {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Content-disposition', contentDisposition(streamInfo.filename));

        const { body: stream, headers, statusCode } = await request(streamInfo.urls, {
            headers: {
                ...getHeaders(streamInfo.service),
                ...(streamInfo.headers || {}),
                Range: streamInfo.range
            },
            signal: abortController.signal,
            maxRedirections: 16,
            dispatcher: defaultAgent,
            ...(shouldFastFailBilibili
                ? {
                    headersTimeout: BILIBILI_HEADERS_TIMEOUT_MS,
                    bodyTimeout: BILIBILI_BODY_TIMEOUT_MS,
                }
                : {}),
        });

        upstreamStatusCode = statusCode;
        upstreamContentLength = headers["content-length"];
        upstreamContentRange = headers["content-range"];
        upstreamAcceptRanges = headers["accept-ranges"];
        res.status(statusCode);

        for (const headerName of ['accept-ranges', 'content-type', 'content-length', 'content-range']) {
            if (headers[headerName]) {
                res.setHeader(headerName, headers[headerName]);
            }
        }

        const requestedRange = typeof streamInfo.range === "string" && streamInfo.range.length > 0;
        if (requestedRange && statusCode !== 206 && statusCode !== 416) {
            console.warn(
                `[TUNNEL ANALYZE] id=${tunnelId} service=${streamInfo.service} reason=range_status_mismatch requested_range=${rangeHeader} upstream_status=${statusCode} upstream_content_range=${upstreamContentRange ?? "none"} upstream_len=${upstreamContentLength ?? "n/a"} route=${routeInfo.route}`,
            );
        }

        if (statusCode === 206 && !upstreamContentRange) {
            console.warn(
                `[TUNNEL ANALYZE] id=${tunnelId} service=${streamInfo.service} reason=missing_content_range requested_range=${rangeHeader} upstream_status=206 upstream_len=${upstreamContentLength ?? "n/a"} route=${routeInfo.route}`,
            );
        }

        const upstreamLenNum = Number(upstreamContentLength);
        if (requestedRange && Number.isFinite(upstreamLenNum) && upstreamLenNum === 0) {
            console.warn(
                `[TUNNEL ANALYZE] id=${tunnelId} service=${streamInfo.service} reason=zero_length_range requested_range=${rangeHeader} requested_span=${requestedRangeSpanBytes ?? "n/a"} upstream_status=${statusCode} route=${routeInfo.route}`,
            );
        }

        res.once("finish", () => logEnd("finish"));
        res.once("close", () => logEnd("close"));
        stream.on("data", (chunk) => {
            if (chunk?.length) {
                bytesForwarded += chunk.length;
            }
        });
        stream.once("end", () => {
            console.log(
                `[TUNNEL] id=${tunnelId} service=${streamInfo.service} type=proxy reason=upstream_end elapsed_ms=${Date.now() - startedAt}`,
            );
        });
        stream.once("close", () => {
            console.log(
                `[TUNNEL] id=${tunnelId} service=${streamInfo.service} type=proxy reason=upstream_close elapsed_ms=${Date.now() - startedAt}`,
            );
        });
        stream.once("error", (error) => {
            console.warn(
                `[TUNNEL] id=${tunnelId} service=${streamInfo.service} type=proxy reason=upstream_error elapsed_ms=${Date.now() - startedAt} message=${error?.message ?? "unknown"}`,
            );
        });

        setupBilibiliTimers(stream);

        console.log(
            `[TUNNEL ROUTE] id=${tunnelId} service=${streamInfo.service} type=proxy route=${routeInfo.route} target=${routeInfo.protocol}//${routeInfo.host}${routeInfo.path} nested_tunnel=${routeInfo.isTunnelTarget} range=${rangeHeader}`,
        );
        console.log(
            `[TUNNEL] id=${tunnelId} service=${streamInfo.service} type=proxy reason=start status=${statusCode} range=${rangeHeader} requested_span=${requestedRangeSpanBytes ?? "n/a"} upstream_len=${upstreamContentLength ?? "n/a"} upstream_content_range=${upstreamContentRange ?? "n/a"} route=${routeInfo.route}`,
        );
        pipe(stream, res, shutdown);
    } catch (error) {
        console.warn(
            `[TUNNEL] id=${tunnelId} service=${streamInfo.service} type=proxy reason=error elapsed_ms=${Date.now() - startedAt} message=${error?.message ?? "unknown"} route=${routeInfo.route} range=${rangeHeader}`,
        );
        shutdown();
    }
}
