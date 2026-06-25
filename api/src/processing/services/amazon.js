import HLS from "hls-parser";

import { genericUserAgent } from "../../config.js";

const VIDEO_OBJECT_TYPES = new Set(["VideoObject", "BroadcastEvent"]);
const MEDIA_URL_RE = /^https:\/\/(?:[^/]+\.)?media-amazon\.com\//i;

const decodeHtml = (value) =>
    String(value || "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();

const isAmazonMediaUrl = (value) => {
    if (typeof value !== "string" || !MEDIA_URL_RE.test(value)) return false;

    try {
        return new URL(value).pathname.endsWith(".m3u8");
    } catch {
        return false;
    }
};

const walkJsonLd = (value, output) => {
    if (Array.isArray(value)) {
        value.forEach((entry) => walkJsonLd(entry, output));
        return;
    }

    if (!value || typeof value !== "object") return;

    const types = Array.isArray(value["@type"])
        ? value["@type"]
        : [value["@type"]];
    if (types.some((type) => VIDEO_OBJECT_TYPES.has(type))) {
        output.push(value);
    }

    if (Array.isArray(value["@graph"])) {
        walkJsonLd(value["@graph"], output);
    }
};

export const extractAmazonLiveMetadata = (html) => {
    const objects = [];

    for (const match of String(html || "").matchAll(
        /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    )) {
        try {
            walkJsonLd(JSON.parse(match[1]), objects);
        } catch {
            // Ignore unrelated or malformed JSON-LD blocks.
        }
    }

    const video = objects.find((entry) => isAmazonMediaUrl(entry?.contentUrl));
    if (video) {
        return {
            manifestUrl: video.contentUrl,
            title: decodeHtml(video.name || video.headline),
            uploader: decodeHtml(
                video.author?.name
                || video.creator?.name
                || video.publisher?.name,
            ),
            duration: video.duration,
        };
    }

    const manifestUrl = String(html || "").match(
        /https:\/\/[^"'<>\\\s]+\.media-amazon\.com\/[^"'<>\\\s]+\.m3u8(?:\?[^"'<>\\\s]*)?/i,
    )?.[0];

    return {
        manifestUrl: decodeHtml(manifestUrl),
        title: decodeHtml(
            String(html || "").match(
                /<meta[^>]+(?:property|name)=["']og:title["'][^>]+content=["']([^"']+)["']/i,
            )?.[1]
            || String(html || "").match(/<title[^>]*>([^<]+)<\/title>/i)?.[1],
        ),
    };
};

const parseDuration = (value) => {
    if (typeof value !== "string") return undefined;

    const match = value.match(
        /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i,
    );
    if (!match) return undefined;

    const duration =
        Number(match[1] || 0) * 86400
        + Number(match[2] || 0) * 3600
        + Number(match[3] || 0) * 60
        + Number(match[4] || 0);

    return Number.isFinite(duration) && duration > 0
        ? Math.round(duration)
        : undefined;
};

const variantHeight = (variant) => Number(variant?.resolution?.height) || 0;
const variantBandwidth = (variant) =>
    Number(variant?.averageBandwidth || variant?.bandwidth) || 0;

export const selectAmazonLiveVariant = (variants, quality) => {
    const usable = Array.isArray(variants)
        ? variants.filter((variant) => typeof variant?.uri === "string" && variant.uri)
        : [];

    if (!usable.length) return null;

    if (quality === "max") {
        return usable.reduce((best, current) => {
            const heightDiff = variantHeight(current) - variantHeight(best);
            if (heightDiff !== 0) return heightDiff > 0 ? current : best;
            return variantBandwidth(current) > variantBandwidth(best) ? current : best;
        });
    }

    const wanted = Number(quality);
    if (!Number.isFinite(wanted) || wanted <= 0) {
        return selectAmazonLiveVariant(usable, "max");
    }

    return usable.reduce((best, current) => {
        const bestDiff = Math.abs(variantHeight(best) - wanted);
        const currentDiff = Math.abs(variantHeight(current) - wanted);
        if (currentDiff !== bestDiff) return currentDiff < bestDiff ? current : best;
        return variantBandwidth(current) > variantBandwidth(best) ? current : best;
    });
};

const requestText = async (url, headers) => {
    try {
        const response = await fetch(url, {
            redirect: "follow",
            headers,
        });
        if (!response.ok) return null;

        return {
            text: await response.text(),
            url: response.url || url,
        };
    } catch {
        return null;
    }
};

export default async function amazon({ id, quality, url }) {
    const pageUrl = url instanceof URL
        ? url.toString()
        : `https://www.amazon.com/live/video/${encodeURIComponent(id)}`;
    const pageOrigin = new URL(pageUrl).origin;
    const headers = {
        "user-agent": genericUserAgent,
        referer: pageUrl,
    };

    const page = await requestText(pageUrl, headers);
    if (!page) return { error: "fetch.fail" };

    const metadata = extractAmazonLiveMetadata(page.text);
    if (!isAmazonMediaUrl(metadata.manifestUrl)) {
        return { error: "fetch.empty" };
    }

    const manifest = await requestText(metadata.manifestUrl, {
        ...headers,
        referer: page.url,
    });
    if (!manifest) return { error: "fetch.fail" };

    let playlist;
    try {
        playlist = HLS.parse(manifest.text);
    } catch {
        return { error: "fetch.empty" };
    }

    const selected = playlist?.isMasterPlaylist
        ? selectAmazonLiveVariant(playlist.variants, quality)
        : null;
    const mediaUrl = selected
        ? new URL(selected.uri, manifest.url).toString()
        : metadata.manifestUrl;
    const height = variantHeight(selected);
    const title = metadata.title || `Amazon Live ${id}`;

    return {
        urls: mediaUrl,
        service: "amazon",
        isHLS: true,
        duration: parseDuration(metadata.duration),
        headers: {
            referer: page.url,
            origin: pageOrigin,
            "user-agent": genericUserAgent,
        },
        filenameAttributes: {
            service: "amazon",
            id,
            title,
            author: metadata.uploader || undefined,
            qualityLabel: height ? `${height}p` : "HLS",
            extension: "mp4",
        },
        audioFilename: title,
        fileMetadata: {
            title,
            artist: metadata.uploader || undefined,
        },
    };
}
