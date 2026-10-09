import { genericUserAgent } from "../../config.js";
import { resolveRedirectingURL } from "../url.js";

const videoRegex = /"url":"(https:\/\/v1\.pinimg\.com\/videos\/.*?)"/g;
const imageRegex = /src="(https:\/\/i\.pinimg\.com\/.*\.(jpg|gif))"/g;
const notFoundRegex = /"__typename"\s*:\s*"PinNotFound"/;

export default async function(o) {
    let id = o.id;

    if (!o.id && o.shortLink) {
        const patternMatch = await resolveRedirectingURL(`https://api.pinterest.com/url_shortener/${o.shortLink}/redirect/`);
        id = patternMatch?.id;
    }

    if (!id) return { error: "fetch.fail" };
    if (id.includes("--")) id = id.split("--")[1];

    const html = await fetch(`https://www.pinterest.com/pin/${id}/`, {
        headers: { "user-agent": genericUserAgent }
    }).then(r => r.text()).catch(() => {});

    if (!html) return { error: "fetch.fail" };

    const invalidPin = html.match(notFoundRegex);

    if (invalidPin) return { error: "fetch.empty" };

    const videoLinks = [...html.matchAll(videoRegex)].map(([, link]) => link);
    // Pinterest sometimes omits progressive URLs from StoryPinVideoBlock data.
    // Use the existing HLS processing path when only a playlist is available.
    const videoLink = videoLinks.find(a => a.endsWith('.mp4'))
                    || videoLinks.find(a => a.endsWith('.m3u8'));

    if (videoLink) return {
        urls: videoLink,
        ...(videoLink.endsWith('.m3u8') ? { isHLS: true } : {}),
        filename: `pinterest_${id}.mp4`,
        audioFilename: `pinterest_${id}_audio`
    }

    const imageLink = [...html.matchAll(imageRegex)]
                    .map(([, link]) => link)
                    .find(a => a.endsWith('.jpg') || a.endsWith('.gif'));

    if (imageLink) {
        const imageType = imageLink.endsWith(".gif") ? "gif" : "jpg";

        return {
            urls: imageLink,
            isPhoto: true,
            filename: `pinterest_${id}.${imageType}`
        };
    }

    return { error: "fetch.empty" };
}
