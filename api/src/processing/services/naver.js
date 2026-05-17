import { genericUserAgent } from "../../config.js";
import { getRedirectingURL } from "../../misc/utils.js";

const CARD_API_URL = "https://creatorhub-api.naver.com/api/v5.0/clipviewer/card";

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

    return representations.filter((item) => item.mimeType.includes("video/mp4") || /\.mp4(?:$|[?#])/i.test(item.url));
};

const pickBest = (items, quality) => {
    if (!items.length) return;

    const target = normalizeQuality(quality);
    return items
        .map((item) => ({
            ...item,
            score:
                (target >= 9000 ? item.height : -Math.abs(item.height - target) * 2)
                + Math.min(item.bandwidth, 8000) / 10
                + item.height * 0.1,
        }))
        .sort((a, b) => b.score - a.score)[0];
};

const getSummaryText = (summary, key) => {
    const value = readFirst(readFirst(summary)?.[key]);
    return getTextValue(value);
};

const buildMetadata = (content, playback) => {
    const summary = readFirst(readFirst(playback?.MPD)?.Period)?.SupplementalProperty?.[0]?.["nvod:Summary"];
    const title =
        String(content?.description || "").trim()
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

const fetchCard = async ({ mediaId, serviceType, mediaType }) => {
    const url = new URL(CARD_API_URL);
    url.searchParams.set("userInteraction", "true");
    url.searchParams.set("seedType", "SPECIFIC");
    url.searchParams.set("seedMediaId", mediaId);
    url.searchParams.set("serviceType", serviceType || "MOMENT");
    url.searchParams.set("mediaType", mediaType || "VOD");

    const response = await fetch(url, {
        headers: defaultHeaders,
    }).catch(() => null);

    if (!response?.ok) return;
    return response.json().catch(() => null);
};

export default async function naver(obj) {
    const params = obj.shortLink
        ? await resolveShortLink(obj.shortLink)
        : {
            mediaId: obj.mediaId,
            serviceType: obj.serviceType,
            mediaType: obj.mediaType,
        };

    if (!params?.mediaId || !/^[0-9A-F]{16,64}$/i.test(params.mediaId)) {
        return { error: "link.unsupported" };
    }

    const data = await fetchCard(params);
    const content = data?.body?.card?.content;
    const playback = content?.vod?.playback;
    if (!content || content?.vod?.playable === false || !playback) {
        return { error: "content.video.unavailable" };
    }

    const candidates = collectRepresentations(playback);
    const selected = pickBest(candidates, obj.quality);
    if (!selected?.url) {
        return { error: "fetch.empty" };
    }

    const metadata = buildMetadata(content, playback);
    const title = metadata.title || `naver_${params.mediaId}`;

    return {
        urls: selected.url,
        headers: {
            referer: `https://m.naver.com/shorts/?mediaId=${encodeURIComponent(params.mediaId)}`,
            origin: "https://m.naver.com",
            "user-agent": genericUserAgent,
        },
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
