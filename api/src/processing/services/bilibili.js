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

const rewriteUpstreamTunnelUrl = (rawUrl) => {
    try {
        const upstreamBase = new URL(env.instagramUpstreamURL);
        const url = new URL(String(rawUrl));
        url.protocol = upstreamBase.protocol;
        url.host = upstreamBase.host;
        url.username = upstreamBase.username;
        url.password = upstreamBase.password;
        return url.toString();
    } catch {
        return String(rawUrl);
    }
};

const fetchUpstream = async (url) => {
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

    const timeoutMs =
        typeof env.instagramUpstreamTimeoutMs === "number" &&
        Number.isFinite(env.instagramUpstreamTimeoutMs) &&
        env.instagramUpstreamTimeoutMs > 0
            ? env.instagramUpstreamTimeoutMs
            : 12000;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        if (upstreamOrigin) {
            console.log(`[bilibili] upstream fallback -> ${upstreamOrigin}`);
        } else {
            console.log(`[bilibili] upstream fallback`);
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
            console.log(`[bilibili] upstream response status=${res.status}`);
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
    } catch {
        console.log(`[bilibili] upstream request failed`);
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

export default async function({ comId, tvId, comShortLink, partId }) {
    if (comShortLink) {
        const patternMatch = await resolveRedirectingURL(`https://b23.tv/${comShortLink}`);
        comId = patternMatch?.comId;
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

    let upstreamUrl;
    let audioFilename;

    if (comId) {
        upstreamUrl = new URL(`https://www.bilibili.com/video/${comId}`);
        if (partId) upstreamUrl.searchParams.set('p', partId);
        audioFilename = `bilibili_${comId}${partId ? `_${partId}` : ''}_audio`;
    } else if (tvId) {
        upstreamUrl = `https://www.bilibili.tv/video/${tvId}`;
        audioFilename = `bilibili_tv_${tvId}_audio`;
    }

    if (!upstreamUrl) return result;

    const upstream = await fetchUpstream(upstreamUrl);
    if (!upstream?.tunnels?.length) return result;

    if (
        typeof upstream.duration === "number" &&
        Number.isFinite(upstream.duration) &&
        upstream.duration > env.durationLimit
    ) {
        return { error: "content.too_long" };
    }

    return {
        urls: upstream.tunnels.slice(0, 2),
        filename: upstream.filename || `bilibili_${comId || tvId}.mp4`,
        audioFilename,
        duration: upstream.duration,
        headers: {
            "ngrok-skip-browser-warning": "true",
        },
    };
}
