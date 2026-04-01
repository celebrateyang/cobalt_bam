import HLS from "hls-parser";

import { fetch } from "undici";
import { Innertube, Session } from "youtubei.js";

import { env } from "../../config.js";
import { getCookie } from "../cookie/manager.js";
import { getYouTubeSession } from "../helpers/youtube-session.js";

const PLAYER_REFRESH_PERIOD = 1000 * 60 * 15; // ms

let innertube, lastRefreshedAt;

const codecList = {
    h264: {
        videoCodec: "avc1",
        audioCodec: "mp4a",
        container: "mp4"
    },
    av1: {
        videoCodec: "av01",
        audioCodec: "opus",
        container: "webm"
    },
    vp9: {
        videoCodec: "vp9",
        audioCodec: "opus",
        container: "webm"
    }
}

const hlsCodecList = {
    h264: {
        videoCodec: "avc1",
        audioCodec: "mp4a",
        container: "mp4"
    },
    vp9: {
        videoCodec: "vp09",
        audioCodec: "mp4a",
        container: "webm"
    }
}

const clientsWithNoCipher = ['IOS', 'ANDROID', 'YTSTUDIO_ANDROID', 'YTMUSIC_ANDROID'];

const videoQualities = [144, 240, 360, 480, 720, 1080, 1440, 2160, 4320];
const isUpstreamServer = (() => {
    const raw = String(process.env.IS_UPSTREAM_SERVER || "").toLowerCase().trim();
    return raw === "true" || raw === "1";
})();

const resolveFormatUrl = (format, useHLS, innertubeClient, innertubeInstance) => {
    if (!format) return null;
    if (useHLS) return format.uri || null;

    if (!clientsWithNoCipher.includes(innertubeClient) && innertubeInstance && format.decipher) {
        try {
            return format.decipher(innertubeInstance.session.player);
        } catch {
            return null;
        }
    }

    return format.url || null;
};

const getUrlAccessibilityScore = (rawUrl) => {
    if (typeof rawUrl !== "string" || !rawUrl) return Number.NEGATIVE_INFINITY;

    try {
        const parsed = new URL(rawUrl);
        let score = 0;

        const ipBypass = parsed.searchParams.get("ipbypass");
        if (ipBypass === "yes" || ipBypass === "1" || ipBypass === "true") {
            score += 100;
        }

        if (!parsed.searchParams.has("ip")) {
            score += 30;
        }

        const client = String(parsed.searchParams.get("c") || "").toUpperCase();
        if (client.startsWith("ANDROID")) score += 20;
        if (client.startsWith("IOS")) score -= 10;

        const itag = Number(parsed.searchParams.get("itag"));
        if ([18, 22].includes(itag)) score += 20;

        return score;
    } catch {
        return Number.NEGATIVE_INFINITY;
    }
};

const cloneInnertube = async (customFetch, useSession) => {
    console.log(`======> [cloneInnertube] Starting Innertube creation, useSession: ${useSession}`);
    
    const shouldRefreshPlayer = lastRefreshedAt + PLAYER_REFRESH_PERIOD < new Date();
    console.log(`======> [cloneInnertube] Should refresh player: ${shouldRefreshPlayer}`);

    // First try youtube_oauth cookies
    let rawCookie = getCookie('youtube_oauth');
    if (!rawCookie) {
        console.log(`======> [cloneInnertube] No youtube_oauth cookies found, trying regular youtube cookies`);
        rawCookie = getCookie('youtube');
    }
    
    const cookie = rawCookie?.toString();
    console.log(`======> [cloneInnertube] Cookie available: ${!!cookie}`);
    if (cookie) {
        console.log(`======> [cloneInnertube] Cookie length: ${cookie.length}, preview: ${cookie.substring(0, 100)}...`);
    }

    const sessionTokens = getYouTubeSession();
    console.log(`======> [cloneInnertube] Session tokens available: ${!!sessionTokens}`);
    
    const retrieve_player = Boolean(sessionTokens || cookie);
    console.log(`======> [cloneInnertube] Will retrieve player: ${retrieve_player}`);

    if (useSession && env.ytSessionServer && !sessionTokens?.potoken) {
        console.log(`======> [cloneInnertube] Throwing no_session_tokens error`);
        throw "no_session_tokens";
    }

    if (!innertube || shouldRefreshPlayer) {
        console.log(`======> [cloneInnertube] Creating new Innertube instance with cookie authentication`);
        innertube = await Innertube.create({
            fetch: customFetch,
            retrieve_player,
            cookie,
            po_token: useSession ? sessionTokens?.potoken : undefined,
            visitor_data: useSession ? sessionTokens?.visitor_data : undefined,
        });
        lastRefreshedAt = +new Date();
        console.log(`======> [cloneInnertube] Innertube instance created successfully`);
    }

    const session = new Session(
        innertube.session.context,
        innertube.session.api_key,
        innertube.session.api_version,
        innertube.session.account_index,
        innertube.session.config_data,
        innertube.session.player,
        cookie,
        customFetch ?? innertube.session.http.fetch,
        innertube.session.cache,
        sessionTokens?.potoken
    );

    const yt = new Innertube(session);
    return yt;
}

