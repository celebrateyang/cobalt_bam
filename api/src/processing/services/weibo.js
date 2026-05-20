const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const PAGE_TIMEOUT_MS = 15000;
const SHORT_LINK_TIMEOUT_MS = 10000;

const pageHeaders = {
    "user-agent": MOBILE_UA,
    referer: "https://h5.video.weibo.com/",
};

const mediaHeaders = {
    "user-agent": MOBILE_UA,
    referer: "https://h5.video.weibo.com/",
};

const decodeHtmlEntities = (value) =>
    String(value || "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");

const stripHtml = (value) =>
    decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " "));

const sanitizeFilenamePart = (value) =>
    String(value || "")
        .trim()
        .replace(/[\\/:*?"<>|]+/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 100);

const toAbsoluteUrl = (value, protocol = "https:") => {
    if (typeof value !== "string" || !value) return "";
    if (value.startsWith("//")) return `${protocol}${value}`;
    return value;
};

const parseNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
};

const decodeUrlPart = (value) => {
    if (typeof value !== "string") return value;

    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

const getHeight = (label, url) => {
    const text = `${label || ""} ${url || ""}`;
    const labelMatch = String(label || "").match(/(\d{3,4})P?/i);
    if (labelMatch) return parseNumber(labelMatch[1]);

    const templateMatch = text.match(/template=(\d+)x(\d+)/i);
    if (templateMatch) {
        return Math.min(parseNumber(templateMatch[1]), parseNumber(templateMatch[2]));
    }

    const fallbackMatch = text.match(/(\d{3,4})P?/i);
    return fallbackMatch ? parseNumber(fallbackMatch[1]) : 0;
};

const pickFormat = (formats, quality) => {
    const usable = formats
        .filter((format) => typeof format?.url === "string" && format.url)
        .sort((a, b) => a.height - b.height);

    if (!usable.length) return null;
    if (quality === "max") return usable.at(-1);

    const wanted = parseNumber(quality);
    if (wanted <= 0) return usable.at(-1);

    return usable.reduce((best, current) => {
        const bestDiff = Math.abs((best.height || 0) - wanted);
        const currentDiff = Math.abs((current.height || 0) - wanted);
        if (currentDiff !== bestDiff) return currentDiff < bestDiff ? current : best;
        return (current.height || 0) > (best.height || 0) ? current : best;
    });
};

const collectFormats = (info) => {
    const formats = [];
    const urls = info?.urls && typeof info.urls === "object" ? info.urls : {};

    for (const [label, value] of Object.entries(urls)) {
        const url = toAbsoluteUrl(value);
        if (!url || formats.some((format) => format.url === url)) continue;

        formats.push({
            label,
            url,
            height: getHeight(label, url),
        });
    }

    const streamUrl = toAbsoluteUrl(info?.stream_url);
    if (streamUrl && !formats.some((format) => format.url === streamUrl)) {
        formats.push({
            label: "default",
            url: streamUrl,
            height: getHeight("default", streamUrl),
        });
    }

    return formats;
};

const extractOidFromUrl = (value) => {
    let parsed;
    try {
        parsed = value instanceof URL ? value : new URL(value);
    } catch {
        return null;
    }

    const fid = parsed.searchParams.get("fid");
    if (fid) return fid;

    const pathMatch = parsed.pathname.match(/\/(?:tv\/)?show\/([^/?#]+)/i);
    return pathMatch?.[1] ? decodeURIComponent(pathMatch[1]) : null;
};

const resolveShortLink = async (shortLink) => {
    if (!shortLink) return null;

    let current = new URL(`https://t.cn/${encodeURIComponent(shortLink)}`);
    for (let i = 0; i < 5; i++) {
        const response = await fetch(current, {
            redirect: "manual",
            headers: pageHeaders,
            signal: AbortSignal.timeout(SHORT_LINK_TIMEOUT_MS),
        });

        const location = response.headers.get("location");
        if (!location) {
            return response.url || current.toString();
        }

        current = new URL(location, current);
    }

    return current.toString();
};

const fetchPlayInfo = async (oid) => {
    const page = `/show/${encodeURIComponent(oid)}`;
    const apiUrl = new URL("https://h5.video.weibo.com/api/component");
    apiUrl.searchParams.set("page", page);

    const body = new URLSearchParams({
        data: JSON.stringify({
            Component_Play_Playinfo: { oid },
        }),
    });

    const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
            ...pageHeaders,
            "content-type": "application/x-www-form-urlencoded",
            "page-referer": page,
        },
        body,
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const data = await response.json().catch(() => null);
    return data?.code === "100000"
        ? data?.data?.Component_Play_Playinfo
        : null;
};

export default async function weibo({ oid, fid, shortLink, quality, url }) {
    try {
        let resolvedOid = decodeUrlPart(oid || fid) || extractOidFromUrl(url);

        if (!resolvedOid && shortLink) {
            resolvedOid = extractOidFromUrl(await resolveShortLink(shortLink));
        }

        if (!resolvedOid) return { error: "fetch.empty" };

        const info = await fetchPlayInfo(resolvedOid);
        if (!info) return { error: "fetch.empty" };

        const selected = pickFormat(collectFormats(info), quality);
        if (!selected?.url) return { error: "fetch.empty" };

        const title = sanitizeFilenamePart(
            stripHtml(info.text) || info.title || info.nickname || resolvedOid
        );
        const mediaId = info.media_id || info.id || resolvedOid;
        const duration = parseNumber(info.duration_time);

        return {
            type: "video",
            urls: selected.url,
            original_url: `https://h5.video.weibo.com/show/${encodeURIComponent(resolvedOid)}`,
            filename: `${title || "weibo"}_${mediaId}.mp4`,
            duration: duration > 0 ? Math.round(duration) : undefined,
            cover: toAbsoluteUrl(info.cover_image),
            headers: mediaHeaders,
            fileMetadata: title ? { title } : undefined,
        };
    } catch {
        return { error: "fetch.fail" };
    }
}
