import { extract, normalizeURL } from "../url.js";
import instagram from "../services/instagram.js";
import tiktok from "../services/tiktok.js";

const DEFAULT_PLAY_URL_TTL_MS = 4 * 60 * 60 * 1000;
const MAX_PLAY_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PLAY_URL_SAFETY_MS = 2 * 60 * 1000;

const toNumber = (value) => {
    if (value === null || value === undefined) return null;
    const raw = typeof value === "string" ? Number(value) : Number(value);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return raw;
};

const parseExpiryFromUrl = (rawUrl) => {
    if (typeof rawUrl !== "string" || !rawUrl) return null;

    try {
        const url = new URL(rawUrl);
        const nowMs = Date.now();
        const queryKeys = [
            "x-expires",
            "expires",
            "expire",
            "exp",
            "e",
        ];

        for (const key of queryKeys) {
            const value = toNumber(url.searchParams.get(key));
            if (!value) continue;
            const asMs = value < 1e12 ? value * 1000 : value;
            if (asMs > nowMs) return asMs;
        }

        // Instagram URLs commonly include `oe` as a hex unix timestamp.
        const oe = url.searchParams.get("oe");
        if (typeof oe === "string" && /^[0-9a-fA-F]{6,12}$/.test(oe)) {
            const unix = Number.parseInt(oe, 16);
            if (Number.isFinite(unix) && unix > 0) {
                const asMs = unix * 1000;
                if (asMs > nowMs) return asMs;
            }
        }
    } catch {
        return null;
    }

    return null;
};

const normalizeExpiryMs = (candidateMs) => {
    const nowMs = Date.now();
    const fallback = nowMs + DEFAULT_PLAY_URL_TTL_MS;
    const candidate = toNumber(candidateMs);
    if (!candidate) return fallback;

    const capped = Math.min(candidate, nowMs + MAX_PLAY_URL_TTL_MS);
    if (capped <= nowMs + PLAY_URL_SAFETY_MS) return fallback;
    return capped;
};

const isLikelyImageUrl = (value) => {
    if (typeof value !== "string" || !value) return false;
    return /\.(jpe?g|png|webp|gif|bmp|avif)(?:$|[?#])/i.test(value);
};

const pickPlayableUrl = (result) => {
    if (!result || result.error) return "";
    if (result.isAudioOnly) return "";

    if (Array.isArray(result.picker)) {
        const firstVideo = result.picker.find(
            (item) => item?.type === "video" && typeof item.url === "string",
        );
        if (firstVideo?.url) return firstVideo.url;
        return "";
    }

    if (typeof result.urls === "string" && result.urls.startsWith("http")) {
        if (isLikelyImageUrl(result.urls)) return "";
        return result.urls;
    }

    return "";
};

const resolveByHost = async ({ host, patternMatch }) => {
    if (host === "instagram") {
        return await instagram({
            ...patternMatch,
            quality: "1080",
            alwaysProxy: false,
        });
    }

    if (host === "tiktok") {
        return await tiktok({
            postId: patternMatch.postId,
            shortLink: patternMatch.shortLink,
            fullAudio: false,
            isAudioOnly: false,
            h265: false,
            alwaysProxy: false,
        });
    }

    throw new Error(`unsupported_platform:${host}`);
};

export const isPlayUrlFresh = (playUrl, expiresAt, { safetyMs = PLAY_URL_SAFETY_MS } = {}) => {
    if (typeof playUrl !== "string" || !playUrl) return false;
    const expires = toNumber(expiresAt);
    if (!expires) return true;
    return expires - Date.now() > Math.max(0, Number(safetyMs) || 0);
};

export const resolveDirectPlayUrl = async (sourceUrl) => {
    if (typeof sourceUrl !== "string" || !sourceUrl.trim()) {
        throw new Error("invalid_source_url");
    }

    const normalized = normalizeURL(sourceUrl.trim());
    const parsed = extract(normalized);
    if (!parsed || parsed.error) {
        throw new Error(`unsupported_url:${parsed?.error || "unknown"}`);
    }

    const result = await resolveByHost(parsed);
    const playUrl = pickPlayableUrl(result);
    if (!playUrl) {
        throw new Error(`play_url_unavailable:${parsed.host}`);
    }

    const resolvedAt = Date.now();
    const parsedExpiry = parseExpiryFromUrl(playUrl);
    const expiresAt = normalizeExpiryMs(parsedExpiry);

    return {
        playUrl,
        host: parsed.host,
        resolvedAt,
        expiresAt,
    };
};

export const resolveDirectPlayUrlForVideo = async (video) => {
    if (!video?.video_url) {
        throw new Error("video_url_missing");
    }

    return await resolveDirectPlayUrl(video.video_url);
};
