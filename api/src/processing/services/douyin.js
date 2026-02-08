import { env } from "../../config.js";

// Mobile UA is required for the share page logic to work without X-Bogus
// Verified working as of Dec 2025
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const PAGE_TIMEOUT_MS = 15000;
const SHARE_PAGE_RETRIES = 1;
const WAF_RETRY_AFTER_SECONDS = 60;
const isUpstreamServer = (() => {
    const raw = String(process.env.IS_UPSTREAM_SERVER || "").toLowerCase().trim();
    return raw === "true" || raw === "1";
})();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const looksLikeWafChallenge = (html) => {
    if (!html) return false;

    // ByteDance WAF JS challenge pages return HTML (often 2-5KB) without router data.
    return (
        html.includes("waf-jschallenge") ||
        html.includes("lf-waf-jschallenge") ||
        html.includes("_wafchallengeid") ||
        html.includes("WAFJS") ||
        html.includes("Please wait")
    );
};

const getUpstreamTargetUrl = ({ videoId, shortLink }) => {
    if (videoId) return `https://www.douyin.com/video/${videoId}`;
    if (shortLink) return `https://douyin.com/_shortLink/${shortLink}`;
    return null;
};

const logUpstreamUsed = (reason, { videoId, shortLink, targetUrl, status }) => {
    let upstreamOrigin;
    try {
        upstreamOrigin = new URL(env.instagramUpstreamURL).origin;
    } catch {
        upstreamOrigin = "unknown";
    }

    console.log("[douyin] resolved via upstream", {
        reason,
        upstream: upstreamOrigin,
        status,
        videoId,
        shortLink,
        targetUrl,
    });
};

const buildUpstreamRelayUrl = (upstreamOrigin, service, url) => {
    if (!upstreamOrigin || upstreamOrigin === "invalid") return null;
    try {
        const relay = new URL("/relay", upstreamOrigin);
        relay.searchParams.set("service", service);
        relay.searchParams.set("url", url);
        return relay.toString();
    } catch {
        return null;
    }
};

const requestUpstreamCobalt = async (targetUrl) => {
    // Reuse INSTAGRAM_UPSTREAM_* for Douyin as well.
    if (!env.instagramUpstreamURL) return null;

    let upstreamOrigin;
    try {
        upstreamOrigin = new URL(env.instagramUpstreamURL).origin;
    } catch {
        upstreamOrigin = "invalid";
    }

    try {
        if (upstreamOrigin !== "invalid" && upstreamOrigin === new URL(env.apiURL).origin) {
            console.warn("[douyin] upstream skipped (same origin)", { upstream: upstreamOrigin });
            return null;
        }
    } catch {
        // ignore
    }

    const endpoint = new URL(env.instagramUpstreamURL);
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

    const timeoutMs =
        typeof env.instagramUpstreamTimeoutMs === "number" &&
        Number.isFinite(env.instagramUpstreamTimeoutMs) &&
        env.instagramUpstreamTimeoutMs > 0
            ? env.instagramUpstreamTimeoutMs
            : 12000;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        console.log("[douyin] upstream request", { upstream: upstreamOrigin, targetUrl });
        const res = await fetch(endpoint, {
            method: "POST",
            signal: controller.signal,
            headers,
            body: JSON.stringify({ url: String(targetUrl) }),
        });

        const payload = await res.json().catch(() => null);
        const duration =
            typeof payload?.duration === "number" &&
            Number.isFinite(payload.duration)
                ? payload.duration
                : undefined;
        console.log("[douyin] upstream response", {
            upstream: upstreamOrigin,
            http: res.status,
            ok: res.ok,
            status: payload?.status,
            error: payload?.error?.code,
            hasUrl: Boolean(payload?.url),
        });

        if (!res.ok) return null;
        if (!payload || typeof payload !== "object") return null;
        if (!["redirect", "tunnel"].includes(payload.status)) return null;
        if (!payload.url) return null;

        const relayUrl =
            payload.status === "redirect"
                ? buildUpstreamRelayUrl(upstreamOrigin, "douyin", payload.url)
                : null;

        return {
            status: payload.status,
            url: payload.url,
            filename: payload.filename,
            relayUrl,
            duration,
        };
    } catch (e) {
        console.warn("Douyin upstream request failed:", e);
        return null;
    } finally {
        clearTimeout(timeout);
    }
};

