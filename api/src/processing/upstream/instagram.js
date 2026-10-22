import { randomUUID } from "node:crypto";
import { getUpstreamNodes, selectUpstreamNode } from "./pool.js";
import { requestUpstream } from "./request.js";

// Sessions differ across nodes. A slow node must not delay a working session.
export const requestInstagramUpstream = async ({ payload, ...options }) => {
    const excluded = new Set();
    const nodes = [];
    for (let i = 0; i < getUpstreamNodes().length; i++) {
        const node = selectUpstreamNode(excluded, { regions: ["global"] });
        if (!node) break;
        excluded.add(node.url);
        nodes.push(node);
    }
    if (!nodes.length) return null;

    const controller = new AbortController();
    const tracedPayload = { ...payload, traceId: payload?.traceId || randomUUID() };
    try {
        return await Promise.any(nodes.map(async (node) => {
            const result = await requestUpstream({
                ...options,
                payload: tracedPayload,
                service: "instagram",
                maxAttempts: 1,
                allowedUpstreamOrigins: [node.origin],
                signal: controller.signal,
                acceptResponse: ({ body }) =>
                    body?.status === "redirect" && typeof body.url === "string" && body.url.length > 0,
            });
            if (result?.body?.status !== "redirect" || !result.body.url) {
                throw new Error("Instagram node returned no downloadable media");
            }
            return result;
        }));
    } catch {
        return null;
    } finally {
        controller.abort();
    }
};
