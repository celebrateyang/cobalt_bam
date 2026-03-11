import { Agent, request } from "undici";
import { create as contentDisposition } from "content-disposition-header";

import { destroyInternalStream } from "./manage.js";
import { getHeaders, closeRequest, closeResponse, pipe } from "./shared.js";

const defaultAgent = new Agent();
const BILIBILI_HEADERS_TIMEOUT_MS = 15_000;
const BILIBILI_BODY_TIMEOUT_MS = 45_000;
const BILIBILI_IDLE_TIMEOUT_MS = 6_000;
const BILIBILI_MIN_REQUEST_TIMEOUT_MS = 7_000;
const BILIBILI_MAX_REQUEST_TIMEOUT_MS = 25_000;
const BILIBILI_MIN_BYTES_PER_SECOND = 350 * 1024;

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

export default async function (streamInfo, res) {
    const abortController = new AbortController();
    const startedAt = Date.now();
    let upstreamStatusCode;
    let upstreamContentLength;
    let idleTimer;
    let maxRequestTimer;
    let endLogged = false;
    const logEnd = (reason, extra = "") => {
        if (endLogged) return;
        endLogged = true;
        const range = streamInfo.range ? ` range=${streamInfo.range}` : "";
        const upstream =
            upstreamStatusCode || upstreamContentLength
                ? ` upstream_status=${upstreamStatusCode ?? "n/a"} upstream_len=${upstreamContentLength ?? "n/a"}`
                : "";
        console.log(
            `[TUNNEL] service=${streamInfo.service} type=proxy reason=${reason} status=${res.statusCode ?? "n/a"} elapsed_ms=${Date.now() - startedAt}${range}${upstream}${extra}`,
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
        if (streamInfo.service !== "bilibili") return;

        const restartIdleTimer = () => {
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                console.warn(
                    `[TUNNEL] service=bilibili type=proxy reason=upstream_idle_timeout elapsed_ms=${Date.now() - startedAt}`,
                );
                closeRequest(abortController);
            }, BILIBILI_IDLE_TIMEOUT_MS);
        };

        const maxRequestMs = estimateBilibiliMaxRequestMs(upstreamContentLength);
        maxRequestTimer = setTimeout(() => {
            console.warn(
                `[TUNNEL] service=bilibili type=proxy reason=upstream_request_timeout elapsed_ms=${Date.now() - startedAt} limit_ms=${maxRequestMs}`,
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
            ...(streamInfo.service === "bilibili"
                ? {
                    headersTimeout: BILIBILI_HEADERS_TIMEOUT_MS,
                    bodyTimeout: BILIBILI_BODY_TIMEOUT_MS,
                }
                : {}),
        });

        upstreamStatusCode = statusCode;
        upstreamContentLength = headers["content-length"];
        res.status(statusCode);

        for (const headerName of ['accept-ranges', 'content-type', 'content-length', 'content-range']) {
            if (headers[headerName]) {
                res.setHeader(headerName, headers[headerName]);
            }
        }

        res.once("finish", () => logEnd("finish"));
        res.once("close", () => logEnd("close"));
        stream.once("end", () => {
            console.log(
                `[TUNNEL] service=${streamInfo.service} type=proxy reason=upstream_end elapsed_ms=${Date.now() - startedAt}`,
            );
        });
        stream.once("close", () => {
            console.log(
                `[TUNNEL] service=${streamInfo.service} type=proxy reason=upstream_close elapsed_ms=${Date.now() - startedAt}`,
            );
        });
        stream.once("error", (error) => {
            console.warn(
                `[TUNNEL] service=${streamInfo.service} type=proxy reason=upstream_error elapsed_ms=${Date.now() - startedAt} message=${error?.message ?? "unknown"}`,
            );
        });

        setupBilibiliTimers(stream);

        console.log(
            `[TUNNEL] service=${streamInfo.service} type=proxy reason=start status=${statusCode} range=${streamInfo.range ?? "none"} upstream_len=${upstreamContentLength ?? "n/a"}`,
        );
        pipe(stream, res, shutdown);
    } catch (error) {
        console.warn(
            `[TUNNEL] service=${streamInfo.service} type=proxy reason=error elapsed_ms=${Date.now() - startedAt} message=${error?.message ?? "unknown"}`,
        );
        shutdown();
    }
}
