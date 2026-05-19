import { env } from "../../config.js";

const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const PAGE_TIMEOUT_MS = 15000;
const VOD_TIMEOUT_MS = 15000;

const pageHeaders = {
    "user-agent": MOBILE_UA,
    referer: "https://www.toutiao.com/",
};

const mediaHeaders = {
    "user-agent": MOBILE_UA,
    referer: "https://m.toutiao.com/",
};

const decodeHtmlEntities = (value) =>
    String(value || "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");

const sanitizeFilenamePart = (value) =>
    String(value || "")
        .trim()
        .replace(/[\\/:*?"<>|]+/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 100);

const parseNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
};

const getHeight = (entry) => {
    const direct = parseNumber(entry?.Height);
    if (direct > 0) return direct;

    const match = String(entry?.Definition || "").match(/(\d{3,4})p/i);
    return match ? parseNumber(match[1]) : 0;
};

const pickFormat = (formats, quality) => {
    const usable = formats
        .filter((entry) => typeof entry?.url === "string" && entry.url)
        .sort((a, b) => {
            const heightDiff = getHeight(a) - getHeight(b);
            if (heightDiff !== 0) return heightDiff;
            return parseNumber(a.Bitrate) - parseNumber(b.Bitrate);
        });

    if (!usable.length) return null;
    if (quality === "max") return usable.at(-1);

    const wanted = parseNumber(quality);
    if (wanted <= 0) return usable.at(-1);

    return usable.reduce((best, current) => {
        const bestHeight = getHeight(best);
        const currentHeight = getHeight(current);
        const bestDiff = Math.abs(bestHeight - wanted);
        const currentDiff = Math.abs(currentHeight - wanted);

        if (currentDiff !== bestDiff) return currentDiff < bestDiff ? current : best;
        return currentHeight > bestHeight ? current : best;
    });
};

const getPageCandidates = ({ id, url }) => {
    const candidates = [];

    if (url instanceof URL) {
        candidates.push(url);
    }

    if (id) {
        candidates.push(new URL(`https://m.toutiao.com/video/${encodeURIComponent(id)}/`));
        candidates.push(new URL(`https://www.toutiao.com/video/${encodeURIComponent(id)}/`));
    }

    return candidates.filter((candidate, index, list) =>
        list.findIndex((item) => item.toString() === candidate.toString()) === index
    );
};

const parseRenderData = (html) => {
    const match = String(html || "").match(
        /<script[^>]+id=["']RENDER_DATA["'][^>]*>([^<]+)<\/script>/i
    );
    if (!match?.[1]) return null;

    try {
        return JSON.parse(decodeURIComponent(match[1]));
    } catch {
        return null;
    }
};

const decodePlayAuthToken = (token) => {
    if (typeof token !== "string" || !token) return null;

    try {
        const decoded = decodeURIComponent(token);
        const data = JSON.parse(Buffer.from(decoded, "base64").toString("utf8"));
        const query = String(data?.GetPlayInfoToken || "").replace(/\\u0026/g, "&");
        return query || null;
    } catch {
        return null;
    }
};

const fetchArticleInfo = async (candidates, expectedId) => {
    for (const candidate of candidates) {
        const response = await fetch(candidate, {
            headers: pageHeaders,
            signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        });
        if (!response.ok) continue;

        const html = await response.text();
        const data = parseRenderData(html);
        const articleInfo = data?.articleInfo;
        if (!articleInfo) continue;

        if (expectedId && String(articleInfo.gid || "") !== String(expectedId)) {
            continue;
        }

        return {
            articleInfo,
            pageUrl: candidate,
        };
    }

    return null;
};

const collectFormats = (playInfoList) => {
    if (!Array.isArray(playInfoList)) return [];

    return playInfoList.flatMap((entry) => {
        const urls = [
            entry?.MainPlayUrl,
            entry?.BackupPlayUrl,
            ...(Array.isArray(entry?.BackupPlayUrlList) ? entry.BackupPlayUrlList : []),
            entry?.PlayUrl,
        ].filter((value, index, list) =>
            typeof value === "string" &&
            value &&
            list.indexOf(value) === index
        );

        if (!urls.length) return [];

        return [{
            ...entry,
            url: urls[0],
            urlCandidates: urls,
        }];
    });
};

const fetchPlayInfo = async (tokenQuery) => {
    const response = await fetch(`https://vod.bytedanceapi.com/?${tokenQuery}`, {
        headers: mediaHeaders,
        signal: AbortSignal.timeout(VOD_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const body = await response.json().catch(() => null);
    const data = body?.Result?.Data;
    if (!data || data.Status === 40) return null;

    return data;
};

export default async function toutiao({ id, quality, url }) {
    try {
        const result = await fetchArticleInfo(
            getPageCandidates({ id, url }),
            id,
        );
        const articleInfo = result?.articleInfo;
        if (!articleInfo) return { error: "fetch.empty" };

        const tokenQuery = decodePlayAuthToken(articleInfo.playAuthTokenV2);
        if (!tokenQuery) return { error: "fetch.empty" };

        const playInfo = await fetchPlayInfo(tokenQuery);
        if (!playInfo) return { error: "fetch.empty" };

        const selected = pickFormat(collectFormats(playInfo.PlayInfoList), quality);
        if (!selected?.url) return { error: "fetch.empty" };

        const duration = parseNumber(articleInfo.videoDuration || playInfo.Duration);
        if (duration > env.durationLimit) {
            return { error: "content.too_long" };
        }

        const title = sanitizeFilenamePart(
            decodeHtmlEntities(articleInfo.title || articleInfo.videoId || id)
        );
        const videoId = articleInfo.videoId || playInfo.VideoID || id || "video";

        return {
            type: "video",
            urls: selected.url,
            urlCandidates: selected.urlCandidates,
            original_url: result.pageUrl.toString(),
            filename: `${title || "toutiao"}_${videoId}.mp4`,
            duration: duration > 0 ? Math.round(duration) : undefined,
            cover: articleInfo.posterUrl || playInfo.CoverUrl,
            headers: mediaHeaders,
            fileMetadata: title ? { title } : undefined,
        };
    } catch {
        return { error: "fetch.fail" };
    }
}
