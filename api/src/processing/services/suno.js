import { genericUserAgent } from "../../config.js";
import { sanitizeString } from "../create-filename.js";
import { createDecipheriv, createHash } from "node:crypto";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

// Only request Suno itself, including when resolving short-link redirects.
export default async function suno({ id, shortLink, isAudioOnly = false }) {
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
        const song = normalized.match(new RegExp(`"id":"${escapedId}","entity_type":"song_schema","video_url":"([^"\\s]*)"`, "i"));
        if (!song) return { error: "fetch.empty" };
        const title = normalized.match(/<meta property="og:title" content="([^"]+)"/i)?.[1]
            ?.replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
        const name = sanitizeString(title || `suno_${songId}`);
        if (song[1]) {
            const media = new URL(song[1]);
            if (media.protocol !== "https:" || media.hostname !== "cdn1.suno.ai" || media.port || media.username || media.password || media.pathname.toLowerCase() !== `/${songId.toLowerCase()}.mp4`) return { error: "fetch.empty" };
            return { service: "suno", urls: media.toString(), filename: `${name}.mp4`, audioFilename: name };
        }
        // Some public songs expose only the player stream. Do not pretend it is
        // an MP4 video, and do not infer a resource from the song ID.
        if (!isAudioOnly) return { error: "fetch.empty" };
        const tail = normalized.slice(song.index + song[0].length, song.index + song[0].length + 8192);
        const mediaArray = tail.match(/"media_urls":(\[[^\]]{0,4096}\])/i)?.[1];
        const entries = mediaArray ? JSON.parse(mediaArray) : [];
        const candidate = Array.isArray(entries)
            ? entries.find(item => item?.content_type === 'm4a-opus' && item?.delivery === 'progressive' && item?.encoding === '1.0.0' && typeof item?.url === 'string')?.url
            : undefined;
        if (!candidate) return { error: "fetch.empty" };
        const media = new URL(candidate);
        if (media.protocol !== "https:" || media.hostname !== "d2lwuy8qc234o3.cloudfront.net" || media.port || media.username || media.password || media.pathname.toLowerCase() !== `/1/clip/${songId.toLowerCase()}.m4a`) return { error: "fetch.empty" };
        const rights = await fetch("https://studio-api.prod.suno.com/api/mango/rights", {
            method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
            headers: { "Content-Type": "application/json", "User-Agent": genericUserAgent },
            body: JSON.stringify({ content_params: { content_id: songId, content_type: "clip" } }),
        });
        if (!rights.ok) return { error: "fetch.fail" };
        const data = await rights.json();
        if (![data?.key, data?.iv, data?.glt].every(v => typeof v === "string" && v.length > 0 && v.length < 8192)) return { error: "fetch.fail" };
        const wrappingKey = createHash("sha256").update(data.glt).digest();
        const unwrap = (value) => {
            const envelope = Buffer.from(value, "base64");
            if (envelope.length < 29 || envelope.length > 256) throw new Error("Invalid envelope");
            const cipher = createDecipheriv("aes-256-gcm", wrappingKey, envelope.subarray(0, 12));
            cipher.setAAD(Buffer.from(songId));
            cipher.setAuthTag(envelope.subarray(-16));
            return Buffer.concat([cipher.update(envelope.subarray(12, -16)), cipher.final()]);
        };
        const key = unwrap(data.key), counter = unwrap(data.iv);
        if (key.length !== 16 || counter.length !== 16) return { error: "fetch.fail" };
        return { service: "suno", urls: media.toString(), filename: `${name}.mp4`, audioFilename: name,
            sunoEncryption: { key: key.toString("base64"), counter: counter.toString("base64") } };
    } catch {
        return { error: "fetch.fail" };
    }
}
