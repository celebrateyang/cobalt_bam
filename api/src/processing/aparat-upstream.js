import { requestUpstream } from "./upstream/request.js";
import { isAparatMediaURL } from "./services/aparat.js";

// Forward JSON extraction results only. Never normalize or wrap a media tunnel.
export const isAparatDirectResponse = (body) => {
    if (body?.service !== "aparat" || body.tunnelUrl || body.fallback
        || (body.tunnel && (!Array.isArray(body.tunnel) || body.tunnel.length))) return false;
    if (body.status === "redirect") {
        return isAparatMediaURL(body.url) && body.directUrl === body.url
            && (!body.directUrlCandidates || (Array.isArray(body.directUrlCandidates)
                && body.directUrlCandidates.every(isAparatMediaURL)));
    }
    return body.status === "local-processing" && Array.isArray(body.tunnel) && body.tunnel.length === 0
        && body.source?.kind === "direct" && Array.isArray(body.source.urls)
        && body.source.urls.length > 0 && body.source.urls.every(isAparatMediaURL);
};

export const isAparatPlaylistResponse = (body) => body?.status === "ok" && body.service === "aparat"
    && body.kind === "aparat-playlist" && Array.isArray(body.items) && body.items.length > 0
    && body.items.length <= 500 && body.items.every(item =>
        /^https:\/\/www\.aparat\.com\/v\/[a-zA-Z0-9]{1,32}$/.test(item?.url || ""));

export const requestAparatUpstream = async (payload, { expand = false } = {}) => {
    if (["true", "1"].includes(String(process.env.IS_UPSTREAM_SERVER || "").toLowerCase().trim())) return null;
    const upstream = await requestUpstream({
        payload, service: "aparat", path: expand ? "/expand" : "/",
        timeoutMs: 20000, maxAttempts: 2, requireStatus: !expand,
        acceptResponse: ({ body }) => expand ? isAparatPlaylistResponse(body) : isAparatDirectResponse(body),
    });
    const valid = expand ? isAparatPlaylistResponse(upstream?.body) : isAparatDirectResponse(upstream?.body);
    return valid ? { status: upstream.status, body: upstream.body } : null;
};
