import { strict as assert } from "node:assert";

import { env } from "../config.js";
import { createResponse } from "../processing/request.js";
import { createStream } from "../stream/manage.js";

import { testers } from "./service-patterns.js";
import matchAction from "./match-action.js";

import { friendlyServiceName } from "./service-alias.js";

import bilibili from "./services/bilibili.js";
import cctv from "./services/cctv.js";
import reddit from "./services/reddit.js";
import twitter from "./services/twitter.js";
import youtube from "./services/youtube.js";
import vk from "./services/vk.js";
import ok from "./services/ok.js";
import tiktok from "./services/tiktok.js";
import tumblr from "./services/tumblr.js";
import vimeo from "./services/vimeo.js";
import soundcloud from "./services/soundcloud.js";
import instagram from "./services/instagram.js";
import pinterest from "./services/pinterest.js";
import streamable from "./services/streamable.js";
import twitch from "./services/twitch.js";
import rutube from "./services/rutube.js";
import dailymotion from "./services/dailymotion.js";
import snapchat from "./services/snapchat.js";
import loom from "./services/loom.js";
import facebook from "./services/facebook.js";
import bluesky from "./services/bluesky.js";
import xiaohongshu from "./services/xiaohongshu.js";
import newgrounds from "./services/newgrounds.js";
import douyin from "./services/douyin.js";
import kuaishou from "./services/kuaishou.js";

let freebind;
const twitterUpstreamFallbackErrors = new Set([
    "content.post.age",
    "content.post.private",
    "content.post.unavailable",
    "fetch.empty",
]);
const tiktokUpstreamFallbackErrors = new Set([
    "fetch.fail",
    "fetch.empty",
    "content.post.unavailable",
    "content.post.age",
]);
const vimeoUpstreamFallbackErrors = new Set([
    "fetch.fail",
    "fetch.empty",
    "content.video.unavailable",
]);
const isUpstreamServer = (() => {
    const raw = String(process.env.IS_UPSTREAM_SERVER || "").toLowerCase().trim();
    return raw === "true" || raw === "1";
})();

const normalizeForwardIp = (value) => {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!trimmed) return "";
    return trimmed.split(",")[0].trim().replace(/^::ffff:/, "");
};

const getRequestHost = (payload) => {
    try {
        if (payload instanceof URL) {
            return payload.hostname.toLowerCase();
        }

        const raw = typeof payload?.url === "string" ? payload.url : String(payload || "");
        return new URL(raw).hostname.toLowerCase();
    } catch {
        return "";
    }
};

const shouldWrapUpstreamTunnelLocally = (payload, value) => {
    if (typeof value !== "string") return false;

    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        return false;
    }

    if (parsed.pathname !== "/tunnel") {
        return false;
    }

    const requestHost = getRequestHost(payload);
    return requestHost === "vimeo.com" || requestHost.endsWith(".vimeo.com");
};

