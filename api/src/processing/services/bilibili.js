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
const PROGRESSIVE_MP4_PROBE_TIMEOUT_MS = 8000;

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
            const candidates = collectCandidateUrls(entry);
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
    const entries = asArray(playInfo?.durl);

    for (const entry of entries) {
        const candidates = collectCandidateUrls(entry);
        const mp4Candidate = candidates.find((url) => {
            try {
                return new URL(url).pathname.toLowerCase().endsWith(".mp4");
            } catch {
                return /\.mp4(?:$|[?#])/i.test(String(url));
            }
        }) || candidates[0];

        if (!mp4Candidate) continue;

        return {
            url: mp4Candidate,
            candidates,
            size: Number(entry?.size) || undefined,
        };
    }
};

const probeProgressiveMp4 = async (url) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROGRESSIVE_MP4_PROBE_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            method: "HEAD",
            headers: BILIBILI_COM_HEADERS,
            signal: controller.signal,
        });

        if (!response.ok) return false;

        const contentType = response.headers.get("content-type") || "";
        const contentLength = Number(response.headers.get("content-length"));
        const pathLooksMp4 = (() => {
            try {
                return new URL(url).pathname.toLowerCase().endsWith(".mp4");
            } catch {
                return /\.mp4(?:$|[?#])/i.test(String(url));
            }
        })();

        return (
            (contentType.toLowerCase().includes("video/mp4") || pathLooksMp4) &&
            (!response.headers.has("content-length") || (Number.isFinite(contentLength) && contentLength > 0))
        );
    } catch {
        return false;
    } finally {
        clearTimeout(timeout);
    }
};

async function com_download(id, partId, filenameTitle, preloadedMeta) {
    const meta = preloadedMeta || await fetchComVideoMeta(id);
    if (!meta) {
        return { error: "fetch.fail" };
    }

    const selectedPage = partId
        ? meta.pages?.find((page) => String(page?.page) === String(partId))
        : null;
    const cid = selectedPage?.cid || meta.cid;
    if (!cid) {
        return { error: "fetch.empty" };
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

    let fallbackBase = `bilibili_${id}`;
    if (partId) {
        fallbackBase += `_${partId}`;
    }
    const filenameBase = buildFilenameBase({
        fallbackBase,
        filenameTitle: filenameTitle || buildComFilenameTitle(meta, partId),
    });

    return {
        urls: [video.baseUrl, audio.baseUrl],
        urlCandidates: [video.candidates, audio.candidates],
        audioFilename: `${filenameBase}_audio`,
        filename: `${filenameBase}_${video.width}x${video.height}.mp4`,
        duration: toSeconds(playInfo.timelength),
    };
}

async function com_progressive_download(id, partId, filenameTitle, preloadedMeta) {
    const meta = preloadedMeta || await fetchComVideoMeta(id);
    if (!meta) {
        return null;
    }

    const selectedPage = partId
        ? meta.pages?.find((page) => String(page?.page) === String(partId))
        : null;
    const cid = selectedPage?.cid || meta.cid;
    if (!cid) {
        return null;
    }

    const playInfo = await fetchComProgressivePlayInfo({ id, cid });
    const progressive = pickProgressiveMp4(playInfo);
    if (!progressive?.url) {
        return null;
    }

    const isUsable = await probeProgressiveMp4(progressive.url);
    if (!isUsable) {
        console.log(`[bilibili] progressive mp4 probe failed id=${id} part=${partId || "root"}`);
        return null;
    }

    let fallbackBase = `bilibili_${id}`;
    if (partId) {
        fallbackBase += `_${partId}`;
    }
    const filenameBase = buildFilenameBase({
        fallbackBase,
        filenameTitle: filenameTitle || buildComFilenameTitle(meta, partId),
    });

    return {
        urls: progressive.url,
        urlCandidates: progressive.candidates,
        filename: `${filenameBase}.mp4`,
        duration: toSeconds(playInfo?.timelength || meta?.duration * 1000),
        directClientDownload: true,
        originalRequest: {
            comId: id,
            partId,
            filenameTitle: filenameTitle || buildComFilenameTitle(meta, partId),
        },
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
}) => {
    let result;

    if (comId) {
        if (preferProgressiveMp4) {
            result = await com_progressive_download(comId, partId, filenameTitle, preloadedMeta);
            if (result) {
                reportBilibiliRouteRequestEvent({
                    route: "local",
                    event: "request_success",
                });
                console.log(`[bilibili] progressive mp4 selected id=${comId} part=${partId || "root"}`);
                return result;
            }
        }

        result = await com_download(comId, partId, filenameTitle, preloadedMeta);
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

export default async function({ comId, tvId, comShortLink, partId, epId, filenameTitle, preferProgressiveMp4, __streamRetry }) {
    if (epId) {
        // bangumi episodes are often behind paid membership / regional licensing walls.
        // return an explicit user-facing error instead of a generic fetch.empty.
        return { error: "content.platform_restricted" };
    }

    if (comShortLink) {
        const patternMatch = await resolveRedirectingURL(`https://b23.tv/${comShortLink}`);
        comId = patternMatch?.comId;
    }

    const preloadedMeta = comId && !filenameTitle
        ? await fetchComVideoMeta(comId).catch(() => null)
        : null;
    const resolvedFilenameTitle = filenameTitle || buildComFilenameTitle(preloadedMeta, partId);

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

    const canUseUpstream = !!upstreamUrl && shouldUseUpstream();
    const routePlan = pickBilibiliRoutePlan({
        canUseUpstream,
        streamRetry: !!__streamRetry,
    });
    console.log(
        `[bilibili-route] choose primary=${routePlan.primary} secondary=${routePlan.secondary ?? "none"} stream_retry=${__streamRetry ? 1 : 0} reason=${routePlan.reason} score_local=${routePlan.scores.local} score_upstream=${routePlan.scores.upstream}`,
    );

    const orderedRoutes =
        preferProgressiveMp4 === true && !__streamRetry
            ? ["local", ...[routePlan.primary, routePlan.secondary].filter(route => route && route !== "local")]
            : [routePlan.primary, routePlan.secondary].filter(Boolean);
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
            preferProgressiveMp4: preferProgressiveMp4 === true && !__streamRetry,
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
