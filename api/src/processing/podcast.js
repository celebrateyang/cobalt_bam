import { createHash } from "node:crypto";
import path from "node:path";

import { genericUserAgent } from "../config.js";

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_FEED_ITEMS = 500;
const PODCAST_BRIDGE_ORIGIN = "https://podcast.freesavevideo.online";

const AUDIO_EXT_RE = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|mp4)(?:$|[?#])/i;

const decodeXml = (value = "") =>
    String(value)
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();

const stripTags = (value = "") =>
    decodeXml(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const getFirstTagText = (xml, tagNames) => {
    const names = Array.isArray(tagNames) ? tagNames : [tagNames];
    for (const name of names) {
        const escaped = name.replace(":", "\\:");
        const match = xml.match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"));
        if (match?.[1]) return stripTags(match[1]);
    }
};

const getAttribute = (tag, name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = String(tag || "").match(new RegExp(`${escaped}\\s*=\\s*["']([^"']+)["']`, "i"));
    return match?.[1] ? decodeXml(match[1]) : undefined;
};

const parseDuration = (value) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;

    if (/^\d+$/.test(trimmed)) {
        const seconds = Number(trimmed);
        return Number.isFinite(seconds) ? seconds : undefined;
    }

    const parts = trimmed.split(":").map((part) => Number(part));
    if (!parts.length || parts.some((part) => !Number.isFinite(part))) return;

    return parts.reduce((acc, part) => acc * 60 + part, 0);
};

const base64UrlEncode = (value) =>
    Buffer.from(value, "utf8").toString("base64url");

const base64UrlDecode = (value) =>
    Buffer.from(String(value || ""), "base64url").toString("utf8");

export const encodePodcastEpisodeUrl = (episode) => {
    const payload = {
        url: episode.url,
        title: episode.title,
        id: episode.itemKey,
        duration: episode.duration,
        cover: episode.cover,
        feedTitle: episode.feedTitle,
    };

    const url = new URL("/episode", PODCAST_BRIDGE_ORIGIN);
    url.searchParams.set("data", base64UrlEncode(JSON.stringify(payload)));
    return url.toString();
};

export const decodePodcastEpisodeData = (value) => {
    try {
        const data = JSON.parse(base64UrlDecode(value));
        if (!data || typeof data !== "object") return null;
        if (typeof data.url !== "string" || !/^https?:\/\//i.test(data.url)) return null;

        return {
            url: data.url,
            title: typeof data.title === "string" ? data.title.trim() : undefined,
            id: typeof data.id === "string" ? data.id.trim() : undefined,
            duration:
                typeof data.duration === "number" && Number.isFinite(data.duration)
                    ? data.duration
                    : undefined,
            cover: typeof data.cover === "string" ? data.cover.trim() : undefined,
            feedTitle: typeof data.feedTitle === "string" ? data.feedTitle.trim() : undefined,
        };
    } catch {
        return null;
    }
};

const fetchText = async (url, { accept = "*/*" } = {}) => {
    const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        headers: {
            "user-agent": genericUserAgent,
            accept,
        },
    });

    if (!response.ok) return null;
    return await response.text().catch(() => null);
};

const parseXmlFeed = (xml) => {
    const text = String(xml || "");
    if (!/<(?:rss|feed)\b/i.test(text)) return null;

    const channelMatch = text.match(/<channel\b[^>]*>([\s\S]*?)<\/channel>/i);
    const channel = channelMatch?.[1] || text;
    const feedTitle = getFirstTagText(channel, "title");
    const feedImage =
        getFirstTagText(channel, "itunes:image") ||
        getAttribute(channel.match(/<itunes:image\b[^>]*>/i)?.[0], "href") ||
        getFirstTagText(channel.match(/<image\b[^>]*>([\s\S]*?)<\/image>/i)?.[1] || "", "url");

    const itemBlocks = [
        ...text.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi),
        ...text.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi),
    ].map((match) => match[1]);

    const items = [];
    for (const block of itemBlocks) {
        const enclosureTag = block.match(/<enclosure\b[^>]*>/i)?.[0];
        let mediaUrl =
            getAttribute(enclosureTag, "url") ||
            getFirstTagText(block, ["media:content", "link"]);

        if (!mediaUrl) {
            const linkTag = block.match(/<link\b[^>]*>/i)?.[0];
            mediaUrl = getAttribute(linkTag, "href") || getFirstTagText(block, "link");
        }

        if (!mediaUrl || !/^https?:\/\//i.test(mediaUrl)) continue;

        try {
            const parsed = new URL(mediaUrl);
            const direct = parsed.searchParams.get("jt");
            if (direct && /^https?:\/\//i.test(direct)) {
                mediaUrl = direct;
            }
        } catch {
            // keep original
        }

        const title = getFirstTagText(block, "title") || feedTitle || "Podcast episode";
        const guid = getFirstTagText(block, "guid") || mediaUrl;
        const duration = parseDuration(getFirstTagText(block, "itunes:duration"));
        const itemHash = createHash("sha1").update(guid || mediaUrl).digest("hex").slice(0, 16);

        items.push({
            itemKey: `podcast:episode:${itemHash}`,
            url: mediaUrl,
            title,
            duration,
            cover: getAttribute(block.match(/<itunes:image\b[^>]*>/i)?.[0], "href") || feedImage,
            feedTitle,
        });

        if (items.length >= MAX_FEED_ITEMS) break;
    }

    if (!items.length) return null;
    return {
        title: feedTitle,
        cover: feedImage,
        items,
    };
};

