import { env } from "../../config.js";
import htmlProbe from "../generic/html-probe.js";

export default async function newsHtml({ url, id, service }) {
    const result = await htmlProbe({
        url: url.toString(),
        timeoutMs: env.genericHtmlProbeTimeoutMs,
    });

    if (result?.error) return result;

    const title = result.fileMetadata?.title || result.audioFilename || service;
    const extension = result.isHLS ? "mp4" : result.filenameAttributes?.extension || "mp4";

    return {
        ...result,
        service,
        filenameAttributes: {
            ...result.filenameAttributes,
            service,
            id: id || result.filenameAttributes?.id || "video",
            title,
            qualityLabel: result.isHLS ? "HLS" : result.filenameAttributes?.qualityLabel,
            extension,
        },
        audioFilename: title,
        fileMetadata: {
            ...result.fileMetadata,
            title,
        },
    };
}
