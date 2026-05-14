import { env } from "../../config.js";
import {
    hasUpstreams,
    markUpstreamFailure,
    markUpstreamSuccess,
    selectUpstreamNode,
} from "./pool.js";

const allowedPayloadKeys = new Set([
    "url",
    "audioBitrate",
    "audioFormat",
    "downloadMode",
    "filenameStyle",
    "youtubeVideoCodec",
    "youtubeVideoContainer",
    "videoQuality",
    "localProcessing",
    "batch",
    "youtubeDubLang",
    "subtitleLang",
    "disableMetadata",
    "allowH265",
    "convertGif",
    "tiktokFullAudio",
    "alwaysProxy",
    "youtubeHLS",
    "youtubeBetterAudio",
]);

const truncate = (value, max = 180) => {
    const text = String(value ?? "");
    return text.length > max ? `${text.slice(0, max)}...` : text;
};

const targetHostForLog = (payload) => {
    try {
        const raw = payload instanceof URL ? payload.toString() : payload?.url ?? payload;
        return new URL(String(raw)).hostname;
    } catch {
        return "unknown";
    }
};

const normalizeForwardIp = (value) => {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!trimmed) return "";
    return trimmed.split(",")[0].trim().replace(/^::ffff:/, "");
};

export const buildUpstreamDownloadBody = (input) => {
    if (input instanceof URL) {
        return { url: String(input) };
    }

    if (!input || typeof input !== "object") {
        return { url: String(input || "") };
    }

    const body = {};
    for (const [key, value] of Object.entries(input)) {
        if (!allowedPayloadKeys.has(key)) continue;
        if (value === undefined || value === null) continue;

        body[key] = key === "url" ? String(value) : value;
    }

    if (!body.url) {
        body.url = String(input.url || "");
    }

    return body;
};

const resolveTimeoutMs = (overrideMs) => {
    if (
        typeof overrideMs === "number" &&
        Number.isFinite(overrideMs) &&
        overrideMs > 0
    ) {
        return overrideMs;
    }

    return env.upstreamTimeoutMs || env.instagramUpstreamTimeoutMs || 12000;
};

const resolveMaxAttempts = (overrideAttempts) => {
    const value =
        typeof overrideAttempts === "number" && Number.isFinite(overrideAttempts)
            ? overrideAttempts
            : env.upstreamMaxAttempts;

    return Math.max(1, Math.floor(value || 1));
};

const errorReason = (error) => {
    if (!error) return "unknown";
    const code = error.code || error.name || error.cause?.code;
    const message = error.message || String(error);
    return truncate([code, message].filter(Boolean).join(":"));
};

const isFailoverStatus = (status) => status >= 500 || [502, 503, 504].includes(status);

const logResultStatus = (payload) => {
    if (!payload || typeof payload !== "object") return "?";
    return payload.status || payload.error?.code || "?";
};

const cnServiceTokens = new Set([
    "bilibili",
    "cctv",
    "douyin",
    "kuaishou",
    "xiaohongshu",
]);

const cnHostFragments = [
    "bilibili.com",
    "bilibili.tv",
    "cctv.com",
    "cntv.cn",
    "douyin.com",
    "iesdouyin.com",
    "kuaishou.com",
    "v.kuaishou.com",
    "xiaohongshu.com",
];

const globalHostFragments = [
    "facebook.com",
    "fb.watch",
    "instagram.com",
    "reddit.com",
    "tiktok.com",
    "twitter.com",
    "x.com",
    "youtube.com",
    "youtu.be",
];

const normalizeRouteToken = (value) =>
    String(value || "")
        .toLowerCase()
        .replace(/^www\./, "");

const includesAny = (value, fragments) =>
    fragments.some((fragment) => value === fragment || value.endsWith(`.${fragment}`));

const resolveRegionPlan = ({ service, targetHost, path }) => {
    const serviceToken = normalizeRouteToken(service);
    const hostToken = normalizeRouteToken(targetHost);
    const routeToken = `${serviceToken} ${hostToken} ${normalizeRouteToken(path)}`;

    if (
        cnServiceTokens.has(serviceToken) ||
        includesAny(hostToken, cnHostFragments) ||
        [...cnServiceTokens].some((token) => routeToken.includes(token))
    ) {
        return {
            name: "cn-first",
            groups: [["cn"], ["global"]],
        };
    }

    if (
        includesAny(hostToken, globalHostFragments) ||
        globalHostFragments.some((fragment) => routeToken.includes(fragment)) ||
        serviceToken === "generic" ||
        serviceToken === "social-instagram"
    ) {
        return {
            name: "global-only",
            groups: [["global"]],
        };
    }

    return {
        name: "global-default",
        groups: [["global"]],
    };
};