const requestUpstreamCobalt = async (payload) => {
    if (!env.instagramUpstreamURL || isUpstreamServer) {
        return null;
    }

    let endpoint;
    try {
        endpoint = new URL(env.instagramUpstreamURL);
    } catch {
        return null;
    }

    try {
        if (new URL(env.apiURL).origin === endpoint.origin) {
            return null;
        }
    } catch {}

    endpoint.pathname = "/";
    endpoint.search = "";
    endpoint.hash = "";

    const headers = {
        Accept: "application/json",
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
    };

    if (env.instagramUpstreamApiKey) {
        headers.Authorization = `Api-Key ${env.instagramUpstreamApiKey}`;
    }

    const forwardedIp = normalizeForwardIp(payload?.requestClientIp || "");
    if (forwardedIp) {
        headers["X-FSV-Client-IP"] = forwardedIp;
    }

    const timeoutMs =
        typeof env.instagramUpstreamTimeoutMs === "number"
        && Number.isFinite(env.instagramUpstreamTimeoutMs)
        && env.instagramUpstreamTimeoutMs > 0
            ? env.instagramUpstreamTimeoutMs
            : 12000;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const buildUpstreamBody = (input) => {
            if (input instanceof URL) {
                return { url: String(input) };
            }

            if (!input || typeof input !== "object") {
                return { url: String(input || "") };
            }

            const allowedKeys = new Set([
                "url",
                "audioBitrate",
                "audioFormat",
                "downloadMode",
                "filenameStyle",
                "youtubeVideoCodec",
                "youtubeVideoContainer",
                "videoQuality",
                "localProcessing",
                "batch",
                "youtubeDubLang",
                "subtitleLang",
                "disableMetadata",
                "allowH265",
                "convertGif",
                "tiktokFullAudio",
                "alwaysProxy",
                "youtubeHLS",
                "youtubeBetterAudio",
            ]);

            const body = {};
            for (const [key, value] of Object.entries(input)) {
                if (!allowedKeys.has(key)) {
                    continue;
                }

                if (value === undefined || value === null) {
                    continue;
                }

                if (key === "url") {
                    body.url = String(value);
                } else {
                    body[key] = value;
                }
            }

            if (!body.url) {
                body.url = String(input.url || "");
            }

            return body;
        };

        const requestBody = (() => {
            return buildUpstreamBody(payload);
        })();

        const response = await fetch(endpoint, {
            method: "POST",
            signal: controller.signal,
            headers,
            body: JSON.stringify(requestBody),
        });

        const body = await response.json().catch(() => null);
        if (!body || typeof body !== "object" || typeof body.status !== "string") {
            return null;
        }

        const upstreamOrigin = endpoint.origin;
        const normalizeTunnelUrl = (value) => {
            if (typeof value !== "string") return value;

            let parsed;
            try {
                parsed = new URL(value);
            } catch {
                return value;
            }

            if (parsed.pathname !== "/tunnel") {
                return value;
            }

            return new URL(
                parsed.pathname + parsed.search + parsed.hash,
                upstreamOrigin,
            ).toString();
        };

        const wrapUpstreamTunnel = (value, filename, serviceHint) => {
            const normalizedValue = normalizeTunnelUrl(value);
            if (!shouldWrapUpstreamTunnelLocally(payload, normalizedValue)) {
                return normalizedValue;
            }

            return createStream({
                type: "proxy",
                url: normalizedValue,
                service: serviceHint || "upstream",
                filename: typeof filename === "string" && filename.trim()
                    ? filename
                    : "download.bin",
            });
        };

        const normalizedBody = (() => {
            if (!body || typeof body !== "object") return body;

            if (body.status === "tunnel" || body.status === "redirect") {
                return {
                    ...body,
                    url: wrapUpstreamTunnel(body.url, body.filename, body.service),
                };
            }

            if (body.status === "local-processing" && Array.isArray(body.tunnel)) {
                return {
                    ...body,
                    tunnel: body.tunnel.map((item) => normalizeTunnelUrl(item)),
                };
            }

            if (body.status === "picker" && Array.isArray(body.picker)) {
                return {
                    ...body,
                    audio: typeof body.audio === "string" ? normalizeTunnelUrl(body.audio) : body.audio,
                    picker: body.picker.map((item) => {
                        if (!item || typeof item !== "object") return item;
                        return {
                            ...item,
                            url: normalizeTunnelUrl(item.url),
                        };
                    }),
                };
            }

            if (body.status === "picker" && typeof body.audio === "string") {
                return {
                    ...body,
                    audio: normalizeTunnelUrl(body.audio),
                };
            }

            return body;
        })();

        return { status: response.status, body: normalizedBody };
    } catch {
        return null;
    } finally {
        clearTimeout(timeout);
    }
};

