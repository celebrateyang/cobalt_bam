import { sanitizeString } from "../create-filename.js";
import { getFeedByExportId, normalizeFeed } from "../../util/resolve-wechat-channel.js";

const browserUserAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/139.0.0.0 Safari/537.36";

const requestHeaders = (referer) => ({
    accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    referer,
    "user-agent": browserUserAgent,
});

const decodeHtmlEntities = (value) => {
    let result = String(value || "");
    for (let index = 0; index < 4; index++) {
        const decoded = result
            .replace(/&amp;/gi, "&")
            .replace(/&quot;/gi, '"')
            .replace(/&#39;|&apos;/gi, "'")
            .replace(/&lt;/gi, "<")
            .replace(/&gt;/gi, ">");
        if (decoded === result) break;
        result = decoded;
    }
    return result;
};

export const decodeWechatValue = (value) => decodeHtmlEntities(
    String(value || "")
        .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\([\\/'"bfnrt])/g, (_, escaped) => ({
            "\\": "\\",
            "/": "/",
            "'": "'",
            '"': '"',
            b: "\b",
            f: "\f",
            n: "\n",
            r: "\r",
            t: "\t",
        }[escaped] || escaped))
);

const secureUrl = (value) => {
    const decoded = decodeWechatValue(value);
    try {
        const url = new URL(decoded);
        if (url.protocol === "http:") url.protocol = "https:";
        return url.toString();
    } catch {
        return null;
    }
};

const extractBalanced = (text, start, open, close) => {
    let depth = 0;
    let quote = null;
    let escaped = false;

    for (let index = start; index < text.length; index++) {
        const character = text[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (character === "\\") escaped = true;
            else if (character === quote) quote = null;
            continue;
        }

        if (character === "'" || character === '"') {
            quote = character;
        } else if (character === open) {
            depth += 1;
        } else if (character === close) {
            depth -= 1;
            if (depth === 0) return text.slice(start, index + 1);
        }
    }

    return "";
};

const extractNamedArray = (text, name) => {
    const keyIndex = text.indexOf(`${name}:`);
    if (keyIndex < 0) return "";
    const arrayStart = text.indexOf("[", keyIndex + name.length + 1);
    if (arrayStart < 0) return "";
    return extractBalanced(text, arrayStart, "[", "]");
};

const extractTopLevelObjects = (arrayText) => {
    const objects = [];
    let depth = 0;
    let quote = null;
    let escaped = false;
    let objectStart = -1;

    for (let index = 1; index < arrayText.length - 1; index++) {
        const character = arrayText[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (character === "\\") escaped = true;
            else if (character === quote) quote = null;
            continue;
        }

        if (character === "'" || character === '"') {
            quote = character;
        } else if (character === "{") {
            if (depth === 0) objectStart = index;
            depth += 1;
        } else if (character === "}") {
            depth -= 1;
            if (depth === 0 && objectStart >= 0) {
                objects.push(arrayText.slice(objectStart, index + 1));
                objectStart = -1;
            }
        }
    }

    return objects;
};

const quotedField = (text, field) => {
    const match = text.match(
        new RegExp(`\\b${field}:\\s*'((?:\\\\.|[^'\\\\])*)'`)
    );
    return match ? decodeWechatValue(match[1]) : null;
};

const numericField = (text, field) => {
    const match = text.match(new RegExp(`\\b${field}:\\s*'?([0-9.]+)`));
    const value = Number(match?.[1]);
    return Number.isFinite(value) ? value : null;
};

const attributesFromTag = (tag) => Object.fromEntries(
    [...tag.matchAll(/\s([:\w-]+)\s*=\s*["']([^"']*)["']/g)]
        .map((match) => [match[1].toLowerCase(), decodeWechatValue(match[2])])
);

const parseArticleMetadata = (html) => {
    const metaTitle = html.match(
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i
    )?.[1];
    const title = metaTitle
        || html.match(/\bmsg_title\s*=\s*'((?:\\.|[^'\\])*)'/)?.[1]
        || html.match(/\btitle:\s*'((?:\\.|[^'\\])*)'/)?.[1];
    const author = html.match(/\bnickname\s*=\s*'((?:\\.|[^'\\])*)'/)?.[1];

    return {
        title: decodeWechatValue(title) || "WeChat article",
        author: decodeWechatValue(author) || null,
    };
};

