import { genericUserAgent } from "../../config.js";

// Mobile UA is required for the share page logic to work without X-Bogus
// Verified working as of Dec 2025
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

const toSeconds = (value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return value > 1000 ? Math.round(value / 1000) : Math.round(value);
};

export default async function(obj) {
    let videoId = obj.id;

    if (!videoId && obj.shortLink) {
        try {
            const res = await fetch(`https://v.douyin.com/${obj.shortLink}/`, {
                method: "HEAD",
                redirect: "follow",
                headers: {
                    "user-agent": MOBILE_UA
                }
            });
            
            const finalUrl = res.url;
            // https://www.douyin.com/video/73123456789...
            // or https://www.iesdouyin.com/share/video/73123456789...
            
            const match = finalUrl.match(/\/video\/(\d+)/) || finalUrl.match(/mid=(\d+)/) || finalUrl.match(/\/share\/video\/(\d+)/);
            if (match) {
                videoId = match[1];
            }
        } catch (e) {
            console.error("Douyin shortlink fetch failed:", e);
            return { error: "fetch.short_link" };
        }
    }

    if (!videoId) return { error: "fetch.short_link" };

    // Fetch share page
    const shareUrl = `https://www.iesdouyin.com/share/video/${videoId}`;
    let html;
    try {
        const res = await fetch(shareUrl, {
            headers: {
                "user-agent": MOBILE_UA
            }
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        html = await res.text();
    } catch (e) {
        console.error("Douyin share page fetch failed:", e);
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
                }
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
