import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SPH_HOST = "weixin.qq.com";
const CHANNELS_ORIGIN = "https://channels.weixin.qq.com";
const CHANNELS_API = `${CHANNELS_ORIGIN}/finder-preview/api/feed/get_feed_info`;
const YUANBAO_ORIGIN = "https://yuanbao.tencent.com";
const YUANBAO_API = `${YUANBAO_ORIGIN}/api/weixin/get_parse_result`;

const browserUserAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/139.0.0.0 Safari/537.36";

const requestJson = async (url, options = {}, timeoutMs = 15_000) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        const text = await response.text();
        let body;

        try {
            body = JSON.parse(text);
        } catch {
            throw new Error(
                `expected JSON from ${url}, got HTTP ${response.status}: ${text.slice(0, 200)}`
            );
        }

        if (!response.ok || (typeof body.errCode === "number" && body.errCode !== 0)) {
            const detail = body.errMsg || body.error?.message || JSON.stringify(body);
            throw new Error(`${url} returned HTTP ${response.status}: ${detail}`);
        }

        return body;
    } finally {
        clearTimeout(timeout);
    }
};

export const extractShortUri = async (shareUrl) => {
    const input = new URL(shareUrl);
    const directMatch = input.pathname.match(/^\/sph\/([A-Za-z0-9]+)/);

    if (input.hostname === SPH_HOST && directMatch) return directMatch[1];

    if (
        input.hostname === "channels.weixin.qq.com" &&
        input.pathname === "/finder-preview/pages/sph"
    ) {
        const id = input.searchParams.get("id")?.match(/^[A-Za-z0-9]+/)?.[0];
        if (id) return id;
    }

    const response = await fetch(input, { redirect: "manual" });
    const location = response.headers.get("location");
    if (!location) throw new Error(`share URL did not redirect (HTTP ${response.status})`);

    const redirected = new URL(location, input);
    const id = redirected.searchParams.get("id")?.match(/^[A-Za-z0-9]+/)?.[0];
    if (!id) throw new Error(`redirect did not contain a valid sph id: ${redirected}`);
    return id;
};

const createRid = () =>
    `${Math.floor(Date.now() / 1000).toString(16)}-${randomBytes(4).toString("hex")}`;

const channelsHeaders = (referer) => ({
    accept: "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "content-type": "application/json",
    origin: CHANNELS_ORIGIN,
    referer,
    "user-agent": browserUserAgent,
});

export const getFeedByShortUri = async (shortUri) => {
    const referer = `${CHANNELS_ORIGIN}/finder-preview/pages/sph?id=${encodeURIComponent(shortUri)}`;
    const response = await requestJson(CHANNELS_API, {
        method: "POST",
        headers: channelsHeaders(referer),
        body: JSON.stringify({
            baseReq: { generalToken: "" },
            shortUri,
        }),
    });

    return response.data;
};

export const getYuanbaoParseResult = async (
    shareUrl,
    { cookie, headers: extraHeaders = {} } = {}
) => {
    if (!cookie) {
        throw new Error("a legitimate Yuanbao login cookie is required for video URL resolution");
    }

    const response = await requestJson(YUANBAO_API, {
        method: "POST",
        headers: {
            accept: "application/json, text/plain, */*",
            "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
            "content-type": "application/json",
            origin: YUANBAO_ORIGIN,
            referer: `${YUANBAO_ORIGIN}/`,
            "user-agent": browserUserAgent,
            "x-language": "zh-CN",
            "x-platform": "win",
            "x-requested-with": "XMLHttpRequest",
            "x-source": "web",
            ...extraHeaders,
            cookie,
        },
        body: JSON.stringify({
            type: "video_channel_url",
            url: shareUrl,
            scene: 1,
        }),
    });

    const data = response.data;
    if (!data?.wx_export_id && !data?.playable_url) {
        throw new Error("Yuanbao response contained neither wx_export_id nor playable_url");
    }
    return data;
};

