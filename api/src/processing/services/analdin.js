import { parse as parseSetCookie, splitCookiesString } from "set-cookie-parser";

import { genericUserAgent } from "../../config.js";

const TITLE_RE = /video_title\s*:\s*'([^']+)'/i;
const VIDEO_URL_RE = /video_url\s*:\s*'([^']+)'/i;
const VIDEO_ALT_URL_RE = /video_alt_url\s*:\s*'([^']+)'/i;

const decodeHtml = (value) => {
    return String(value || "")
        .replace(/\\\//g, "/")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
};

const cookieHeaderFrom = (headers) => {
    const rawCookies =
        typeof headers.getSetCookie === "function"
            ? headers.getSetCookie()
            : splitCookiesString(headers.get("set-cookie") || "");

    return parseSetCookie(rawCookies)
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; ");
};

const toEmbedUrl = (id) => `https://www.analdin.xxx/embed/${encodeURIComponent(id)}`;

export default async function analdin({ id }) {
    const embedUrl = toEmbedUrl(id);
    let response;
    try {
        response = await fetch(embedUrl, {
            redirect: "follow",
            headers: {
                "user-agent": genericUserAgent,
                referer: `https://www.analdin.xxx/videos/${encodeURIComponent(id)}/`,
            },
        });
    } catch {
        return { error: "fetch.fail" };
    }

    if (!response.ok) {
        return { error: "fetch.fail" };
    }

    const html = await response.text().catch(() => "");
    const title = decodeHtml(html.match(TITLE_RE)?.[1]) || id;
    const urls = [
        decodeHtml(html.match(VIDEO_ALT_URL_RE)?.[1]),
        decodeHtml(html.match(VIDEO_URL_RE)?.[1]),
    ].filter(Boolean);

    if (!urls.length) {
        return { error: "fetch.empty" };
    }

    const cookie = cookieHeaderFrom(response.headers);
    const headers = {
        referer: response.url || embedUrl,
        origin: "https://www.analdin.xxx",
        ...(cookie ? { cookie } : {}),
    };

    return {
        urls: urls[0],
        service: "analdin",
        headers,
        filenameAttributes: {
            service: "analdin",
            id,
            title,
            qualityLabel: urls[0].includes("hd.mp4") ? "HD" : "MP4",
            extension: "mp4",
        },
        fileMetadata: {
            title,
        },
    };
}
