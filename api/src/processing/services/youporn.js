import { env } from "../../config.js";
import extractWithYtDlp from "../generic/yt-dlp.js";

export default async function youporn({ id, quality, isAudioOnly, isAudioMuted }) {
    if (!/^\d+$/.test(id) || isAudioOnly || isAudioMuted) return { error: "fetch.empty" };
    const result = await extractWithYtDlp({
        url: `https://www.youporn.com/watch/${id}/`, quality,
        downloadMode: "auto", preferHls: true, timeoutMs: env.genericYtDlpTimeoutMs,
    });
    if (result.error) return result;
    try {
        const media = new URL(result.urls);
        if (media.protocol !== "https:" || media.username || media.password || media.port ||
            !/(^|\.)ypncdn\.com$/i.test(media.hostname) || !media.pathname.endsWith(".m3u8")) {
            return { error: "fetch.empty" };
        }
    } catch { return { error: "fetch.empty" }; }
    return { ...result, service: "youporn", filenameAttributes: {
        ...result.filenameAttributes, service: "youporn", id, extension: "mp4",
    } };
}
