import { resolveRedirectingURL } from "../url.js";
import { genericUserAgent } from "../../config.js";
import { createStream } from "../../stream/manage.js";
import extractGeneric from "../generic/index.js";

const https = (url) => {
    return url.replace(/^http:/i, 'https:');
}

const encodeQueryValue = (value) => {
    try {
        return encodeURIComponent(decodeURIComponent(value));
    } catch {
        return encodeURIComponent(value);
    }
};

const snakeToCamel = (value) =>
    value.replace(/_([a-z])/g, (_, char) => char.toUpperCase());

const camelizeKeys = (value) => {
    if (Array.isArray(value)) {
        return value.map(camelizeKeys);
    }

    if (!value || typeof value !== "object") {
        return value;
    }

    return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
            snakeToCamel(key),
            camelizeKeys(entry),
        ])
    );
};

const canonicalNoteUrl = (noteId, xsecToken, originURL) => {
    const hostname = originURL?.hostname === "www.rednote.com"
        ? "www.rednote.com"
        : "www.xiaohongshu.com";

    if (!xsecToken) {
        return `https://${hostname}/explore/${noteId}`;
    }

    return `https://${hostname}/explore/${noteId}?xsec_token=${encodeQueryValue(xsecToken)}`;
};

const extractInitialState = (html) => {
    const match = html.match(/<script>window\.__INITIAL_STATE__=(.*?)<\/script>/s);
    if (!match) return null;

    return JSON.parse(match[1].replace(/:\s*undefined/g, ":null"));
};

const extractNoteFromInitialState = ({ data, noteId, redirectedToUnavailable }) => {
    const preloadNote = data?.noteData?.data?.noteData;
    if (preloadNote) {
        return camelizeKeys(preloadNote);
    }

    const feedItem = data?.noteData?.data?.items?.[0]?.noteCard;
    if (feedItem) {
        return camelizeKeys(feedItem);
    }

    const apiFeedItem = data?.data?.items?.[0]?.note_card;
    if (apiFeedItem) {
        return camelizeKeys(apiFeedItem);
    }

    const noteInfo = data?.note?.noteDetailMap;
    if (!noteInfo) {
        if (redirectedToUnavailable) {
            throw new Error("content.post.unavailable");
        }
        throw new Error("no note detail map");
    }

    const currentNote = noteInfo[noteId];
    if (!currentNote) {
        if (redirectedToUnavailable) {
            throw new Error("content.post.unavailable");
        }
        throw new Error("no current note in detail map");
    }

    return camelizeKeys(currentNote.note);
};

const pickBestStreamVariant = (variants = []) => {
    if (!Array.isArray(variants) || variants.length === 0) {
        return null;
    }

    return variants.reduce((best, current) => {
        const bestBitrate = Number(best?.videoBitrate || best?.avgBitrate || 0);
        const currentBitrate = Number(current?.videoBitrate || current?.avgBitrate || 0);
        return currentBitrate > bestBitrate ? current : best;
    });
};

const getLivePhotoVideoUrl = ({ image, h265, isAudioOnly }) => {
    const stream = image?.stream;
    if (!stream || typeof stream !== "object") {
        return null;
    }

    const preferredCodecs = [];
    if (h265 && !isAudioOnly) {
        preferredCodecs.push("h265");
    }

    preferredCodecs.push("h264", "av1", "h266");

    for (const codec of preferredCodecs) {
        const selected = pickBestStreamVariant(stream?.[codec]);
        if (selected?.masterUrl) {
            return https(selected.masterUrl);
        }
    }

    return null;
};

const resolveOriginalVideoUrl = async ({ originVideoKey, dispatcher }) => {
    if (!originVideoKey) return null;

    const candidates = [
        `https://sns-video-hw.xhscdn.com/${originVideoKey}`,
        `https://sns-video-bd.xhscdn.com/${originVideoKey}`,
    ];

    for (const url of candidates) {
        const res = await fetch(url, {
            method: "HEAD",
            headers: {
                "user-agent": genericUserAgent,
                "referer": "https://www.rednote.com/",
            },
            dispatcher,
        }).catch(() => null);

        if (res?.ok) {
            return url;
        }
    }

    return null;
};

