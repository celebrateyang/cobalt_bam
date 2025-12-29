const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const PAGE_TIMEOUT_MS = 15000;

const extractPhotoId = (candidateUrl) => {
    if (!candidateUrl) return null;

    try {
        const parsed = new URL(candidateUrl);
        const pathMatch = parsed.pathname.match(
            /\/(?:short-video|fw\/photo|video)\/([a-zA-Z0-9]+)/,
        );
        if (pathMatch?.[1]) return pathMatch[1];

        const shareObjectId = parsed.searchParams.get("shareObjectId");
        if (shareObjectId) return shareObjectId;
    } catch {
        // ignore
    }

    return null;
};

const resolveRedirectLocation = async (url) => {
    const headers = { "user-agent": MOBILE_UA };

    try {
        const res = await fetch(url, {
            method: "HEAD",
            redirect: "manual",
            headers,
            signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        });

        const location = res.headers.get("location");
        if (location) return new URL(location, url).href;
    } catch {
        // ignore and try GET
    }

    try {
        const res = await fetch(url, {
            method: "GET",
            redirect: "manual",
            headers,
            signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        });

        const location = res.headers.get("location");
        if (location) return new URL(location, url).href;
    } catch {
        // ignore
    }

    return null;
};

const fetchPageHtml = async (urls) => {
    const headers = {
        "user-agent": MOBILE_UA,
        "Cookie": "did=web_d563dca728d28b00336877723e0359ed", // Sometimes helps to have a dummy DID
    };

    let lastError;
    for (const url of urls.filter(Boolean)) {
        try {
            const res = await fetch(url, {
                headers,
                signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
            });
            if (!res.ok) throw new Error(`Status ${res.status}`);
            return { html: await res.text(), fetchedUrl: url };
        } catch (e) {
            lastError = e;
        }
    }

    throw lastError ?? new Error("fetch.fail");
};

const toSeconds = (value) => {
    if (value == null) return undefined;

    const numeric = typeof value === "string" ? Number(value) : value;
    if (typeof numeric !== "number" || !Number.isFinite(numeric) || numeric <= 0) {
        return undefined;
    }

    return numeric > 1000 ? Math.round(numeric / 1000) : Math.round(numeric);
};

export default async function(obj) {
    let videoId = obj.id;
    const originalUrl = obj.url;
    let targetUrl = obj.url;

    // 1. Handle Short Links
    if (obj.shortLink) {
        try {
            const location = await resolveRedirectLocation(
                `https://v.kuaishou.com/${obj.shortLink}`,
            );
            const resolvedId = extractPhotoId(location);
            if (resolvedId) videoId = resolvedId;
        } catch (e) {
            console.error("Kuaishou shortlink fetch failed:", e);
            return { error: "fetch.short_link" };
        }
    }

    if (!videoId && obj.shareToken) {
        try {
            const location = await resolveRedirectLocation(
                `https://v.kuaishou.com/f/${obj.shareToken}`,
            );
            const resolvedId = extractPhotoId(location);
            if (resolvedId) videoId = resolvedId;
        } catch (e) {
            console.error("Kuaishou shareToken resolve failed:", e);
            return { error: "fetch.fail" };
        }
    }

    if (!videoId && targetUrl) {
        videoId = extractPhotoId(targetUrl) || videoId;
    }

    if (videoId) {
        // Prefer endpoints that are reachable more reliably than www.kuaishou.com
        targetUrl = `https://v.kuaishou.com/fw/photo/${videoId}`;
    }

    if (!targetUrl) return { error: "fetch.short_link" };

    // 2. Fetch Page Content
    let html;
    let fetchedUrl = targetUrl;
    try {
        const candidates = videoId
            ? [
                  `https://v.kuaishou.com/fw/photo/${videoId}`,
                  `https://m.gifshow.com/fw/photo/${videoId}`,
                  targetUrl,
              ]
            : [targetUrl];
        const res = await fetchPageHtml(candidates);
        html = res.html;
        fetchedUrl = res.fetchedUrl;
    } catch (e) {
        console.error("Kuaishou page fetch failed:", e);
        return { error: "fetch.fail" };
    }

    // 3. Extract Data
    let videoInfo = {};
    try {
        // Strategy 1: window.pageData
        let match = html.match(/window\.pageData\s*=\s*({.+?});/);
        if (match && match[1]) {
            const data = JSON.parse(match[1]);
            if (data.video) {
                videoInfo = {
                    url: data.video.srcNoMark || data.video.src,
                    title: data.video.caption,
                    id: data.video.photoId,
                    duration: toSeconds(data.video.duration),
                };
            }
        }

        // Strategy 2: window.INIT_STATE
        if (!videoInfo.url) {
            match = html.match(/window\.INIT_STATE\s*=\s*({.+?})<\/script>/);
            if (match && match[1]) {
                const initState = JSON.parse(match[1]);
                // Find the key that holds the photo data
                for (const key in initState) {
                    const item = initState[key];
                    if (item && item.photo) {
                        const photo = item.photo;
                        let url;
                        const duration = toSeconds(photo.duration || photo.manifest?.adaptationSet?.[0]?.duration);
                        // Try mainMvUrls
                        if (photo.mainMvUrls && photo.mainMvUrls.length > 0) {
                            url = photo.mainMvUrls[0].url;
                        }
                        // Fallback to adaptationSet if mainMvUrls is missing
                        if (!url && photo.manifest && photo.manifest.adaptationSet) {
                             const adaptation = photo.manifest.adaptationSet[0];
                             if (adaptation && adaptation.representation && adaptation.representation.length > 0) {
                                 url = adaptation.representation[0].url;
                             }
                        }

                        if (url) {
                            videoInfo = {
                                url: url,
                                title: photo.caption,
                                id: photo.photoId,
                                duration,
                            };
                            break; // Found it
                        }
                    }
                }
            }
        }

        if (!videoInfo.url) throw new Error("No video URL found in page data");

    } catch (e) {
        console.error("Kuaishou data parse failed:", e);
        return { error: "fetch.fail" };
    }

    // 4. Return Result
    return {
        type: "video",
        urls: videoInfo.url,
        original_url: originalUrl || targetUrl,
        filename: `kuaishou_${videoInfo.id || videoId || Date.now()}.mp4`,
        status: "proxy",
        duration: videoInfo.duration,
        headers: {
            "User-Agent": MOBILE_UA,
            "Referer": `${new URL(fetchedUrl).origin}/`,
        }
    };
}
