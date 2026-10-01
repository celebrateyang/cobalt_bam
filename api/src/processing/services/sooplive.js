import { genericUserAgent } from "../../config.js";
import { createStream } from "../../stream/manage.js";

const API_URL = "https://api.m.sooplive.com/station/video/a/view";
const SUPPORTED_MEDIA_HOST_RE = /(?:^|\.)(?:sooplive\.com|sooplive\.co\.kr|afreecatv\.com)$/i;

const parseNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const mediaHeight = (item) => {
    const dimensions = String(item?.resolution || "")
        .split("x")
        .map(parseNumber);
    return Math.max(...dimensions, parseNumber(String(item?.label || "").match(/\d+/)?.[0]));
};

const mediaBitrate = (item) =>
    parseNumber(String(item?.bitrate || "").match(/\d+/)?.[0]);

const isSupportedMediaUrl = (value) => {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "https:"
            && SUPPORTED_MEDIA_HOST_RE.test(parsed.hostname)
            && /\.m3u8(?:$|[?#])/i.test(parsed.toString());
    } catch {
        return false;
    }
};

export const selectSoopQuality = (qualityInfo, requestedQuality) => {
    const allCandidates = Array.isArray(qualityInfo)
        ? qualityInfo.filter((item) => isSupportedMediaUrl(item?.file))
        : [];
    const fixedCandidates = allCandidates.filter((item) => mediaHeight(item) > 0);
    const candidates = fixedCandidates.length ? fixedCandidates : allCandidates;
    if (!candidates.length) return null;

    const target = requestedQuality === "max"
        ? Number.POSITIVE_INFINITY
        : parseNumber(requestedQuality) || 1080;

    return [...candidates].sort((a, b) => {
        if (target === Number.POSITIVE_INFINITY) {
            return mediaHeight(b) - mediaHeight(a) || mediaBitrate(b) - mediaBitrate(a);
        }

        return Math.abs(mediaHeight(a) - target) - Math.abs(mediaHeight(b) - target)
            || mediaBitrate(b) - mediaBitrate(a);
    })[0];
};

const selectFileUrl = (file, quality) => {
    const selected = selectSoopQuality(file?.quality_info, quality);
    if (selected) return { url: selected.file, height: mediaHeight(selected) };
    if (isSupportedMediaUrl(file?.file)) return { url: file.file, height: 0 };
    return null;
};

const requestVideo = async (id, referer) => {
    const body = new URLSearchParams({
        nTitleNo: id,
        nApiLevel: "10",
    });

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                accept: "application/json, text/plain, */*",
                referer,
                origin: "https://vod.sooplive.com",
                "user-agent": genericUserAgent,
            },
            body,
        });
        if (!response.ok) return null;
        return response.json();
    } catch {
        return null;
    }
};

export default async function sooplive({ id, quality, url }) {
    const pageUrl = url instanceof URL
        ? url.toString()
        : `https://vod.sooplive.com/player/${encodeURIComponent(id)}`;
    const response = await requestVideo(id, pageUrl);
    if (!response) return { error: "fetch.fail" };

    const data = response?.data;
    if (data?.code === -6221 || data?.code === -6205) {
        return { error: "content.video.unavailable" };
    }

    const files = Array.isArray(data?.files) ? data.files : [];
    const selectedFiles = files
        .map((file) => ({ file, selected: selectFileUrl(file, quality) }))
        .filter((entry) => entry.selected);

    if (!selectedFiles.length) {
        return {
            error: data?.sub_upload_type || data?.adult_status === "notLogin"
                ? "content.video.unavailable"
                : "fetch.empty",
        };
    }

    const title = String(data?.title || `SOOP ${id}`).trim();
    const author = String(data?.writer_nick || "").trim() || undefined;
    const durationMs = parseNumber(data?.total_file_duration)
        || selectedFiles.reduce((total, entry) => total + parseNumber(entry.file?.duration), 0);
    const heights = selectedFiles.map((entry) => entry.selected.height).filter(Boolean);
    const qualityHeight = heights.length ? Math.min(...heights) : 0;
    const urls = selectedFiles.map((entry) => entry.selected.url);

    if (selectedFiles.length > 1) {
        return {
            service: "sooplive",
            picker: selectedFiles.map((entry, index) => ({
                type: "video",
                url: createStream({
                    type: "remux",
                    url: entry.selected.url,
                    service: "sooplive",
                    filename: `SOOP_${id}_part_${index + 1}.mp4`,
                    headers: {
                        referer: pageUrl,
                        origin: "https://vod.sooplive.com",
                        "user-agent": genericUserAgent,
                    },
                    isHLS: true,
                }),
                thumb: typeof data?.thumb === "string" ? data.thumb : undefined,
                label: `Part ${index + 1}`,
                note: title,
            })),
        };
    }

    return {
        urls: urls[0],
        service: "sooplive",
        isHLS: true,
        duration: durationMs > 0 ? Math.round(durationMs / 1000) : undefined,
        headers: {
            referer: pageUrl,
            origin: "https://vod.sooplive.com",
            "user-agent": genericUserAgent,
        },
        filenameAttributes: {
            service: "SOOP",
            id,
            title,
            author,
            qualityLabel: qualityHeight ? `${qualityHeight}p` : "HLS",
            extension: "mp4",
        },
        audioFilename: title,
        fileMetadata: {
            title,
            artist: author,
        },
        cover: typeof data?.thumb === "string" ? data.thumb : undefined,
    };
}
