import { Agent, request } from "undici";
import { create as contentDisposition } from "content-disposition-header";

import { destroyInternalStream } from "./manage.js";
import { getHeaders, closeRequest, closeResponse, pipe } from "./shared.js";

const defaultAgent = new Agent();

export default async function (streamInfo, res) {
    const abortController = new AbortController();
    const startedAt = Date.now();
    let upstreamStatusCode;
    let upstreamContentLength;
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
    const shutdown = () => (
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
        });

        upstreamStatusCode = statusCode;
        upstreamContentLength = headers["content-length"];
        res.status(statusCode);

        for (const headerName of ['accept-ranges', 'content-type', 'content-length']) {
            if (headers[headerName]) {
                res.setHeader(headerName, headers[headerName]);
            }
        }

        res.once("finish", () => logEnd("finish"));
        res.once("close", () => logEnd("close"));
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
