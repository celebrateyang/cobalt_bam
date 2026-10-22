import { genericUserAgent } from "../../config.js";
import { getRedirectingURL } from "../../misc/utils.js";
import HLS from "hls-parser";

const CARD_API_URL = "https://creatorhub-api.naver.com/api/v7.0/clipviewer/card";

const defaultHeaders = {
    "user-agent": genericUserAgent,
    "accept": "application/json,text/plain,*/*",
    "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
};

const parseNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
};

const normalizeQuality = (quality) => {
    if (quality === "max") return 9000;
    return parseNumber(quality) || 1080;
};

const readFirst = (value) => {
    if (Array.isArray(value)) return value[0];
    return value;
};

const getTextValue = (value) => {
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
        return value["#text"] || value.value || "";
    }
    return "";
};

const getLabelValue = (labels, kind) => {
    if (!Array.isArray(labels)) return "";

    const found = labels.find((label) => label?.["@kind"] === kind);
    return getTextValue(found);
};

const getResolution = (representation) => {
    const labelResolution = parseNumber(getLabelValue(representation?.["nvod:Label"], "resolution"));
    if (labelResolution) return labelResolution;

    return Math.max(
        parseNumber(representation?.["@height"]),
        parseNumber(representation?.["@width"]),
    );
};

const collectRepresentations = (playback) => {
    const periods = readFirst(playback?.MPD)?.Period;
    const adaptationSets = readFirst(periods)?.AdaptationSet;
    const sets = Array.isArray(adaptationSets) ? adaptationSets : [adaptationSets].filter(Boolean);
    const representations = [];

    for (const set of sets) {
        const items = Array.isArray(set?.Representation)
            ? set.Representation
            : [set?.Representation].filter(Boolean);

        for (const item of items) {
            const hlsUrl = readFirst(item?.["@nvod:m3u"]);
            if (typeof hlsUrl === "string" && /^https?:\/\//i.test(hlsUrl)) {
                // Use the representation playlist, not the set's master, so
                // FFmpeg cannot silently switch to a different resolution.
                representations.push({
                    url: hlsUrl,
                    height: getResolution(item),
                    bandwidth: parseNumber(item?.["@bandwidth"]),
                    isHLS: true,
                    hlsAudioCodec: String(item?.["@codecs"] || set?.["@codecs"] || "")
                        .split(",").map(codec => codec.trim()).find(codec => codec.startsWith("mp4a.")),
                });
            }
            // A DASH BaseURL with a SegmentTemplate is a directory, not a
            // complete progressive video. Never return it as an MP4 download.
            if (item?.SegmentTemplate || set?.SegmentTemplate) continue;
            const url = readFirst(item?.BaseURL);
            if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
                continue;
            }

            representations.push({
                url,
                height: getResolution(item),
                bandwidth: parseNumber(item?.["@bandwidth"]),
                mimeType: String(item?.["@mimeType"] || set?.["@mimeType"] || ""),
            });
        }
    }

    return representations.filter((item) => item.isHLS || item.mimeType.includes("video/mp4") || /\.mp4(?:$|[?#])/i.test(item.url));
};

const rankCandidates = (items, quality) => {
    const target = normalizeQuality(quality);
    return items
        .map((item) => ({
            ...item,
            score:
                (target >= 9000 ? item.height : -Math.abs(item.height - target) * 2)
                + item.height * 0.1,
        }))
        .sort((a, b) => b.score - a.score
            || Number(Boolean(a.isHLS)) - Number(Boolean(b.isHLS))
            || b.bandwidth - a.bandwidth);
};

const probeMedia = async (url, headers, range, isHlsSegment = false) => {
    let reader;
    try {
        const response = await fetch(url, {
            headers: { ...headers, range },
            signal: AbortSignal.timeout(5_000),
        });
        reader = response.body?.getReader();
        const contentType = response.headers.get("content-type") || "";
        const mediaType = isHlsSegment
            ? /^(video\/(mp2t|mpeg|mp4)|application\/octet-stream)(?:;|$)/i
            : /^(video\/mp4|application\/octet-stream)(?:;|$)/i;
        if (!response.ok
            || !mediaType.test(contentType)
            || response.headers.get("content-length") === "0") return false;
        const chunk = await reader?.read();
        return Boolean(chunk?.value?.length);
    } catch {
        return false;
    } finally {
        // A server may ignore Range; never buffer a multi-gigabyte video here.
        await reader?.cancel().catch(() => {});
    }
};

const probeHls = async (url, headers) => {
    try {
        const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
        if (!response.ok) {
            await response.body?.cancel();
            return false;
        }
        const manifest = await response.text();
        if (!manifest.trimStart().startsWith("#EXTM3U")) return false;
        const playlist = HLS.parse(manifest);
        if (playlist.isMasterPlaylist || !playlist.segments?.length) return false;
        const segments = playlist.segments;
        const samples = [...new Set([0, Math.floor(segments.length / 2), segments.length - 1])];
        const checks = await Promise.all(samples.map(index => {
            const segment = segments[index];
            if (!segment.uri) return false;
            return probeMedia(new URL(segment.uri, response.url || url).href, headers, "bytes=0-0", true);
        }));
        return checks.every(Boolean);
    } catch {
        return false;
    }
};

const selectPlayable = async (items, quality, headers) => {
    for (const candidate of rankCandidates(items, quality)) {
        if (candidate.isHLS) {
            if (await probeHls(candidate.url, headers)) return candidate;
            continue;
        }
        // Old NAVER encodes may return 403, or serve only cached initial bytes.
        // Read both ends before issuing a tunnel or charging points.
        if (await probeMedia(candidate.url, headers, "bytes=0-0")
            && await probeMedia(candidate.url, headers, "bytes=-1")) return candidate;
    }
};

const getSummaryText = (summary, key) => {
    const value = readFirst(readFirst(summary)?.[key]);
    return getTextValue(value);
};

const buildMetadata = (content, playback) => {
    const summary = readFirst(readFirst(playback?.MPD)?.Period)?.SupplementalProperty?.[0]?.["nvod:Summary"];
    const title =
        String(content?.title || "").trim()
        || String(content?.description || "").trim()
        || getSummaryText(summary, "nvod:Title")
        || `naver_${content?.mediaId || "shorts"}`;
    const cover =
        getSummaryText(summary, "nvod:Cover")
        || content?.profile?.profileImageUrl
        || content?.profile?.logo?.url;

    return {
        title,
        cover,
        duration: parseDuration(readFirst(readFirst(playback?.MPD)?.Period)?.["@duration"]),
    };
};

const parseDuration = (value) => {
    if (typeof value !== "string") return;

    const match = value.match(/^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/);
    if (!match) return;

    return (
        parseNumber(match[1]) * 3600
        + parseNumber(match[2]) * 60
        + parseNumber(match[3])
    );
};

const extractParamsFromUrl = (value) => {
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        return {};
    }

    const bridgeUrl = parsed.searchParams.get("url");
    if (bridgeUrl) {
        return extractParamsFromUrl(bridgeUrl);
    }

    const deepLinkParams = parsed.searchParams.get("params");
    if (deepLinkParams) {
        try {
            const params = JSON.parse(deepLinkParams);
            return {
                mediaId: params.seedMediaId || params.mediaId,
                serviceType: params.serviceType,
                mediaType: params.mediaType,
            };
        } catch {
            // fall through to normal query extraction
        }
    }

    return {
        mediaId: parsed.searchParams.get("mediaId") || parsed.searchParams.get("seedMediaId"),
        serviceType: parsed.searchParams.get("serviceType"),
        mediaType: parsed.searchParams.get("mediaType") || parsed.searchParams.get("seedMediaType"),
    };
};

const resolveShortLink = async (shortLink) => {
    const source = `https://naver.me/${encodeURIComponent(shortLink)}`;
    const first = await getRedirectingURL(source, undefined, defaultHeaders);
    if (!first) return {};

    let resolved;
    try {
        resolved = new URL(first, source).toString();
    } catch {
        return {};
    }

    const params = extractParamsFromUrl(resolved);
    if (params.mediaId) return params;

    const second = await getRedirectingURL(resolved, undefined, defaultHeaders);
    if (!second) return params;

    try {
        return extractParamsFromUrl(new URL(second, resolved).toString());
    } catch {
        return params;
    }
};

const resolveBlogClip = async (blogId, clipId) => {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(blogId || "") || !/^\d{1,18}$/.test(clipId || "")) {
        return { error: "link.unsupported" };
    }
    try {
        const response = await fetch(`https://m.blog.naver.com/${blogId}/clip/${clipId}`, {
            headers: defaultHeaders,
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return { error: "fetch.fail" };
        const html = await response.text();
        const state = html.match(/window\.__REACT_QUERY_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/)?.[1];
        if (!state) return { error: "fetch.empty" };
        const document = JSON.parse(state).queries?.find(query =>
            query.queryKey?.[0] === "GetClipDocument"
            && query.queryKey?.includes(blogId)
            && String(query.state?.data?.docNo) === clipId)?.state?.data;
        if (!document?.videoId || document.blogId !== blogId) return { error: "content.video.unavailable" };
        return { mediaId: document.videoId, serviceType: "MOMENT", mediaType: "VOD" };
    } catch {
        return { error: "fetch.fail" };
    }
};

const fetchCard = async ({ mediaId, serviceType, mediaType }) => {
    const url = new URL(CARD_API_URL);
    url.searchParams.set("userInteraction", "true");
    url.searchParams.set("seedType", "SPECIFIC");
    url.searchParams.set("seedMediaId", mediaId);
    url.searchParams.set("serviceType", serviceType || "MOMENT");
    url.searchParams.set("mediaType", mediaType || "VOD");

    const response = await fetch(url, {
        headers: defaultHeaders,
        signal: AbortSignal.timeout(10_000),
    }).catch(() => null);

    if (!response?.ok) return { error: "fetch.fail" };
    return response.json().catch(() => ({ error: "fetch.fail" }));
};

export default async function naver(obj) {
    const params = obj.blogId || obj.clipId
        ? await resolveBlogClip(obj.blogId, obj.clipId)
        : obj.shortLink
        ? await resolveShortLink(obj.shortLink)
        : {
            mediaId: obj.mediaId,
            serviceType: obj.serviceType,
            mediaType: obj.mediaType,
        };

    if (params?.error) return params;
    if (!params?.mediaId || !/^[0-9A-F]{16,64}$/i.test(params.mediaId)) {
        return { error: "link.unsupported" };
    }

    const data = await fetchCard(params);
    if (data?.error) return data;
    if (data?.header?.code && data.header.code !== 0) return { error: "fetch.fail" };
    const content = data?.body?.card?.content;
    const playback = content?.vod?.playback;
    if (!content || content?.vod?.playable === false || !playback) {
        return { error: "content.video.unavailable" };
    }

    const candidates = collectRepresentations(playback);
    if (!candidates.length) {
        return { error: "fetch.empty" };
    }
    const headers = {
        referer: `https://m.naver.com/shorts/?mediaId=${encodeURIComponent(params.mediaId)}`,
        origin: "https://m.naver.com",
        "user-agent": genericUserAgent,
    };
    const selected = await selectPlayable(candidates, obj.quality, headers);
    if (!selected) return { error: "fetch.fail" };

    const metadata = buildMetadata(content, playback);
    const title = metadata.title || `naver_${params.mediaId}`;

    return {
        urls: selected.url,
        isHLS: selected.isHLS === true,
        hlsAudioCodec: selected.hlsAudioCodec,
        headers,
        filenameAttributes: {
            service: "naver",
            id: params.mediaId,
            title,
            author: content?.profile?.nickname || content?.channel?.channelName || undefined,
            qualityLabel: selected.height ? `${selected.height}p` : "MP4",
            extension: "mp4",
        },
        audioFilename: title,
        fileMetadata: {
            title,
            artist: content?.profile?.nickname || content?.channel?.channelName || undefined,
        },
        cover: metadata.cover,
        duration: metadata.duration,
        service: "naver",
    };
}