export default async function({ host, patternMatch, params, authType }) {
    const { url } = params;
    assert(url instanceof URL);
    let dispatcher, requestIP;

    if (env.freebindCIDR) {
        if (!freebind) {
            freebind = await import('freebind');
        }

        requestIP = freebind.ip.random(env.freebindCIDR);
        dispatcher = freebind.dispatcherFromIP(requestIP, { strict: false });
    }

    try {
        let r,
            isAudioOnly = params.downloadMode === "audio",
            isAudioMuted = params.downloadMode === "mute";

        if (!testers[host]) {
            return createResponse("error", {
                code: "error.api.service.unsupported"
            });
        }
        if (!(testers[host](patternMatch))) {
            return createResponse("error", {
                code: "error.api.link.unsupported",
                context: {
                    service: friendlyServiceName(host),
                }
            });
        }

        // youtubeHLS will be fully removed in the future
        let youtubeHLS = params.youtubeHLS;
        const hlsEnv = env.enableDeprecatedYoutubeHls;

        if (hlsEnv === "never" || (hlsEnv === "key" && authType !== "key")) {
            youtubeHLS = false;
        }

        const subtitleLang =
            params.subtitleLang !== "none" ? params.subtitleLang : undefined;

        switch (host) {
            case "twitter":
                r = await twitter({
                    id: patternMatch.id,
                    index: patternMatch.index - 1,
                    toGif: !!params.convertGif,
                    alwaysProxy: params.alwaysProxy,
                    dispatcher,
                    subtitleLang
                });
                break;

            case "vk":
                r = await vk({
                    ownerId: patternMatch.ownerId,
                    videoId: patternMatch.videoId,
                    accessKey: patternMatch.accessKey,
                    quality: params.videoQuality,
                    subtitleLang,
                });
                break;

            case "ok":
                r = await ok({
                    id: patternMatch.id,
                    quality: params.videoQuality
                });
                break;

            case "bilibili":
                r = await bilibili(patternMatch);
                break;

            case "cctv":
                r = await cctv({
                    ...patternMatch,
                    quality: params.videoQuality,
                    url,
                });
                break;

            case "youtube":
                // In API mode, route all YouTube requests to upstream directly.
                // This avoids using API node egress/cookies for YouTube extraction.
                if (!isUpstreamServer) {
                    const upstream = await requestUpstreamCobalt(params);
                    if (upstream) {
                        return upstream;
                    }

                    return createResponse("error", {
                        code: "error.api.fetch.fail",
                        context: {
                            service: friendlyServiceName(host),
                        },
                    });
                }

                let fetchInfo = {
                    dispatcher,
                    id: patternMatch.id.slice(0, 11),
                    quality: params.videoQuality,
                    codec: params.youtubeVideoCodec,
                    container: params.youtubeVideoContainer,
                    isAudioOnly,
                    isAudioMuted,
                    dubLang: params.youtubeDubLang,
                    youtubeHLS,
                    subtitleLang,
                    requestClientIp: params.requestClientIp,
                }

                if (url.hostname === "music.youtube.com" || isAudioOnly) {
                    fetchInfo.quality = "1080";
                    fetchInfo.codec = "vp9";
                    fetchInfo.isAudioOnly = true;
                    fetchInfo.isAudioMuted = false;

                    if (env.ytAllowBetterAudio && params.youtubeBetterAudio) {
                        fetchInfo.quality = "max";
                    }
                }

                r = await youtube(fetchInfo);
                break;

            case "reddit":
                r = await reddit({
                    ...patternMatch,
                    dispatcher,
                });
                break;

            case "tiktok":
                r = await tiktok({
                    postId: patternMatch.postId,
                    shortLink: patternMatch.shortLink,
                    fullAudio: params.tiktokFullAudio,
                    isAudioOnly,
                    h265: params.allowH265,
                    alwaysProxy: params.alwaysProxy,
                    subtitleLang,
                });
                break;

            case "tumblr":
                r = await tumblr({
                    id: patternMatch.id,
                    user: patternMatch.user,
                    url
                });
                break;

            case "vimeo":
                r = await vimeo({
                    id: patternMatch.id.slice(0, 11),
                    password: patternMatch.password,
                    quality: params.videoQuality,
                    isAudioOnly,
                    subtitleLang,
                });
                break;

            case "soundcloud":
                isAudioOnly = true;
                isAudioMuted = false;
                r = await soundcloud({
                    ...patternMatch,
                    format: params.audioFormat,
                });
                break;

            case "instagram":
                r = await instagram({
                    ...patternMatch,
                    quality: params.videoQuality,
                    alwaysProxy: params.alwaysProxy,
                    dispatcher
                })
                break;

            case "pinterest":
                r = await pinterest({
                    id: patternMatch.id,
                    shortLink: patternMatch.shortLink || false
                });
                break;

            case "streamable":
                r = await streamable({
                    id: patternMatch.id,
                    quality: params.videoQuality,
                    isAudioOnly,
                });
                break;

            case "twitch":
                r = await twitch({
                    clipId: patternMatch.clip || false,
                    quality: params.videoQuality,
                    isAudioOnly,
                });
                break;

            case "rutube":
                r = await rutube({
                    id: patternMatch.id,
                    yappyId: patternMatch.yappyId,
                    key: patternMatch.key,
                    quality: params.videoQuality,
                    isAudioOnly,
                    subtitleLang,
                });
                break;

            case "dailymotion":
                r = await dailymotion(patternMatch);
                break;

            case "douyin":
                r = await douyin(patternMatch);
                break;

            case "kuaishou":
                r = await kuaishou(patternMatch);
                break;

            case "snapchat":
                r = await snapchat({
                    ...patternMatch,
                    alwaysProxy: params.alwaysProxy,
                });
                break;

            case "loom":
                r = await loom({
                    id: patternMatch.id,
                    subtitleLang,
                });
                break;

            case "facebook":
                r = await facebook({
                    ...patternMatch,
                    dispatcher
                });
                break;

            case "bsky":
                r = await bluesky({
                    ...patternMatch,
                    alwaysProxy: params.alwaysProxy,
                    dispatcher
                });
                break;

            case "xiaohongshu":
                r = await xiaohongshu({
                    ...patternMatch,
                    h265: params.allowH265,
                    isAudioOnly,
                    dispatcher,
                });
                break;

            case "newgrounds":
                r = await newgrounds({
                    ...patternMatch,
                    quality: params.videoQuality,
                });
                break;

            default:
                return createResponse("error", {
                    code: "error.api.service.unsupported"
                });
        }

        if (r.isAudioOnly) {
            isAudioOnly = true;
            isAudioMuted = false;
        }

        if (
            host === "tiktok"
            && !isUpstreamServer
            && !isAudioOnly
            && !isAudioMuted
            && !r?.picker
        ) {
            const shouldTryUpstream =
                tiktokUpstreamFallbackErrors.has(r?.error)
                || r?.tiktokPreferUpstream === true;

            if (shouldTryUpstream) {
                console.log(
                    `[tiktok] local result error=${r?.error || "none"} source=${r?.tiktokVideoSourceKind || "unknown"} embed=${r?.tiktokUsedEmbedFallback === true} -> trying upstream fallback`
                );

                const upstream = await requestUpstreamCobalt(params);
                if (upstream) {
                    console.log(
                        `[tiktok] upstream fallback success status=${upstream?.body?.status || "unknown"}`
                    );
                    return upstream;
                }

                console.log("[tiktok] upstream fallback unavailable, returning local result");
            }
        }

        if (host === "vimeo" && !isUpstreamServer) {
            const shouldTryUpstream =
                r?.isHLS === true ||
                vimeoUpstreamFallbackErrors.has(r?.error);

            if (shouldTryUpstream) {
                console.log(
                    `[vimeo] local result error=${r?.error || "none"} hls=${r?.isHLS === true} -> trying upstream fallback`
                );

                const upstream = await requestUpstreamCobalt(params);
                if (upstream?.body?.status && upstream.body.status !== "error") {
                    console.log(
                        `[vimeo] upstream fallback success status=${upstream?.body?.status || "unknown"}`
                    );
                    return upstream;
                }

                console.log("[vimeo] upstream fallback unavailable, returning local result");
            }
        }

        if (r.error && r.critical) {
            return createResponse("critical", {
                code: `error.api.${r.error}`,
            })
        }

        if (host === "twitter" && twitterUpstreamFallbackErrors.has(r?.error)) {
            console.log(
                `[twitter] local error=${r.error}, trying upstream fallback`
            );
            const upstream = await requestUpstreamCobalt(params);
            if (upstream) {
                console.log(
                    `[twitter] upstream fallback success status=${upstream?.body?.status || "unknown"}`
                );
                return upstream;
            }
            console.log("[twitter] upstream fallback unavailable, returning local error");
        }

        if (r.error) {
            const normalizedError =
                host === "youtube"
                    ? ({
                        "youtube.auth_required": "youtube.login",
                        "youtube.no_session_tokens": "youtube.login",
                        "youtube.api_error": "fetch.fail",
                        "youtube.no_matching_format": "fetch.fail",
                    }[r.error] || r.error)
                    : r.error;

            let context;
            const retryAfterSeconds =
                typeof r?.limit === "number" &&
                Number.isFinite(r.limit) &&
                r.limit > 0
                    ? Math.round(r.limit)
                    : 60;

            switch(normalizedError) {
                case "content.too_long":
                    context = {
                        limit: parseFloat((env.durationLimit / 60).toFixed(2)),
                    }
                    break;

                case "fetch.fail":
                case "fetch.critical":
                case "link.unsupported":
                case "content.video.unavailable":
                case "content.platform_restricted":
                    context = {
                        service: friendlyServiceName(host),
                    }
                    break;

                case "fetch.rate":
                    context = {
                        service: friendlyServiceName(host),
                        limit: retryAfterSeconds,
                    }
                    break;
            }

            return createResponse("error", {
                code: `error.api.${normalizedError}`,
                context,
            })
        }

        let localProcessing = params.localProcessing;
        const lpEnv = env.forceLocalProcessing;
        const shouldForceLocal = lpEnv === "always" || (lpEnv === "session" && authType === "session");
        const localDisabled = (!localProcessing || localProcessing === "disabled");

        if (shouldForceLocal && localDisabled) {
            localProcessing = "preferred";
        }

        return matchAction({
            r,
            host,
            isBatchRequest: params.batch === true,
            audioFormat: params.audioFormat,
            isAudioOnly,
            isAudioMuted,
            disableMetadata: params.disableMetadata,
            filenameStyle: params.filenameStyle,
            convertGif: params.convertGif,
            requestIP,
            audioBitrate: params.audioBitrate,
            alwaysProxy: params.alwaysProxy || localProcessing === "forced",
            localProcessing,
        })
    } catch {
        return createResponse("error", {
            code: "error.api.fetch.critical",
            context: {
                service: friendlyServiceName(host),
            }
        })
    }
}
