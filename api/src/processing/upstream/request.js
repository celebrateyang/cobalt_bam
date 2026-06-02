import { randomUUID } from "node:crypto";

import { env } from "../../config.js";
import {
    getUpstreamNodes,
    hasUpstreams,
    isSelfOrigin,
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

const resolveBodyTimeoutMs = (overrideMs) => {
    if (
        typeof overrideMs === "number" &&
        Number.isFinite(overrideMs) &&
        overrideMs > 0
    ) {
        return overrideMs;
    }

    return env.upstreamBodyTimeoutMs || 5000;
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

const classifyFetchError = (error, phase) => {
    const reason = errorReason(error);
    const name = String(error?.name || "");
    const code = String(error?.code || error?.cause?.code || "");
    const message = String(error?.message || error || "");

    if (
        name === "AbortError" ||
        code === "ABORT_ERR" ||
        message.toLowerCase().includes("aborted")
    ) {
        return {
            code: phase === "body" ? "upstream.incomplete" : "upstream.timeout",
            reason,
            retryable: false,
        };
    }

    return {
        code: "upstream.network",
        reason,
        retryable: true,
    };
};

const parseTimingHeaderMs = (response, name) => {
    const raw = response.headers.get(name);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
};

const calculateTunnelMs = (totalMs, upstreamAppMs) => {
    if (!Number.isFinite(upstreamAppMs)) return null;
    return Math.max(0, totalMs - upstreamAppMs);
};

const summarizeSelectionBlockers = (excluded, regions) => {
    const now = Date.now();
    const allowedRegions = Array.isArray(regions) && regions.length > 0
        ? new Set(regions)
        : null;
    const candidates = getUpstreamNodes().filter(
        (node) =>
            !excluded.has(node.url) &&
            !isSelfOrigin(node.origin) &&
            (!allowedRegions || allowedRegions.has(node.region)),
    );
    const circuitOpenNodes = candidates.filter((node) => node.circuitOpenUntil > now);
    const retryAt = circuitOpenNodes
        .map((node) => node.circuitOpenUntil)
        .filter((value) => Number.isFinite(value) && value > now)
        .sort((a, b) => a - b)[0];

    return {
        total: candidates.length,
        circuitOpen: circuitOpenNodes.length,
        retryAfterSeconds: retryAt ? Math.max(1, Math.ceil((retryAt - now) / 1000)) : 60,
    };
};

const createFailureResponse = ({ code, service, reason, retryAfterSeconds }) => ({
    status: 503,
    body: {
        status: "error",
        service,
        error: {
            code: `error.api.${code}`,
            context: {
                service,
                retryAfterSeconds,
                reason,
            },
        },
    },
    upstreamFailure: {
        code,
        reason,
        retryAfterSeconds,
    },
});

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
    bodyTimeoutMs,
    maxAttempts,
    buildBody = buildUpstreamDownloadBody,
    headers: extraHeaders = {},
    acceptResponse,
    requireStatus = true,
    returnFailureResponse = false,
} = {}) => {
    const traceId = String(payload?.traceId || randomUUID()).slice(0, 128);
    if (!hasUpstreams()) {
        console.warn(
            `[UPSTREAM BLOCKED] trace_id=${traceId} event=upstream.unavailable reason=no_upstreams_configured`,
        );
        return returnFailureResponse
            ? createFailureResponse({
                code: "upstream.unavailable",
                service,
                reason: "no_upstreams_configured",
                retryAfterSeconds: 60,
            })
            : null;
    }

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
            if (!node) {
                const blockers = summarizeSelectionBlockers(excluded, regions);
                if (!lastErrorResult && blockers.circuitOpen > 0) {
                    lastErrorResult = createFailureResponse({
                        code: "upstream.circuit_open",
                        service,
                        reason: "circuit_open",
                        retryAfterSeconds: blockers.retryAfterSeconds,
                    });
                    console.warn(
                        `[UPSTREAM BLOCKED] trace_id=${traceId} event=upstream.circuit_open service=${service} regions=${regions.join("|")} circuit_open=${blockers.circuitOpen} retry_after_seconds=${blockers.retryAfterSeconds}`,
                    );
                }
                break;
            }

            attemptNo += 1;
            excluded.add(node.url);
            node.inFlight += 1;

            const endpoint = new URL(path, node.url);
            const effectiveTimeoutMs = resolveTimeoutMs(timeoutMs);
            const effectiveBodyTimeoutMs = resolveBodyTimeoutMs(bodyTimeoutMs);
            const controller = new AbortController();
            let phase = "headers";
            let timeout = setTimeout(() => controller.abort(), effectiveTimeoutMs);
            const startedAt = Date.now();

            const headers = {
                Accept: "application/json",
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",
                ...extraHeaders,
                "X-FSV-Trace-ID": traceId,
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
                    `[UPSTREAM REQUEST] trace_id=${traceId} event=request_start service=${service} policy=${regionPlan.name} regions=${regions.join("|")} attempt=${attemptNo} upstream=${node.origin} region=${node.region} target_host=${targetHost} headers_timeout_ms=${effectiveTimeoutMs} body_timeout_ms=${effectiveBodyTimeoutMs}`,
                );

                const response = await fetch(endpoint, {
                    method: "POST",
                    signal: controller.signal,
                    headers,
                    body: JSON.stringify(buildBody(payload)),
                });

                const headersMs = Date.now() - startedAt;
                const upstreamAppMs = parseTimingHeaderMs(response, "x-fsv-app-elapsed-ms");
                console.log(
                    `[UPSTREAM STAGE] trace_id=${traceId} event=response_headers service=${service} upstream=${node.origin} region=${node.region} http=${response.status} headers_ms=${headersMs} upstream_app_ms=${upstreamAppMs ?? "n/a"}`,
                );
                clearTimeout(timeout);
                phase = "body";
                timeout = setTimeout(() => controller.abort(), effectiveBodyTimeoutMs);
                const body = await response.json().catch(() => null);
                const elapsedMs = Date.now() - startedAt;
                const bodyMs = elapsedMs - headersMs;
                const tunnelMs = calculateTunnelMs(elapsedMs, upstreamAppMs);

                if (
                    !body ||
                    typeof body !== "object" ||
                    (requireStatus && typeof body.status !== "string")
                ) {
                    markUpstreamFailure(node, `invalid_json:http_${response.status}`);
                    lastErrorResult = createFailureResponse({
                        code: "upstream.incomplete",
                        service,
                        reason: `invalid_json:http_${response.status}`,
                        retryAfterSeconds: 5,
                    });
                    console.warn(
                        `[UPSTREAM FAILOVER] trace_id=${traceId} event=response_incomplete service=${service} upstream=${node.origin} region=${node.region} reason=invalid_json http=${response.status} headers_ms=${headersMs} body_ms=${bodyMs} total_ms=${elapsedMs} upstream_app_ms=${upstreamAppMs ?? "n/a"} tunnel_ms=${tunnelMs ?? "n/a"}`,
                    );
                    continue;
                }

                if (!response.ok) {
                    if (isFailoverStatus(response.status)) {
                        markUpstreamFailure(node, `http_${response.status}`);
                        lastErrorResult = createFailureResponse({
                            code: "upstream.unavailable",
                            service,
                            reason: `http_${response.status}`,
                            retryAfterSeconds: 5,
                        });
                        continue;
                    }
                    return null;
                }

                markUpstreamSuccess(node, elapsedMs);
                console.log(
                    `[UPSTREAM RESULT] trace_id=${traceId} event=response_complete service=${service} upstream=${node.origin} region=${node.region} http=${response.status} status=${logResultStatus(body)} headers_ms=${headersMs} body_ms=${bodyMs} total_ms=${elapsedMs} upstream_app_ms=${upstreamAppMs ?? "n/a"} tunnel_ms=${tunnelMs ?? "n/a"}`,
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
                    if (body.error?.code === "error.api.youtube.timeout") {
                        return lastErrorResult;
                    }
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
                const failure = classifyFetchError(error, phase);
                const reason = failure.reason;
                markUpstreamFailure(node, reason);
                if (returnFailureResponse || !lastErrorResult) {
                    lastErrorResult = createFailureResponse({
                        code: failure.code,
                        service,
                        reason,
                        retryAfterSeconds: Math.max(1, Math.ceil(effectiveTimeoutMs / 1000)),
                    });
                }
                console.warn(
                    `[UPSTREAM FAILOVER] trace_id=${traceId} event=${failure.code} phase=${phase} service=${service} upstream=${node.origin} region=${node.region} reason=${reason} total_ms=${elapsedMs} retryable=${failure.retryable}`,
                );
                if (!failure.retryable) {
                    return lastErrorResult?.upstreamFailure ? lastErrorResult : null;
                }
                console.warn(
                    `[UPSTREAM RETRY] trace_id=${traceId} event=retry_next_node service=${service} failed_upstream=${node.origin} next_attempt=${attemptNo + 1}`,
                );
            } finally {
                clearTimeout(timeout);
                node.inFlight = Math.max(0, node.inFlight - 1);
            }
        }
    }

    if (returnFailureResponse && lastErrorResult?.upstreamFailure) {
        return lastErrorResult;
    }

    return lastErrorResult?.upstreamFailure ? null : lastErrorResult;
};
