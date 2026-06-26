import path from "node:path";

import { genericUserAgent } from "../../config.js";

const ABSOLUTE_MEDIA_RE = /^https?:\/\//i;
const MEDIA_EXT_RE = /\.(mp4|m4v|webm|mov|m3u8)(?:$|[?#])/i;
const MEDIA_HINT_RE = /(?:[/.])(?:mp4|m4v|webm|mov|m3u8)(?:[-/?#]|$)/i;
const HLS_EXT_RE = /\.m3u8(?:$|[?#])/i;
const PREVIEW_MEDIA_RE = /(?:^|[\/_.-])(?:preview|vthumb|thumb|thumbnail)(?:[\/_.-]|$)/i;
const MIN_DIRECT_MEDIA_BYTES = 32 * 1024;
const MAX_HLS_PLAYLIST_BYTES = 512 * 1024;

const resolveCandidateUrl = (value, baseUrl) => {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!trimmed) return "";

    try {
        const resolved = new URL(trimmed, baseUrl);
        if (!ABSOLUTE_MEDIA_RE.test(resolved.toString())) {
            return "";
        }
        return resolved.toString();
    } catch {
        return "";
    }
};

const decodeHtml = (value) => {
    return String(value || "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
};

const getHost = (value) => {
    try {
        return new URL(value).hostname.toLowerCase();
    } catch {
        return "";
    }
};

const getDomainKey = (host) => {
    const parts = String(host || "").split(".").filter(Boolean);
    if (parts.length <= 2) return parts.join(".");

    const suffix = parts.slice(-2).join(".");
    if (suffix === "com.cn" || suffix === "net.cn" || suffix === "org.cn") {
        return parts.slice(-3).join(".");
    }

    return suffix;
};

const extractMetaContent = (html, property) => {
    const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
        new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["']`, "i"),
        new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["']`, "i"),
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match?.[1]) {
            return decodeHtml(match[1]);
        }
    }
};

const extractTitle = (html) => {
    return (
        extractMetaContent(html, "og:title")
        || extractMetaContent(html, "twitter:title")
        || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()
        || undefined
    );
};

const extractCandidatesFromHtml = (html, baseUrl) => {
    const candidates = [];
    const push = (value, { allowHint = false } = {}) => {
        const resolved = resolveCandidateUrl(value, baseUrl);
        if (!resolved || candidates.includes(resolved)) return;
        if (!MEDIA_EXT_RE.test(resolved) && !(allowHint && MEDIA_HINT_RE.test(resolved))) return;
        try {
            if (PREVIEW_MEDIA_RE.test(new URL(resolved).pathname)) return;
        } catch {
            return;
        }
        candidates.push(resolved);
    };

    const metaKeys = [
        "og:video",
        "og:video:url",
        "og:video:secure_url",
        "twitter:player:stream",
    ];

    for (const key of metaKeys) {
        push(extractMetaContent(html, key));
    }

    for (const match of html.matchAll(/<(?:video|source)[^>]+src=["']([^"']+)["']/gi)) {
        push(decodeHtml(match[1]));
    }

    for (const match of html.matchAll(/<(?:script)[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
        const jsonText = decodeHtml(match[1]);
        try {
            const data = JSON.parse(jsonText);
            const stack = [data];
            while (stack.length) {
                const item = stack.pop();
                if (!item || typeof item !== "object") continue;
                if (Array.isArray(item)) {
                    stack.push(...item);
                    continue;
                }
                push(item.contentUrl, { allowHint: true });
                push(item.embedUrl, { allowHint: true });
                for (const value of Object.values(item)) {
                    if (value && typeof value === "object") stack.push(value);
                }
            }
        } catch {
            // ignore malformed structured data
        }
    }

    const decodedHtml = decodeHtml(html);
    for (const match of decodedHtml.matchAll(/["']src["']\s*:\s*["']([^"']+)["']/gi)) {
        push(match[1], { allowHint: true });
    }

    for (const match of html.matchAll(/https?:\/\/[^"'<>\\\s]+?\.(?:mp4|m4v|webm|mov|m3u8)(?:\?[^"'<>\\\s]*)?/gi)) {
        push(match[0]);
    }

    const baseHost = getHost(baseUrl);
    const baseDomainKey = getDomainKey(baseHost);

    return candidates
        .map((url, index) => {
            const host = getHost(url);
            const sameHost = host === baseHost;
            const sameSite = getDomainKey(host) === baseDomainKey;
            return {
                url,
                index,
                rank: sameHost ? 0 : sameSite ? 1 : 2,
            };
        })
        .sort((a, b) => a.rank - b.rank || a.index - b.index)
        .map((candidate) => candidate.url);
};

const buildFilenameAttributes = ({ originUrl, title, extension }) => {
    const host = (() => {
        try {
            return new URL(originUrl).hostname;
        } catch {
            return "generic";
        }
    })();

    return {
        service: host,
        id: "generic",
        title: title || host,
        qualityLabel: extension.toUpperCase(),
        extension,
    };
};

const guessExtension = (url, contentType) => {
    if (typeof contentType === "string" && contentType.includes("mpegurl")) {
        return "mp4";
    }

    try {
        const ext = path.extname(new URL(url).pathname).replace(/^\./, "").toLowerCase();
        if (ext) return ext;
    } catch {
        // ignore
    }

    return "mp4";
};

const isMediaContentType = (contentType) => {
    const normalized = String(contentType || "").toLowerCase();
    return (
        normalized.startsWith("video/")
        || normalized.startsWith("audio/")
        || normalized.includes("octet-stream")
    );
};

const isHlsContentType = (contentType) => {
    const normalized = String(contentType || "").toLowerCase();
    return normalized.includes("mpegurl") || normalized.includes("vnd.apple.mpegurl");
};

const getNumericHeader = (headers, name) => {
    const value = Number(headers.get(name));
    return Number.isFinite(value) && value >= 0 ? value : undefined;
};

const isValidHlsPlaylist = (text) => {
    const playlist = String(text || "");
    if (!playlist.trimStart().startsWith("#EXTM3U")) return false;

    return (
        /#EXT-X-STREAM-INF\b/i.test(playlist)
        || /#EXTINF\b/i.test(playlist)
        || /#EXT-X-MEDIA\b/i.test(playlist)
    );
};

const validateHlsCandidate = async ({ url, headers, signal }) => {
    let response;
    try {
        response = await fetch(url, {
            redirect: "follow",
            signal,
            headers: {
                "user-agent": genericUserAgent,
                ...headers,
            },
        });
    } catch {
        return false;
    }

    if (!response.ok) return false;

    const contentLength = getNumericHeader(response.headers, "content-length");
    if (contentLength && contentLength > MAX_HLS_PLAYLIST_BYTES) return false;

    const contentType = response.headers.get("content-type");
    if (contentType && !isHlsContentType(contentType) && !contentType.toLowerCase().includes("text/plain")) {
        return false;
    }

    let text;
    try {
        text = await response.text();
    } catch {
        return false;
    }

    if (text.length > MAX_HLS_PLAYLIST_BYTES) return false;
    return isValidHlsPlaylist(text);
};

const validateDirectMediaCandidate = async ({ url, headers, signal }) => {
    let response;
    try {
        response = await fetch(url, {
            method: "GET",
            redirect: "follow",
            signal,
            headers: {
                "user-agent": genericUserAgent,
                ...headers,
                Range: "bytes=0-1023",
            },
        });
    } catch {
        return false;
    }

    if (!response.ok && response.status !== 206) return false;

    const contentType = response.headers.get("content-type");
    if (contentType && !isMediaContentType(contentType)) return false;

    const contentRange = String(response.headers.get("content-range") || "");
    const rangeTotal = Number(contentRange.match(/\/(\d+)$/)?.[1]);
    const contentLength = getNumericHeader(response.headers, "content-length");
    const sizeHint = Number.isFinite(rangeTotal) && rangeTotal > 0
        ? rangeTotal
        : contentLength;

    if (sizeHint && sizeHint < MIN_DIRECT_MEDIA_BYTES) return false;

    try {
        await response.body?.cancel();
    } catch {
        // ignore
    }

    return true;
};

const selectValidatedCandidate = async ({ candidates, headers, signal }) => {
    for (const candidate of candidates) {
        const isHLS = HLS_EXT_RE.test(candidate);
        const valid = isHLS
            ? await validateHlsCandidate({ url: candidate, headers, signal })
            : await validateDirectMediaCandidate({ url: candidate, headers, signal });

        if (valid) {
            return candidate;
        }
    }

    return "";
};

export default async function htmlProbe({ url, timeoutMs }) {
    const controller = AbortSignal.timeout(timeoutMs);

    let response;
    try {
        response = await fetch(url, {
            redirect: "follow",
            signal: controller,
            headers: {
                "user-agent": genericUserAgent,
            },
        });
    } catch {
        return { error: "fetch.fail" };
    }

    if (!response.ok) {
        return { error: "fetch.fail" };
    }

    const finalUrl = response.url || url;
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const responseHost = (() => {
        try {
            return new URL(finalUrl).hostname;
        } catch {
            return "generic";
        }
    })();

    if (contentType.startsWith("video/") || contentType.startsWith("audio/")) {
        const extension = guessExtension(finalUrl, contentType);
        return {
            service: responseHost,
            urls: finalUrl,
            filenameAttributes: buildFilenameAttributes({
                originUrl: finalUrl,
                title: responseHost,
                extension,
            }),
            audioFilename: responseHost,
            fileMetadata: {
                title: responseHost,
            },
            bestAudio: contentType.startsWith("audio/") ? extension : undefined,
            genericExtractor: "html-probe",
        };
    }

    if (!contentType.includes("html")) {
        return { error: "fetch.empty" };
    }

    let html;
    try {
        html = await response.text();
    } catch {
        return { error: "fetch.fail" };
    }

    const title = extractTitle(html) || responseHost;
    const candidates = extractCandidatesFromHtml(html, finalUrl);
    if (!candidates.length) {
        return { error: "fetch.empty" };
    }

    const candidateHeaders = {
        referer: finalUrl,
        origin: new URL(finalUrl).origin,
    };
    const selected = await selectValidatedCandidate({
        candidates,
        headers: candidateHeaders,
        signal: controller,
    });
    if (!selected) {
        return { error: "fetch.empty" };
    }

    const isHLS = HLS_EXT_RE.test(selected);
    const extension = isHLS ? "mp4" : guessExtension(selected, "");

    return {
        service: responseHost,
        urls: selected,
        headers: candidateHeaders,
        filenameAttributes: buildFilenameAttributes({
            originUrl: finalUrl,
            title,
            extension,
        }),
        audioFilename: title,
        fileMetadata: {
            title,
        },
        isHLS,
        genericExtractor: "html-probe",
    };
}
