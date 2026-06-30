import { getCookie } from "../cookie/manager.js";
import { parse as parseSetCookie, splitCookiesString } from "set-cookie-parser";

const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const PAGE_TIMEOUT_MS = 15000;
const SHORT_LINK_TIMEOUT_MS = 10000;
const VISITOR_COOKIE_TTL_MS = 6 * 60 * 60 * 1000;

const pageHeaders = {
    "user-agent": MOBILE_UA,
    referer: "https://h5.video.weibo.com/",
};

const mediaHeaders = {
    "user-agent": MOBILE_UA,
    referer: "https://h5.video.weibo.com/",
};

const statusHeaders = {
    "user-agent": MOBILE_UA,
    accept: "application/json, text/plain, */*",
    referer: "https://weibo.com/",
    "x-requested-with": "XMLHttpRequest",
};

let visitorCookie = null;

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

const collectStatusFormats = (mediaInfo) => {
    const formats = collectFormats(mediaInfo);
    const seen = new Set(formats.map(format => format.url));

    const addFormat = (label, value) => {
        const url = toAbsoluteUrl(value);
        if (!url || seen.has(url)) return;

        seen.add(url);
        formats.push({
            label,
            url,
            height: getHeight(label, url),
        });
    };

    addFormat("stream_url", mediaInfo?.stream_url);

    if (mediaInfo?.playback_list && typeof mediaInfo.playback_list === "object") {
        for (const item of Object.values(mediaInfo.playback_list).flat()) {
            const meta = item?.play_info || item;
            addFormat(meta?.quality_label || meta?.label || meta?.quality || "playback", meta?.url);
        }
    }

    const directKeys = [
        "mp4_hd_url",
        "mp4_720p_mp4",
        "mp4_1080p_mp4",
        "mp4_4k_mp4",
        "h5_url",
    ];
    for (const key of directKeys) {
        addFormat(key, mediaInfo?.[key]);
    }

    return formats;
};

const findObjectId = (value) => {
    if (!value) return null;

    if (typeof value === "string") {
        return value.match(/1034:[0-9A-Za-z:_-]{1,64}/)?.[0] || null;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            const id = findObjectId(item);
            if (id) return id;
        }
        return null;
    }

    if (typeof value === "object") {
        for (const key of ["object_id", "oid", "fid", "media_id"]) {
            const id = findObjectId(value[key]);
            if (id) return id;
        }

        for (const item of Object.values(value)) {
            const id = findObjectId(item);
            if (id) return id;
        }
    }

    return null;
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

const parseCallbackJson = (value, callbackName) => {
    const text = String(value || "").trim();
    const prefix = `window.${callbackName} && ${callbackName}(`;
    if (!text.startsWith(prefix)) return null;

    const start = prefix.length;
    const end = text.lastIndexOf(")");
    if (end <= start) return null;

    return JSON.parse(text.slice(start, end));
};

const getSetCookieHeader = (headers) => {
    if (typeof headers?.getSetCookie === "function") {
        return headers.getSetCookie().join(", ");
    }

    return headers?.get?.("set-cookie") || "";
};

const fetchVisitorCookie = async () => {
    const now = Date.now();
    if (visitorCookie?.value && visitorCookie.expiresAt > now) {
        return visitorCookie.value;
    }

    const fp = {
        os: "1",
        browser: "Chrome138,0,0,0",
        fonts: "undefined",
        screenInfo: "1920*1080*24",
        plugins: "Portable Document Format::internal-pdf-viewer::PDF Viewer",
    };

    const genResponse = await fetch("https://passport.weibo.com/visitor/genvisitor", {
        method: "POST",
        headers: {
            "user-agent": MOBILE_UA,
            "content-type": "application/x-www-form-urlencoded",
            referer: "https://weibo.com/",
        },
        body: new URLSearchParams({
            cb: "gen_callback",
            fp: JSON.stringify(fp),
        }),
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });

    if (!genResponse.ok) return null;

    const genData = parseCallbackJson(await genResponse.text(), "gen_callback");
    const tid = genData?.data?.tid;
    if (!tid) return null;

    const visitorUrl = new URL("https://passport.weibo.com/visitor/visitor");
    visitorUrl.searchParams.set("a", "incarnate");
    visitorUrl.searchParams.set("t", tid);
    visitorUrl.searchParams.set("w", "2");
    visitorUrl.searchParams.set("c", "100");
    visitorUrl.searchParams.set("gc", "");
    visitorUrl.searchParams.set("cb", "cross_domain");
    visitorUrl.searchParams.set("from", "weibo");

    const visitorResponse = await fetch(visitorUrl, {
        headers: {
            "user-agent": MOBILE_UA,
            referer: "https://weibo.com/",
        },
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });

    if (!visitorResponse.ok) return null;

    const parsed = parseSetCookie(splitCookiesString(getSetCookieHeader(visitorResponse.headers)), {
        decodeValues: false,
    });
    const values = {};
    let expiresAt = now + VISITOR_COOKIE_TTL_MS;

    for (const cookie of parsed) {
        if (!["SUB", "SUBP"].includes(cookie.name) || !cookie.value) continue;

        values[cookie.name] = cookie.value;
        if (cookie.expires) {
            expiresAt = Math.min(expiresAt, cookie.expires.getTime());
        }
    }

    const value = Object.entries(values)
        .map(([name, cookieValue]) => `${name}=${cookieValue}`)
        .join("; ");

    if (!value) return null;

    visitorCookie = { value, expiresAt };
    return value;
};