const extractAlternateFeeds = (html, baseUrl) => {
    const feeds = [];
    const push = (value) => {
        if (typeof value !== "string" || !value.trim()) return;
        try {
            const resolved = new URL(decodeXml(value), baseUrl).toString();
            if (!feeds.includes(resolved)) feeds.push(resolved);
        } catch {
            // ignore
        }
    };

    for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
        const tag = match[0];
        const type = String(getAttribute(tag, "type") || "").toLowerCase();
        const rel = String(getAttribute(tag, "rel") || "").toLowerCase();
        if ((type.includes("rss") || type.includes("atom") || rel.includes("alternate")) && getAttribute(tag, "href")) {
            push(getAttribute(tag, "href"));
        }
    }

    return feeds;
};

const extractPageMetadata = (html) => {
    const nextData = html.match(/<script\b[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
    if (nextData) {
        try {
            const data = JSON.parse(decodeXml(nextData));
            const podcast = data?.props?.pageProps?.podcast;
            if (podcast?.title) {
                return {
                    title: podcast.title,
                    author: podcast.author,
                    episodeCount:
                        typeof podcast.episodeCount === "number"
                            ? podcast.episodeCount
                            : undefined,
                };
            }
        } catch {
            // fall back to meta tags
        }
    }

    const title =
        html.match(/<meta\b[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
        html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];

    return title ? { title: decodeXml(title) } : {};
};

const normalizeSearchText = (value) =>
    String(value || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[|｜-].*$/g, "")
        .trim();

const findApplePodcastFeed = async ({ title, author, episodeCount }) => {
    if (!title) return null;

    const searchUrl = new URL("https://itunes.apple.com/search");
    searchUrl.searchParams.set("media", "podcast");
    searchUrl.searchParams.set("entity", "podcast");
    searchUrl.searchParams.set("term", title);
    searchUrl.searchParams.set("country", "CN");
    searchUrl.searchParams.set("limit", "10");

    const json = await fetch(searchUrl, {
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        headers: {
            "user-agent": genericUserAgent,
            accept: "application/json",
        },
    })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

    const results = Array.isArray(json?.results) ? json.results : [];
    const normalizedTitle = normalizeSearchText(title);
    const normalizedAuthor = normalizeSearchText(author);

    const candidates = results
        .filter((item) => typeof item?.feedUrl === "string" && item.feedUrl)
        .map((item) => {
            const itemTitle = normalizeSearchText(item.collectionName);
            const itemAuthor = normalizeSearchText(item.artistName);
            let score = 0;
            if (itemTitle === normalizedTitle) score += 10;
            if (itemTitle.includes(normalizedTitle) || normalizedTitle.includes(itemTitle)) score += 4;
            if (normalizedAuthor && itemAuthor && (itemAuthor === normalizedAuthor || itemAuthor.includes(normalizedAuthor))) score += 3;
            if (episodeCount && Number(item.trackCount) === episodeCount) score += 2;
            return { item, score };
        })
        .sort((a, b) => b.score - a.score);

    return candidates[0]?.score > 0 ? candidates[0].item.feedUrl : undefined;
};

export const resolvePodcastFeed = async (inputUrl) => {
    const input = String(inputUrl || "").trim();
    if (!input) return null;

    const initialText = await fetchText(input, {
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*",
    });
    if (!initialText) return null;

    const directFeed = parseXmlFeed(initialText);
    if (directFeed) {
        return { ...directFeed, feedUrl: input };
    }

    const alternateFeeds = extractAlternateFeeds(initialText, input);
    for (const feedUrl of alternateFeeds) {
        const xml = await fetchText(feedUrl, {
            accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        });
        const feed = parseXmlFeed(xml);
        if (feed) return { ...feed, feedUrl };
    }

    const metadata = extractPageMetadata(initialText);
    const appleFeedUrl = await findApplePodcastFeed(metadata);
    if (appleFeedUrl) {
        const xml = await fetchText(appleFeedUrl, {
            accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        });
        const feed = parseXmlFeed(xml);
        if (feed) return { ...feed, feedUrl: appleFeedUrl, title: feed.title || metadata.title };
    }

    return null;
};

const extensionFromUrl = (url) => {
    try {
        const ext = path.extname(new URL(url).pathname).replace(/^\./, "").toLowerCase();
        if (ext) return ext === "mp4" ? "m4a" : ext;
    } catch {
        // ignore
    }
    return AUDIO_EXT_RE.test(url) ? "m4a" : "mp3";
};

export const buildPodcastExpandResult = async (inputUrl) => {
    const feed = await resolvePodcastFeed(inputUrl);
    if (!feed?.items?.length) return null;

    const collectionId = createHash("sha1")
        .update(feed.feedUrl || inputUrl)
        .digest("base64url")
        .slice(0, 24);

    return {
        service: "podcast",
        kind: "podcast-feed",
        collectionKey: `podcast:feed:${collectionId}`,
        title: feed.title,
        items: feed.items.map((item) => ({
            itemKey: item.itemKey,
            url: encodePodcastEpisodeUrl(item),
            title: item.title,
            duration: item.duration,
        })),
    };
};

export const buildPodcastEpisodeResult = (patternMatch) => {
    const episode = decodePodcastEpisodeData(patternMatch?.data);
    if (!episode) return { error: "link.unsupported" };

    const extension = extensionFromUrl(episode.url);
    const title = episode.title || episode.feedTitle || "Podcast episode";

    return {
        urls: episode.url,
        cover: episode.cover,
        duration: episode.duration,
        filenameAttributes: {
            service: "podcast",
            id: episode.id || "episode",
            title,
            extension,
        },
        audioFilename: title,
        fileMetadata: {
            title,
            album: episode.feedTitle,
        },
        bestAudio: extension,
        isAudioOnly: true,
    };
};
