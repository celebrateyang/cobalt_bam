import { genericUserAgent } from "../../config.js";

const PLAYER_RE = /var\s+player_aaaa\s*=\s*(\{[\s\S]*?\})\s*<\/script>/i;
const MEDIA_URL_RE = /\.(?:m3u8|mp4|m4v|webm|mov)(?:$|[?#])/i;

const requestHeaders = {
    "user-agent": genericUserAgent,
};

const extractStringProp = (source, key) => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`["']?${escaped}["']?\\s*:\\s*(["'])([\\s\\S]*?)\\1`, "i");
    return source.match(pattern)?.[2];
};

const extractNumberProp = (source, key) => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`["']?${escaped}["']?\\s*:\\s*(\\d+)`, "i");
    return source.match(pattern)?.[1];
};

const decodeJsString = (value) => {
    if (typeof value !== "string") return "";

    try {
        return JSON.parse(`"${value}"`);
    } catch {
        return value.replace(/\\\//g, "/");
    }
};

const decodePlayerUrl = (value, encrypt) => {
    const decoded = decodeJsString(value);

    try {
        if (encrypt === "1") return unescape(decoded);
        if (encrypt === "2") return unescape(Buffer.from(decoded, "base64").toString("utf8"));
    } catch {
        return decoded;
    }

    return decoded;
};

const extractTitle = (html) =>
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()
    || "zhshjn video";

export default async function({ url }) {
    let response;
    try {
        response = await fetch(url, {
            redirect: "follow",
            headers: requestHeaders,
        });
    } catch {
        return { error: "fetch.fail" };
    }

    if (!response.ok) return { error: "fetch.fail" };

    let html;
    try {
        html = await response.text();
    } catch {
        return { error: "fetch.fail" };
    }

    const playerSource = html.match(PLAYER_RE)?.[1];
    if (!playerSource) return { error: "fetch.empty" };

    const rawMediaUrl = extractStringProp(playerSource, "url");
    if (!rawMediaUrl) return { error: "fetch.empty" };

    const mediaUrl = decodePlayerUrl(rawMediaUrl, extractNumberProp(playerSource, "encrypt"));
    let resolved;
    try {
        resolved = new URL(mediaUrl, response.url || url).toString();
    } catch {
        return { error: "fetch.empty" };
    }

    if (!MEDIA_URL_RE.test(resolved)) return { error: "fetch.empty" };

    const title = extractTitle(html);
    const isHLS = /\.m3u8(?:$|[?#])/i.test(resolved);

    return {
        service: "zhshjn",
        urls: resolved,
        headers: {
            referer: response.url || url.toString(),
            origin: new URL(response.url || url).origin,
        },
        forceRedirect: true,
        isHLS,
        filenameAttributes: {
            service: "zhshjn",
            id: extractStringProp(playerSource, "id") || "video",
            title,
            qualityLabel: isHLS ? "M3U8" : "Video",
            extension: isHLS ? "m3u8" : "mp4",
        },
        audioFilename: title,
        fileMetadata: {
            title,
        },
    };
}