export const requestUpstream = async ({
    payload,
    requestClientIp,
    service = "upstream",
    path = "/",
    timeoutMs,
    maxAttempts,
    buildBody = buildUpstreamDownloadBody,
    headers: extraHeaders = {},
    acceptResponse,
    requireStatus = true,
} = {}) => {
    if (!hasUpstreams()) return null;

    const attempts = resolveMaxAttempts(maxAttempts);
    const excluded = new Set();
    const targetHost = targetHostForLog(payload);
    const regionPlan = resolveRegionPlan({ service, targetHost, path });
    let attemptNo = 0;
    let lastErrorResult = null;

    for (const regions of regionPlan.groups) {
        for (let groupAttempt = 1; groupAttempt <= attempts; groupAttempt++) {
            if (attemptNo >= attempts) break;

            const node = selectUpstreamNode(excluded, { regions });
            if (!node) break;

            attemptNo += 1;
            excluded.add(node.url);
            node.inFlight += 1;

            const endpoint = new URL(path, node.url);
            const effectiveTimeoutMs = resolveTimeoutMs(timeoutMs);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), effectiveTimeoutMs);
            const startedAt = Date.now();

            const headers = {
                Accept: "application/json",
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",
                ...extraHeaders,
            };

            if (env.upstreamApiKey) {
                headers.Authorization = `Api-Key ${env.upstreamApiKey}`;
            }

            const forwardedIp = normalizeForwardIp(requestClientIp || payload?.requestClientIp || "");
            if (forwardedIp) {
                headers["X-FSV-Client-IP"] = forwardedIp;
            }

            try {
                console.log(
                    `[UPSTREAM REQUEST] service=${service} policy=${regionPlan.name} regions=${regions.join("|")} attempt=${attemptNo} upstream=${node.origin} region=${node.region} target_host=${targetHost} timeout_ms=${effectiveTimeoutMs}`,
                );

                const response = await fetch(endpoint, {
                    method: "POST",
                    signal: controller.signal,
                    headers,
                    body: JSON.stringify(buildBody(payload)),
                });

                const body = await response.json().catch(() => null);
                const elapsedMs = Date.now() - startedAt;

                if (
                    !body ||
                    typeof body !== "object" ||
                    (requireStatus && typeof body.status !== "string")
                ) {
                    markUpstreamFailure(node, `invalid_json:http_${response.status}`);
                    console.warn(
                        `[UPSTREAM FAILOVER] service=${service} upstream=${node.origin} region=${node.region} reason=invalid_json http=${response.status} elapsed_ms=${elapsedMs}`,
                    );
                    continue;
                }

                if (!response.ok) {
                    if (isFailoverStatus(response.status)) {
                        markUpstreamFailure(node, `http_${response.status}`);
                        continue;
                    }
                    return null;
                }

                markUpstreamSuccess(node, elapsedMs);
                console.log(
                    `[UPSTREAM RESULT] service=${service} upstream=${node.origin} region=${node.region} http=${response.status} status=${logResultStatus(body)} elapsed_ms=${elapsedMs}`,
                );

                if (acceptResponse && !acceptResponse({ response, body, node })) {
                    console.warn(
                        `[UPSTREAM FAILOVER] service=${service} upstream=${node.origin} region=${node.region} reason=response_not_accepted status=${logResultStatus(body)} elapsed_ms=${elapsedMs}`,
                    );
                    continue;
                }

                if (requireStatus && body.status === "error") {
                    lastErrorResult = {
                        status: response.status,
                        body,
                        upstreamOrigin: node.origin,
                        upstreamUrl: node.url,
                    };
                    console.warn(
                        `[UPSTREAM FAILOVER] service=${service} upstream=${node.origin} region=${node.region} reason=body_error status=${logResultStatus(body)} elapsed_ms=${elapsedMs}`,
                    );
                    continue;
                }

                return {
                    status: response.status,
                    body,
                    upstreamOrigin: node.origin,
                    upstreamUrl: node.url,
                };
            } catch (error) {
                const elapsedMs = Date.now() - startedAt;
                const reason = errorReason(error);
                markUpstreamFailure(node, reason);
                console.warn(
                    `[UPSTREAM FAILOVER] service=${service} upstream=${node.origin} region=${node.region} reason=${reason} elapsed_ms=${elapsedMs}`,
                );
            } finally {
                clearTimeout(timeout);
                node.inFlight = Math.max(0, node.inFlight - 1);
            }
        }
    }

    return lastErrorResult;
};
