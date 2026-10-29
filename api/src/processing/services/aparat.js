const API_ORIGIN = "https://www.aparat.com";
const SHORTS_ORIGIN = "https://shorts.aparat.com";
const MAX_ITEMS = 500;

export const isAparatMediaURL = (value) => {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password && !url.port
            && /^(?:[a-z0-9-]+\.)*aparat\.(?:com|cloud)$/i.test(url.hostname)
            && /^\/aparat-(?:video|short)\/[a-zA-Z0-9_.-]+\.(?:mp4|apt)$/.test(url.pathname);
    } catch { return false; }
};

const readText = async (response, limit) => {
    if (!response.ok || !response.body) throw new Error("Aparat request failed");
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > limit) throw new Error("Aparat response too large");
            chunks.push(value);
        }
        return Buffer.concat(chunks).toString("utf8");
    } finally { await reader.cancel().catch(() => {}); }
};

const request = async (fetcher, url, headers = {}) => {
    try {
        return await fetcher(url, {
            headers: { "user-agent": "Mozilla/5.0", ...headers },
            redirect: "error",
            signal: AbortSignal.timeout(15000),
        });
    } catch (error) {
        // Do not log signed CDN URLs or source titles.
        console.warn(`[aparat] request_failed host=${new URL(url).hostname} code=${error?.cause?.code || error?.name || "unknown"}`);
        throw error;
    }
};

const json = async (fetcher, url) => JSON.parse(await readText(await request(fetcher, url), 4 * 1024 * 1024));

// Verify only the MP4 signature. Never buffer or relay a media body on the API.
export const probeAparatMP4 = async (url, fetcher = fetch) => {
    if (!isAparatMediaURL(url)) return false;
    const response = await request(fetcher, url, { Range: "bytes=0-15" });
    if (!response.body) return false;
    const reader = response.body.getReader();
    try {
        if (![200, 206].includes(response.status)) return false;
        let head = Buffer.alloc(0);
        while (head.length < 12) {
            const { value, done } = await reader.read();
            if (done) break;
            head = Buffer.concat([head, Buffer.from(value).subarray(0, 16 - head.length)]);
        }
        return head.toString("ascii", 4, 8) === "ftyp";
    } finally { await reader.cancel().catch(() => {}); }
};

