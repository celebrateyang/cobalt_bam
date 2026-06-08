import { genericUserAgent } from "../../config.js";

const SOURCE_RE = /["']source["']\s*:\s*["']([^"']+\.m3u8(?:\?[^"']*)?)["']/i;
const TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i;

const decodeHtml = (value) => {
    return String(value || "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
};

export default async function bjnews({ url, id }) {
    let response;
    try {
        response = await fetch(url.toString(), {
            redirect: "follow",
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

    const html = await response.text().catch(() => "");
    const mediaUrl = decodeHtml(html.match(SOURCE_RE)?.[1]);
    if (!mediaUrl) {
        return { error: "fetch.empty" };
    }

    const title = decodeHtml(html.match(TITLE_RE)?.[1]) || id || "bjnews";

    return {
        urls: mediaUrl,
        service: "bjnews",
        isHLS: true,
        filenameAttributes: {
            service: "bjnews",
            id,
            title,
            qualityLabel: "HLS",
            extension: "mp4",
        },
        fileMetadata: {
            title,
        },
        headers: {
            referer: response.url || url.toString(),
            origin: new URL(response.url || url.toString()).origin,
        },
    };
}
