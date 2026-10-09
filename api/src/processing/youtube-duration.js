import { env } from "../config.js";

export const exceedsYoutubeDurationLimit = (duration) => {
    const seconds = Number(duration);
    return Number.isFinite(seconds) && seconds > env.durationLimit;
};

// Check upstream metadata before exposing any download or processing links.
export const getYoutubeUpstreamDurationError = (body) => {
    if (!body || body.status === "error" || !exceedsYoutubeDurationLimit(body.duration)) {
        return null;
    }

    return {
        code: "error.api.content.too_long",
        context: { limit: parseFloat((env.durationLimit / 60).toFixed(2)) },
    };
};