export const aparatShortsCandidates = (master) => {
    const lines = master.split(/\r?\n/).map(line => line.trim());
    const candidates = [];
    for (let i = 0; i < lines.length - 1; i++) {
        const resolution = lines[i].match(/^#EXT-X-STREAM-INF:.*RESOLUTION=(\d+)x(\d+)/);
        if (!resolution) continue;
        try {
            const url = new URL(lines[i + 1]);
            if (!/^\/aparat-short\/\d+\.mp4\/chunk\.m3u8$/.test(url.pathname)) continue;
            url.pathname = url.pathname.slice(0, -"/chunk.m3u8".length);
            if (isAparatMediaURL(url.href)) candidates.push({ url: url.href, height: Math.min(+resolution[1], +resolution[2]) });
        } catch { /* Ignore unknown player/CDN layouts. */ }
    }
    return candidates;
};

const rankCandidates = (candidates, quality) => {
    const cap = quality === "max" ? Infinity : Number(quality) || Infinity;
    return [...candidates].sort((a, b) => {
        const aOver = a.height > cap, bOver = b.height > cap;
        if (aOver !== bOver) return aOver ? 1 : -1;
        return aOver ? a.height - b.height : b.height - a.height;
    });
};

export default async function aparat({ id, shortId, quality = "max" }, fetcher = fetch) {
    const videoId = shortId || id;
    if (!(shortId ? /^\d{1,24}$/ : /^[a-zA-Z0-9]{1,32}$/).test(videoId || "")) return { error: "link.unsupported" };
    try {
        let candidates, title, author, duration;
        if (shortId) {
            const data = await json(fetcher, `${SHORTS_ORIGIN}/api/v1/posts/${shortId}`);
            const post = data?.data?.post;
            if (data.status !== "ok" || !post || post.type !== "short-video") return { error: "content.post.unavailable" };
            title = post.description;
            author = post.user?.username;
            duration = Number(post.short_videos?.[0]?.duration);
            // Construct the known endpoint; do not fetch arbitrary URLs supplied by metadata.
            const master = await readText(await request(fetcher, `${SHORTS_ORIGIN}/api/v1/hls/${shortId}.m3u8`), 256 * 1024);
            candidates = aparatShortsCandidates(master);
        } else {
            const data = await json(fetcher, `${API_ORIGIN}/etc/api/video/videohash/${id}`);
            const video = data?.video;
            if (!video || video.isHidden || (video.cost_type?.type && video.cost_type.type !== "free")) return { error: "content.post.unavailable" };
            // can_download controls Aparat's download button; public, free videos
            // can still expose a playable MP4. Require our CDN and MP4 checks below.
            title = video.title;
            author = video.username;
            duration = Number(video.duration);
            candidates = (video.file_link_all || []).flatMap(format => (format.urls || []).map(url => ({
                url, height: Number(String(format.profile || format.text || "").match(/\d{3,4}/)?.[0]) || 0,
            })));
            if (video.file_link) candidates.push({ url: video.file_link, height: 0 });
        }
        const seen = new Set();
        candidates = rankCandidates(candidates, quality).filter(({ url }) => {
            if (!isAparatMediaURL(url) || seen.has(url)) return false;
            seen.add(url);
            return true;
        });
        for (const candidate of candidates.slice(0, 6)) {
            if (!await probeAparatMP4(candidate.url, fetcher).catch(() => false)) continue;
            title = String(title || "").trim() || `Aparat ${videoId}`;
            return {
                service: "aparat", urls: candidate.url, directClientDownload: true,
                duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
                fileMetadata: { title, artist: author || undefined },
                filenameAttributes: { service: "aparat", id: videoId, title, author, extension: "mp4",
                    qualityLabel: candidate.height ? `${candidate.height}p` : "MP4" },
            };
        }
        return { error: "fetch.empty" };
    } catch { return { error: "fetch.fail" }; }
}

export const expandAparat = async (input, fetcher = fetch) => {
    const url = new URL(input);
    const id = url.pathname.match(/^\/playlist\/(\d{1,20})\/?$/)?.[1]
        || (/^\/v\/[a-zA-Z0-9]{1,32}\/?$/.test(url.pathname)
            ? url.searchParams.get("playlist")?.match(/^\d{1,20}$/)?.[0] : undefined);
    if (!id) return { service: "aparat", kind: "single", items: [{ url: input }] };
    try {
        let next = `${API_ORIGIN}/api/fa/v1/video/playlist/one/playlist_id/${id}`;
        const items = [], seen = new Set(), pages = new Set();
        let title, total;
        while (next && pages.size < 20) {
            if (pages.has(next)) throw new Error("Repeated playlist page");
            pages.add(next);
            const body = await json(fetcher, next);
            const isListPage = Array.isArray(body.data);
            const attributes = isListPage ? {} : body?.data?.attributes;
            const references = isListPage ? body.data : body?.data?.relationships?.video?.data;
            if (!attributes || !Array.isArray(references)) throw new Error("Invalid playlist");
            title ||= attributes.title;
            total ??= Number(attributes.cnt);
            if (!Number.isInteger(total) || total < 0 || total > MAX_ITEMS) throw new Error("Unsupported playlist size");
            const included = new Map((isListPage ? body.data : body.included || []).map(item => [`${String(item.type).toLowerCase()}:${item.id}`, item.attributes]));
            const before = items.length;
            for (const ref of references) {
                const video = included.get(`${String(ref.type).toLowerCase()}:${ref.id}`);
                if (!/^[a-zA-Z0-9]{1,32}$/.test(video?.uid || "") || seen.has(video.uid)) continue;
                seen.add(video.uid);
                const seconds = Number(video.duration);
                items.push({ url: `${API_ORIGIN}/v/${video.uid}`, itemKey: `aparat:video:${video.uid}`,
                    title: video.title, duration: Number.isFinite(seconds) && seconds > 0 ? seconds : undefined });
                if (items.length > MAX_ITEMS) throw new Error("Playlist too large");
            }
            if (items.length >= total) break;
            if (items.length === before) throw new Error("Playlist made no progress");
            const raw = attributes.list_videos_playlist?.link_next || body.links?.next;
            if (!raw) throw new Error("Incomplete playlist");
            const page = new URL(raw, API_ORIGIN);
            if (page.origin !== API_ORIGIN || page.username || page.password
                || !page.pathname.startsWith("/api/fa/v1/video/playlist/get_list_video/")
                || !page.pathname.split("/").some((part, i, parts) => part === "playlist_id" && parts[i + 1] === id)) throw new Error("Invalid playlist page");
            next = page.href;
        }
        if (!items.length || items.length < total) throw new Error("Incomplete playlist");
        return { service: "aparat", kind: "aparat-playlist", collectionKey: `aparat:playlist:${id}`, title,
            currentUrl: `${API_ORIGIN}/playlist/${id}`, items };
    } catch {
        return { service: "aparat", kind: "error", error: { code: "error.api.fetch.fail", context: { service: "Aparat" } } };
    }
};
