import { randomUUID } from "node:crypto";
import { selectUpstreamNode } from "./pool.js";
import { requestUpstream } from "./request.js";
import { env } from "../../config.js";
import { validateYoutubeClipRange } from "../youtube-clip-range.js";

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

// Old nodes can ignore unknown request fields and return a complete download.
// Never accept their result, or use its duration for billing, as a clip.
export const hasVerifiedYoutubeClip = (body, requested, limit = env.durationLimit) => {
    const clip = body?.youtubeClip;
    if (body?.status !== "local-processing" || body.type !== "merge" || body.service !== "youtube" || clip?.version !== 1
        || !requested || clip.start !== requested.start || clip.end !== requested.end
        || !Array.isArray(body.tunnel) || body.tunnel.length !== 2 || !body.tunnel.every(hasUrl)
        || !hasUrl(body.output?.filename) || body.output?.type !== "video/webm") return false;
    const valid = validateYoutubeClipRange(clip, clip.sourceDuration, limit);
    return !!valid && body.duration === valid.duration;
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
        const result = await requestUpstream({ ...options, payload, service: "youtube", maxAttempts: 1 });
        if (payload?.youtubeClip && result && result.body?.status !== "error"
            && !hasVerifiedYoutubeClip(result?.body, payload.youtubeClip)) {
            return { status: 503, body: { status: "error", error: { code: "error.api.upstream.incomplete" } } };
        }
        return result || {
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
            if (!hasDownload(result?.body) || (payload?.youtubeClip && !hasVerifiedYoutubeClip(result.body, payload.youtubeClip))) {
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
        // A node that obtained the duration can report the actionable limit even
        // when another node encountered an unrelated extraction error.
        return failures.find((result) => result?.body?.error?.code === "error.api.content.too_long")
            || failures.find((result) => result && !result.upstreamFailure)
            || failures.find(Boolean);
    } finally {
        controller.abort();
    }
};
