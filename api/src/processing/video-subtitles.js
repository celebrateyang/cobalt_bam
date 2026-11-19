import { renderSrt } from "../ai-video/subtitles.js";
import { youtubeSubtitleMetadata } from "./services/youtube.js";
import { fetchDouyinSubtitleDetails, resolveSubtitleVideoId } from "./services/douyin.js";

const maxBytes = 2 * 1024 * 1024;

export const parseSubtitleSource = (value) => {
    if (typeof value !== "string" || value.length > 2048) return null;
    let url;
    try { url = new URL(value); } catch { return null; }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return null;
    const host = url.hostname;
    if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(host)) {
        const id = host === "youtu.be" ? url.pathname.match(/^\/([\w-]{11})\/?$/)?.[1]
            : /^\/watch\/?$/.test(url.pathname) ? url.searchParams.get("v")
            : url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]+)\/?$/)?.[1];
        return /^[\w-]{11}$/.test(id || "") ? { platform: "youtube", id } : null;
    }
    if (["douyin.com", "www.douyin.com", "m.douyin.com", "www.iesdouyin.com", "iesdouyin.com", "v.douyin.com"].includes(host)) {
        const id = url.pathname.match(/^\/(?:share\/)?video\/(\d{8,24})\/?$/)?.[1] || url.searchParams.get("modal_id");
        if (/^\d{8,24}$/.test(id || "")) return { platform: "douyin", id };
        const short = host === "v.douyin.com" && url.pathname.match(/^\/([\w-]{2,64})\/?$/)?.[1];
        return short ? { platform: "douyin", short } : null;
    }
    return null;
};

export const douyinSubtitleMetadata = (details) => {
    const automatic = Object.create(null);
    const add = (language, file) => {
        const key = typeof language === "string" && /^[\w-]{1,64}$/.test(language)
            ? language.replace(/_/g, "-") : "und";
        if (file.url && file.ext) (automatic[key] ||= []).push(file);
    };
    for (const detail of details) {
        const video = detail.video;
        const cla = video.cla_info || video.claInfo;
        const groups = [cla?.caption_infos || cla?.captionInfos, video.subtitle_infos || video.subtitleInfos];
        for (const caption of groups.flatMap(group => Array.isArray(group) ? group : [])) {
            if (!caption) continue;
            const url = caption.url || caption.Url || caption.url_list?.[0] || caption.urlList?.[0];
            const format = String(caption.Format || caption.format || "").toLowerCase();
            const ext = format === "webvtt" ? "vtt" : ["vtt", "srt"].includes(format) ? format
                : /\.(srt|vtt)(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase();
            const language = Array.isArray(caption.language) ? caption.language[0] : caption.language;
            add(caption.language_code || caption.LanguageCodeName || caption.lang || language, { url, ext });
        }
        const stickers = detail.interaction_stickers;
        for (const sticker of Array.isArray(stickers) ? stickers : []) {
            const captions = sticker?.auto_video_caption_info?.auto_captions;
            for (const caption of Array.isArray(captions) ? captions : []) {
                if (caption) add(caption.language, { url: caption.url?.url_list?.[0], ext: "srt", utterances: true });
            }
        }
    }
    return { automatic_captions: automatic };
};

const douyinMetadata = async ({ id, short }) => {
    id ||= await resolveSubtitleVideoId(short);
    if (!id) throw new Error("Unable to resolve Douyin video");
    return douyinSubtitleMetadata(await fetchDouyinSubtitleDetails(id));
};

const safeSubtitleUrl = (platform, value) => {
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
        if (platform === "youtube") {
            return ["www.youtube.com", "youtube.com"].includes(url.hostname) && url.pathname === "/api/timedtext" ? url : null;
        }
        const allowed = ["douyin.com", "douyinvod.com", "douyinpic.com", "bytecdn.cn", "byteimg.com", "zjcdn.com", "ixigua.com", "ibytedtos.com"];
        return allowed.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`)) ? url : null;
    } catch { return null; }
};

const downloadCandidate = (platform, automatic, entry) => {
    const url = safeSubtitleUrl(platform, entry?.url);
    if (platform === "youtube" && automatic) {
        if (url?.searchParams.get("kind") !== "asr" || url.searchParams.has("tlang")) return null;
    }
    return url;
};

export const collectSubtitleTracks = (platform, info) => {
    const tracks = [];
    const seen = new Set();
    for (const [automatic, group] of [[false, info.subtitles], [true, info.automatic_captions]]) {
        for (const [key, entries] of Object.entries(group || {})) {
            if (!/^[\w-]{1,64}$/.test(key) || key === "live_chat" || !Array.isArray(entries)) continue;
            for (const format of ["vtt", "srt"]) {
                const file = entries.find(entry => entry?.ext === format && downloadCandidate(platform, automatic, entry));
                if (!file) continue;
                const language = platform === "youtube" && automatic ? key.replace(/-orig$/, "") : key;
                const id = `${automatic ? "auto" : "manual"}:${language}`;
                if (seen.has(id)) break;
                seen.add(id);
                tracks.push({
                    id, language, automatic, format,
                    name: typeof file.name === "string" ? file.name.slice(0, 100) : undefined,
                    file,
                });
                break;
            }
        }
    }
    return tracks;
};

export const readSubtitleTracks = async (source) => {
    const info = source.platform === "youtube"
        ? await youtubeSubtitleMetadata(source.id)
        : await douyinMetadata(source);
    return collectSubtitleTracks(source.platform, info);
};

export const readSubtitleFile = async (platform, track) => {
    const url = safeSubtitleUrl(platform, track.file.url);
    if (!url) throw new Error("Invalid subtitle URL");
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok || !response.body) throw new Error("Subtitle file unavailable");
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) throw new Error("Subtitle file too large");
            chunks.push(value);
        }
    } finally {
        await reader.cancel().catch(() => {});
    }
    let text = Buffer.concat(chunks).toString("utf8");
    if (track.file.utterances) {
        const utterances = JSON.parse(text).utterances;
        const cues = Array.isArray(utterances) ? utterances.filter(Boolean).flatMap(({ start_time, end_time, text }) => (
            Number.isSafeInteger(start_time) && start_time >= 0 && Number.isSafeInteger(end_time) && end_time > start_time
                && typeof text === "string" && text.trim()
                ? [{ startMs: start_time, endMs: end_time, text: text.trim() }] : []
        )) : [];
        text = renderSrt(cues);
    }
    if (track.format === "vtt" ? (!/^\uFEFF?WEBVTT(?:\s|$)/.test(text) || !text.includes("-->")) : !/^\uFEFF?\s*\d+\s*\r?\n\d{2,}:\d{2}:\d{2},\d{3}\s*-->/.test(text)) {
        throw new Error("Invalid subtitle file");
    }
    return text;
};