const pickBestVideoUrl = async ({ video, h265, isAudioOnly, dispatcher }) => {
    if (h265 && !isAudioOnly && video.consumer?.originVideoKey) {
        const originalURL = await resolveOriginalVideoUrl({
            originVideoKey: video.consumer.originVideoKey,
            dispatcher,
        });

        if (originalURL) {
            return originalURL;
        }
    }

    const h264Streams = video.media?.stream?.h264;

    if (h264Streams?.length) {
        return h264Streams.reduce((a, b) =>
            Number(a?.videoBitrate) > Number(b?.videoBitrate) ? a : b
        ).masterUrl;
    }

    return null;
};

const buildImagePickerItem = ({
    image,
    index,
    filenameBase,
    h265,
    isAudioOnly,
}) => {
    const imageUrl = https(image.urlDefault);
    const livePhotoUrl = getLivePhotoVideoUrl({ image, h265, isAudioOnly });

    if (livePhotoUrl) {
        return {
            type: "video",
            thumb: imageUrl,
            url: createStream({
                service: "xiaohongshu",
                type: "proxy",
                url: livePhotoUrl,
                filename: `${filenameBase}_${index + 1}.mp4`,
            }),
            label: `Live ${index + 1}`,
            note: "Live Photo",
        };
    }

    return {
        type: "photo",
        url: createStream({
            service: "xiaohongshu",
            type: "proxy",
            url: imageUrl,
            filename: `${filenameBase}_${index + 1}.jpg`,
        })
    };
};

const attemptGenericFallback = async ({ noteId, xsecToken, isAudioOnly, url }) => {
    if (!noteId) return null;

    const fallback = await extractGeneric({
        url: canonicalNoteUrl(noteId, xsecToken, url),
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

export default async function ({ id, token, shareType, shareId, h265, isAudioOnly, dispatcher, url }) {
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

    if (!noteId) return { error: "fetch.short_link" };

    const noteUrl = canonicalNoteUrl(noteId, xsecToken, url);
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
        note = extractNoteFromInitialState({
            data: extractInitialState(html),
            noteId,
            redirectedToUnavailable,
        });
    } catch (error) {
        if (error?.message === "content.post.unavailable") {
            return { error: "content.post.unavailable" };
        }
    }

    if (!note) {
        const fallback = await attemptGenericFallback({ noteId, xsecToken, isAudioOnly, url });
        if (fallback) return fallback;
        return { error: redirectedToUnavailable ? "content.post.unavailable" : "fetch.empty" };
    }

    const video = note.video;
    const images = note.imageList;

    const filenameBase = `xiaohongshu_${noteId}`;

    if (video) {
        const videoFilename = `${filenameBase}.mp4`;
        const audioFilename = `${filenameBase}_audio`;

        const videoURL = await pickBestVideoUrl({ video, h265, isAudioOnly, dispatcher });

        if (!videoURL) {
            const fallback = await attemptGenericFallback({ noteId, xsecToken, isAudioOnly, url });
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
        const fallback = await attemptGenericFallback({ noteId, xsecToken, isAudioOnly, url });
        if (fallback) return fallback;
        return { error: "fetch.empty" };
    }

    if (images.length === 1) {
        const livePhotoUrl = getLivePhotoVideoUrl({
            image: images[0],
            h265,
            isAudioOnly,
        });

        if (livePhotoUrl) {
            return {
                urls: livePhotoUrl,
                filename: `${filenameBase}.mp4`,
                audioFilename: `${filenameBase}_audio`,
            };
        }
    }

    if (images.length === 1) {
        return {
            isPhoto: true,
            urls: https(images[0].urlDefault),
            filename: `${filenameBase}.jpg`,
        }
    }

    const picker = images.map((image, i) => buildImagePickerItem({
        image,
        index: i,
        filenameBase,
        h265,
        isAudioOnly,
    }));

    return { picker };
}
