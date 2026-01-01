import Cookie from "../cookie/cookie.js";

import { extract, normalizeURL } from "../url.js";
import { genericUserAgent } from "../../config.js";
import { updateCookie } from "../cookie/manager.js";
import { createStream } from "../../stream/manage.js";
import { convertLanguageCode } from "../../misc/language-codes.js";

const shortDomain = "https://vt.tiktok.com/";
const embedMarker = '<script id="__FRONTITY_CONNECT_STATE__" type="application/json">';

const toSeconds = (value) => {
    if (value == null) return undefined;

    const numeric = typeof value === "string" ? Number(value) : value;

    if (typeof numeric !== "number" || !Number.isFinite(numeric)) return undefined;
    return numeric > 1000 ? Math.round(numeric / 1000) : Math.round(numeric);
};

const extractEmbed = (html, postId) => {
    if (!html) return;

    const start = html.indexOf(embedMarker);
    if (start < 0) return;

    const end = html.indexOf("</script>", start);
    if (end < 0) return;

    const jsonStr = html.slice(start + embedMarker.length, end);

    try {
        const state = JSON.parse(jsonStr);
        return (
            state?.source?.data?.[`/embed/v2/${postId}`]
            ?? state?.source?.data?.[`/embed/v2/${postId}/`]
        );
    } catch {
        return;
    }
};

const fetchLegacyDetail = async (postId, cookie) => {
    try {
        // Legacy flow: should always be /video/, even for photos.
        const res = await fetch(`https://www.tiktok.com/@i/video/${postId}`, {
            headers: {
                "user-agent": genericUserAgent,
                cookie,
            }
        });
        updateCookie(cookie, res.headers);

        const html = await res.text();

        const json = html
            .split('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">')[1]
            ?.split('</script>')[0];

        if (!json) return { ok: false, error: "fetch.fail" };

        const data = JSON.parse(json);
        const videoDetail = data?.["__DEFAULT_SCOPE__"]?.["webapp.video-detail"];

        if (!videoDetail) return { ok: false, error: "fetch.fail" };

        // status_deleted or etc
        if (videoDetail.statusMsg) {
            return { ok: false, error: "content.post.unavailable" };
        }

        const detail = videoDetail?.itemInfo?.itemStruct;
        if (!detail) return { ok: false, error: "fetch.fail" };

        if (detail.isContentClassified) {
            return { ok: false, error: "content.post.age" };
        }

        if (!detail.author) {
            return { ok: false, error: "fetch.empty" };
        }

        return { ok: true, detail };
    } catch {
        return { ok: false, error: "fetch.fail" };
    }
};

const fetchEmbedDetail = async (postId, cookie) => {
    try {
        const embedRes = await fetch(`https://www.tiktok.com/embed/v2/${postId}`, {
            headers: {
                "user-agent": genericUserAgent,
                cookie,
            }
        });

        updateCookie(cookie, embedRes.headers);

        const embedHtml = await embedRes.text();
        const embed = extractEmbed(embedHtml, postId);
        const embedVideoData = embed?.videoData;

        const legacyNeeded =
            !embed ||
            embed?.isError ||
            !embedVideoData?.itemInfos ||
            !embedVideoData?.authorInfos;

        if (legacyNeeded) {
            return { ok: false };
        }

        return { ok: true, detail: embedVideoData };
    } catch {
        return { ok: false };
    }
};

