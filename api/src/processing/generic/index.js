import { env } from "../../config.js";

import htmlProbe from "./html-probe.js";
import extractWithYtDlp from "./yt-dlp.js";

export const canAttemptGenericURL = (value) => {
    if (typeof value !== "string" || !value.trim()) {
        return false;
    }

    try {
        const parsed = new URL(value);
        return ["http:", "https:"].includes(parsed.protocol);
    } catch {
        return false;
    }
};

export const getGenericServiceHost = (value) => {
    try {
        return new URL(value).hostname;
    } catch {
        return "generic";
    }
};

const shouldTryHtmlProbe = (request) => {
    return request.downloadMode !== "mute";
};

export default async function extractGeneric(request) {
    const url = String(request?.url || "");
    if (!canAttemptGenericURL(url)) {
        return { error: "link.invalid" };
    }

    const attempts = [];
    if (shouldTryHtmlProbe(request)) {
        attempts.push({
            name: "html-probe",
            run: () => htmlProbe({
                url,
                timeoutMs: env.genericHtmlProbeTimeoutMs,
            }),
        });
    }

    attempts.push({
        name: "yt-dlp",
        run: () => extractWithYtDlp({
            url,
            quality: request?.videoQuality,
            downloadMode: request?.downloadMode,
            timeoutMs: env.genericYtDlpTimeoutMs,
        }),
    });

    let lastError = "fetch.fail";
    for (const attempt of attempts) {
        const startedAt = Date.now();
        console.log(`[GENERIC START] extractor=${attempt.name} url=${url}`);

        const result = await attempt.run().catch(() => ({ error: "fetch.fail" }));
        if (!result?.error) {
            console.log(
                `[GENERIC RESULT] extractor=${attempt.name} host=${getGenericServiceHost(url)} elapsed_ms=${Date.now() - startedAt} hls=${result?.isHLS === true} merge=${Array.isArray(result?.urls)}`,
            );
            return {
                ...result,
                service: result?.service || getGenericServiceHost(url),
                genericExtractor: attempt.name,
            };
        }

        lastError = result.error;
        console.log(
            `[GENERIC FAIL] extractor=${attempt.name} host=${getGenericServiceHost(url)} elapsed_ms=${Date.now() - startedAt} reason=${result?.message || result?.error || "unknown"}`,
        );
    }

    return {
        error: lastError,
        service: getGenericServiceHost(url),
    };
}
