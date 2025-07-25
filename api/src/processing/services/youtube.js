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
    let innertubeClient = o.innertubeClient || env.customInnertubeClient || "IOS";
    console.log(`======> [youtube] Using HLS: ${useHLS}, Client: ${innertubeClient}`);

    // HLS playlists from the iOS client don't contain the av1 video format.
    if (useHLS && o.format === "av1") {
        useHLS = false;
        console.log(`======> [youtube] Disabled HLS due to av1 format`);
    }    if (useHLS) {
        innertubeClient = "IOS";
        console.log(`======> [youtube] Set client to IOS for HLS`);
    }

    // iOS client doesn't have adaptive formats of resolution >1080p,
    // so we use the WEB_EMBEDDED client instead for those cases
    const useSession =
        env.ytSessionServer && (
            (
                !useHLS
                && innertubeClient === "IOS"
                && (
                    (quality > 1080 && o.format !== "h264")
                    || (quality > 1080 && o.format !== "vp9")
                )
            )
        );    if (useSession) {
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
    try {
        console.log(`======> [youtube] Getting basic video info for ID: ${o.id} with client: ${innertubeClient}`);
        info = await yt.getBasicInfo(o.id, innertubeClient);
        console.log(`======> [youtube] Successfully retrieved video info with authentication`);
    } catch (e) {
        console.log(`======> [youtube] Failed to get video info: ${e.message}`);
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

    let video, audio, dubbedLanguage,
        codec = o.format || "h264", itag = o.itag;

    if (useHLS) {
        const hlsManifest = info.streaming_data.hls_manifest_url;

        if (!hlsManifest) {
            return { error: "youtube.no_hls_streams" };
        }

        const fetchedHlsManifest = await fetch(hlsManifest, {
            dispatcher: o.dispatcher,
        }).then(r => {
            if (r.status === 200) {
                return r.text();
            } else {
                throw new Error("couldn't fetch the HLS playlist");
            }
        }).catch(() => { });

        if (!fetchedHlsManifest) {
            return { error: "youtube.no_hls_streams" };
        }

        const variants = HLS.parse(fetchedHlsManifest).variants.sort(
            (a, b) => Number(b.bandwidth) - Number(a.bandwidth)
        );

        if (!variants || variants.length === 0) {
            return { error: "youtube.no_hls_streams" };
        }

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
            audio = selected.audio.find(i => i.name.endsWith("- original"));
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

        // sort formats & weed out bad ones
        info.streaming_data.adaptive_formats.sort((a, b) =>
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

        // if there's no proper combo of av1, vp9, or h264, then give up
        if (noBestMedia()) {
            return { error: "youtube.no_matching_format" };
        }

        audio = sorted_formats[codec].bestAudio;

        if (audio?.audio_track && !audio?.audio_track?.audio_is_default) {
            audio = sorted_formats[codec].audio.find(i =>
                i?.audio_track?.audio_is_default
            );
        }

        if (o.dubLang) {
            const dubbedAudio = sorted_formats[codec].audio.find(i =>
                i.language?.startsWith(o.dubLang) && i.audio_track
            );

            if (dubbedAudio && !dubbedAudio?.audio_track?.audio_is_default) {
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

        return {
            type: "audio",
            isAudioOnly: true,
            urls,
            filenameAttributes,
            fileMetadata,
            bestAudio,
            isHLS: useHLS,
            originalRequest
        }
    }

    if (video && audio) {
        let resolution;

        if (useHLS) {
            resolution = normalizeQuality(video.resolution);
            filenameAttributes.resolution = `${video.resolution.width}x${video.resolution.height}`;
            filenameAttributes.extension = hlsCodecList[codec].container;

            video = video.uri;
            audio = audio.uri;
        } else {
            resolution = normalizeQuality({
                width: video.width,
                height: video.height,
            });

            filenameAttributes.resolution = `${video.width}x${video.height}`;
            filenameAttributes.extension = codecList[codec].container;

            if (!clientsWithNoCipher.includes(innertubeClient) && innertube) {
                video = video.decipher(innertube.session.player);
                audio = audio.decipher(innertube.session.player);
            } else {
                video = video.url;
                audio = audio.url;
            }
        }

        filenameAttributes.qualityLabel = `${resolution}p`;
        filenameAttributes.youtubeFormat = codec;

        return {
            type: "merge",
            urls: [
                video,
                audio,
            ],
            filenameAttributes,
            fileMetadata,
            isHLS: useHLS,
            originalRequest
        }
    }

    return { error: "youtube.no_matching_format" };
}
