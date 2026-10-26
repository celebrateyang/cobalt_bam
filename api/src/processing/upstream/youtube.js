import { randomUUID } from "node:crypto";
import { selectUpstreamNode } from "./pool.js";
import { requestUpstream } from "./request.js";

const hasUrl = (value) => typeof value === "string" && value.trim().length > 0;

const hasDownload = (body) => {
    if (body?.status === "redirect" || body?.status === "tunnel") {
        return hasUrl(body.url);
    }
    if (body?.status === "local-processing") {
        return Array.isArray(body.tunnel) && body.tunnel.length > 0
            && body.tunnel.every(hasUrl);
    }
    return false;
};

// Race up to three global nodes; errors must never beat a usable download.
export const requestYoutubeUpstream = async ({ payload, ...options }) => {
    const excluded = new Set();
    const nodes = [];
    for (let i = 0; i < 3; i++) {
        const node = selectUpstreamNode(excluded, { regions: ["global"] });
        if (!node) break;
        excluded.add(node.url);
        nodes.push(node);
    }
    if (!nodes.length) {
        // Preserve the existing unavailable/circuit-open response.
        return await requestUpstream({ ...options, payload, service: "youtube", maxAttempts: 1 }) || {
            status: 503,
            body: { status: "error", error: { code: "error.api.upstream.unavailable" } },
            upstreamFailure: { code: "upstream.unavailable" },
        };
    }

    const controller = new AbortController();
    const tracedPayload = { ...payload, traceId: payload?.traceId || randomUUID() };
    const failures = [];
    try {
        return await Promise.any(nodes.map(async (node, index) => {
            const result = await requestUpstream({
                ...options,
                payload: tracedPayload,
                service: "youtube",
                maxAttempts: 1,
                allowedUpstreamOrigins: [node.origin],
                signal: controller.signal,
            });
            if (!hasDownload(result?.body)) {
                failures[index] = result?.body?.status === "error" ? result : {
                    status: 503,
                    body: { status: "error", error: { code: "error.api.upstream.incomplete" } },
                    upstreamFailure: { code: "upstream.incomplete" },
                };
                throw new Error("YouTube node returned no downloadable media");
            }
            return result;
        }));
    } catch {
        // Prefer a specific extraction error over a transport failure, in node order.
        return failures.find((result) => result && !result.upstreamFailure)
            || failures.find(Boolean);
    } finally {
        controller.abort();
    }
};
