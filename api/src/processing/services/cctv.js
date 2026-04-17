import HLS from "hls-parser";

import { env, genericUserAgent } from "../../config.js";

const CCTV_REFERER = "https://tv.cctv.com/";
const GUID_REGEX = /var\s+guid\s*=\s*"([0-9a-f]{32})"/i;
const CCTV_HLS_BITRATES = [2000, 1200, 850, 450];
const CCTV_HIGH_QUALITY_BANDWIDTH = 1200000;

const requestHeaders = {
    "user-agent": genericUserAgent,
    referer: CCTV_REFERER,
};

const toDuration = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
    return Math.round(numeric);
};

const shouldPreferHighestBandwidth = (quality, manifestLabel) => {
    if (quality === "max") return true;
    const wanted = Number(quality);
    if (!Number.isFinite(wanted) || wanted <= 0) {
        return manifestLabel === "hls";
    }

    return wanted >= 720;
};

const selectVariant = (variants, quality, manifestLabel) => {
    if (!Array.isArray(variants) || variants.length === 0) return null;

    if (shouldPreferHighestBandwidth(quality, manifestLabel)) {
        return variants.reduce((best, current) => {
            const bestHeight = Number(best?.resolution?.height) || 0;
            const currentHeight = Number(current?.resolution?.height) || 0;
            if (manifestLabel !== "hls" && currentHeight !== bestHeight) {
                return currentHeight > bestHeight ? current : best;
            }

            const bestBandwidth = Number(best?.bandwidth) || 0;
            const currentBandwidth = Number(current?.bandwidth) || 0;
            return currentBandwidth > bestBandwidth ? current : best;
        });
    }

    const wanted = Number(quality);
    if (!Number.isFinite(wanted) || wanted <= 0) {
        return variants.reduce((best, current) => {
            const bestBandwidth = Number(best?.bandwidth) || 0;
            const currentBandwidth = Number(current?.bandwidth) || 0;
            return currentBandwidth > bestBandwidth ? current : best;
        });
    }

    return variants.reduce((best, current) => {
        const bestHeight = Number(best?.resolution?.height) || 0;
        const currentHeight = Number(current?.resolution?.height) || 0;
        const bestDiff = Math.abs(bestHeight - wanted);
        const currentDiff = Math.abs(currentHeight - wanted);

        if (currentDiff !== bestDiff) {
            return currentDiff < bestDiff ? current : best;
        }

        const bestBandwidth = Number(best?.bandwidth) || 0;
        const currentBandwidth = Number(current?.bandwidth) || 0;
        return currentBandwidth > bestBandwidth ? current : best;
    });
};

const requestText = async (url) => {
    try {
        const response = await fetch(url, { headers: requestHeaders });
        return await response.text();
    } catch {}
};

const requestJSON = async (url) => {
    const text = await requestText(url);
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};

const extractGuid = (html) => {
    if (typeof html !== "string" || !html) return null;
    return html.match(GUID_REGEX)?.[1] || null;
};

const collectUniqueCandidates = (candidates) => {
    const deduped = [];
    for (const candidate of candidates) {
        const value = typeof candidate?.url === "string" ? candidate.url.trim() : "";
        if (!value) continue;
        if (deduped.some((entry) => entry.url === value)) continue;
        deduped.push({
            label: candidate.label,
            url: value,
        });
    }

    return deduped;
};

const collectManifestCandidates = (videoInfo) =>
    collectUniqueCandidates([
        { label: "hls", url: videoInfo?.hls_url },
        { label: "hls_enc2", url: videoInfo?.manifest?.hls_enc2_url },
        { label: "hls_enc", url: videoInfo?.manifest?.hls_enc_url },
        { label: "hls_h5e", url: videoInfo?.manifest?.hls_h5e_url },
    ]);

const inferBitrateFromUrl = (value) => {
    if (typeof value !== "string") return null;
    const match = /\/asp\/hls\/(\d+)\//i.exec(value);
    if (!match) return null;
    const numeric = Number(match[1]);
    return Number.isFinite(numeric) ? numeric : null;
};

