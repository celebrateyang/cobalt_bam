import path from "node:path";

import { genericUserAgent } from "../../config.js";

const ABSOLUTE_MEDIA_RE = /^https?:\/\//i;
const MEDIA_EXT_RE = /\.(mp4|m4v|webm|mov|m3u8)(?:$|[?#])/i;

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
    const push = (value) => {
        const resolved = resolveCandidateUrl(value, baseUrl);
        if (!resolved || candidates.includes(resolved)) return;
        if (!MEDIA_EXT_RE.test(resolved)) return;
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

    for (const match of html.matchAll(/https?:\/\/[^"'<>\\\s]+?\.(?:mp4|m4v|webm|mov|m3u8)(?:\?[^"'<>\\\s]*)?/gi)) {
        push(match[0]);
    }

    return candidates;
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

    const selected = candidates[0];
    const isHLS = /\.m3u8(?:$|[?#])/i.test(selected);
    const extension = isHLS ? "mp4" : guessExtension(selected, "");

    return {
        service: responseHost,
        urls: selected,
        headers: {
            referer: finalUrl,
            origin: new URL(finalUrl).origin,
        },
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