const fetchStatusInfo = async (mblogId, uid) => {
    if (!mblogId) return null;

    const apiUrl = new URL("https://weibo.com/ajax/statuses/show");
    apiUrl.searchParams.set("id", mblogId);

    const cookie = getCookie("weibo");
    const baseHeaders = {
        ...statusHeaders,
        referer: uid
            ? `https://weibo.com/${encodeURIComponent(uid)}/${encodeURIComponent(mblogId)}`
            : statusHeaders.referer,
    };

    if (cookie) {
        baseHeaders.cookie = cookie.toString();
    }

    const requestStatus = async (headers) => {
        const response = await fetch(apiUrl, {
            headers,
            signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        });

        if (!response.ok) return null;

        return response.json().catch(() => null);
    };

    const data = await requestStatus(baseHeaders);
    if (data && data.ok !== -100) return data;

    const fallbackCookie = await fetchVisitorCookie().catch(() => null);
    if (!fallbackCookie) return data;

    return requestStatus({
        ...baseHeaders,
        cookie: fallbackCookie,
    });
};

const resolveLivePlaybackUrl = async (value) => {
    if (typeof value !== "string" || !value) return null;

    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        return null;
    }

    if (
        parsed.hostname !== "wblive-out.api.weibo.com" ||
        !parsed.pathname.endsWith("/wblive/room/play")
    ) {
        return null;
    }

    try {
        const response = await fetch(parsed, {
            redirect: "manual",
            headers: statusHeaders,
            signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        });
        const location = response.headers.get("location");
        if (!location) return null;

        const resolved = new URL(location, parsed);
        if (resolved.protocol === "http:") resolved.protocol = "https:";

        return resolved.toString();
    } catch {
        return null;
    }
};

const formatStatusResponse = async (status, mblogId, quality) => {
    const mediaInfo = status?.page_info?.media_info;
    if (!mediaInfo) return null;

    const selected = pickFormat(collectStatusFormats(mediaInfo), quality);
    if (!selected?.url) return null;
    const livePlaybackUrl = await resolveLivePlaybackUrl(selected.url);
    const mediaUrl = livePlaybackUrl || selected.url;
    const isHLS = /\.m3u8(?:$|[?#])/i.test(mediaUrl);

    const title = sanitizeFilenamePart(
        stripHtml(status.text_raw || status.text || mediaInfo.title || status?.page_info?.page_title || mblogId)
    );
    const mediaId = mediaInfo.media_id || status.idstr || mblogId;
    const duration = parseNumber(mediaInfo.duration || mediaInfo.duration_time);

    return {
        type: "video",
        urls: mediaUrl,
        isHLS,
        original_url: `https://weibo.com/${status?.user?.id || ""}/${mblogId}`.replace(".com//", ".com/"),
        filename: `${title || "weibo"}_${mediaId}.mp4`,
        duration: duration > 0 ? Math.round(duration) : undefined,
        cover: toAbsoluteUrl(mediaInfo.cover_image || status?.page_info?.page_pic?.url),
        headers: {
            ...mediaHeaders,
            referer: "https://weibo.com/",
        },
        fileMetadata: title ? { title } : undefined,
    };
};

export default async function weibo({ oid, fid, shortLink, mblogId, uid, quality, url }) {
    try {
        let resolvedOid = decodeUrlPart(oid || fid) || extractOidFromUrl(url);

        if (!resolvedOid && mblogId) {
            const status = await fetchStatusInfo(mblogId, uid);
            const statusResponse = await formatStatusResponse(status, mblogId, quality);
            if (statusResponse) return statusResponse;

            resolvedOid = findObjectId(status);
        }

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
