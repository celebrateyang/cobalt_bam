import stream from "../stream/stream.js";
import { getInternalTunnel } from "../stream/manage.js";
import { setTunnelPort } from "../config.js";
import { Green } from "../misc/console-text.js";
import express from "express";

const getTargetForLog = (rawUrl) => {
    try {
        const u = new URL(String(rawUrl));
        return `${u.protocol}//${u.host}${u.pathname}`;
    } catch {
        return "invalid";
    }
};

const forbiddenForwardHeaders = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "proxy-connection",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "host",
]);

const mergeHeadersCaseInsensitive = (existingHeaders, incomingHeaders) => {
    const merged = new Map();

    const setHeader = (key, value) => {
        if (!key || value === undefined || value === null) {
            return;
        }

        const headerName = String(key).toLowerCase();
        if (!headerName) {
            return;
        }
        if (forbiddenForwardHeaders.has(headerName) || headerName.startsWith(":")) {
            return;
        }

        if (Array.isArray(value)) {
            const items = value
                .map((entry) => (entry === undefined || entry === null ? "" : String(entry).trim()))
                .filter(Boolean);

            if (!items.length) {
                return;
            }

            merged.set(headerName, items.join(", "));
            return;
        }

        const headerValue = String(value).trim();
        if (!headerValue) {
            return;
        }

        merged.set(headerName, headerValue);
    };

    for (const [key, value] of existingHeaders || []) {
        setHeader(key, value);
    }

    for (const [key, value] of Object.entries(incomingHeaders || {})) {
        setHeader(key, value);
    }

    return merged;
};

const validateTunnel = (req, res) => {
    if (!req.ip.endsWith('127.0.0.1')) {
        res.sendStatus(403);
        return;
    }

    if (String(req.query.id).length !== 21) {
        res.sendStatus(400);
        return;
    }

    const streamInfo = getInternalTunnel(req.query.id);
    if (!streamInfo) {
        res.sendStatus(404);
        return;
    }

    return streamInfo;
}

const streamTunnel = (req, res) => {
    const streamInfo = validateTunnel(req, res);
    if (!streamInfo) {
        return;
    }
    const tunnelId = String(req.query.id);

    streamInfo.headers = mergeHeadersCaseInsensitive(streamInfo.headers, req.headers);
    streamInfo.internalTunnelId = tunnelId;

    console.log(
        `[ITUNNEL OPEN] id=${tunnelId} service=${streamInfo.service} range=${req.headers["range"] || "none"} target=${getTargetForLog(streamInfo.url)}`,
    );

    return stream(res, { type: 'internal', data: streamInfo });
}

export const setupTunnelHandler = () => {
    const tunnelHandler = express();

    tunnelHandler.get('/itunnel', streamTunnel);

    // fallback
    tunnelHandler.use((_, res) => res.sendStatus(400));
    // error handler
    tunnelHandler.use((_, __, res, ____) => res.socket.end());


    const server = tunnelHandler.listen({
        port: 0,
        host: '127.0.0.1',
        exclusive: true
    }, () => {
        const { port } = server.address();
        console.log(`${Green('[✓]')} internal tunnel handler running on 127.0.0.1:${port}`);
        setTunnelPort(port);
    });
}
