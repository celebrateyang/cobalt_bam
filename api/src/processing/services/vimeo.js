import HLS from "hls-parser";
import { env, genericUserAgent } from "../../config.js";
import { merge } from '../../misc/utils.js';
import { getCookie } from "../cookie/manager.js";

const resolutionMatch = {
    "3840": 2160,
    "2732": 1440,
    "2560": 1440,
    "2048": 1080,
    "1920": 1080,
    "1366": 720,
    "1280": 720,
    "960": 480,
    "640": 360,
    "426": 240
}

const genericHeaders = {
    Accept: 'application/vnd.vimeo.*+json; version=3.4.10',
    'User-Agent': 'com.vimeo.android.videoapp (Google, Pixel 7a, google, Android 16/36 Version 11.8.1) Kotlin VimeoNetworking/3.12.0',
    Authorization: 'Basic NzRmYTg5YjgxMWExY2JiNzUwZDg1MjhkMTYzZjQ4YWYyOGEyZGJlMTp4OGx2NFd3QnNvY1lkamI2UVZsdjdDYlNwSDUrdm50YzdNNThvWDcwN1JrenJGZC9tR1lReUNlRjRSVklZeWhYZVpRS0tBcU9YYzRoTGY2Z1dlVkJFYkdJc0dMRHpoZWFZbU0reDRqZ1dkZ1diZmdIdGUrNUM5RVBySlM0VG1qcw==',
    'Accept-Language': 'en',
}
const playerPageHeaders = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "User-Agent": genericUserAgent,
    "Accept-Language": "en",
}

let bearer = '';

const getBearer = async (refresh = false) => {
    const cookie = getCookie('vimeo_bearer')?.values?.()?.access_token;
    if ((bearer || cookie) && !refresh) return bearer || cookie;

    const oauthResponse = await fetch(
        'https://api.vimeo.com/oauth/authorize/client',
        {
            method: 'POST',
            body: new URLSearchParams({
                scope: 'private public create edit delete interact upload purchased stats',
                grant_type: 'client_credentials',
            }).toString(),
            headers: {
                ...genericHeaders,
                'Content-Type': 'application/x-www-form-urlencoded',
            }
        }
    )
    .then(a => a.json())
    .catch(() => {});

    if (!oauthResponse || !oauthResponse.access_token) {
        return;
    }

    return bearer = oauthResponse.access_token;
}

const requestApiInfo = (bearerToken, videoId, password) => {
    if (password) {
        videoId += `:${password}`
    }

    return fetch(
        `https://api.vimeo.com/videos/${videoId}`,
        {
            headers: {
                ...genericHeaders,
                Authorization: `Bearer ${bearerToken}`,
            }
        }
    )
    .then(a => a.json())
    .catch(() => {});
}

const compareQuality = (rendition, requestedQuality) => {
    const quality = parseInt(rendition);
    return Math.abs(quality - requestedQuality);
}

const extractJsonAfter = (text, marker) => {
    const start = text.indexOf(marker);
    if (start === -1) return;

    let index = start + marker.length;
    while (index < text.length && /\s/.test(text[index])) {
        index += 1;
    }

    if (text[index] !== "{") {
        return;
    }

    const begin = index;
    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (; index < text.length; index += 1) {
        const char = text[index];

        if (inString) {
            if (isEscaped) {
                isEscaped = false;
            } else if (char === "\\") {
                isEscaped = true;
            } else if (char === "\"") {
                inString = false;
            }
            continue;
        }

        if (char === "\"") {
            inString = true;
            continue;
        }

        if (char === "{") {
            depth += 1;
            continue;
        }

        if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                return text.slice(begin, index + 1);
            }
        }
    }
}

const getSubtitlesFromTracks = (textTracks, subtitleLang) => {
    if (!subtitleLang || !Array.isArray(textTracks) || textTracks.length === 0) {
        return;
    }

    let subtitles = textTracks.find(
        t => typeof t?.lang === "string" && t.lang.startsWith(subtitleLang)
    );

    if (!subtitles?.url) {
        return;
    }

    return new URL(subtitles.url, "https://player.vimeo.com/").toString();
}

const getDirectLink = async (data, quality, subtitleLang) => {
    if (!data.files) return;

    const match = data.files
        .filter(f => f.rendition?.endsWith('p'))
        .reduce((prev, next) => {
            const delta = {
                prev: compareQuality(prev.rendition, quality),
                next: compareQuality(next.rendition, quality)
            };

            return delta.prev < delta.next ? prev : next;
        });

    if (!match) return;

    let subtitles = getSubtitlesFromTracks(data.text_tracks, subtitleLang);
    if (!subtitles && subtitleLang && data.config_url) {
        const config = await fetch(data.config_url)
                    .then(r => r.json())
                    .catch(() => {});

        subtitles = getSubtitlesFromTracks(config?.request?.text_tracks, subtitleLang);
    }

    return {
        urls: match.link,
        subtitles,
        filenameAttributes: {
            resolution: `${match.width}x${match.height}`,
            qualityLabel: match.rendition,
            extension: "mp4"
        },
        bestAudio: "mp3",
    }
}