const getHlsVariants = async (hlsManifest, dispatcher) => {
    if (!hlsManifest) {
        return { error: "youtube.no_hls_streams" };
    }

    const fetchedHlsManifest =
        await fetch(hlsManifest, { dispatcher })
            .then(r => r.status === 200 ? r.text() : undefined)
            .catch(() => {});

    if (!fetchedHlsManifest) {
        return { error: "youtube.no_hls_streams" };
    }

    const variants = HLS.parse(fetchedHlsManifest).variants.sort(
        (a, b) => Number(b.bandwidth) - Number(a.bandwidth)
    );

    if (!variants || variants.length === 0) {
        return { error: "youtube.no_hls_streams" };
    }

    return variants;
}

const getSubtitles = async (info, dispatcher, subtitleLang) => {
    const preferredCap = info.captions.caption_tracks.find(caption =>
        caption.kind !== 'asr' && caption.language_code.startsWith(subtitleLang)
    );

    const captionsUrl = preferredCap?.base_url;
    if (!captionsUrl) return;

    if (!captionsUrl.includes("exp=xpe")) {
        let url = new URL(captionsUrl);
        url.searchParams.set('fmt', 'vtt');

        return {
            url: url.toString(),
            language: preferredCap.language_code,
        }
    }

    // if we have exp=xpe in the url, then captions are
    // locked down and can't be accessed without a yummy potoken,
    // so instead we just use subtitles from HLS

    const hlsVariants = await getHlsVariants(
        info.streaming_data.hls_manifest_url,
        dispatcher
    );
    if (hlsVariants?.error) return;

    // all variants usually have the same set of subtitles
    const hlsSubtitles = hlsVariants[0]?.subtitles;
    if (!hlsSubtitles?.length) return;

    const preferredHls = hlsSubtitles.find(
        subtitle => subtitle.language.startsWith(subtitleLang)
    );

    if (!preferredHls) return;

    const fetchedHlsSubs =
        await fetch(preferredHls.uri, { dispatcher })
            .then(r => r.status === 200 ? r.text() : undefined)
            .catch(() => {});

    const parsedSubs = HLS.parse(fetchedHlsSubs);
    if (!parsedSubs) return;

    return {
        url: parsedSubs.segments[0]?.uri,
        language: preferredHls.language,
    }
}

