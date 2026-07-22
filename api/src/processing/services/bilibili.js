import { genericUserAgent, env } from "../../config.js";
import { resolveRedirectingURL } from "../url.js";
import { requestUpstream } from "../upstream/request.js";
import {
    pickBilibiliRoutePlan,
    reportBilibiliRouteRequestEvent,
} from "./bilibili-route-state.js";

// TO-DO: higher quality downloads (currently requires an account)

const shouldUseUpstream = () => {
    return Array.isArray(env.upstreamURLs) && env.upstreamURLs.length > 0;
};

const STREAM_RETRY_UPSTREAM_TIMEOUT_MS = 8000;
const LONG_VIDEO_DIRECT_BRIDGE_SECONDS = 30 * 60;

const asArray = (value) => {
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
};

const collectCandidateUrls = (entry) => {
    const unique = [];
    const push = (raw) => {
        if (typeof raw !== "string") return;
        const value = raw.trim();
        if (!value || unique.includes(value)) return;
        unique.push(value);
    };

    push(entry?.baseUrl);
    push(entry?.base_url);
    push(entry?.url);
    asArray(entry?.backupUrl).forEach(push);
    asArray(entry?.backup_url).forEach(push);

    return unique;
};

const BILIBILI_BROWSER_CDN_HOSTS = Object.freeze([
    "upos-sz-mirrorcos.bilivideo.com",
    "upos-sz-mirrorali.bilivideo.com",
    "upos-sz-mirrorhw.bilivideo.com",
]);

export const buildProgressiveDirectCandidates = (urls) => {
    const unique = [];
    const push = (value) => {
        if (!value || unique.includes(value)) return;
        unique.push(value);
    };

    for (const rawUrl of urls) {
        try {
            const parsed = new URL(rawUrl);
            if (/\/upgcxcode\//i.test(parsed.pathname)) {
                for (const hostname of BILIBILI_BROWSER_CDN_HOSTS) {
                    const candidate = new URL(parsed);
                    candidate.hostname = hostname;
                    candidate.port = "";
                    push(candidate.toString());
                }
            }
        } catch {
            // Keep the untouched URL below even when it cannot be parsed.
        }
    }

    urls.forEach(push);
    return unique;
};

const rewriteUpstreamTunnelUrl = (rawUrl, upstreamOrigin) => {
    try {
        const upstreamBase = new URL(upstreamOrigin);
        const url = new URL(String(rawUrl));
        url.protocol = upstreamBase.protocol;
        // `url.host = upstreamBase.host` does not always clear an existing
        // explicit port (for example upstream URL without port, tunnel URL with :9000).
        // Assign hostname+port explicitly so we never keep stale tunnel ports.
        url.hostname = upstreamBase.hostname;
        url.port = upstreamBase.port;
        url.username = upstreamBase.username;
        url.password = upstreamBase.password;
        return url.toString();
    } catch {
        return String(rawUrl);
    }
};

const resolveUpstreamTimeoutMs = (overrideMs) => {
    if (
        typeof overrideMs === "number" &&
        Number.isFinite(overrideMs) &&
        overrideMs > 0
    ) {
        return overrideMs;
    }

    if (
        typeof env.upstreamTimeoutMs === "number" &&
        Number.isFinite(env.upstreamTimeoutMs) &&
        env.upstreamTimeoutMs > 0
    ) {
        return env.upstreamTimeoutMs;
    }

    return 12000;
};

const fetchUpstream = async (url, { timeoutMs: timeoutOverrideMs, reason = "fallback" } = {}) => {
    if (!shouldUseUpstream()) return null;

    const timeoutMs = resolveUpstreamTimeoutMs(timeoutOverrideMs);
    const startedAt = Date.now();

    try {
        console.log(`[bilibili] upstream ${reason}`);

        const upstream = await requestUpstream({
            payload: { url: String(url), localProcessing: "forced" },
            service: "bilibili",
            timeoutMs,
            buildBody: () => ({
                url: String(url),
                localProcessing: "forced",
            }),
        });

        const payload = upstream?.body;
        if (!upstream) {
            console.log(`[bilibili] upstream unavailable reason=${reason}`);
            return null;
        }
        if (!payload || typeof payload !== "object") return null;

        if (
            payload.status !== "local-processing" ||
            !Array.isArray(payload.tunnel) ||
            payload.tunnel.length < 2
        ) {
            return null;
        }

        return {
            tunnels: payload.tunnel.map((item) => rewriteUpstreamTunnelUrl(item, upstream.upstreamOrigin)),
            filename: payload.output?.filename || payload.filename,
            duration: payload.duration,
        };
    } catch (error) {
        console.log(
            `[bilibili] upstream request failed reason=${reason} elapsed_ms=${Date.now() - startedAt} message=${error?.message || "unknown"}`,
        );
        return null;
    }
};