const parseNativeVideo = (objectText) => {
    const id = quotedField(objectText, "video_id");
    const transInfo = extractNamedArray(objectText, "mp_video_trans_info");
    const formats = extractTopLevelObjects(transInfo)
        .map((format) => ({
            url: secureUrl(quotedField(format, "url")),
            width: numericField(format, "width"),
            height: numericField(format, "height"),
            duration: numericField(format, "duration"),
            filesize: numericField(format, "filesize"),
            quality: quotedField(format, "video_quality_wording"),
            formatId: quotedField(format, "format_id"),
        }))
        .filter((format) => format.url)
        .sort((left, right) => (
            (right.width || 0) * (right.height || 0)
            - (left.width || 0) * (left.height || 0)
            || (right.filesize || 0) - (left.filesize || 0)
        ));

    if (!id || !formats.length) return null;
    return {
        id,
        kind: "mpvideo",
        formats,
        cover: secureUrl(
            quotedField(objectText, "cover_url_16_9")
            || quotedField(objectText, "cover_url")
        ),
        title: quotedField(objectText, "content_noencode"),
    };
};

const parseContentOrder = (html) => {
    const items = [];
    const tagPattern = /<(iframe|mp-common-videosnap)\b[^>]*>/gi;
    let match;

    while ((match = tagPattern.exec(html))) {
        const attributes = attributesFromTag(match[0]);
        const mpVideoId = attributes["data-mpvid"];
        if (mpVideoId?.startsWith("wxv_")) {
            items.push({ id: mpVideoId, kind: "mpvideo" });
            continue;
        }

        const iframeUrl = secureUrl(attributes["data-src"] || attributes.src);
        if (iframeUrl) {
            const parsed = new URL(iframeUrl);
            const videoId = parsed.searchParams.get("vid");
            if (parsed.hostname === "v.qq.com" && videoId) {
                items.push({ id: videoId, kind: "tencent_video" });
                continue;
            }
        }

        if (match[1].toLowerCase() === "mp-common-videosnap" && attributes["data-id"]) {
            items.push({
                id: attributes["data-id"],
                kind: "finder",
                username: attributes["data-username"],
                title: attributes["data-desc"],
                author: attributes["data-nickname"],
                cover: secureUrl(attributes["data-url"]),
            });
        }
    }

    const seen = new Set();
    return items.filter((item) => {
        const key = `${item.kind}:${item.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

export const parseWechatArticle = (html) => {
    const pageInfoArray = extractNamedArray(html, "video_page_infos");
    const pageVideos = extractTopLevelObjects(pageInfoArray);
    const nativeVideos = new Map();
    const tencentCovers = new Map();

    for (const objectText of pageVideos) {
        const id = quotedField(objectText, "video_id");
        if (!id) continue;
        if (id.startsWith("wxv_")) {
            const video = parseNativeVideo(objectText);
            if (video) nativeVideos.set(id, video);
        } else {
            tencentCovers.set(id, secureUrl(
                quotedField(objectText, "cover_url_16_9")
                || quotedField(objectText, "cover_url")
            ));
        }
    }

    const order = parseContentOrder(html);
    return {
        ...parseArticleMetadata(html),
        items: order.map((item) => {
            if (item.kind === "mpvideo") return nativeVideos.get(item.id) || item;
            if (item.kind === "tencent_video") {
                return { ...item, cover: tencentCovers.get(item.id) || null };
            }
            return item;
        }),
    };
};

const parseTencentResponse = (text) => {
    try {
        return JSON.parse(text);
    } catch {
        const match = text.match(/^[^(=]*[=(]([\s\S]*?)[);]*$/);
        if (!match) return null;
        try {
            return JSON.parse(match[1]);
        } catch {
            return null;
        }
    }
};

const tencentDirectCdnHosts = [
    "ugcws.video.gtimg.com",
    "apd-vlive.apdcdn.tc.qq.com",
];

const toTencentDirectUrls = (rawUrl) => {
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol === "https:") return [parsed.toString()];

        return tencentDirectCdnHosts.map((hostname) => {
            const direct = new URL(parsed);
            direct.protocol = "https:";
            direct.hostname = hostname;
            direct.port = "";
            return direct.toString();
        });
    } catch {
        return [];
    }
};

export const resolveTencentVideo = async (video, fetchImpl = fetch) => {
    const api = new URL("https://vv.video.qq.com/getinfo");
    for (const [key, value] of Object.entries({
        vids: video.id,
        platform: "101001",
        charge: "0",
        otype: "json",
        defn: "fhd",
    })) api.searchParams.set(key, value);

    const response = await fetchImpl(api, {
        headers: requestHeaders("https://v.qq.com/"),
    });
    if (!response.ok) return null;
    const body = parseTencentResponse(await response.text());
    const info = body?.vl?.vi?.[0];
    if (!info?.fn || !info?.fvkey) return null;

    const urls = (info.ul?.ui || [])
        .map((item) => {
            try {
                const url = new URL(`${item.url || ""}${info.fn}`);
                url.searchParams.set("vkey", info.fvkey);
                return url.toString();
            } catch {
                return null;
            }
        })
        .filter(Boolean)
        .flatMap(toTencentDirectUrls)
        .filter((value, index, list) => list.indexOf(value) === index);
    if (!urls.length) return null;

    return {
        ...video,
        urls,
        width: Number(info.vw) || null,
        height: Number(info.vh) || null,
        duration: Number(info.td) || null,
    };
};

const resolveFinderVideo = async (video) => {
    try {
        const data = await getFeedByExportId({
            exportId: video.id,
            generalToken: "",
        });
        const feed = normalizeFeed(data, {
            exportId: video.id,
            resolutionMode: "article_embed",
        });
        const h264 = feed.videos.find((item) => item.codec === "h264");
        const fallback = feed.videos.find((item) => !item.codec);
        const h265 = feed.videos.find((item) => item.codec === "h265");
        const primary = h264 || fallback || h265;
        if (!primary?.url) return null;

        return {
            ...video,
            title: video.title || feed.title,
            author: video.author || feed.author,
            cover: feed.cover || video.cover,
            urls: [primary.url, h264?.url, fallback?.url, h265?.url]
                .filter((value, index, list) => value && list.indexOf(value) === index),
            width: primary.width,
            height: primary.height,
            duration: Number(feed.duration) || null,
        };
    } catch {
        return null;
    }
};

const requestArticle = async (url, fetchImpl) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
        const response = await fetchImpl(url, {
            headers: requestHeaders("https://mp.weixin.qq.com/"),
            redirect: "follow",
            signal: controller.signal,
        });
        if (!response.ok) throw new Error(`article returned HTTP ${response.status}`);
        return response.text();
    } finally {
        clearTimeout(timeout);
    }
};

export const resolveWechatArticle = async (url, { fetchImpl = fetch } = {}) => {
    const html = await requestArticle(url, fetchImpl);
    const article = parseWechatArticle(html);
    const resolved = [];
    let unavailableCount = 0;

    for (const item of article.items) {
        let result = null;
        if (item.kind === "mpvideo" && item.formats?.length) {
            const urls = item.formats.map((format) => format.url);
            const best = item.formats[0];
            result = {
                ...item,
                urls,
                width: best.width,
                height: best.height,
                duration: best.duration,
                quality: best.quality,
            };
        } else if (item.kind === "tencent_video") {
            result = await resolveTencentVideo(item, fetchImpl);
        } else if (item.kind === "finder") {
            result = await resolveFinderVideo(item);
        }

        if (result?.urls?.length) resolved.push(result);
        else unavailableCount += 1;
    }

    return {
        ...article,
        items: resolved,
        unavailableCount,
        discoveredCount: article.items.length,
    };
};

const safeFilenameStem = (value) => sanitizeString(String(value || "video"))
    .replace(/[. ]+$/g, "")
    .slice(0, 160) || "video";

const durationNote = (duration) => {
    if (!Number.isFinite(duration) || duration <= 0) return null;
    const seconds = Math.round(duration);
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
};

const itemLabel = (item) => ({
    mpvideo: "WeChat MP Video",
    tencent_video: "Tencent Video",
    finder: "WeChat Channels",
}[item.kind] || "Video");

export const buildWechatArticleResult = (article, articleId) => {
    if (!article.items.length) return { error: "fetch.empty" };
    const totalDuration = article.items.reduce(
        (sum, item) => sum + (Number(item.duration) || 0),
        0,
    );
    const title = safeFilenameStem(article.title || `wechat_article_${articleId}`);

    if (article.items.length === 1) {
        const item = article.items[0];
        return {
            service: "wechat_channels",
            urls: item.urls[0],
            urlCandidates: item.urls.slice(1),
            directClientDownload: true,
            filename: `${title}.mp4`,
            cover: item.cover || undefined,
            duration: Number(item.duration) || undefined,
        };
    }

    return {
        service: "wechat_channels",
        picker: article.items.map((item, index) => {
            const resolution = item.width && item.height
                ? `${item.width}x${item.height}`
                : null;
            const detail = [itemLabel(item), resolution, durationNote(Number(item.duration))]
                .filter(Boolean)
                .join(" · ");
            const filename = `${title}_${String(index + 1).padStart(2, "0")}.mp4`;
            return {
                type: "video",
                url: item.urls[0],
                urlCandidates: item.urls.slice(1),
                filename,
                thumb: item.cover || undefined,
                label: `Video ${index + 1}`,
                note: detail,
            };
        }),
        duration: totalDuration > 0 ? totalDuration : undefined,
        unavailableCount: article.unavailableCount,
    };
};
