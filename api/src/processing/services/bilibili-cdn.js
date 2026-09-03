import path from "node:path";

import { genericUserAgent } from "../../config.js";

const BILIBILI_REFERER = "https://www.bilibili.com/";
const MEDIA_CONTENT_TYPES = ["video/", "audio/", "application/octet-stream"];

export const isBilibiliCdnHost = (hostname) => {
    const normalized = String(hostname || "").toLowerCase().replace(/\.+$/, "");
    return normalized === "bilivideo.com" || normalized.endsWith(".bilivideo.com");
};

const signedExpiry = (url) => {
    for (const key of ["deadline", "expires", "x-expires"]) {
        const value = Number.parseInt(url.searchParams.get(key) || "", 10);
        if (!Number.isFinite(value) || value <= 0) continue;
        return value < 10_000_000_000 ? value * 1000 : value;
    }
    return null;
};

const extensionFor = (url, contentType) => {
    if (contentType.startsWith("audio/")) return "m4a";
    const pathnameExtension = path.extname(url.pathname).replace(/^\./, "").toLowerCase();
    if (["mp4", "m4v", "m4s", "mov", "webm"].includes(pathnameExtension)) {
        return pathnameExtension === "m4s" ? "mp4" : pathnameExtension;
    }
    return "mp4";
};

export default async function bilibiliCdn({ url, fetchImpl = fetch, now = Date.now() }) {
    if (!(url instanceof URL) || !isBilibiliCdnHost(url.hostname) || !url.pathname || url.pathname === "/") {
        return { error: "link.unsupported" };
    }

    const expiry = signedExpiry(url);
    if (expiry !== null && expiry <= now) {
        return { error: "bilibili.cdn.expired" };
    }

    const headers = {
        referer: BILIBILI_REFERER,
        "user-agent": genericUserAgent,
    };

    let response;
    try {
        response = await fetchImpl(url, {
            method: "GET",
            redirect: "manual",
            signal: AbortSignal.timeout(8000),
            headers: {
                ...headers,
                Range: "bytes=0-1023",
            },
        });
    } catch {
        return { error: "fetch.fail" };
    }

    try {
        if ([401, 403, 410].includes(response.status)) {
            return { error: "bilibili.cdn.expired" };
        }
        if (!response.ok && response.status !== 206) {
            return { error: "fetch.fail" };
        }

        const contentType = String(response.headers.get("content-type") || "").toLowerCase();
        if (!MEDIA_CONTENT_TYPES.some((type) => contentType.startsWith(type))) {
            return { error: "bilibili.cdn.not_media" };
        }

        const extension = extensionFor(url, contentType);
        return {
            service: "bilibili_cdn",
            urls: url.toString(),
            headers,
            directClientDownload: true,
            filenameAttributes: {
                service: "bilibili_cdn",
                id: "temporary-media",
                title: "bilibili-cdn",
                qualityLabel: extension.toUpperCase(),
                extension,
            },
            audioFilename: "bilibili-cdn",
            fileMetadata: { title: "bilibili-cdn" },
        };
    } finally {
        await response.body?.cancel().catch(() => {});
    }
}
