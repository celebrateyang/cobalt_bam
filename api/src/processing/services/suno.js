import { genericUserAgent } from "../../config.js";
import { sanitizeString } from "../create-filename.js";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

// Only request Suno itself, including when resolving short-link redirects.
export default async function suno({ id, shortLink }) {
    let url = new URL(id ? `https://suno.com/song/${id}` : `https://suno.com/s/${shortLink}`);
    let response;
    try {
        for (let i = 0; i < 4; i++) {
            if (url.protocol !== "https:" || !["suno.com", "www.suno.com"].includes(url.hostname) || url.port || url.username || url.password) return { error: "fetch.fail" };
            response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000), headers: { "User-Agent": genericUserAgent, Accept: "text/html" } });
            if (response.status < 300 || response.status >= 400) break;
            const location = response.headers.get("location");
            if (!location) return { error: "fetch.fail" };
            url = new URL(location, url);
            response = undefined;
        }
        const songId = url.pathname.match(/^\/song\/([^/]+)\/?$/)?.[1];
        if (!response?.ok || !uuid.test(songId || "") || (id && songId.toLowerCase() !== id.toLowerCase())) return { error: "fetch.empty" };
        const html = await response.text();
        // Next.js embeds the song object inside escaped flight data. Require the
        // requested song ID and its video field together, not a recommendation.
        const normalized = html.replace(/\\+"/g, '"');
        const escapedId = songId.replace(/[-]/g, "\\-");
        const song = normalized.match(new RegExp(`"id":"${escapedId}","entity_type":"song_schema","video_url":"([^"\\s]+)"`, "i"));
        if (!song) return { error: "fetch.empty" };
        const media = new URL(song[1]);
        if (media.protocol !== "https:" || media.hostname !== "cdn1.suno.ai" || media.port || media.username || media.password || media.pathname.toLowerCase() !== `/${songId.toLowerCase()}.mp4`) return { error: "fetch.empty" };
        const title = normalized.match(/<meta property="og:title" content="([^"]+)"/i)?.[1]
            ?.replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
        const name = sanitizeString(title || `suno_${songId}`);
        return { service: "suno", urls: media.toString(), filename: `${name}.mp4`, audioFilename: name };
    } catch {
        return { error: "fetch.fail" };
    }
}
