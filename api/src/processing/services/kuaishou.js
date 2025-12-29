import { genericUserAgent } from "../../config.js";

const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

export default async function(obj) {
    let videoId = obj.id;
    let targetUrl = obj.url;

    if (!targetUrl && obj.shareToken) {
        targetUrl = `https://www.kuaishou.com/f/${obj.shareToken}`;
    }

    // 1. Handle Short Links
    if (obj.shortLink) {
        try {
            const res = await fetch(`https://v.kuaishou.com/${obj.shortLink}`, {
                method: "HEAD",
                redirect: "follow",
                headers: {
                    "user-agent": MOBILE_UA
                }
            });
            targetUrl = res.url;
            
            // Extract ID from redirected URL if possible, though we might just use the URL directly
            // URL usually looks like: https://www.kuaishou.com/short-video/3x...
            const match = targetUrl.match(/\/short-video\/([a-zA-Z0-9]+)/);
            if (match) {
                videoId = match[1];
            }
        } catch (e) {
            console.error("Kuaishou shortlink fetch failed:", e);
            return { error: "fetch.short_link" };
        }
    } else if (videoId) {
        // If we have an ID but no full URL, construct one
        targetUrl = `https://www.kuaishou.com/short-video/${videoId}`;
    }

    if (!targetUrl) return { error: "fetch.short_link" };

    // 2. Fetch Page Content
    let html;
    try {
        const res = await fetch(targetUrl, {
            headers: {
                "user-agent": MOBILE_UA,
                "Cookie": "did=web_d563dca728d28b00336877723e0359ed" // Sometimes helps to have a dummy DID
            }
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        html = await res.text();
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
                    id: data.video.photoId
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
                                id: photo.photoId
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
        original_url: targetUrl,
        filename: `kuaishou_${videoInfo.id || videoId || Date.now()}.mp4`,
        status: "proxy",
        headers: {
            "User-Agent": MOBILE_UA,
            "Referer": "https://www.kuaishou.com/"
        }
    };
}