export default async function (o) {
    console.log(`======> [youtube] Starting YouTube video processing for URL: ${o.url || o.id}`);
    
    // Check if cookies are available before proceeding
    const oauthCookie = getCookie('youtube_oauth');
    const regularCookie = getCookie('youtube');
    const hasCookies = !!(oauthCookie || regularCookie);
    
    console.log(`======> [youtube] Cookie availability check - OAuth: ${!!oauthCookie}, Regular: ${!!regularCookie}, Has any: ${hasCookies}`);
    
    if (!hasCookies) {
        console.log(`======> [youtube] ERROR: No YouTube authentication cookies found! All YouTube downloads require authentication.`);
        return { error: "youtube.auth_required" };
    }
    
    const quality = o.quality === "max" ? 9000 : Number(o.quality);
    console.log(`======> [youtube] Processing with quality: ${quality}`);

    let useHLS = o.youtubeHLS;
    const prefersDirectRedirectClient =
        !o.isAudioOnly &&
        !useHLS &&
        !o.innertubeClient &&
        !env.customInnertubeClient;
    let innertubeClient =
        o.innertubeClient
        || env.customInnertubeClient
        || (prefersDirectRedirectClient ? "ANDROID" : "IOS");
    console.log(`======> [youtube] Using HLS: ${useHLS}, Client: ${innertubeClient}`);

    // Force direct redirect flow for normal video downloads:
    // disable HLS/merge path and require progressive MP4 direct URL.
    if (!o.isAudioOnly && !o.isAudioMuted && useHLS) {
        useHLS = false;
        console.log(`======> [youtube] Disabled HLS for direct-redirect-only policy`);
    }

    // HLS playlists from the iOS client don't contain the av1 video format.
    if (useHLS && o.codec === "av1") {
        useHLS = false;
        console.log(`======> [youtube] Disabled HLS due to av1 format`);
    }    if (useHLS) {
        innertubeClient = "IOS";
        console.log(`======> [youtube] Set client to IOS for HLS`);
    }

    // iOS client doesn't have adaptive formats of resolution >1080p,
    // so we use the WEB_EMBEDDED client instead for those cases
    let useSession =
        env.ytSessionServer && (
            (
                !useHLS
                && innertubeClient === "IOS"
                && (
                    (quality > 1080 && o.codec !== "h264")
                    || (quality > 1080 && o.codec !== "vp9")
                )
            )
        );

    // we can get subtitles reliably only from the iOS client
    if (o.subtitleLang) {
        innertubeClient = "IOS";
        useSession = false;
    }

    if (useSession) {
        innertubeClient = env.ytSessionInnertubeClient || "WEB_EMBEDDED";
        console.log(`======> [youtube] Using session client: ${innertubeClient}`);
    }

    let yt;
    try {
        console.log(`======> [youtube] Creating Innertube instance with authentication`);
        yt = await cloneInnertube(
            (input, init) => fetch(input, {
                ...init,
                dispatcher: o.dispatcher
            }),
            useSession
        );
        console.log(`======> [youtube] Innertube instance created successfully with authentication`);
    } catch (e) {
        console.log(`======> [youtube] Innertube creation failed: ${e}`);
        if (e === "no_session_tokens") {
            return { error: "youtube.no_session_tokens" };
        } else if (e.message?.endsWith("decipher algorithm")) {
            return { error: "youtube.decipher" }
        } else if (e.message?.includes("refresh access token")) {
            return { error: "youtube.token_expired" }
        } else throw e;
    }

    let info;
    let lastInfoError;
    const infoClients = [...new Set([
        innertubeClient,
        "IOS",
        "WEB",
        "WEB_EMBEDDED",
    ])];

    for (const client of infoClients) {
        try {
            console.log(`======> [youtube] Getting basic video info for ID: ${o.id} with client: ${client}`);
            info = await yt.getBasicInfo(o.id, { client });
            innertubeClient = client;
            console.log(`======> [youtube] Successfully retrieved video info with authentication using client: ${client}`);
            break;
        } catch (e) {
            lastInfoError = e;
            console.log(`======> [youtube] Failed to get video info with client ${client}: ${e?.message}`);
        }
    }

    if (!info) {
        const e = lastInfoError;
        if (e?.info) {
            let errorInfo;
            try { errorInfo = JSON.parse(e?.info); } catch {}

            if (errorInfo?.reason === "This video is private") {
                return { error: "content.video.private" };
            }
            if (["INVALID_ARGUMENT", "UNAUTHENTICATED"].includes(errorInfo?.error?.status)) {
                return { error: "youtube.api_error" };
            }
        }

        if (e?.message === "This video is unavailable") {
            return { error: "content.video.unavailable" };
        }

        return { error: "fetch.fail" };
    }

    if (!info) return { error: "fetch.fail" };

    if (isUpstreamServer) {
        const progressive = Array.isArray(info.streaming_data?.formats)
            ? info.streaming_data.formats
            : [];
        const adaptive = Array.isArray(info.streaming_data?.adaptive_formats)
            ? info.streaming_data.adaptive_formats
            : [];

        const resolvedCandidates = [...progressive, ...adaptive]
            .map((format) => {
                const resolvedUrl = resolveFormatUrl(
                    format,
                    useHLS,
                    innertubeClient,
                    innertube,
                );
                return {
                    resolvedUrl,
                    score: getUrlAccessibilityScore(resolvedUrl),
                    itag: format?.itag,
                    hasVideo: !!format?.has_video,
                    hasAudio: !!format?.has_audio,
                    quality: format?.quality_label || `${format?.width || "?"}x${format?.height || "?"}`,
                    bitrate: Number(format?.bitrate || 0),
                    mime: typeof format?.mime_type === "string"
                        ? format.mime_type.split(";")[0]
                        : "n/a",
                };
            })
            .filter((item) => !!item.resolvedUrl)
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return b.bitrate - a.bitrate;
            });

        console.log(
            `======> [youtube] Resolved URL candidates count=${resolvedCandidates.length} (progressive=${progressive.length}, adaptive=${adaptive.length}, client=${innertubeClient})`,
        );
        for (const [index, item] of resolvedCandidates.entries()) {
            console.log(
                `======> [youtube][candidate ${index + 1}/${resolvedCandidates.length}] itag=${item.itag ?? "n/a"} av=${item.hasVideo ? 1 : 0}${item.hasAudio ? 1 : 0} quality=${item.quality} bitrate=${item.bitrate || "n/a"} mime=${item.mime} score=${item.score} url=${item.resolvedUrl}`,
            );
        }
    }

    const playability = info.playability_status;
    const basicInfo = info.basic_info;

    switch (playability.status) {
        case "LOGIN_REQUIRED":
            if (playability.reason.endsWith("bot")) {
                return { error: "youtube.login" }
            }
            if (playability.reason.endsWith("age") || playability.reason.endsWith("inappropriate for some users.")) {
                return { error: "content.video.age" }
            }
            if (playability?.error_screen?.reason?.text === "Private video") {
                return { error: "content.video.private" }
            }
            break;

        case "UNPLAYABLE":
            if (playability?.reason?.endsWith("request limit.")) {
                return { error: "fetch.rate" }
            }
            if (playability?.error_screen?.subreason?.text?.endsWith("in your country")) {
                return { error: "content.video.region" }
            }
            if (playability?.error_screen?.reason?.text === "Private video") {
                return { error: "content.video.private" }
            }
            break;

        case "AGE_VERIFICATION_REQUIRED":
            return { error: "content.video.age" };
    }

    if (playability.status !== "OK") {
        return { error: "content.video.unavailable" };
    }

    if (basicInfo.is_live) {
        return { error: "content.video.live" };
    }

    if (basicInfo.duration > env.durationLimit) {
        return { error: "content.too_long" };
    }

    const duration = basicInfo.duration;

    // return a critical error if returned video is "Video Not Available"
    // or a similar stub by youtube
    if (basicInfo.id !== o.id) {
        return {
            error: "fetch.fail",
            critical: true
        }
    }

    const normalizeQuality = res => {
        const shortestSide = Math.min(res.height, res.width);
        return videoQualities.find(qual => qual >= shortestSide);
    }

    let video, audio, subtitles, dubbedLanguage,
        codec = o.codec || "h264", itag = o.itag;

    if (useHLS) {
        const variants = await getHlsVariants(
            info.streaming_data.hls_manifest_url,
            o.dispatcher
        );

        if (variants?.error) return variants;

        const matchHlsCodec = codecs => (
            codecs.includes(hlsCodecList[codec].videoCodec)
        );

        const best = variants.find(i => matchHlsCodec(i.codecs));

        const preferred = variants.find(i =>
            matchHlsCodec(i.codecs) && normalizeQuality(i.resolution) === quality
        );

        let selected = preferred || best;

        if (!selected) {
            codec = "h264";
            selected = variants.find(i => matchHlsCodec(i.codecs));
        }

        if (!selected) {
            return { error: "youtube.no_matching_format" };
        }

        audio = selected.audio.find(i => i.isDefault);

        // some videos (mainly those with AI dubs) don't have any tracks marked as default
        // why? god knows, but we assume that a default track is marked as such in the title
        if (!audio) {
            audio = selected.audio.find(i => i.name.endsWith("original"));
        }

        if (o.dubLang) {
            const dubbedAudio = selected.audio.find(i =>
                i.language?.startsWith(o.dubLang)
            );

            if (dubbedAudio && !dubbedAudio.isDefault) {
                dubbedLanguage = dubbedAudio.language;
                audio = dubbedAudio;
            }
        }

        selected.audio = [];
        selected.subtitles = [];
        video = selected;
    } else {
        // i miss typescript so bad
        const sorted_formats = {
            h264: {
                video: [],
                audio: [],
                bestVideo: undefined,
                bestAudio: undefined,
            },
            vp9: {
                video: [],
                audio: [],
                bestVideo: undefined,
                bestAudio: undefined,
            },
            av1: {
                video: [],
                audio: [],
                bestVideo: undefined,
                bestAudio: undefined,
            },
        }

        const checkFormat = (format, pCodec) => format.content_length &&
            (format.mime_type.includes(codecList[pCodec].videoCodec)
                || format.mime_type.includes(codecList[pCodec].audioCodec));

        const adaptiveFormats = Array.isArray(info.streaming_data?.adaptive_formats)
            ? info.streaming_data.adaptive_formats
            : [];

        // sort formats & weed out bad ones
        adaptiveFormats.sort((a, b) =>
            Number(b.bitrate) - Number(a.bitrate)
        ).forEach(format => {
            Object.keys(codecList).forEach(yCodec => {
                const matchingItag = slot => !itag?.[slot] || itag[slot] === format.itag;
                const sorted = sorted_formats[yCodec];
                const goodFormat = checkFormat(format, yCodec);
                if (!goodFormat) return;

                if (format.has_video && matchingItag('video')) {
                    sorted.video.push(format);
                    if (!sorted.bestVideo)
                        sorted.bestVideo = format;
                }

                if (format.has_audio && matchingItag('audio')) {
                    sorted.audio.push(format);
                    if (!sorted.bestAudio)
                        sorted.bestAudio = format;
                }
            })
        });

        const noBestMedia = () => {
            const vid = sorted_formats[codec]?.bestVideo;
            const aud = sorted_formats[codec]?.bestAudio;
            return (!vid && !o.isAudioOnly) || (!aud && o.isAudioOnly)
        };

        if (noBestMedia()) {
            if (codec === "av1") codec = "vp9";
            else if (codec === "vp9") codec = "av1";

            // if there's no higher quality fallback, then use h264
            if (noBestMedia()) codec = "h264";
        }

        // if there's no proper adaptive combo, keep going for redirect fallback.
        if (noBestMedia()) {
            if (o.isAudioOnly) {
                return { error: "youtube.no_matching_format" };
            }

            video =
                adaptiveFormats.find((format) =>
                    format?.has_video && (format?.url || format?.decipher)
                ) || video;
            audio =
                adaptiveFormats.find((format) =>
                    format?.has_audio && (format?.url || format?.decipher)
                ) || audio;
        } else {
            audio = sorted_formats[codec].bestAudio;

            if (audio?.audio_track && !audio?.is_original) {
                audio = sorted_formats[codec].audio.find(i =>
                    i?.is_original
                );
            }

            if (o.dubLang) {
                const dubbedAudio = sorted_formats[codec].audio.find(i =>
                    i.language?.startsWith(o.dubLang) && i.audio_track
                );

                if (dubbedAudio && !dubbedAudio?.is_original) {
                    audio = dubbedAudio;
                    dubbedLanguage = dubbedAudio.language;
                }
            }

            if (!o.isAudioOnly) {
                const qual = (i) => {
                    return normalizeQuality({
                        width: i.width,
                        height: i.height,
                    })
                }

                const bestQuality = qual(sorted_formats[codec].bestVideo);
                const useBestQuality = quality >= bestQuality;

                video = useBestQuality
                    ? sorted_formats[codec].bestVideo
                    : sorted_formats[codec].video.find(i => qual(i) === quality);

                if (!video) video = sorted_formats[codec].bestVideo;
            }
        }

        if (o.subtitleLang && !o.isAudioOnly && info.captions?.caption_tracks?.length) {
            const videoSubtitles = await getSubtitles(info, o.dispatcher, o.subtitleLang);
            if (videoSubtitles) {
                subtitles = videoSubtitles;
            }
        }
    }

    if (video?.drm_families || audio?.drm_families) {
        return { error: "youtube.drm" };
    }

    const fileMetadata = {
        title: basicInfo.title.trim(),
        artist: basicInfo.author.replace("- Topic", "").trim()
    }

    if (basicInfo?.short_description?.startsWith("Provided to YouTube by")) {
        const descItems = basicInfo.short_description.split("\n\n", 5);

        if (descItems.length === 5) {
            fileMetadata.album = descItems[2];
            fileMetadata.copyright = descItems[3];
            if (descItems[4].startsWith("Released on:")) {
                fileMetadata.date = descItems[4].replace("Released on: ", '').trim();
            }
        }
    }

    if (subtitles) {
        fileMetadata.sublanguage = subtitles.language;
    }

    const filenameAttributes = {
        service: "youtube",
        id: o.id,
        title: fileMetadata.title,
        author: fileMetadata.artist,
        youtubeDubName: dubbedLanguage || false,
    }

    itag = {
        video: video?.itag,
        audio: audio?.itag
    };

    const originalRequest = {
        ...o,
        dispatcher: undefined,
        itag,
        innertubeClient
    };

    if (audio && o.isAudioOnly) {
        let bestAudio = codec === "h264" ? "m4a" : "opus";
        let urls = audio.url;

        if (useHLS) {
            bestAudio = "mp3";
            urls = audio.uri;
        }

        if (!clientsWithNoCipher.includes(innertubeClient) && innertube) {
            urls = audio.decipher(innertube.session.player);
        }

        let cover = `https://i.ytimg.com/vi/${o.id}/maxresdefault.jpg`;
        const testMaxCover = await fetch(cover, { dispatcher: o.dispatcher })
            .then(r => r.status === 200)
            .catch(() => {});

        if (!testMaxCover) {
            cover = basicInfo.thumbnail?.[0]?.url;
        }

        return {
            type: "audio",
            isAudioOnly: true,
            urls,
            filenameAttributes,
            fileMetadata,
            bestAudio,
            isHLS: useHLS,
            originalRequest,

            cover,
            cropCover: basicInfo.author.endsWith("- Topic"),
            duration,
        }
    }

    if (!o.isAudioOnly) {
        const resolveUrl = (format) =>
            resolveFormatUrl(format, useHLS, innertubeClient, innertube);

        let directUrl = null;

        // Prefer progressive MP4 first when downloading normal video (with audio).
        if (!o.isAudioMuted && !useHLS) {
            const progressiveFormats = (info.streaming_data?.formats || [])
                .filter((format) =>
                    format?.has_video &&
                    format?.has_audio &&
                    format?.content_length &&
                    typeof format?.mime_type === "string" &&
                    format.mime_type.includes("video/mp4"),
                )
                .sort((a, b) => Number(b.bitrate || 0) - Number(a.bitrate || 0));

            if (progressiveFormats.length > 0) {
                const qualityOf = (fmt) => normalizeQuality({
                    width: fmt?.width || 0,
                    height: fmt?.height || 0,
                }) || 0;

                const candidates = progressiveFormats
                    .map((format) => {
                        const resolvedUrl = resolveUrl(format);
                        return {
                            format,
                            resolvedUrl,
                            quality: qualityOf(format),
                            score: getUrlAccessibilityScore(resolvedUrl),
                            bitrate: Number(format?.bitrate || 0),
                        };
                    })
                    .filter((item) => !!item.resolvedUrl)
                    .sort((a, b) => {
                        if (b.score !== a.score) return b.score - a.score;

                        const aQualityDelta = Math.abs((a.quality || 0) - quality);
                        const bQualityDelta = Math.abs((b.quality || 0) - quality);
                        if (aQualityDelta !== bQualityDelta) return aQualityDelta - bQualityDelta;

                        return b.bitrate - a.bitrate;
                    });

                const preferred = candidates[0];

                directUrl = preferred?.resolvedUrl || null;
                if (directUrl && preferred?.format) {
                    const progressiveQuality = preferred.quality;
                    const picked = preferred.format;
                    filenameAttributes.resolution = `${picked.width}x${picked.height}`;
                    filenameAttributes.qualityLabel = `${progressiveQuality}p`;
                    filenameAttributes.extension = "mp4";
                    filenameAttributes.youtubeFormat = "h264";
                }
            }
        }

        // Fallback to video-only direct URL (still redirect, never merge).
        if (!directUrl && video) {
            const adaptiveFormats = Array.isArray(info.streaming_data?.adaptive_formats)
                ? info.streaming_data.adaptive_formats
                : [];
            const videoCandidates = [video, ...adaptiveFormats.filter((fmt) => fmt?.has_video)]
                .map((format) => {
                    const resolvedUrl = resolveUrl(format);
                    return {
                        format,
                        resolvedUrl,
                        score: getUrlAccessibilityScore(resolvedUrl),
                        bitrate: Number(format?.bitrate || 0),
                    };
                })
                .filter((item) => !!item.resolvedUrl)
                .sort((a, b) => {
                    if (b.score !== a.score) return b.score - a.score;
                    return b.bitrate - a.bitrate;
                });

            const picked = videoCandidates[0]?.format || null;
            directUrl = videoCandidates[0]?.resolvedUrl || null;

            if (directUrl && picked) {
                let resolution;
                if (useHLS) {
                    resolution = normalizeQuality(picked.resolution);
                    filenameAttributes.resolution = `${picked.resolution.width}x${picked.resolution.height}`;
                    filenameAttributes.extension =
                        o.container === "auto" ? hlsCodecList[codec].container : o.container;
                } else {
                    resolution = normalizeQuality({
                        width: picked.width,
                        height: picked.height,
                    });
                    filenameAttributes.resolution = `${picked.width}x${picked.height}`;
                    filenameAttributes.extension =
                        o.container === "auto" ? codecList[codec].container : o.container;
                }

                filenameAttributes.qualityLabel = `${resolution}p`;
                filenameAttributes.youtubeFormat = codec;
            }
        }

        if (!directUrl && audio) {
            const adaptiveFormats = Array.isArray(info.streaming_data?.adaptive_formats)
                ? info.streaming_data.adaptive_formats
                : [];
            const audioCandidates = [audio, ...adaptiveFormats.filter((fmt) => fmt?.has_audio)]
                .map((format) => {
                    const resolvedUrl = resolveUrl(format);
                    return {
                        resolvedUrl,
                        score: getUrlAccessibilityScore(resolvedUrl),
                        bitrate: Number(format?.bitrate || 0),
                    };
                })
                .filter((item) => !!item.resolvedUrl)
                .sort((a, b) => {
                    if (b.score !== a.score) return b.score - a.score;
                    return b.bitrate - a.bitrate;
                });

            directUrl = audioCandidates[0]?.resolvedUrl || null;
        }

        if (directUrl) {
            try {
                const parsed = new URL(directUrl);
                console.log(
                    `======> [youtube] Redirect URL selected: host=${parsed.host}, itag=${parsed.searchParams.get("itag") || "n/a"}, client=${parsed.searchParams.get("c") || "n/a"}, ipbypass=${parsed.searchParams.get("ipbypass") || "no"}, has_ip=${parsed.searchParams.has("ip")}`,
                );
            } catch {}

            return {
                type: "proxy",
                forceRedirect: true,
                urls: directUrl,
                subtitles: subtitles?.url,
                filenameAttributes,
                fileMetadata,
                isHLS: useHLS,
                originalRequest,
                duration,
            };
        }
    }

    return { error: "youtube.no_matching_format" };
}