export const getFeedByExportId = async ({ exportId, generalToken }) => {
    const pageUrl = `${CHANNELS_ORIGIN}/finder-preview/pages/feed`;
    const apiUrl = new URL(CHANNELS_API);
    apiUrl.searchParams.set("_rid", createRid());
    apiUrl.searchParams.set("_pageUrl", pageUrl);

    const referer = new URL(pageUrl);
    referer.searchParams.set("entry_card_type", "48");
    referer.searchParams.set("comment_scene", "39");
    referer.searchParams.set("appid", "0");
    referer.searchParams.set("token", generalToken || "");
    referer.searchParams.set("entry_scene", "0");
    referer.searchParams.set("eid", exportId);

    const response = await requestJson(apiUrl, {
        method: "POST",
        headers: channelsHeaders(referer),
        body: JSON.stringify({
            baseReq: { generalToken: generalToken || "" },
            exportId,
        }),
    });

    return response.data;
};

const addVideo = (videos, candidate, defaults = {}) => {
    if (!candidate) return;
    const rawUrl = candidate.videoUrl || candidate.url;
    if (!rawUrl) return;

    const url = `${rawUrl}${candidate.urlToken || candidate.url_token || ""}`;
    if (!url.startsWith("https://finder.video.qq.com/")) return;
    if (videos.some((video) => video.url === url)) return;

    videos.push({
        quality: candidate.quality || defaults.quality || null,
        url,
        width: candidate.width || defaults.width || null,
        height: candidate.height || defaults.height || null,
        codec: candidate.codec || defaults.codec || null,
        decodeKey: candidate.decodeKey || candidate.decode_key || null,
    });
};

export const normalizeFeed = (data, context = {}) => {
    const feed = data?.feedInfo || {};
    const author = data?.authorInfo || {};
    const videos = [];

    addVideo(videos, feed.h264VideoInfo, { codec: "h264" });
    addVideo(videos, feed.h265VideoInfo, { codec: "h265" });
    addVideo(videos, feed.videoUrl ? { videoUrl: feed.videoUrl } : null);

    for (const media of feed.media || feed.objectDesc?.media || []) {
        addVideo(videos, media);
    }

    return {
        source: "wechat_channels",
        title: feed.description?.split("\n", 1)[0] || null,
        description: feed.description || null,
        author: author.nickname || null,
        authorAvatar: author.headImgUrl || null,
        cover: feed.coverUrl || null,
        duration: feed.duration || feed.videoPlayLen || null,
        videos,
        exportId: context.exportId || data?.sceneInfo?.dynamicExportId || null,
        resolutionMode: context.resolutionMode || "short_uri_metadata",
        warning: data?.errMsg?.title || null,
    };
};

export const resolveWechatChannel = async (
    shareUrl,
    { yuanbaoCookie, yuanbaoHeaders } = {}
) => {
    const shortUri = await extractShortUri(shareUrl);

    if (!yuanbaoCookie) {
        const data = await getFeedByShortUri(shortUri);
        return normalizeFeed(data, { resolutionMode: "short_uri_metadata" });
    }

    const parsed = await getYuanbaoParseResult(shareUrl, {
        cookie: yuanbaoCookie,
        headers: yuanbaoHeaders,
    });
    const playable = parsed.playable_url ? new URL(parsed.playable_url) : null;
    const exportId = playable?.searchParams.get("eid") || parsed.wx_export_id;
    const generalToken = playable?.searchParams.get("token") || "";
    if (!exportId) throw new Error("could not obtain exportId from Yuanbao response");

    const data = await getFeedByExportId({ exportId, generalToken });
    return normalizeFeed(data, {
        exportId,
        resolutionMode: "yuanbao_authenticated_http",
    });
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
    const args = process.argv.slice(2);
    let shareUrl = "https://weixin.qq.com/sph/AievImkslV";
    let yuanbaoCookie = process.env.WECHAT_CHANNELS_YUANBAO_COOKIE;
    let yuanbaoHeaders;

    for (let index = 0; index < args.length; index++) {
        if (args[index] === "--cookie-file") {
            const cookieFile = args[++index];
            if (!cookieFile) throw new Error("--cookie-file requires a path");
            yuanbaoCookie = (await readFile(cookieFile, "utf8"))
                .trim()
                .replace(/^cookie\s*:\s*/i, "");
        } else {
            shareUrl = args[index];
        }
    }

    if (process.env.WECHAT_CHANNELS_YUANBAO_HEADERS_JSON) {
        yuanbaoHeaders = JSON.parse(process.env.WECHAT_CHANNELS_YUANBAO_HEADERS_JSON);
    }

    const result = await resolveWechatChannel(shareUrl, {
        yuanbaoCookie,
        yuanbaoHeaders,
    });
    console.log(JSON.stringify(result, null, 2));
}
