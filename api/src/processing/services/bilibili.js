import { genericUserAgent, env } from "../../config.js";
import { resolveRedirectingURL } from "../url.js";

// TO-DO: higher quality downloads (currently requires an account)

const shouldUseUpstream = () => {
    if (!env.instagramUpstreamURL) return false;

    try {
        // avoid accidental recursion if upstream points to self
        const upstream = new URL(env.instagramUpstreamURL).origin;

        try {
            const self = new URL(env.apiURL).origin;
            return upstream !== self;
        } catch {
            return true;
        }
    } catch {
        return false;
    }
};

const PROACTIVE_UPSTREAM_TIMEOUT_MS = 12000;

const rewriteUpstreamTunnelUrl = (rawUrl) => {
    try {
        const upstreamBase = new URL(env.instagramUpstreamURL);
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
        typeof env.instagramUpstreamTimeoutMs === "number" &&
        Number.isFinite(env.instagramUpstreamTimeoutMs) &&
        env.instagramUpstreamTimeoutMs > 0
    ) {
        return env.instagramUpstreamTimeoutMs;
    }

    return 12000;
};

const fetchUpstream = async (url, { timeoutMs: timeoutOverrideMs, reason = "fallback" } = {}) => {
    if (!shouldUseUpstream()) return null;

    const endpoint = new URL(env.instagramUpstreamURL);
    endpoint.pathname = "/";
    endpoint.search = "";
    endpoint.hash = "";

    let upstreamOrigin;
    try {
        upstreamOrigin = new URL(env.instagramUpstreamURL).origin;
    } catch {}

    const headers = {
        Accept: "application/json",
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
    };

    if (env.instagramUpstreamApiKey) {
        headers.Authorization = `Api-Key ${env.instagramUpstreamApiKey}`;
    }

    const timeoutMs = resolveUpstreamTimeoutMs(timeoutOverrideMs);

    const controller = new AbortController();
    const startedAt = Date.now();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        if (upstreamOrigin) {
            console.log(`[bilibili] upstream ${reason} -> ${upstreamOrigin}`);
        } else {
            console.log(`[bilibili] upstream ${reason}`);
        }

        const res = await fetch(endpoint, {
            method: "POST",
            signal: controller.signal,
            headers,
            body: JSON.stringify({
                url: String(url),
                localProcessing: "forced",
            }),
        });

        const payload = await res.json().catch(() => null);
        if (!res.ok) {
            console.log(`[bilibili] upstream response status=${res.status} reason=${reason}`);
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
            tunnels: payload.tunnel.map(rewriteUpstreamTunnelUrl),
            filename: payload.output?.filename || payload.filename,
            duration: payload.duration,
        };
    } catch (error) {
        console.log(
            `[bilibili] upstream request failed reason=${reason} elapsed_ms=${Date.now() - startedAt} message=${error?.message || "unknown"}`,
        );
        return null;
    } finally {
        clearTimeout(timeout);
    }
};

function getBest(content) {
    return content?.filter(v => v.baseUrl || v.url)
                .map(v => (v.baseUrl = v.baseUrl || v.url, v))
                .reduce((a, b) => a?.bandwidth > b?.bandwidth ? a : b);
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

async function com_download(id, partId) {
    const url = new URL(`https://bilibili.com/video/${id}`);

    if (partId) {
        url.searchParams.set('p', partId);
    }

    const html = await fetch(url, {
        headers: {
            "user-agent": genericUserAgent
        }
    })
    .then(r => r.text())
    .catch(() => {});

    if (!html) {
        return { error: "fetch.fail" }
    }

    if (!(html.includes('<script>window.__playinfo__=') && html.includes('"video_codecid"'))) {
        return { error: "fetch.empty" };
    }

    const streamData = JSON.parse(
        html.split('<script>window.__playinfo__=')[1].split('</script>')[0]
    );

    if (streamData.data.timelength > env.durationLimit * 1000) {
        return { error: "content.too_long" };
    }

    const [ video, audio ] = extractBestQuality(streamData.data.dash);
    if (!video || !audio) {
        return { error: "fetch.empty" };
    }

    let filenameBase = `bilibili_${id}`;
    if (partId) {
        filenameBase += `_${partId}`;
    }

    return {
        urls: [video.baseUrl, audio.baseUrl],
        audioFilename: `${filenameBase}_audio`,
        filename: `${filenameBase}_${video.width}x${video.height}.mp4`,
        duration: toSeconds(streamData.data.timelength),
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
        audioFilename: `bilibili_tv_${id}_audio`,
        filename: `bilibili_tv_${id}.mp4`,
        duration: toSeconds(video.duration),
    };
}

const buildUpstreamContext = ({ comId, tvId, partId }) => {
    if (comId) {
        const upstreamUrl = new URL(`https://www.bilibili.com/video/${comId}`);
        if (partId) upstreamUrl.searchParams.set('p', partId);

        return {
            upstreamUrl,
            audioFilename: `bilibili_${comId}${partId ? `_${partId}` : ''}_audio`,
            defaultFilename: `bilibili_${comId}.mp4`,
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

const buildUpstreamResult = ({ upstream, audioFilename, defaultFilename }) => {
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
        filename: upstream.filename || defaultFilename,
        audioFilename,
        duration: upstream.duration,
        headers: {
            "ngrok-skip-browser-warning": "true",
        },
    };
};

export default async function({ comId, tvId, comShortLink, partId, epId }) {
    if (epId) {
        // bangumi episodes are often behind paid membership / regional licensing walls.
        // return an explicit user-facing error instead of a generic fetch.empty.
        return { error: "content.platform_restricted" };
    }

    if (comShortLink) {
        const patternMatch = await resolveRedirectingURL(`https://b23.tv/${comShortLink}`);
        comId = patternMatch?.comId;
    }

    const {
        upstreamUrl,
        audioFilename,
        defaultFilename,
    } = buildUpstreamContext({ comId, tvId, partId });

    // Prefer upstream first for bilibili when available to avoid frequent
    // mid-stream closes on some egress paths. Keep timeout short to fallback fast.
    if (upstreamUrl) {
        const proactiveUpstream = await fetchUpstream(upstreamUrl, {
            timeoutMs: PROACTIVE_UPSTREAM_TIMEOUT_MS,
            reason: "preferred",
        });
        const proactiveResult = buildUpstreamResult({
            upstream: proactiveUpstream,
            audioFilename,
            defaultFilename,
        });
        if (proactiveResult) {
            console.log(
                `[bilibili] upstream preferred selected tunnels=${proactiveResult.urls.length}`,
            );
            return proactiveResult;
        }
        console.log("[bilibili] upstream preferred unavailable, fallback to local extractor");
    }

    let result;

    if (comId) {
        result = await com_download(comId, partId);
    } else if (tvId) {
        result = await tv_download(tvId);
    } else {
        return { error: "fetch.fail" };
    }

    if (!result?.error || !['fetch.empty', 'fetch.fail'].includes(result.error)) {
        return result;
    }

    if (!upstreamUrl) return result;

    const upstream = await fetchUpstream(upstreamUrl, { reason: "fallback" });
    if (upstream?.tunnels?.length) {
        console.log(`[bilibili] upstream fallback selected tunnels=${upstream.tunnels.length}`);
    }
    return (
        buildUpstreamResult({
            upstream,
            audioFilename,
            defaultFilename,
        })
        || result
    );
}