const getHLSMasterURL = (hlsData) => {
    if (!hlsData?.cdns || typeof hlsData.cdns !== "object") {
        return;
    }

    const defaultCDN = hlsData.default_cdn && hlsData.cdns[hlsData.default_cdn]
        ? hlsData.cdns[hlsData.default_cdn]
        : undefined;
    const fallbackCDN = Object.values(hlsData.cdns).find(
        c => typeof c?.avc_url === "string" || typeof c?.url === "string"
    );
    const chosen = defaultCDN || fallbackCDN;

    return chosen?.avc_url || chosen?.url;
}

const buildOriginalVideoURL = (videoId, password) => {
    const originalURL = new URL(`https://vimeo.com/${videoId}`);
    if (password) {
        originalURL.pathname += `/${password}`;
    }
    return originalURL;
}

const getHLS = async (configURL, obj) => {
    if (!configURL) return;

    const api = await fetch(configURL)
                    .then(r => r.json())
                    .catch(() => {});
    if (!api) return { error: "fetch.fail" };

    if (api.video?.duration > env.durationLimit) {
        return { error: "content.too_long" };
    }

    const urlMasterHLS = api.request?.files?.hls?.cdns?.akfire_interconnect_quic?.url;
    if (!urlMasterHLS) return { error: "fetch.fail" };

    const masterHLS = await fetch(urlMasterHLS)
                            .then(r => r.text())
                            .catch(() => {});

    if (!masterHLS) return { error: "fetch.fail" };

    const variants = HLS.parse(masterHLS)?.variants?.sort(
        (a, b) => Number(b.bandwidth) - Number(a.bandwidth)
    );
    if (!variants || variants.length === 0) return { error: "fetch.empty" };

    let bestQuality;

    if (obj.quality < resolutionMatch[variants[0]?.resolution?.width]) {
        bestQuality = variants.find(v =>
            (obj.quality === resolutionMatch[v.resolution.width])
        );
    }

    if (!bestQuality) bestQuality = variants[0];

    const expandLink = (path) => {
        return new URL(path, urlMasterHLS).toString();
    };

    let urls = expandLink(bestQuality.uri);

    const audioPath = bestQuality?.audio[0]?.uri;
    if (audioPath) {
        urls = [
            urls,
            expandLink(audioPath)
        ]
    } else if (obj.isAudioOnly) {
        return { error: "fetch.empty" };
    }

    return {
        urls,
        isHLS: true,
        filenameAttributes: {
            resolution: `${bestQuality.resolution.width}x${bestQuality.resolution.height}`,
            qualityLabel: `${resolutionMatch[bestQuality.resolution.width]}p`,
            extension: "mp4"
        },
        bestAudio: "mp3",
    }
}

const getPlayerURLFromOEmbed = async (videoId, password) => {
    const originalURL = buildOriginalVideoURL(videoId, password);
    const endpoint = new URL("https://vimeo.com/api/oembed.json");
    endpoint.searchParams.set("url", originalURL.toString());

    const oembed = await fetch(endpoint, {
        headers: playerPageHeaders,
    })
    .then(r => r.json())
    .catch(() => {});

    const iframeHtml = typeof oembed?.html === "string" ? oembed.html : "";
    const iframeSrc = iframeHtml.match(/src="([^"]+)"/i)?.[1];
    if (!iframeSrc) {
        return;
    }

    return new URL(iframeSrc.replace(/&amp;/g, "&"));
}

const getPlayerConfig = async (videoId, password, browserCookie) => {
    let playerURL;
    if (password) {
        playerURL = new URL(`https://player.vimeo.com/video/${videoId}`);
        playerURL.searchParams.set("h", password);
    } else {
        playerURL = await getPlayerURLFromOEmbed(videoId, password);
    }

    if (!playerURL) {
        return;
    }

    const originalURL = buildOriginalVideoURL(videoId, password);

    const page = await fetch(playerURL, {
        headers: {
            ...playerPageHeaders,
            Referer: originalURL.toString(),
            ...(browserCookie ? { Cookie: browserCookie } : {}),
        },
    })
    .then(r => r.text())
    .catch(() => {});

    if (!page) {
        return;
    }

    const serializedConfig = extractJsonAfter(page, "window.playerConfig = ");
    if (!serializedConfig) {
        return;
    }

    return JSON.parse(serializedConfig);
}