const resolveShortLinkFinalUrl = async (shortLink) => {
    const baseUrl = `https://v.douyin.com/${shortLink}/`;

    const headers = {
        "user-agent": MOBILE_UA,
    };

    try {
        const res = await fetch(baseUrl, {
            method: "HEAD",
            redirect: "manual",
            headers,
            signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        });

        const location = res.headers.get("location");
        if (location) return new URL(location, baseUrl).href;
    } catch {
        // ignore and try GET
    }

    try {
        const res = await fetch(baseUrl, {
            method: "GET",
            redirect: "manual",
            headers,
            signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        });

        const location = res.headers.get("location");
        if (location) return new URL(location, baseUrl).href;
    } catch {
        // ignore
    }

    const res = await fetch(baseUrl, {
        method: "HEAD",
        redirect: "follow",
        headers,
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });

    return res.url;
};

const toSeconds = (value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return value > 1000 ? Math.round(value / 1000) : Math.round(value);
};

const parseTotalLength = (headers) => {
    const contentRange = headers.get("content-range");
    if (contentRange) {
        const match = contentRange.match(/\/(\d+)$/);
        if (match) {
            const total = parseInt(match[1]);
            if (Number.isFinite(total) && total > 0) return total;
        }
    }

    const contentLength = headers.get("content-length");
    if (!contentLength) return undefined;
    const parsed = parseInt(contentLength);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const probeContentLength = async (url) => {
    try {
        const res = await fetch(url, {
            method: "GET",
            redirect: "follow",
            headers: {
                "User-Agent": MOBILE_UA,
                // Request a single byte so we can read total length from Content-Range.
                Range: "bytes=0-0",
            },
            signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        });

        return {
            statusCode: res.status,
            bytes: parseTotalLength(res.headers),
        };
    } catch {
        return {
            statusCode: undefined,
            bytes: undefined,
        };
    }
};

const buildRelayHeaders = () => {
    const headers = {
        "ngrok-skip-browser-warning": "true",
    };

    if (env.instagramUpstreamApiKey) {
        headers.Authorization = `Api-Key ${env.instagramUpstreamApiKey}`;
    }

    return headers;
};

export default async function(obj) {
    let videoId = obj.id;

    if (!videoId && obj.shortLink) {
        try {
            const finalUrl = await resolveShortLinkFinalUrl(obj.shortLink);
            // https://www.douyin.com/video/73123456789...
            // or https://www.iesdouyin.com/share/video/73123456789...
            
            const match = finalUrl.match(/\/video\/(\d+)/) || finalUrl.match(/mid=(\d+)/) || finalUrl.match(/\/share\/video\/(\d+)/);
            if (match) {
                videoId = match[1];
            }
        } catch (e) {
            console.error("Douyin shortlink fetch failed:", e);

            const upstreamTargetUrl = getUpstreamTargetUrl({ shortLink: obj.shortLink });
            if (upstreamTargetUrl) {
                const upstream = await requestUpstreamCobalt(upstreamTargetUrl);
                if (upstream?.url) {
                    logUpstreamUsed("shortlink_fetch_failed", {
                        videoId,
                        shortLink: obj.shortLink,
                        targetUrl: upstreamTargetUrl,
                        status: upstream.status,
                    });
                    if (upstream.relayUrl) {
                        return {
                            filename: upstream.filename || `douyin_${obj.shortLink}.mp4`,
                            audioFilename: `douyin_${obj.shortLink}_audio`,
                            urls: upstream.relayUrl,
                            duration: upstream.duration,
                            headers: buildRelayHeaders(),
                        };
                    }
                    return {
                        filename: upstream.filename || `douyin_${obj.shortLink}.mp4`,
                        audioFilename: `douyin_${obj.shortLink}_audio`,
                        urls: upstream.url,
                        forceRedirect: upstream.status === "redirect",
                        duration: upstream.duration,
                        headers: {
                            "User-Agent": MOBILE_UA,
                        },
                    };
                }
            }

            return { error: "fetch.short_link" };
        }
    }

    if (!videoId) return { error: "fetch.short_link" };

    // Fetch share page
    const shareUrls = [
        `https://www.iesdouyin.com/share/video/${videoId}`,
        `https://m.douyin.com/share/video/${videoId}`,
    ];
    let html;
    let shareUrl;
    let wafDetected = false;

    let lastFetchError;
    for (const candidateUrl of shareUrls) {
        shareUrl = candidateUrl;

        for (let attempt = 0; attempt <= SHARE_PAGE_RETRIES; attempt++) {
            try {
                const res = await fetch(candidateUrl, {
                    headers: {
                        "user-agent": MOBILE_UA,
                    },
                    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
                });

                const body = await res.text();

                if (!res.ok) {
                    // Douyin may return anti-bot blocks as HTTP errors.
                    if ([403, 412, 429].includes(res.status)) {
                        wafDetected = true;
                        console.warn(
                            `Douyin share page blocked (status ${res.status}, attempt ${attempt + 1})`,
                            { shareUrl: candidateUrl, bytes: body.length },
                        );

                        if (attempt < SHARE_PAGE_RETRIES) {
                            await sleep(800 + Math.floor(Math.random() * 800));
                            continue;
                        }

                        break;
                    }

                    lastFetchError = new Error(`Status ${res.status}`);
                    break;
                }

                if (looksLikeWafChallenge(body)) {
                    wafDetected = true;
                    console.warn(
                        `Douyin WAF challenge detected while fetching share page (attempt ${attempt + 1})`,
                        { shareUrl: candidateUrl, bytes: body.length },
                    );

                    if (attempt < SHARE_PAGE_RETRIES) {
                        // Backoff to avoid repeatedly hitting WAF on bursty traffic.
                        await sleep(800 + Math.floor(Math.random() * 800));
                        continue;
                    }

                    break;
                }

                html = body;
                break;
            } catch (e) {
                lastFetchError = e;

                if (attempt < SHARE_PAGE_RETRIES) {
                    await sleep(400 + Math.floor(Math.random() * 400));
                    continue;
                }

                break;
            }
        }

        if (html) break;
    }

    if (!html) {
        if (wafDetected) {
            const upstreamTargetUrl = getUpstreamTargetUrl({ videoId, shortLink: obj.shortLink });
            if (upstreamTargetUrl) {
                console.warn("Douyin WAF challenge detected, trying upstream cobalt", {
                    targetUrl: upstreamTargetUrl,
                });

                const upstream = await requestUpstreamCobalt(upstreamTargetUrl);
                if (upstream?.url) {
                    logUpstreamUsed("waf_fetch", {
                        videoId,
                        shortLink: obj.shortLink,
                        targetUrl: upstreamTargetUrl,
                        status: upstream.status,
                    });
                    if (upstream.relayUrl) {
                        return {
                            filename: upstream.filename || `douyin_${videoId}.mp4`,
                            audioFilename: `douyin_${videoId}_audio`,
                            urls: upstream.relayUrl,
                            duration: upstream.duration,
                            headers: buildRelayHeaders(),
                        };
                    }
                    return {
                        filename: upstream.filename || `douyin_${videoId}.mp4`,
                        audioFilename: `douyin_${videoId}_audio`,
                        urls: upstream.url,
                        forceRedirect: upstream.status === "redirect",
                        duration: upstream.duration,
                        headers: {
                            "User-Agent": MOBILE_UA,
                        },
                    };
                }
            }

            return { error: "fetch.rate", limit: WAF_RETRY_AFTER_SECONDS };
        }
        if (lastFetchError) {
            console.error("Douyin share page fetch failed:", lastFetchError);
        }
        return { error: "fetch.fail" };
    }

    // Extract _ROUTER_DATA
    let data;
    try {
        const jsonStr = html.match(/window\._ROUTER_DATA\s*=\s*(.*?)(?=<\/script>)/s);
        if (jsonStr) {
            data = JSON.parse(jsonStr[1].trim());
        } else {
            // Fallback for RENDER_DATA
            const renderStr = html.match(/window\._RENDER_DATA\s*=\s*(.*?)(?=<\/script>)/s);
            if (renderStr) {
                data = JSON.parse(decodeURIComponent(renderStr[1].trim()));
            }
        }
        
        if (!data) throw new Error("no router data found in html");
    } catch (e) {
        if (looksLikeWafChallenge(html)) {
            console.warn("Douyin WAF challenge detected while parsing share page", {
                shareUrl,
                bytes: html.length,
            });

            const upstreamTargetUrl = getUpstreamTargetUrl({ videoId, shortLink: obj.shortLink });
            if (upstreamTargetUrl) {
                console.warn("Douyin WAF challenge detected, trying upstream cobalt", {
                    targetUrl: upstreamTargetUrl,
                });

                const upstream = await requestUpstreamCobalt(upstreamTargetUrl);
                if (upstream?.url) {
                    logUpstreamUsed("waf_parse", {
                        videoId,
                        shortLink: obj.shortLink,
                        targetUrl: upstreamTargetUrl,
                        status: upstream.status,
                    });
                    if (upstream.relayUrl) {
                        return {
                            filename: upstream.filename || `douyin_${videoId}.mp4`,
                            audioFilename: `douyin_${videoId}_audio`,
                            urls: upstream.relayUrl,
                            duration: upstream.duration,
                            headers: buildRelayHeaders(),
                        };
                    }
                    return {
                        filename: upstream.filename || `douyin_${videoId}.mp4`,
                        audioFilename: `douyin_${videoId}_audio`,
                        urls: upstream.url,
                        forceRedirect: upstream.status === "redirect",
                        duration: upstream.duration,
                        headers: {
                            "User-Agent": MOBILE_UA,
                        },
                    };
                }
            }

            return { error: "fetch.rate", limit: WAF_RETRY_AFTER_SECONDS };
        }
        console.error("Douyin data parse failed:", e);
        return { error: "fetch.fail" };
    }

    // Navigate JSON
    try {
        // Handle both _ROUTER_DATA structure and potential variations
        const loaderData = data.loaderData;
        if (!loaderData) throw new Error("no loaderData");

        const videoPageKey = Object.keys(loaderData).find(k => k.includes('video_') && k.includes('/page'));
        if (!videoPageKey) throw new Error("no video page key");

        const videoInfoRes = loaderData[videoPageKey].videoInfoRes;
        if (!videoInfoRes) throw new Error("no videoInfoRes");

        const filterReasons = Array.isArray(videoInfoRes.filter_list)
            ? videoInfoRes.filter_list
                .map((entry) => String(entry?.filter_reason || "").trim())
                .filter(Boolean)
            : [];

        const item = videoInfoRes.item_list ? videoInfoRes.item_list[0] : null;
        if (!item) {
            if (filterReasons.length) {
                console.warn("[douyin] video unavailable from share payload", {
                    videoId,
                    statusCode: videoInfoRes.status_code,
                    isOversea: videoInfoRes.is_oversea,
                    filterReasons,
                    upstream: isUpstreamServer,
                });
            }

            const upstreamTargetUrl = getUpstreamTargetUrl({ videoId, shortLink: obj.shortLink });
            if (upstreamTargetUrl && !isUpstreamServer) {
                console.warn("[douyin] no item list after local retries, trying upstream cobalt", {
                    videoId,
                    targetUrl: upstreamTargetUrl,
                    localAttempts: SHARE_PAGE_RETRIES + 1,
                });

                const upstream = await requestUpstreamCobalt(upstreamTargetUrl);
                if (upstream?.url) {
                    logUpstreamUsed("no_item_list", {
                        videoId,
                        shortLink: obj.shortLink,
                        targetUrl: upstreamTargetUrl,
                        status: upstream.status,
                    });
                    if (upstream.relayUrl) {
                        return {
                            filename: upstream.filename || `douyin_${videoId}.mp4`,
                            audioFilename: `douyin_${videoId}_audio`,
                            urls: upstream.relayUrl,
                            duration: upstream.duration,
                            headers: buildRelayHeaders(),
                        };
                    }
                    return {
                        filename: upstream.filename || `douyin_${videoId}.mp4`,
                        audioFilename: `douyin_${videoId}_audio`,
                        urls: upstream.url,
                        forceRedirect: upstream.status === "redirect",
                        duration: upstream.duration,
                        headers: {
                            "User-Agent": MOBILE_UA,
                        },
                    };
                }
            }

            if (filterReasons.length) {
                return { error: "fetch.empty" };
            }

            throw new Error("no item list");
        }

        const videoUri = item.video.play_addr.uri;
        const title = item.desc;
        const duration = toSeconds(item?.video?.duration ?? item?.duration);
        
        // Construct download URL
        // Using aweme.snssdk.com as it reliably redirects to the video file
        const apiUrl = `https://aweme.snssdk.com/aweme/v1/play/?video_id=${videoUri}&ratio=1080p&line=0`;
        
        // Resolve the redirect to get the direct CDN URL
        let directUrl = apiUrl;
        let directHeadStatusCode;
        try {
            const headRes = await fetch(apiUrl, {
                method: "HEAD",
                redirect: "follow",
                headers: {
                    "User-Agent": MOBILE_UA
                },
                signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
            });
            directHeadStatusCode = headRes.status;
            directUrl = headRes.url;
        } catch (e) {
            console.error("Failed to resolve direct URL", e);
        }

        // Probe media URL with a 1-byte range request:
        // 1) estimate file size for large-file upstream routing
        // 2) detect broken direct media endpoints (4xx/5xx) early
        const {
            statusCode: directRangeStatusCode,
            bytes: contentLengthBytes,
        } = await probeContentLength(directUrl);

        const directProbeStatusCode =
            typeof directHeadStatusCode === "number" && directHeadStatusCode >= 400
                ? directHeadStatusCode
                : directRangeStatusCode;

        const shouldFallbackByLargeFile =
            typeof contentLengthBytes === "number" &&
            contentLengthBytes >= env.douyinUpstreamMinBytes;
        const shouldFallbackByDirectStatus =
            typeof directProbeStatusCode === "number" &&
            directProbeStatusCode >= 400;

        if (!env.instagramUpstreamURL && shouldFallbackByDirectStatus) {
            console.warn("[douyin] direct media probe failed and upstream is not configured", {
                videoId,
                directStatusCode: directProbeStatusCode,
                directUrl,
            });
            return { error: "fetch.fail" };
        }

        if (env.instagramUpstreamURL && (shouldFallbackByLargeFile || shouldFallbackByDirectStatus)) {
            const upstreamTargetUrl = getUpstreamTargetUrl({
                videoId,
                shortLink: obj.shortLink,
            });
            if (upstreamTargetUrl) {
                console.warn("[douyin] direct media fallback condition met, trying upstream cobalt", {
                    videoId,
                    bytes: contentLengthBytes ?? "n/a",
                    threshold: env.douyinUpstreamMinBytes,
                    directStatusCode: directProbeStatusCode ?? "n/a",
                    directUrl,
                });
                const upstream = await requestUpstreamCobalt(upstreamTargetUrl);
                if (upstream?.url) {
                    const upstreamReason = shouldFallbackByLargeFile
                        ? "large_file"
                        : "direct_probe_status";
                    logUpstreamUsed(upstreamReason, {
                        videoId,
                        shortLink: obj.shortLink,
                        targetUrl: upstreamTargetUrl,
                        status: upstream.status,
                    });
                    if (upstream.relayUrl) {
                        return {
                            filename: upstream.filename || `douyin_${videoId}.mp4`,
                            audioFilename: `douyin_${videoId}_audio`,
                            urls: upstream.relayUrl,
                            duration: upstream.duration,
                            headers: buildRelayHeaders(),
                        };
                    }
                    return {
                        filename: upstream.filename || `douyin_${videoId}.mp4`,
                        audioFilename: `douyin_${videoId}_audio`,
                        urls: upstream.url,
                        forceRedirect: upstream.status === "redirect",
                        duration: upstream.duration,
                        headers: {
                            "User-Agent": MOBILE_UA,
                        },
                    };
                }
            }

            // If direct media endpoint is already 4xx/5xx and upstream is unavailable,
            // return a hard failure instead of a tunnel that will certainly 404.
            if (shouldFallbackByDirectStatus) {
                return { error: "fetch.fail" };
            }
        }

        return {
            filename: `douyin_${videoId}.mp4`,
            audioFilename: `douyin_${videoId}_audio`,
            urls: directUrl,
            duration,
            headers: {
                "User-Agent": MOBILE_UA
            }
        };
    } catch (e) {
        console.error("Douyin extraction error:", e);
        return { error: "fetch.fail" };
    }
}