const buildSiblingVariantUrls = (manifestUrl, quality, manifestLabel) => {
    if (manifestLabel !== "hls" || !shouldPreferHighestBandwidth(quality, manifestLabel)) {
        return [];
    }

    if (!/\/asp\/hls\/\d+\//i.test(manifestUrl)) {
        return [];
    }

    const currentBitrate = inferBitrateFromUrl(manifestUrl);
    return CCTV_HLS_BITRATES
        .filter((bitrate) => bitrate !== currentBitrate)
        .map((bitrate) => ({
            bitrate,
            url: manifestUrl
                .replace(/\/asp\/hls\/\d+\//i, `/asp/hls/${bitrate}/`)
                .replace(/\/(\d+)\.m3u8(?=$|\?)/i, `/${bitrate}.m3u8`),
        }));
};

const tryPromoteDirectVariant = async (manifestUrl, quality, manifestLabel) => {
    const siblingVariants = buildSiblingVariantUrls(manifestUrl, quality, manifestLabel);
    if (!siblingVariants.length) return null;

    for (const candidate of siblingVariants) {
        const candidateText = await requestText(candidate.url);
        if (!candidateText) continue;

        try {
            const playlist = HLS.parse(candidateText);
            const segmentCount = Array.isArray(playlist?.segments) ? playlist.segments.length : 0;
            if (playlist?.isMasterPlaylist || segmentCount <= 0) {
                continue;
            }

            return candidate.url;
        } catch {}
    }

    return null;
};

const shouldTryPromoteSelectedVariant = (selected, quality, manifestLabel) => {
    if (manifestLabel !== "hls") return false;
    if (!shouldPreferHighestBandwidth(quality, manifestLabel)) return false;

    const wanted = Number(quality);
    const selectedHeight = Number(selected?.resolution?.height) || 0;
    const selectedBandwidth = Number(selected?.bandwidth) || 0;

    if (!Number.isFinite(wanted) || wanted <= 0) {
        return selectedBandwidth > 0 && selectedBandwidth < CCTV_HIGH_QUALITY_BANDWIDTH;
    }

    return selectedHeight < wanted || selectedBandwidth < CCTV_HIGH_QUALITY_BANDWIDTH;
};

const pickVariantUrl = async (manifestUrl, quality, manifestLabel) => {
    const manifestText = await requestText(manifestUrl);
    if (!manifestText) return manifestUrl;

    try {
        const playlist = HLS.parse(manifestText);
        if (!playlist?.isMasterPlaylist || !Array.isArray(playlist.variants) || playlist.variants.length === 0) {
            const promotedUrl = await tryPromoteDirectVariant(manifestUrl, quality, manifestLabel);
            if (promotedUrl) {
                return promotedUrl;
            }

            return manifestUrl;
        }

        const selected = selectVariant(playlist.variants, quality, manifestLabel);
        if (!selected?.uri) return manifestUrl;

        const resolved = new URL(selected.uri, manifestUrl).toString();
        if (shouldTryPromoteSelectedVariant(selected, quality, manifestLabel)) {
            const promotedUrl = await tryPromoteDirectVariant(resolved, quality, manifestLabel);
            if (promotedUrl) {
                return promotedUrl;
            }
        }

        return resolved;
    } catch {
        return manifestUrl;
    }
};

export default async function cctv({ id, quality, url }) {
    const pageUrl = url instanceof URL
        ? url
        : new URL(`https://tv.cctv.com/${id || ""}`);

    const html = await requestText(pageUrl);
    if (!html) return { error: "fetch.fail" };

    const guid = extractGuid(html);
    if (!guid) return { error: "fetch.empty" };
    const infoUrl = new URL("https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do");
    infoUrl.searchParams.set("pid", guid);

    const videoInfo = await requestJSON(infoUrl);
    if (!videoInfo) return { error: "fetch.fail" };
    if (videoInfo.ack !== "yes" || videoInfo.status !== "001") {
        return { error: "fetch.empty" };
    }

    const duration = toDuration(
        videoInfo?.video?.totalLength
            || videoInfo?.video?.chapters?.[0]?.duration
    );

    if (duration && duration > env.durationLimit) {
        return { error: "content.too_long" };
    }

    const manifestCandidates = collectManifestCandidates(videoInfo);
    if (!manifestCandidates.length) return { error: "fetch.empty" };

    const selectedManifest = manifestCandidates[0];
    const manifestUrl = selectedManifest.url;
    const streamUrl = await pickVariantUrl(manifestUrl, quality, selectedManifest.label);

    return {
        urls: streamUrl,
        isHLS: true,
        duration,
        filename: `cctv_${guid}.mp4`,
        audioFilename: `cctv_${guid}_audio`,
        headers: requestHeaders,
        fileMetadata: videoInfo?.title
            ? { title: String(videoInfo.title).trim() }
            : undefined,
    };
}