const getResponseFromPlayerConfig = async (config, obj, quality) => {
    if (!config?.request?.files) {
        return;
    }

    const progressiveFiles = Array.isArray(config.request.files.progressive)
        ? config.request.files.progressive
        : undefined;

    const directResponse = progressiveFiles?.length
        ? await getDirectLink({
            files: progressiveFiles,
            text_tracks: config.request.text_tracks,
        }, quality, obj.subtitleLang)
        : undefined;

    if (directResponse) {
        return directResponse;
    }

    const hlsURL = getHLSMasterURL(config.request.files.hls);
    if (!hlsURL) {
        return;
    }

    const masterHLS = await fetch(hlsURL)
                        .then(r => r.text())
                        .catch(() => {});

    if (!masterHLS) {
        return { error: "fetch.fail" };
    }

    if (config.video?.duration > env.durationLimit) {
        return { error: "content.too_long" };
    }

    const variants = HLS.parse(masterHLS)?.variants?.sort(
        (a, b) => Number(b.bandwidth) - Number(a.bandwidth)
    );
    if (!variants || variants.length === 0) {
        return { error: "fetch.empty" };
    }

    let bestQuality;
    if (quality < resolutionMatch[variants[0]?.resolution?.width]) {
        bestQuality = variants.find(v =>
            quality === resolutionMatch[v.resolution.width]
        );
    }

    if (!bestQuality) {
        bestQuality = variants[0];
    }

    const expandLink = (path) => {
        return new URL(path, hlsURL).toString();
    };

    let urls = expandLink(bestQuality.uri);

    const audioPath = bestQuality?.audio?.[0]?.uri;
    if (audioPath) {
        urls = [
            urls,
            expandLink(audioPath),
        ];
    } else if (obj.isAudioOnly) {
        return { error: "fetch.empty" };
    }

    return {
        urls,
        isHLS: true,
        filenameAttributes: {
            resolution: `${bestQuality.resolution.width}x${bestQuality.resolution.height}`,
            qualityLabel: `${resolutionMatch[bestQuality.resolution.width]}p`,
            extension: "mp4"
        },
        bestAudio: "mp3",
    }
}

export default async function(obj) {
    let quality = obj.quality === "max" ? 9000 : Number(obj.quality);
    if (quality < 240) quality = 240;
    if (!quality || obj.isAudioOnly) quality = 9000;
    const browserCookie = getCookie("vimeo")?.toString();

    const buildFinalResponse = (info, response) => {
        const fileMetadata = {
            title: info?.name || info?.title || info?.video?.title,
            artist: info?.user?.name || info?.owner?.name || info?.video?.owner?.name,
        };
        const duration =
            typeof info?.duration === "number" && Number.isFinite(info.duration)
                ? info.duration
                : typeof info?.video?.duration === "number" && Number.isFinite(info.video.duration)
                    ? info.video.duration
                    : undefined;

        if (response.subtitles) {
            fileMetadata.sublanguage = obj.subtitleLang;
        }

        return merge(
            {
                duration,
                fileMetadata,
                filenameAttributes: {
                    service: "vimeo",
                    id: obj.id,
                    title: fileMetadata.title,
                    author: fileMetadata.artist,
                }
            },
            response
        );
    };

    if (obj.password || browserCookie) {
        const playerConfig = await getPlayerConfig(obj.id, obj.password, browserCookie).catch(() => {});
        const playerResponse = playerConfig
            ? await getResponseFromPlayerConfig(playerConfig, obj, quality)
            : undefined;

        if (playerResponse && !playerResponse.error) {
            return buildFinalResponse(playerConfig, playerResponse);
        }
    }

    const bearerToken = await getBearer();
    if (!bearerToken) {
        return { error: "fetch.fail" };
    }

    let info = await requestApiInfo(bearerToken, obj.id, obj.password);
    let response;

    // auth error, try to refresh the token
    if (info?.error_code === 8003) {
        const newBearer = await getBearer(true);
        if (!newBearer) {
            return { error: "fetch.fail" };
        }
        info = await requestApiInfo(newBearer, obj.id, obj.password);
    }

    // if there's still no info, then return a generic error
    if (!info || info.error_code) {
        return { error: "fetch.empty" };
    }

    if (obj.isAudioOnly) {
        response = await getHLS(info.config_url, { ...obj, quality });
    }

    if (!response) response = await getDirectLink(info, quality, obj.subtitleLang);
    if (!response) response = { error: "fetch.empty" };

    if (response.error) {
        return response;
    }

    return buildFinalResponse(info, response);
}
