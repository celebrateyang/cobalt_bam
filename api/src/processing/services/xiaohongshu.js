import { resolveRedirectingURL } from "../url.js";
import { genericUserAgent } from "../../config.js";
import { createStream } from "../../stream/manage.js";
import extractGeneric from "../generic/index.js";

const https = (url) => {
    return url.replace(/^http:/i, 'https:');
}

const canonicalNoteUrl = (noteId, xsecToken) => {
    return `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=${encodeURIComponent(xsecToken)}`;
};

const attemptGenericFallback = async ({ noteId, xsecToken, isAudioOnly }) => {
    if (!noteId || !xsecToken) return null;

    const fallback = await extractGeneric({
        url: canonicalNoteUrl(noteId, xsecToken),
        videoQuality: "1080",
        audioFormat: "mp3",
        audioBitrate: "128",
        downloadMode: isAudioOnly ? "audio" : "auto",
        filenameStyle: "basic",
        disableMetadata: false,
        convertGif: true,
        alwaysProxy: true,
        localProcessing: "disabled",
        batch: false,
    }).catch(() => null);

    if (!fallback || fallback.error) {
        return null;
    }

    return {
        ...fallback,
        service: "xiaohongshu",
        filenameAttributes: fallback.filenameAttributes
            ? {
                ...fallback.filenameAttributes,
                service: "xiaohongshu",
            }
            : fallback.filenameAttributes,
    };
};

export default async function ({ id, token, shareType, shareId, h265, isAudioOnly, dispatcher }) {
    let noteId = id;
    let xsecToken = token;

    if (!noteId) {
        const patternMatch = await resolveRedirectingURL(
            `https://xhslink.com/${shareType}/${shareId}`,
            dispatcher
        );

        noteId = patternMatch?.id;
        xsecToken = patternMatch?.token;
    }

    if (!noteId || !xsecToken) return { error: "fetch.short_link" };

    const noteUrl = canonicalNoteUrl(noteId, xsecToken);
    const res = await fetch(noteUrl, {
        headers: {
            "user-agent": genericUserAgent,
        },
        dispatcher,
    });

    const html = await res.text();
    const redirectedToUnavailable = (() => {
        try {
            const finalUrl = new URL(res.url || noteUrl);
            return finalUrl.pathname === "/404";
        } catch {
            return false;
        }
    })();

    let note;
    try {
        const initialState = html
            .split('<script>window.__INITIAL_STATE__=')[1]
            .split('</script>')[0]
            .replace(/:\s*undefined/g, ":null");

        const data = JSON.parse(initialState);

        const noteInfo = data?.note?.noteDetailMap;
        if (!noteInfo) throw "no note detail map";

        const currentNote = noteInfo[noteId];
        if (!currentNote) {
            if (redirectedToUnavailable) {
                return { error: "content.post.unavailable" };
            }
            throw "no current note in detail map";
        }

        note = currentNote.note;
    } catch {}

    if (!note) {
        const fallback = await attemptGenericFallback({ noteId, xsecToken, isAudioOnly });
        if (fallback) return fallback;
        return { error: redirectedToUnavailable ? "content.post.unavailable" : "fetch.empty" };
    }

    const video = note.video;
    const images = note.imageList;

    const filenameBase = `xiaohongshu_${noteId}`;

    if (video) {
        const videoFilename = `${filenameBase}.mp4`;
        const audioFilename = `${filenameBase}_audio`;

        let videoURL;

        if (h265 && !isAudioOnly && video.consumer?.originVideoKey) {
            videoURL = `https://sns-video-bd.xhscdn.com/${video.consumer.originVideoKey}`;
        } else {
            const h264Streams = video.media?.stream?.h264;

            if (h264Streams?.length) {
                videoURL = h264Streams.reduce((a, b) => Number(a?.videoBitrate) > Number(b?.videoBitrate) ? a : b).masterUrl;
            }
        }

        if (!videoURL) {
            const fallback = await attemptGenericFallback({ noteId, xsecToken, isAudioOnly });
            if (fallback) return fallback;
            return { error: "fetch.empty" };
        }

        return {
            urls: https(videoURL),
            filename: videoFilename,
            audioFilename: audioFilename,
        }
    }

    if (!images || images.length === 0) {
        const fallback = await attemptGenericFallback({ noteId, xsecToken, isAudioOnly });
        if (fallback) return fallback;
        return { error: "fetch.empty" };
    }

    if (images.length === 1) {
        return {
            isPhoto: true,
            urls: https(images[0].urlDefault),
            filename: `${filenameBase}.jpg`,
        }
    }

    const picker = images.map((image, i) => {
        return {
            type: "photo",
            url: createStream({
                service: "xiaohongshu",
                type: "proxy",
                url: https(image.urlDefault),
                filename: `${filenameBase}_${i + 1}.jpg`,
            })
        }
    });

    return { picker };
}
