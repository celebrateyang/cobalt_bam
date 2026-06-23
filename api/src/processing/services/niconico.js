import { env } from "../../config.js";
import extractWithYtDlp from "../generic/yt-dlp.js";

const buildURL = (id, type = "watch") => {
    const normalizedType = type === "shorts" ? "shorts" : "watch";
    return `https://www.nicovideo.jp/${normalizedType}/${encodeURIComponent(id)}`;
};

export default async function niconico(obj) {
    const ytDlp = await extractWithYtDlp({
        url: buildURL(obj.id, obj.type),
        quality: obj.quality,
        downloadMode: obj.isAudioOnly
            ? "audio"
            : obj.isAudioMuted
                ? "mute"
                : "auto",
        timeoutMs: env.genericYtDlpTimeoutMs,
    });

    if (ytDlp?.error) {
        return ytDlp;
    }

    return {
        ...ytDlp,
        service: "niconico",
        filenameAttributes: {
            ...ytDlp.filenameAttributes,
            service: "niconico",
            id: obj.id,
            title: ytDlp.fileMetadata?.title || ytDlp.title,
            author: ytDlp.fileMetadata?.artist || ytDlp.uploader,
        },
    };
}
