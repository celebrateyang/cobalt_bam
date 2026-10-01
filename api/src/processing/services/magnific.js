import { sanitizeString } from "../create-filename.js";

const MEDIA_EXTENSION = /\.(avif|gif|jpe?g|png|webp|mp4|mov|webm|mp3|m4a|aac|ogg|wav)(?:$|[?#])/i;
const IMAGE_EXTENSION = /\.(avif|gif|jpe?g|png|webp)(?:$|[?#])/i;
const VIDEO_EXTENSION = /\.(mp4|mov|webm)(?:$|[?#])/i;
const AUDIO_EXTENSION = /\.(mp3|m4a|aac|ogg|wav)(?:$|[?#])/i;
const PAGE_TYPE = /^\/(?:[a-z]{2}\/)?free-(photo|ai-image|vector|psd|video)\/[^/]+\/?$/i;
const BLOCKED_PAGE = /^\/(?:[a-z]{2}\/)?(?:premium-|app\/|ai\/|pikaso\/)/i;
const MAGNIFIC_HOST = /(^|\.)magnific\.(?:com|ai)$/i;

const decodeHtml = (value = "") => value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

export const safeMagnificMediaUrl = (value) => {
    try {
        const media = new URL(decodeHtml(value));
        if (media.protocol !== "https:" || !MAGNIFIC_HOST.test(media.hostname)) return undefined;
        return MEDIA_EXTENSION.test(media.href) ? media.href : undefined;
    } catch {
        return undefined;
    }
};

const extractMeta = (html, key) => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
        new RegExp(`<meta\\b[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
        new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
    ];
    return patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean);
};

const extractCandidates = (html) => {
    const values = [
        extractMeta(html, "og:video:secure_url"),
        extractMeta(html, "og:video"),
        extractMeta(html, "twitter:player:stream"),
        extractMeta(html, "og:audio:secure_url"),
        extractMeta(html, "og:audio"),
        extractMeta(html, "og:image:secure_url"),
        extractMeta(html, "og:image"),
        extractMeta(html, "twitter:image"),
    ];
    for (const match of html.matchAll(/["'](?:contentUrl|embedUrl|url)["']\s*:\s*["'](https:\/\/[^"']+)["']/gi)) {
        values.push(match[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/"));
    }
    return [...new Set(values.map(safeMagnificMediaUrl).filter(Boolean))];
};

const extensionFor = (value) => value.match(MEDIA_EXTENSION)?.[1]?.toLowerCase().replace("jpeg", "jpg");

const filenameFor = (url, title) => {
    const extension = extensionFor(url) || "bin";
    const pathName = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
    const pathBase = pathName.replace(/\.[^.]+$/, "");
    return `${sanitizeString(title || pathBase || "magnific_media")}.${extension}`;
};

const selectForType = (candidates, pageType) => {
    if (pageType === "video") return candidates.find((value) => VIDEO_EXTENSION.test(value));
    return candidates.find((value) => IMAGE_EXTENSION.test(value));
};

export default async function magnific({ url, fetchImpl = fetch }) {
    let source;
    try {
        source = new URL(url?.toString?.() || url);
    } catch {
        return { error: "link.unsupported" };
    }

    if (!MAGNIFIC_HOST.test(source.hostname)) return { error: "link.unsupported" };

    const isPageHost = ["magnific.com", "www.magnific.com"].includes(source.hostname.toLowerCase());
    const pageMatch = source.pathname.match(PAGE_TYPE);
    const directUrl = safeMagnificMediaUrl(source.href);

    if (!isPageHost && directUrl) {
        return {
            service: "magnific",
            urls: directUrl,
            directClientDownload: true,
            isPhoto: IMAGE_EXTENSION.test(directUrl),
            filename: filenameFor(directUrl),
        };
    }

    if (BLOCKED_PAGE.test(source.pathname)) return { error: "content.platform_restricted" };
    if (!pageMatch) return { error: "link.unsupported" };

    try {
        const response = await fetchImpl(source.href, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
                Accept: "text/html,application/xhtml+xml",
            },
            signal: AbortSignal.timeout(20000),
        });
        if (response.status === 403 || response.status === 429) return { error: "magnific.browser_required" };
        if (response.status === 404 || response.status === 410) return { error: "content.video.unavailable" };
        if (!response.ok) return { error: "fetch.fail" };

        const html = await response.text();
        if (/\bPremium\b/i.test(extractMeta(html, "og:title") || "") || /premium-resource/i.test(html)) {
            return { error: "content.platform_restricted" };
        }

        const mediaUrl = selectForType(extractCandidates(html), pageMatch[1].toLowerCase());
        if (!mediaUrl) return { error: "magnific.browser_required" };

        const title = decodeHtml(extractMeta(html, "og:title") || "")
            .replace(/\s*[|—-]\s*Magnific.*$/i, "")
            .trim();
        return {
            service: "magnific",
            urls: mediaUrl,
            directClientDownload: true,
            isPhoto: IMAGE_EXTENSION.test(mediaUrl),
            filename: filenameFor(mediaUrl, title),
        };
    } catch {
        return { error: "magnific.browser_required" };
    }
}

export const magnificMediaKinds = {
    image: IMAGE_EXTENSION,
    video: VIDEO_EXTENSION,
    audio: AUDIO_EXTENSION,
};
