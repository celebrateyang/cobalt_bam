import { genericUserAgent } from "../../config.js";
import { sanitizeString } from "../create-filename.js";

const pageHeaders = {
    "User-Agent": genericUserAgent,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
};

const decodeHtmlEntities = (value) => String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const extractNextData = (html) => {
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
    if (!match?.[1]) return;

    try {
        return JSON.parse(decodeHtmlEntities(match[1]));
    } catch {
        return;
    }
};

const getQueries = (nextData) => {
    const queries = nextData?.props?.pageProps?.trpcState?.json?.queries;
    return Array.isArray(queries) ? queries : [];
};

const getQueryData = (queries, queryName) => {
    return queries.find((query) => {
        const key = query?.queryKey?.[0];
        return Array.isArray(key) && key[0] === "course" && key[1] === queryName;
    })?.state?.data;
};

const firstUrl = (...values) => {
    for (const value of values) {
        if (typeof value !== "string" || !value) continue;
        try {
            const parsed = new URL(value);
            if (parsed.protocol === "https:" || parsed.protocol === "http:") {
                return parsed.toString();
            }
        } catch {}
    }
};

const getSubtitleUrl = (video) => {
    const track = Array.isArray(video?.tracks)
        ? video.tracks.find((item) => typeof item?.src === "string" && item.src)
        : undefined;
    if (track?.src) return track.src;

    if (typeof video?.subtitle === "string" && video.subtitle) {
        try {
            const parsed = JSON.parse(video.subtitle);
            const first = Object.values(parsed || {}).find((item) => item?.URI);
            if (first?.URI) return first.URI;
        } catch {}
    }
};

const buildFilename = ({ courseName, lessonName, videoId }) => {
    const title = [courseName, lessonName]
        .filter((value) => typeof value === "string" && value.trim())
        .join(" - ");

    return `${sanitizeString(title || `deeplearningai_${videoId || "video"}`)}.mp4`;
};

export default async function({ courseSlug, lessonId, lessonSlug, url }) {
    const pageUrl = url?.toString?.()
        || `https://learn.deeplearning.ai/courses/${courseSlug}/lesson/${lessonId}/${lessonSlug}`;

    const html = await fetch(pageUrl, { headers: pageHeaders })
        .then((response) => response.ok ? response.text() : undefined)
        .catch(() => undefined);

    if (!html) {
        return { error: "fetch.fail" };
    }

    const nextData = extractNextData(html);
    const queries = getQueries(nextData);
    const course = getQueryData(queries, "getCourseBySlug");
    const lessonVideo = getQueryData(queries, "getLessonVideo");
    const video = lessonVideo?.video;

    if (!video || typeof video !== "object") {
        return { error: "fetch.empty" };
    }

    const lesson = course?.lessons?.[lessonId];
    const courseName = course?.name || course?.wpData?.courseName || courseSlug;
    const lessonName = lesson?.name || lessonSlug;
    const directUrl = firstUrl(video.mp4360pUrl);
    const hlsUrl = firstUrl(
        video.mp4Url,
        video.webmUrl,
        Array.isArray(video.srcSet) ? video.srcSet[0]?.src : undefined,
    );

    if (!directUrl && !hlsUrl) {
        return { error: "fetch.empty" };
    }

    const filename = buildFilename({
        courseName,
        lessonName,
        videoId: video.videoId,
    });

    return {
        service: "deeplearningai",
        urls: directUrl || hlsUrl,
        directUrl,
        hlsUrl,
        previewUrl: directUrl || hlsUrl,
        subtitles: getSubtitleUrl(video),
        filename,
        audioFilename: `deeplearningai_${video.videoId || lessonId}_audio`,
        duration: typeof lesson?.time === "number" ? lesson.time : undefined,
        fileMetadata: {
            title: lessonName,
            artist: courseName,
        },
    };
}