export default async function(obj) {
    const cookie = new Cookie({});
    let postId = obj.postId;

    if (!postId) {
        let html = await fetch(`${shortDomain}${obj.shortLink}`, {
            redirect: "manual",
            headers: {
                "user-agent": genericUserAgent.split(' Chrome/1')[0]
            }
        }).then(r => r.text()).catch(() => {});

        if (!html) return { error: "fetch.fail" };

        if (html.startsWith('<a href="https://')) {
            const extractedURL = html.split('<a href="')[1].split('?')[0];
            const { host, patternMatch } = extract(normalizeURL(extractedURL));
            if (host === "tiktok") {
                postId = patternMatch?.postId;
            }
        }
    }
    if (!postId) return { error: "fetch.short_link" };

    // Prefer legacy extraction for no-watermark video URLs.
    // If legacy fails (e.g. WAF), fall back to embed extraction and retry legacy once using refreshed cookies.
    const legacy = await fetchLegacyDetail(postId, cookie);
    let detail;
    let isEmbed = false;

    if (legacy.ok) {
        detail = legacy.detail;
        isEmbed = false;
    } else {
        if (legacy.error && ["content.post.unavailable", "content.post.age"].includes(legacy.error)) {
            return { error: legacy.error };
        }

        const embed = await fetchEmbedDetail(postId, cookie);
        if (embed.ok) {
            const retryLegacy = await fetchLegacyDetail(postId, cookie);
            if (retryLegacy.ok) {
                detail = retryLegacy.detail;
                isEmbed = false;
            } else {
                detail = embed.detail;
                isEmbed = true;
            }
        } else {
            return { error: legacy.error || "fetch.fail" };
        }
    }

    let video, videoFilename, audioFilename, audio, images,
        filenameBase = `tiktok_${
            isEmbed ? detail?.authorInfos?.uniqueId : detail.author?.uniqueId
        }_${postId}`,
        bestAudio; // will get defaulted to m4a later on in match-action

    const duration =
        isEmbed
            ? toSeconds(detail?.itemInfos?.video?.videoMeta?.duration)
            : (toSeconds(detail?.video?.duration) || toSeconds(detail?.music?.duration));

    images = isEmbed ? detail?.itemInfos?.imagePostInfo?.images : detail.imagePost?.images;

    let playAddr = isEmbed
        ? detail?.itemInfos?.video?.urls?.[0]
        : detail.video?.playAddr;

    if (obj.h265) {
        if (!isEmbed) {
            const h265PlayAddr = detail?.video?.bitrateInfo?.find(b => b.CodecType.includes("h265"))?.PlayAddr.UrlList[0]
            playAddr = h265PlayAddr || playAddr
        }
    }

    if (!obj.isAudioOnly && !images) {
        video = playAddr;
        videoFilename = `${filenameBase}.mp4`;
    } else {
        audio = playAddr;
        audioFilename = `${filenameBase}_audio`;

        if (obj.fullAudio || !audio) {
            const musicUrl = isEmbed
                ? detail?.musicInfos?.playUrl?.[0]
                : detail.music.playUrl;
            audio = musicUrl || audio;
            audioFilename += `_original`
        }
        if (typeof audio === "string" && audio.includes("mime_type=audio_mpeg")) bestAudio = 'mp3';
    }

    if (video) {
        let subtitles, fileMetadata;
        if (!isEmbed && obj.subtitleLang && detail?.video?.subtitleInfos?.length) {
            const langCode = convertLanguageCode(obj.subtitleLang);
            const subtitle = detail?.video?.subtitleInfos.find(
                s => s.LanguageCodeName.startsWith(langCode) && s.Format === "webvtt"
            )
            if (subtitle) {
                subtitles = subtitle.Url;
                fileMetadata = {
                    sublanguage: langCode,
                }
            }
        }
        return {
            urls: video,
            subtitles,
            fileMetadata,
            filename: videoFilename,
            headers: { cookie },
            duration,
        }
    }

    if (images && obj.isAudioOnly) {
        return {
            urls: audio,
            audioFilename: audioFilename,
            isAudioOnly: true,
            bestAudio,
            headers: { cookie },
            duration,
        }
    }

    if (images) {
        const pickImageUrl = (image) => {
            const urlLists = [
                image?.imageURL?.urlList,
                image?.displayImage?.urlList,
                image?.image?.urlList,
                image?.urlList,
            ];

            const candidates = urlLists.flatMap((list) => (
                Array.isArray(list) ? list : []
            ));

            const preferred = candidates.find((url) => (
                typeof url === "string" && (url.includes(".jpeg") || url.includes(".jpg"))
            ));

            return preferred || candidates.find((url) => typeof url === "string");
        };

        let imageLinks = images
            .map(pickImageUrl)
            .filter(Boolean)
            .map((url, i) => {
                if (obj.alwaysProxy) url = createStream({
                    service: "tiktok",
                    type: "proxy",
                    url,
                    filename: `${filenameBase}_photo_${i + 1}.jpg`
                })

                return {
                    type: "photo",
                    url
                }
            });

        return {
            picker: imageLinks,
            urls: audio,
            audioFilename: audioFilename,
            isAudioOnly: true,
            bestAudio,
            headers: { cookie },
            duration,
        }
    }

    if (audio) {
        return {
            urls: audio,
            audioFilename: audioFilename,
            isAudioOnly: true,
            bestAudio,
            headers: { cookie },
            duration,
        }
    }

    return { error: "fetch.empty" };
}
