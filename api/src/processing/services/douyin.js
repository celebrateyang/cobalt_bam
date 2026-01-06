import { env } from "../../config.js";

// Mobile UA is required for the share page logic to work without X-Bogus
// Verified working as of Dec 2025
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const PAGE_TIMEOUT_MS = 15000;
const SHARE_PAGE_RETRIES = 1;
const WAF_RETRY_AFTER_SECONDS = 60;

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

const requestUpstreamCobalt = async (targetUrl) => {
    // Reuse INSTAGRAM_UPSTREAM_* for Douyin as well.
    if (!env.instagramUpstreamURL) return null;

    try {
        if (new URL(env.instagramUpstreamURL).origin === new URL(env.apiURL).origin) {
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
        const res = await fetch(endpoint, {
            method: "POST",
            signal: controller.signal,
            headers,
            body: JSON.stringify({ url: String(targetUrl) }),
        });

        const payload = await res.json().catch(() => null);

        if (!res.ok) return null;
        if (!payload || typeof payload !== "object") return null;
        if (!["redirect", "tunnel"].includes(payload.status)) return null;
        if (!payload.url) return null;

        return {
            url: payload.url,
            filename: payload.filename,
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
                    return {
                        filename: upstream.filename || `douyin_${obj.shortLink}.mp4`,
                        urls: upstream.url,
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
                    console.log("Douyin upstream succeeded after WAF challenge");
                    return {
                        filename: upstream.filename || `douyin_${videoId}.mp4`,
                        urls: upstream.url,
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
                    console.log("Douyin upstream succeeded after WAF challenge");
                    return {
                        filename: upstream.filename || `douyin_${videoId}.mp4`,
                        urls: upstream.url,
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

        const item = videoInfoRes.item_list ? videoInfoRes.item_list[0] : null;
        if (!item) throw new Error("no item list");

        const videoUri = item.video.play_addr.uri;
        const title = item.desc;
        const duration = toSeconds(item?.video?.duration ?? item?.duration);
        
        // Construct download URL
        // Using aweme.snssdk.com as it reliably redirects to the video file
        const apiUrl = `https://aweme.snssdk.com/aweme/v1/play/?video_id=${videoUri}&ratio=1080p&line=0`;
        
        // Resolve the redirect to get the direct CDN URL
        let directUrl = apiUrl;
        try {
            const headRes = await fetch(apiUrl, {
                method: "HEAD",
                redirect: "follow",
                headers: {
                    "User-Agent": MOBILE_UA
                },
                signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
            });
            directUrl = headRes.url;
        } catch (e) {
            console.error("Failed to resolve direct URL", e);
        }

        return {
            filename: `douyin_${videoId}.mp4`,
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
