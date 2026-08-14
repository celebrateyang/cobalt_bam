import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { resolveWechatChannel } from "../../util/resolve-wechat-channel.js";

const defaultCookieFile = fileURLToPath(
    new URL("../../../yuanbao-cookie.txt", import.meta.url)
);

const normalizeDuration = (value) => {
    const duration = Number(value);
    if (!Number.isFinite(duration) || duration <= 0) return undefined;
    return duration > 10_000 ? Math.round(duration / 1000) : Math.round(duration);
};

const readYuanbaoCookie = async (
    cookieFile = process.env.WECHAT_CHANNELS_YUANBAO_COOKIE_FILE || defaultCookieFile
) => (await readFile(cookieFile, "utf8"))
    .trim()
    .replace(/^cookie\s*:\s*/i, "");

export const buildWechatChannelResult = (feed, shortUri) => {
    const h264 = feed.videos.find((video) => video.codec === "h264");
    const fallback = feed.videos.find((video) => !video.codec);
    const h265 = feed.videos.find((video) => video.codec === "h265");
    const primary = h264 || fallback || h265;

    if (!primary?.url) return { error: "fetch.fail" };

    const candidates = [primary.url, h264?.url, fallback?.url, h265?.url]
        .filter((value, index, list) => value && list.indexOf(value) === index);
    const width = primary.width || h264?.width || fallback?.width;
    const height = primary.height || h264?.height || fallback?.height;

    return {
        service: "wechat_channels",
        urls: primary.url,
        urlCandidates: candidates.slice(1),
        directClientDownload: true,
        filenameAttributes: {
            service: "wechat_channels",
            id: shortUri,
            title: feed.title || `wechat_channels_${shortUri}`,
            author: feed.author || undefined,
            resolution: width && height ? `${width}x${height}` : undefined,
            qualityLabel: primary.codec === "h264"
                ? "H.264"
                : primary.codec === "h265" ? "H.265" : "MP4",
            extension: "mp4",
        },
        cover: feed.cover || undefined,
        duration: normalizeDuration(feed.duration),
    };
};

export default async function({ shortUri, url }) {
    try {
        const yuanbaoCookie = await readYuanbaoCookie();
        if (!yuanbaoCookie) return { error: "fetch.fail" };

        const feed = await resolveWechatChannel(url.toString(), { yuanbaoCookie });
        return buildWechatChannelResult(feed, shortUri);
    } catch (error) {
        console.warn(
            `[wechat_channels] extraction failed: ${error?.code || error?.name || "Error"}: ${error?.message || "unknown"}`
        );
        return { error: "fetch.fail" };
    }
}
