import Cookie from "../cookie/cookie.js";

import { extract, normalizeURL } from "../url.js";
import { genericUserAgent } from "../../config.js";
import { updateCookie } from "../cookie/manager.js";
import { createStream } from "../../stream/manage.js";
import { convertLanguageCode } from "../../misc/language-codes.js";
import extractWithYtDlp from "../generic/yt-dlp.js";

const shortDomain = "https://vt.tiktok.com/";
const embedMarker = '<script id="__FRONTITY_CONNECT_STATE__" type="application/json">';

const normalizeUrlCandidate = (value) => {
    if (typeof value !== "string") return "";
    const url = value.trim();
    if (!url || !/^https?:\/\//i.test(url)) return "";
    return url;
};

const collectUrlCandidates = (value) => {
    if (typeof value === "string") {
        const normalized = normalizeUrlCandidate(value);
        return normalized ? [normalized] : [];
    }

    if (Array.isArray(value)) {
        return value
            .map(normalizeUrlCandidate)
            .filter(Boolean);
    }

    if (value && typeof value === "object") {
        if (Array.isArray(value.UrlList)) {
            return collectUrlCandidates(value.UrlList);
        }

        if (Array.isArray(value.urlList)) {
            return collectUrlCandidates(value.urlList);
        }
    }

    return [];
};

const classifyVideoCandidate = (url, source) => {
    if (/\/aweme\/v1\/play\//i.test(url) || /(?:\?|&)is_play_url=1(?:&|$)/i.test(url)) {
        return "api-play";
    }

    if (source.includes("download")) {
        return "download";
    }

    if (source.startsWith("embed")) {
        return "embed";
    }

    return "direct-play";
};

const buildVideoCandidateSet = ({ detail, isEmbed, preferH265 }) => {
    const buckets = {
        preferredApiPlay: [],
        preferredDirectPlay: [],
        fallbackApiPlay: [],
        fallbackDirectPlay: [],
        embedPlay: [],
        download: [],
    };
    const seen = new Set();

    const pushCandidate = (rawValue, source, options = {}) => {
        for (const url of collectUrlCandidates(rawValue)) {
            if (seen.has(url)) continue;
            seen.add(url);

            const kind = classifyVideoCandidate(url, source);
            const preferredCodec = options.preferredCodec === true;

            if (kind === "download") {
                buckets.download.push({ url, source, kind });
                continue;
            }

            if (kind === "embed") {
                buckets.embedPlay.push({ url, source, kind });
                continue;
            }

            if (kind === "api-play") {
                if (preferredCodec) {
                    buckets.preferredApiPlay.push({ url, source, kind });
                } else {
                    buckets.fallbackApiPlay.push({ url, source, kind });
                }
                continue;
            }

            if (preferredCodec) {
                buckets.preferredDirectPlay.push({ url, source, kind });
            } else {
                buckets.fallbackDirectPlay.push({ url, source, kind });
            }
        }
    };

    if (isEmbed) {
        pushCandidate(detail?.itemInfos?.video?.urls, "embed.video.urls");
        pushCandidate(detail?.itemInfos?.video?.playAddr, "embed.video.playAddr");
        pushCandidate(detail?.itemInfos?.video?.playUrl, "embed.video.playUrl");
        pushCandidate(detail?.itemInfos?.video?.downloadAddr, "embed.video.downloadAddr");
    } else {
        const bitrateInfo = Array.isArray(detail?.video?.bitrateInfo)
            ? detail.video.bitrateInfo
            : [];

        for (const bitrate of bitrateInfo) {
            const codecType = String(bitrate?.CodecType || "").toLowerCase();
            const preferredCodec =
                preferH265 === true
                    ? codecType.includes("h265")
                    : !codecType.includes("h265");

            pushCandidate(
                bitrate?.PlayAddr?.UrlList,
                `legacy.bitrateInfo.${codecType || "unknown"}`,
                { preferredCodec },
            );
        }

        pushCandidate(detail?.video?.PlayAddrStruct?.UrlList, "legacy.playAddrStruct");
        pushCandidate(detail?.video?.playAddr, "legacy.playAddr");
        pushCandidate(detail?.video?.downloadAddr, "legacy.downloadAddr");
    }

    return [
        ...buckets.preferredApiPlay,
        ...buckets.preferredDirectPlay,
        ...buckets.fallbackApiPlay,
        ...buckets.fallbackDirectPlay,
        ...buckets.embedPlay,
        ...buckets.download,
    ];
};

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

const normalizeTikTokUsernamePath = (username) => {
    if (typeof username !== "string") return "@i";

    const normalized = username.trim().replace(/^\/+|\/+$/g, "");
    if (!normalized) return "@i";

    return normalized.startsWith("@") ? normalized : `@${normalized}`;
};

const withOptionalCookie = (headers, cookie) => {
    if (typeof cookie !== "string" || !cookie.trim()) {
        return headers;
    }

    return {
        ...headers,
        cookie,
    };
};

const fetchLegacyDetail = async (postId, cookie, username) => {
    try {
        // Legacy flow: should always be /video/, even for photos.
        // Prefer the real username path when available. Newer TikTok pages can
        // WAF the generic /@i/video/:id path while serving universal data on
        // /@:user/video/:id.
        const userPath = normalizeTikTokUsernamePath(username);
        const res = await fetch(`https://www.tiktok.com/${userPath}/video/${postId}`, {
            headers: withOptionalCookie({
                "user-agent": genericUserAgent,
            }, cookie)
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
            headers: withOptionalCookie({
                "user-agent": genericUserAgent,
            }, cookie)
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

const buildTikTokCanonicalUrl = ({ postId, username, shortLink, url }) => {
    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
        return url;
    }

    if (shortLink) {
        return `${shortDomain}${shortLink}`;
    }

    if (postId) {
        const userPath = normalizeTikTokUsernamePath(username);
        return `https://www.tiktok.com/${userPath}/video/${postId}`;
    }

    return "";
};

const fallbackToYtDlp = async (obj, reason) => {
    if (obj.isAudioOnly || obj.isAudioMuted) return null;

    const url = buildTikTokCanonicalUrl({
        postId: obj.postId,
        username: obj.username || obj.user,
        shortLink: obj.shortLink,
        url: obj.url,
    });

    if (!url) return null;

    const startedAt = Date.now();
    console.log(`[tiktok] trying yt-dlp fallback reason=${reason || "unknown"} url=${url}`);

    const result = await extractWithYtDlp({
        url,
        quality: obj.quality,
        downloadMode: "auto",
        timeoutMs: obj.ytDlpTimeoutMs,
        avoidWatermarked: true,
    }).catch((error) => ({
        error: "fetch.fail",
        message: error?.message || String(error),
    }));

    if (result?.error) {
        console.log(
            `[tiktok] yt-dlp fallback failed reason=${reason || "unknown"} elapsed_ms=${Date.now() - startedAt} message=${result.message || result.error}`,
        );
        return null;
    }

    console.log(
        `[tiktok] yt-dlp fallback success elapsed_ms=${Date.now() - startedAt} hls=${result?.isHLS === true} merge=${Array.isArray(result?.urls)}`,
    );

    return {
        ...result,
        service: "tiktok",
        tiktokVideoSource: "yt-dlp",
        tiktokVideoSourceKind: "yt-dlp",
        tiktokUsedYtDlpFallback: true,
    };
};

export default async function(obj) {
    const cookie = new Cookie({});
    let postId = obj.postId;
    let username = obj.username || obj.user;

    if (!postId) {
        let html = await fetch(`${shortDomain}${obj.shortLink}`, {
            redirect: "manual",
            headers: {
                "user-agent": genericUserAgent.split(' Chrome/1')[0]
            }
        }).then(r => r.text()).catch(() => {});

        if (!html) {
            const ytDlp = await fallbackToYtDlp(obj, "short_link_fetch_fail");
            return ytDlp || { error: "fetch.fail" };
        }

        if (html.startsWith('<a href="https://')) {
            const extractedURL = html.split('<a href="')[1].split('?')[0];
            const { host, patternMatch } = extract(normalizeURL(extractedURL));
            if (host === "tiktok") {
                postId = patternMatch?.postId;
                username = patternMatch?.user || username;
            }
        }
    }
    if (!postId) {
        const ytDlp = await fallbackToYtDlp(obj, "short_link_resolve_fail");
        return ytDlp || { error: "fetch.short_link" };
    }

    obj.postId = postId;
    obj.username = username;

    // Prefer legacy extraction for no-watermark video URLs.
    // If legacy fails (e.g. WAF), fall back to embed extraction and retry legacy once using refreshed cookies.
    const legacy = await fetchLegacyDetail(postId, cookie, username);
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
            const retryLegacy = await fetchLegacyDetail(postId, cookie, username);
            if (retryLegacy.ok) {
                detail = retryLegacy.detail;
                isEmbed = false;
            } else {
                detail = embed.detail;
                isEmbed = true;
            }
        } else {
            const ytDlp = await fallbackToYtDlp(obj, legacy.error || "legacy_and_embed_fail");
            return ytDlp || { error: legacy.error || "fetch.fail" };
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

    if (isEmbed && !obj.isAudioOnly && !images) {
        const ytDlp = await fallbackToYtDlp(obj, "embed_video_watermarked");
        return ytDlp || {
            error: "fetch.fail",
            tiktokPreferUpstream: true,
            tiktokUsedEmbedFallback: true,
            tiktokVideoSourceKind: "embed",
        };
    }

    const videoCandidates = buildVideoCandidateSet({
        detail,
        isEmbed,
        preferH265: obj.h265 === true,
    });
    const primaryVideoCandidate = videoCandidates[0];
    const playAddr = primaryVideoCandidate?.url;
    const videoUrlCandidates = videoCandidates
        .slice(1)
        .map((candidate) => candidate.url);

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
            urlCandidates: videoUrlCandidates.length ? videoUrlCandidates : undefined,
            subtitles,
            fileMetadata,
            filename: videoFilename,
            headers: { cookie },
            duration,
            tiktokVideoSource: primaryVideoCandidate?.source,
            tiktokVideoSourceKind: primaryVideoCandidate?.kind,
            tiktokUsedEmbedFallback: isEmbed,
            tiktokPreferUpstream:
                isEmbed === true || primaryVideoCandidate?.kind === "download",
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