function getBest(content) {
    return content
        ?.map((entry) => {
            const candidates = buildProgressiveDirectCandidates(collectCandidateUrls(entry));
            if (!candidates.length) return null;

            return {
                ...entry,
                baseUrl: candidates[0],
                url: candidates[0],
                candidates,
            };
        })
        ?.filter(Boolean)
        ?.reduce((a, b) => a?.bandwidth > b?.bandwidth ? a : b);
}

function extractBestQuality(dashData) {
    const bestVideo = getBest(dashData.video),
          bestAudio = getBest(dashData.audio);

    if (!bestVideo || !bestAudio) return [];
    return [ bestVideo, bestAudio ];
}

const toSeconds = (value) =>
    typeof value === "number" && Number.isFinite(value)
        ? Math.round(value / 1000)
        : undefined;

const sanitizeFilenamePart = (value) =>
    String(value || "")
        .trim()
        .replace(/[\u0000-\u001F\u007F-\u009F]+/g, " ")
        .replace(/[<>:"/\\|?*]+/g, "_")
        .replace(/\s+/g, " ")
        .replace(/[. ]+$/g, "")
        .slice(0, 120)
        .trim();

const buildFilenameBase = ({ fallbackBase, filenameTitle }) => {
    const titleBase = sanitizeFilenamePart(filenameTitle);
    return titleBase || fallbackBase;
};

const buildComFilenameTitle = (meta, partId) => {
    const title = sanitizeFilenamePart(meta?.title);
    if (!title) return undefined;

    if (!partId || !Array.isArray(meta?.pages) || meta.pages.length <= 1) {
        return title;
    }

    const selectedPage = meta.pages.find((page) => String(page?.page) === String(partId));
    const part = sanitizeFilenamePart(selectedPage?.part);
    if (!part || part === title) return title;

    return `${title} - ${part}`;
};

const getComSelectedPage = (meta, partId) => {
    if (!Array.isArray(meta?.pages) || !meta.pages.length) return null;

    if (partId) {
        return meta.pages.find((page) => String(page?.page) === String(partId)) || null;
    }

    if (meta?.cid) {
        return meta.pages.find((page) => String(page?.cid) === String(meta.cid)) || meta.pages[0];
    }

    return meta.pages[0];
};

const getComDurationSeconds = (meta, partId) => {
    if (!meta) return undefined;

    const selectedPage = getComSelectedPage(meta, partId);
    const duration = selectedPage?.duration ?? meta.duration;

    return typeof duration === "number" && Number.isFinite(duration)
        ? Math.round(duration)
        : undefined;
};

const BILIBILI_COM_HEADERS = Object.freeze({
    "user-agent": genericUserAgent,
    referer: "https://www.bilibili.com/",
});

const fetchComVideoMeta = async (id) => {
    const url = new URL("https://api.bilibili.com/x/web-interface/view");
    url.searchParams.set("bvid", id);

    const payload = await fetch(url, {
        headers: BILIBILI_COM_HEADERS,
    })
        .then((response) => response.json())
        .catch(() => null);

    if (payload?.code !== 0 || !payload?.data) {
        return null;
    }

    return payload.data;
};

const fetchComPlayInfo = async ({ id, cid }) => {
    const url = new URL("https://api.bilibili.com/x/player/playurl");
    url.searchParams.set("bvid", id);
    url.searchParams.set("cid", String(cid));
    url.searchParams.set("fnval", "4048");
    url.searchParams.set("qn", "64");
    url.searchParams.set("fourk", "1");

    const payload = await fetch(url, {
        headers: {
            ...BILIBILI_COM_HEADERS,
            referer: `https://www.bilibili.com/video/${id}/`,
        },
    })
        .then((response) => response.json())
        .catch(() => null);

    if (payload?.code !== 0 || !payload?.data) {
        return null;
    }

    return payload.data;
};

const fetchComProgressivePlayInfo = async ({ id, cid }) => {
    const url = new URL("https://api.bilibili.com/x/player/playurl");
    url.searchParams.set("bvid", id);
    url.searchParams.set("cid", String(cid));
    url.searchParams.set("fnval", "0");
    url.searchParams.set("platform", "html5");
    url.searchParams.set("high_quality", "1");
    url.searchParams.set("qn", "64");

    const payload = await fetch(url, {
        headers: {
            ...BILIBILI_COM_HEADERS,
            referer: `https://www.bilibili.com/video/${id}/`,
        },
    })
        .then((response) => response.json())
        .catch(() => null);

    if (payload?.code !== 0 || !payload?.data) {
        return null;
    }

    return payload.data;
};

const pickProgressiveMp4 = (playInfo) => {
    const entries = Array.isArray(playInfo?.durl) ? playInfo.durl : [];
    const candidates = entries
        .map((entry) => {
            const urls = buildProgressiveDirectCandidates(collectCandidateUrls(entry));
            if (!urls.length) return null;

            return {
                url: urls[0],
                candidates: urls,
                size: typeof entry?.size === "number" ? entry.size : 0,
                length: typeof entry?.length === "number" ? entry.length : 0,
                isMp4: urls.some((url) => /\.mp4(?:$|[?#])/i.test(url)),
            };
        })
        .filter(Boolean);

    return candidates.reduce((best, item) => {
        if (!best) return item;
        if (item.isMp4 !== best.isMp4) return item.isMp4 ? item : best;
        if (item.size > best.size) return item;
        if (item.size === best.size && item.length > best.length) return item;
        return best;
    }, null);
};

async function com_download(
    id,
    partId,
    filenameTitle,
    preloadedMeta,
    preferProgressiveMp4 = false,
    forceProgressiveMp4 = false,
) {
    const meta = preloadedMeta || await fetchComVideoMeta(id);
    if (!meta) {
        return { error: "fetch.fail" };
    }

    const selectedPage = getComSelectedPage(meta, partId);
    const cid = selectedPage?.cid || meta.cid;
    if (!cid) {
        return { error: "fetch.empty" };
    }

    const durationSeconds = getComDurationSeconds(meta, partId);
    const shouldUseDirectBridge =
        preferProgressiveMp4 === true &&
        (
            forceProgressiveMp4 === true ||
            (
                typeof durationSeconds === "number" &&
                durationSeconds >= LONG_VIDEO_DIRECT_BRIDGE_SECONDS
            )
        );

    let fallbackBase = `bilibili_${id}`;
    if (partId) {
        fallbackBase += `_${partId}`;
    }
    const filenameBase = buildFilenameBase({
        fallbackBase,
        filenameTitle: filenameTitle || buildComFilenameTitle(meta, partId),
    });

    if (shouldUseDirectBridge) {
        const progressiveInfo = await fetchComProgressivePlayInfo({ id, cid });
        const progressive = pickProgressiveMp4(progressiveInfo);

        if (progressive?.url) {
            return {
                service: "bilibili",
                urls: progressive.url,
                urlCandidates: progressive.candidates,
                directClientDownload: true,
                filename: `${filenameBase}.mp4`,
                duration: durationSeconds,
            };
        }

        // This request came from the explicit "download current only" Direct
        // Bridge action. Do not silently switch it back to DASH merge/queue.
        if (forceProgressiveMp4) return { error: "fetch.empty" };
    }

    const playInfo = await fetchComPlayInfo({ id, cid });
    if (!playInfo?.dash) {
        return { error: "fetch.empty" };
    }

    if (playInfo.timelength > env.durationLimit * 1000) {
        return { error: "content.too_long" };
    }

    const [ video, audio ] = extractBestQuality(playInfo.dash);
    if (!video || !audio) {
        return { error: "fetch.empty" };
    }

    return {
        urls: [video.baseUrl, audio.baseUrl],
        urlCandidates: [video.candidates, audio.candidates],
        audioFilename: `${filenameBase}_audio`,
        filename: `${filenameBase}_${video.width}x${video.height}.mp4`,
        duration: toSeconds(playInfo.timelength),
    };
}

async function tv_download(id) {
    const url = new URL(
        'https://api.bilibili.tv/intl/gateway/web/playurl'
        + '?s_locale=en_US&platform=web&qn=64&type=0&device=wap'
        + '&tf=0&spm_id=bstar-web.ugc-video-detail.0.0&from_spm_id='
    );

    url.searchParams.set('aid', id);

    const { data } = await fetch(url).then(a => a.json());
    if (!data?.playurl?.video) {
        return { error: "fetch.empty" };
    }

    const [ video, audio ] = extractBestQuality({
        video: data.playurl.video.map(s => s.video_resource)
                                 .filter(s => s.codecs.includes('avc1')),
        audio: data.playurl.audio_resource
    });

    if (!video || !audio) {
        return { error: "fetch.empty" };
    }

    if (video.duration > env.durationLimit * 1000) {
        return { error: "content.too_long" };
    }

    return {
        urls: [video.url, audio.url],
        urlCandidates: [video.candidates, audio.candidates],
        audioFilename: `bilibili_tv_${id}_audio`,
        filename: `bilibili_tv_${id}.mp4`,
        duration: toSeconds(video.duration),
    };
}

const buildUpstreamContext = ({ comId, tvId, partId, filenameTitle }) => {
    if (comId) {
        const upstreamUrl = new URL(`https://www.bilibili.com/video/${comId}`);
        if (partId) upstreamUrl.searchParams.set('p', partId);

        const fallbackBase = `bilibili_${comId}${partId ? `_${partId}` : ''}`;
        const filenameBase = buildFilenameBase({ fallbackBase, filenameTitle });

        return {
            upstreamUrl,
            audioFilename: `${filenameBase}_audio`,
            defaultFilename: `${fallbackBase}.mp4`,
            preferredFilename: filenameTitle ? `${filenameBase}.mp4` : undefined,
        };
    }

    if (tvId) {
        return {
            upstreamUrl: `https://www.bilibili.tv/video/${tvId}`,
            audioFilename: `bilibili_tv_${tvId}_audio`,
            defaultFilename: `bilibili_${tvId}.mp4`,
        };
    }

    return {};
};

const buildUpstreamResult = ({
    upstream,
    audioFilename,
    defaultFilename,
    preferredFilename,
    originalRequest,
}) => {
    if (!upstream?.tunnels?.length) return null;

    if (
        typeof upstream.duration === "number" &&
        Number.isFinite(upstream.duration) &&
        upstream.duration > env.durationLimit
    ) {
        return { error: "content.too_long" };
    }

    return {
        urls: upstream.tunnels.slice(0, 2),
        filename: preferredFilename || upstream.filename || defaultFilename,
        audioFilename,
        duration: upstream.duration,
        originalRequest,
        headers: {
            "ngrok-skip-browser-warning": "true",
        },
    };
};

const tryUpstreamResult = async ({
    upstreamUrl,
    audioFilename,
    defaultFilename,
    preferredFilename,
    originalRequest,
    reason,
    timeoutMs,
}) => {
    if (!upstreamUrl) return null;

    const upstream = await fetchUpstream(upstreamUrl, {
        reason,
        ...(timeoutMs ? { timeoutMs } : {}),
    });
    const result = buildUpstreamResult({
        upstream,
        audioFilename,
        defaultFilename,
        preferredFilename,
        originalRequest,
    });

    if (result) {
        reportBilibiliRouteRequestEvent({
            route: "upstream",
            event: "request_success",
        });
        console.log(`[bilibili] upstream ${reason} selected tunnels=${result.urls.length}`);
    } else {
        reportBilibiliRouteRequestEvent({
            route: "upstream",
            event: "request_fail",
        });
    }

    return result;
};

const tryLocalExtractorResult = async ({
    comId,
    tvId,
    partId,
    filenameTitle,
    preloadedMeta,
    preferProgressiveMp4,
    forceProgressiveMp4,
}) => {
    let result;

    if (comId) {
        result = await com_download(
            comId,
            partId,
            filenameTitle,
            preloadedMeta,
            preferProgressiveMp4,
            forceProgressiveMp4,
        );
    } else if (tvId) {
        result = await tv_download(tvId);
    } else {
        result = { error: "fetch.fail" };
    }

    if (!result?.error || !["fetch.empty", "fetch.fail"].includes(result.error)) {
        reportBilibiliRouteRequestEvent({
            route: "local",
            event: "request_success",
        });
    } else {
        reportBilibiliRouteRequestEvent({
            route: "local",
            event: "request_fail",
        });
    }

    return result;
};

export default async function({ comId, tvId, comShortLink, partId, epId, filenameTitle, preferProgressiveMp4, forceProgressiveMp4, __streamRetry }) {
    if (epId) {
        // bangumi episodes are often behind paid membership / regional licensing walls.
        // return an explicit user-facing error instead of a generic fetch.empty.
        return { error: "content.platform_restricted" };
    }

    if (comShortLink) {
        const patternMatch = await resolveRedirectingURL(`https://b23.tv/${comShortLink}`);
        comId = patternMatch?.comId;
    }

    const preloadedMeta = comId && (!filenameTitle || preferProgressiveMp4)
        ? await fetchComVideoMeta(comId).catch(() => null)
        : null;
    const resolvedFilenameTitle = filenameTitle || buildComFilenameTitle(preloadedMeta, partId);
    const directBridgeEligible =
        preferProgressiveMp4 === true &&
        (
            forceProgressiveMp4 === true ||
            (
                typeof getComDurationSeconds(preloadedMeta, partId) === "number" &&
                getComDurationSeconds(preloadedMeta, partId) >= LONG_VIDEO_DIRECT_BRIDGE_SECONDS
            )
        );

    const {
        upstreamUrl,
        audioFilename,
        defaultFilename,
        preferredFilename,
    } = buildUpstreamContext({ comId, tvId, partId, filenameTitle: resolvedFilenameTitle });
    const originalRequest = {
        comId,
        tvId,
        partId,
        epId,
        filenameTitle: resolvedFilenameTitle,
    };

    const canUseUpstream = !!upstreamUrl && shouldUseUpstream() && !directBridgeEligible;
    const routePlan = pickBilibiliRoutePlan({
        canUseUpstream,
        streamRetry: !!__streamRetry,
    });
    console.log(
        `[bilibili-route] choose primary=${routePlan.primary} secondary=${routePlan.secondary ?? "none"} stream_retry=${__streamRetry ? 1 : 0} reason=${routePlan.reason} score_local=${routePlan.scores.local} score_upstream=${routePlan.scores.upstream}`,
    );

    const orderedRoutes = [routePlan.primary, routePlan.secondary].filter(Boolean);
    const attempted = new Set();
    let localFallbackError = null;

    for (const [index, route] of orderedRoutes.entries()) {
        if (attempted.has(route)) continue;
        attempted.add(route);

        if (route === "upstream") {
            const upstreamResult = await tryUpstreamResult({
                upstreamUrl,
                audioFilename,
                defaultFilename,
                preferredFilename,
                originalRequest,
                reason: __streamRetry
                    ? (index === 0 ? "adaptive-stream-retry-primary" : "adaptive-stream-retry-secondary")
                    : (index === 0 ? "adaptive-primary" : "adaptive-secondary"),
                timeoutMs: __streamRetry ? STREAM_RETRY_UPSTREAM_TIMEOUT_MS : undefined,
            });

            if (upstreamResult) {
                return upstreamResult;
            }
            continue;
        }

        const localResult = await tryLocalExtractorResult({
            comId,
            tvId,
            partId,
            filenameTitle: resolvedFilenameTitle,
            preloadedMeta,
            preferProgressiveMp4: directBridgeEligible,
            forceProgressiveMp4,
        });

        if (!localResult?.error) {
            localResult.originalRequest = originalRequest;
            return localResult;
        }

        if (!["fetch.empty", "fetch.fail"].includes(localResult.error)) {
            return localResult;
        }

        localFallbackError = localResult;
    }

    return localFallbackError || { error: "fetch.fail" };
}
