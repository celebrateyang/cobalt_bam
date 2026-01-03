import { genericUserAgent } from "../config.js";
import { getRedirectingURL } from "../misc/utils.js";

const DEFAULT_TIMEOUT_MS = 15000;

const BILIBILI_HEADERS = Object.freeze({
    "user-agent": genericUserAgent,
    referer: "https://www.bilibili.com/",
    accept: "application/json, text/plain, */*",
});

// Mobile UA is required for Douyin share pages + mix API to work without X-Bogus.
// Verified working as of Dec 2025.
const DOUYIN_MOBILE_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

const isBilibiliHost = (hostname) => {
    return (
        hostname === "b23.tv" ||
        hostname.endsWith(".bilibili.com") ||
        hostname === "bilibili.com" ||
        hostname.endsWith(".bilibili.tv") ||
        hostname === "bilibili.tv"
    );
};

const isDouyinHost = (hostname) => {
    return (
        hostname === "v.douyin.com" ||
        hostname === "douyin.com" ||
        hostname.endsWith(".douyin.com") ||
        hostname === "iesdouyin.com" ||
        hostname.endsWith(".iesdouyin.com")
    );
};

const isTikTokHost = (hostname) => {
    return hostname === "tiktok.com" || hostname.endsWith(".tiktok.com");
};

const uniqBy = (items, keyFn) => {
    const seen = new Set();
    const result = [];
    for (const item of items) {
        const key = keyFn(item);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(item);
    }
    return result;
};

const buildCollectionKey = (service, kind, id) => {
    if (!service || !kind || !id) return;
    return `${service}:${kind}:${id}`;
};

const toStringId = (value) => {
    if (value == null) return;
    const id = String(value);
    return id ? id : undefined;
};

const toSeconds = (value) =>
    typeof value === "number" && Number.isFinite(value)
        ? Math.round(value)
        : undefined;

const toSecondsMaybeMs = (value) =>
    typeof value === "number" && Number.isFinite(value)
        ? value > 1000
            ? Math.round(value / 1000)
            : Math.round(value)
        : undefined;

const resolveFinalURL = async (inputUrl, maxHops = 5) => {
    let current = inputUrl;

    for (let hop = 0; hop < maxHops; hop++) {
        const next = await getRedirectingURL(current, undefined, {
            "user-agent": genericUserAgent,
        });
        if (!next) break;

        try {
            const resolved = new URL(next, current);
            // Prevent redirect chains from leaving the expected service domains.
            if (!isBilibiliHost(resolved.hostname)) {
                break;
            }
            current = resolved.toString();
        } catch {
            break;
        }
    }

    return current;
};

const TIKTOK_APP_ID = "1180";
const TIKTOK_HEADERS = Object.freeze({
    "user-agent": genericUserAgent,
    referer: "https://www.tiktok.com/",
    accept: "application/json, text/plain, */*",
});

const extractTikTokVideoId = (urlString) => {
    if (!urlString) return;

    let url;
    try {
        url = new URL(urlString);
    } catch {
        return;
    }

    const path = url.pathname;

    const match =
        path.match(/\/video\/(\d+)/) ||
        path.match(/\/photo\/(\d+)/) ||
        path.match(/^\/i18n\/share\/video\/(\d+)/) ||
        path.match(/^\/v\/(\d+)\.html$/);

    if (match?.[1]) return match[1];
};

const extractTikTokPlaylistId = (urlString) => {
    if (!urlString) return;

    let url;
    try {
        url = new URL(urlString);
    } catch {
        return;
    }

    const match = url.pathname.match(/\/playlist\/[^/]*?(\d{6,})\/?$/);
    if (match?.[1]) return match[1];
};

const resolveTikTokShortLink = async (urlString) => {
    try {
        const res = await fetch(urlString, {
            redirect: "manual",
            headers: {
                "user-agent": genericUserAgent.split(" Chrome/1")[0],
            },
            signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        });

        const location = res.headers.get("location");
        if (location) {
            try {
                return new URL(location, urlString).toString();
            } catch {
                return location;
            }
        }

        const html = await res.text();
        if (html?.startsWith('<a href=\"https://')) {
            return html.split('<a href=\"')[1].split('?')[0];
        }
    } catch {
        // ignore
    }
};

const extractTikTokUniversalData = (html) => {
    const marker =
        '<script id=\"__UNIVERSAL_DATA_FOR_REHYDRATION__\" type=\"application/json\">';

    const start = html.indexOf(marker);
    if (start < 0) return null;

    const end = html.indexOf("</script>", start);
    if (end < 0) return null;

    try {
        const json = html.slice(start + marker.length, end);
        return JSON.parse(json);
    } catch {
        return null;
    }
};

const fetchTikTokVideoDetail = async (postId) => {
    const url = `https://www.tiktok.com/@i/video/${postId}`;

    const html = await fetch(url, {
        headers: {
            "user-agent": genericUserAgent,
        },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })
        .then((r) => (r.ok ? r.text() : null))
        .catch(() => null);

    if (!html) return null;

    const data = extractTikTokUniversalData(html);
    const videoDetail = data?.__DEFAULT_SCOPE__?.["webapp.video-detail"];
    if (!videoDetail) return null;

    if (videoDetail.statusMsg) {
        return { error: "content.post.unavailable" };
    }

    const item = videoDetail?.itemInfo?.itemStruct;
    if (item?.isContentClassified) {
        return { error: "content.post.age" };
    }

    return { item };
};

const fetchTikTokPlaylistItems = async (playlistId) => {
    const items = [];
    let cursor = 0;

    for (let page = 0; page < 200; page++) {
        const url = new URL("https://www.tiktok.com/api/reflow/playlist/item_list/");
        url.searchParams.set("app_id", TIKTOK_APP_ID);
        url.searchParams.set("playlist_id", String(playlistId));
        url.searchParams.set("cursor", String(cursor));
        url.searchParams.set("count", "30");

        const json = await fetch(url, {
            headers: TIKTOK_HEADERS,
            signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        })
            .then((r) => r.json())
            .catch(() => null);

        if (!json || json.status_code !== 0) {
            break;
        }

        const list = Array.isArray(json.item_list) ? json.item_list : [];

        for (const entry of list) {
            const basic = entry?.item_basic;
            const id = basic?.id ? String(basic.id) : null;
            if (!id) continue;

            const creator = basic?.creator?.base?.unique_id;
            const isPhoto = !basic?.video?.video_play_info && !!basic?.image_post;
            const pathType = isPhoto ? "photo" : "video";

            const itemUrl = creator
                ? `https://www.tiktok.com/@${creator}/${pathType}/${id}`
                : `https://www.tiktok.com/@i/${pathType}/${id}`;

            items.push({
                itemKey: `tiktok:post:${id}`,
                url: itemUrl,
                title: basic?.desc,
                duration: toSeconds(basic?.video?.video_play_info?.duration),
            });
        }

        const hasMore = json.has_more === true || json.has_more === 1;
        if (!hasMore) break;

        const nextCursor =
            typeof json.cursor === "number" && Number.isFinite(json.cursor)
                ? json.cursor
                : null;

        if (nextCursor == null || nextCursor === cursor) {
            break;
        }

        cursor = nextCursor;
    }

    return uniqBy(items, (i) => i.url);
};

const resolveDouyinShortLink = async (shortLink) => {
    const url = `https://v.douyin.com/${shortLink}/`;

    const res = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        headers: {
            "user-agent": DOUYIN_MOBILE_UA,
        },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    return res.url;
};

const extractDouyinVideoId = (urlString) => {
    if (!urlString) return;

    let url;
    try {
        url = new URL(urlString);
    } catch {
        return;
    }

    const path = url.pathname;

    const match =
        path.match(/^\/(?:video|note)\/(\d+)/) ||
        path.match(/^\/share\/(?:video|note)\/(\d+)/);

    if (match?.[1]) return match[1];

    const mid = url.searchParams.get("mid");
    if (mid) return mid;
};

const parseDouyinShareData = (html) => {
    try {
        const router = html.match(
            /window\._ROUTER_DATA\s*=\s*(.*?)(?=<\/script>)/s,
        );
        if (router?.[1]) {
            return JSON.parse(router[1].trim());
        }

        const render = html.match(
            /window\._RENDER_DATA\s*=\s*(.*?)(?=<\/script>)/s,
        );
        if (render?.[1]) {
            return JSON.parse(decodeURIComponent(render[1].trim()));
        }
    } catch {
        // ignore
    }

    return null;
};

const fetchDouyinMixItems = async (mixId) => {
    const items = [];
    let cursor = 0;

    for (let page = 0; page < 100; page++) {
        const url = new URL("https://m.douyin.com/aweme/v1/mix/aweme/");
        url.searchParams.set("mix_id", String(mixId));
        url.searchParams.set("cursor", String(cursor));
        url.searchParams.set("count", "20");
        url.searchParams.set("device_type", "");
        url.searchParams.set("device_platform", "web");
        url.searchParams.set("version_code", "280500");
        url.searchParams.set("version_name", "28.5.0");
        url.searchParams.set("aid", "1128");

        const json = await fetch(url, {
            headers: {
                "user-agent": DOUYIN_MOBILE_UA,
                referer: "https://m.douyin.com/",
                accept: "application/json, text/plain, */*",
            },
            signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        })
            .then((r) => r.json())
            .catch(() => null);

        if (!json || json.status_code !== 0) {
            break;
        }

        const list = Array.isArray(json.aweme_list) ? json.aweme_list : [];
        for (const aweme of list) {
            const awemeId = aweme?.aweme_id ? String(aweme.aweme_id) : null;
            if (!awemeId) continue;

            items.push({
                itemKey: `douyin:video:${awemeId}`,
                url: `https://www.douyin.com/video/${awemeId}`,
                title: aweme?.desc,
                duration: toSecondsMaybeMs(aweme?.video?.duration ?? aweme?.duration),
            });
        }

        if (json.has_more !== 1) {
            break;
        }

        const nextCursor =
            typeof json.cursor === "number" && Number.isFinite(json.cursor)
                ? json.cursor
                : null;

        if (nextCursor == null || nextCursor === cursor) {
            break;
        }

        cursor = nextCursor;
    }

    return uniqBy(items, (i) => i.url);
};

const fetchDouyinMixTitle = async (mixId) => {
    const url = new URL("https://m.douyin.com/aweme/v1/mix/detail/");
    url.searchParams.set("mix_id", String(mixId));
    url.searchParams.set("aid", "1128");
    url.searchParams.set("device_platform", "web");
    url.searchParams.set("version_code", "280500");
    url.searchParams.set("version_name", "28.5.0");

    const json = await fetch(url, {
        headers: {
            "user-agent": DOUYIN_MOBILE_UA,
            referer: "https://m.douyin.com/",
            accept: "application/json, text/plain, */*",
        },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })
        .then((r) => r.json())
        .catch(() => null);

    if (!json || json.status_code !== 0) return;
    return json?.mix_info?.mix_name;
};

const bilibiliView = async ({ id }) => {
    const viewUrl = new URL("https://api.bilibili.com/x/web-interface/view");

    const lowered = String(id).toLowerCase();
    if (lowered.startsWith("bv")) {
        viewUrl.searchParams.set("bvid", id);
    } else if (lowered.startsWith("av")) {
        viewUrl.searchParams.set("aid", String(id).slice(2));
    } else if (/^\d+$/.test(String(id))) {
        viewUrl.searchParams.set("aid", String(id));
    } else {
        viewUrl.searchParams.set("bvid", id);
    }

    return fetch(viewUrl, { headers: BILIBILI_HEADERS })
        .then((r) => r.json())
        .catch(() => null);
};

const bilibiliUgcSeasonFromView = (data) => {
    const season = data?.ugc_season;
    if (!season?.sections?.length) return;

    const seasonId = toStringId(season?.id);
    const episodes = season.sections.flatMap((section) => section?.episodes ?? []);
    const items = episodes
        .map((ep) => {
            // Bilibili can return arc.duration for the entire multi-page video, while the
            // actual /video/:bvid download without ?p= will fetch the first page only.
            // Prefer the first page duration when available.
            const duration = toSeconds(
                ep?.page?.duration ?? ep?.duration ?? ep?.arc?.duration,
            );
            return {
                itemKey: ep?.bvid ? `bilibili:video:${ep.bvid}` : undefined,
                url: ep?.bvid
                    ? `https://www.bilibili.com/video/${ep.bvid}`
                    : undefined,
                title: ep?.title || ep?.arc?.title,
                duration,
            };
        })
        .filter((item) => item.url);

    if (items.length <= 1) return;

    return {
        service: "bilibili",
        kind: "bilibili-ugc-season",
        collectionKey: seasonId
            ? buildCollectionKey("bilibili", "ugc-season", seasonId)
            : undefined,
        title: season.title,
        items: uniqBy(items, (i) => i.url),
    };
};

const bilibiliMultiPageFromView = (data) => {
    const pages = data?.pages;
    const bvid = data?.bvid;

    if (!bvid || !Array.isArray(pages) || pages.length <= 1) return;

    const bvidString = toStringId(bvid);
    const items = pages
        .map((page) => ({
            itemKey:
                typeof page?.page === "number" && bvidString
                    ? `bilibili:video:${bvidString}:p=${page.page}`
                    : undefined,
            url:
                typeof page?.page === "number"
                    ? `https://www.bilibili.com/video/${bvid}?p=${page.page}`
                    : undefined,
            title: page?.part,
            duration: toSeconds(page?.duration),
        }))
        .filter((item) => item.url);

    if (items.length <= 1) return;

    return {
        service: "bilibili",
        kind: "bilibili-multi-page",
        collectionKey: bvidString
            ? buildCollectionKey("bilibili", "multi-page", bvidString)
            : undefined,
        title: data?.title,
        items: uniqBy(items, (i) => i.url),
    };
};

const bilibiliUgcSeasonFromSpace = async ({ mid, seasonId }) => {
    const pageSize = 30;

    const allArchives = [];
    let pageNum = 1;
    let total = Infinity;

    while ((pageNum - 1) * pageSize < total && pageNum < 200) {
        const url = new URL(
            "https://api.bilibili.com/x/polymer/web-space/seasons_archives_list"
        );
        url.searchParams.set("mid", String(mid));
        url.searchParams.set("season_id", String(seasonId));
        url.searchParams.set("page_num", String(pageNum));
        url.searchParams.set("page_size", String(pageSize));

        const json = await fetch(url, {
            headers: {
                ...BILIBILI_HEADERS,
                referer: `https://space.bilibili.com/${mid}`,
            },
        })
            .then((r) => r.json())
            .catch(() => null);

        if (!json?.data || json?.code !== 0) break;

        const meta = json.data.meta;
        const archives = json.data.archives ?? [];
        const page = json.data.page;

        total = page?.total ?? meta?.total ?? total;

        for (const a of archives) {
            if (!a?.bvid) continue;
            allArchives.push({
                itemKey: `bilibili:video:${a.bvid}`,
                url: `https://www.bilibili.com/video/${a.bvid}`,
                title: a.title,
                duration: toSeconds(a?.duration),
            });
        }

        if (!archives.length) break;
        pageNum += 1;
    }

    const items = uniqBy(allArchives, (i) => i.url);

    if (items.length <= 1) return;

    // Fetch meta from the first page (already done) is best effort; if missing, we still return items.
    const metaUrl = new URL(
        "https://api.bilibili.com/x/polymer/web-space/seasons_archives_list"
    );
    metaUrl.searchParams.set("mid", String(mid));
    metaUrl.searchParams.set("season_id", String(seasonId));
    metaUrl.searchParams.set("page_num", "1");
    metaUrl.searchParams.set("page_size", "1");

    const metaJson = await fetch(metaUrl, {
        headers: {
            ...BILIBILI_HEADERS,
            referer: `https://space.bilibili.com/${mid}`,
        },
    })
        .then((r) => r.json())
        .catch(() => null);

    const title = metaJson?.data?.meta?.name || metaJson?.data?.meta?.title;

    return {
        service: "bilibili",
        kind: "bilibili-ugc-season",
        collectionKey: seasonId
            ? buildCollectionKey("bilibili", "ugc-season", String(seasonId))
            : undefined,
        title,
        items,
    };
};

const expandBilibili = async (inputUrl) => {
    const finalUrlString = await resolveFinalURL(inputUrl);

    let url;
    try {
        url = new URL(finalUrlString);
    } catch {
        return {
            service: "bilibili",
            kind: "single",
            items: [{ url: inputUrl }],
        };
    }

    // /video/:id
    const videoMatch = url.pathname.match(/^\/video\/([^/]+)\/?$/);
    if (videoMatch) {
        const id = videoMatch[1];
        const view = await bilibiliView({ id });
        const data = view?.code === 0 ? view?.data : null;

        if (data) {
            const season = bilibiliUgcSeasonFromView(data);
            if (season) return season;

            const multi = bilibiliMultiPageFromView(data);
            if (multi) return multi;

            const canonicalBvid = data?.bvid || id;
            return {
                service: "bilibili",
                kind: "single",
                title: data?.title,
                items: [
                    {
                        url: `https://www.bilibili.com/video/${canonicalBvid}`,
                        duration: toSeconds(data?.duration),
                    },
                ],
            };
        }

        return {
            service: "bilibili",
            kind: "single",
            items: [{ url: finalUrlString }],
        };
    }

    // space.bilibili.com/:mid/channel/collectiondetail?sid=:sid
    if (url.hostname === "space.bilibili.com") {
        const parts = url.pathname.split("/").filter(Boolean);
        const mid = parts?.[0];
        const channelPage = parts?.slice(1).join("/") || "";
        const sid = url.searchParams.get("sid");

        if (mid && sid && channelPage === "channel/collectiondetail") {
            const season = await bilibiliUgcSeasonFromSpace({
                mid,
                seasonId: sid,
            });
            if (season) return season;
        }
    }

    return {
        service: "bilibili",
        kind: "single",
        items: [{ url: finalUrlString }],
    };
};

const expandDouyin = async (inputUrl) => {
    let url;
    try {
        url = new URL(inputUrl);
    } catch {
        return {
            service: "douyin",
            kind: "single",
            items: [{ url: inputUrl }],
        };
    }

    // Explicit mix detail URLs can be expanded directly.
    const mixMatch = url.pathname.match(/^\/share\/mix\/detail\/(\d+)\/?$/);
    if (mixMatch?.[1]) {
        const mixId = mixMatch[1];
        const [title, items] = await Promise.all([
            fetchDouyinMixTitle(mixId),
            fetchDouyinMixItems(mixId),
        ]);

        if (items.length > 1) {
            return {
                service: "douyin",
                kind: "douyin-mix",
                collectionKey: buildCollectionKey("douyin", "mix", mixId),
                title,
                items,
            };
        }

        return {
            service: "douyin",
            kind: "single",
            items: [{ url: inputUrl }],
        };
    }

    let videoId = extractDouyinVideoId(inputUrl);

    if (!videoId && url.hostname === "v.douyin.com") {
        const parts = url.pathname.split("/").filter(Boolean);
        const shortLink = parts?.[0];
        if (shortLink) {
            const finalUrl = await resolveDouyinShortLink(shortLink);
            videoId = extractDouyinVideoId(finalUrl);
        }
    } else if (!videoId && url.pathname.startsWith("/_shortLink/")) {
        const parts = url.pathname.split("/").filter(Boolean);
        const shortLink = parts?.[1];
        if (shortLink) {
            const finalUrl = await resolveDouyinShortLink(shortLink);
            videoId = extractDouyinVideoId(finalUrl);
        }
    }

    if (!videoId) {
        return {
            service: "douyin",
            kind: "single",
            items: [{ url: inputUrl }],
        };
    }

    const shareUrl = `https://www.iesdouyin.com/share/video/${videoId}`;
    const html = await fetch(shareUrl, {
        headers: { "user-agent": DOUYIN_MOBILE_UA },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })
        .then((r) => (r.ok ? r.text() : null))
        .catch(() => null);

    if (!html) {
        return {
            service: "douyin",
            kind: "single",
            items: [{ url: inputUrl }],
        };
    }

    const data = parseDouyinShareData(html);
    const loaderData = data?.loaderData;

    if (!loaderData) {
        return {
            service: "douyin",
            kind: "single",
            items: [{ url: inputUrl }],
        };
    }

    const videoPageKey = Object.keys(loaderData).find(
        (k) => k.includes("video_") && k.includes("/page"),
    );

    const item =
        videoPageKey && loaderData[videoPageKey]?.videoInfoRes?.item_list
            ? loaderData[videoPageKey].videoInfoRes.item_list[0]
            : null;

    const canonicalUrl = `https://www.douyin.com/video/${videoId}`;

    if (!item) {
        return {
            service: "douyin",
            kind: "single",
            items: [{ url: canonicalUrl }],
        };
    }

    const mixId = item?.mix_info?.mix_id;
    if (!mixId) {
        return {
            service: "douyin",
            kind: "single",
            title: item?.desc,
            items: [
                {
                    url: canonicalUrl,
                    title: item?.desc,
                    duration: toSecondsMaybeMs(
                        item?.video?.duration ?? item?.duration,
                    ),
                },
            ],
        };
    }

    const expandedItems = await fetchDouyinMixItems(mixId);

    if (expandedItems.length <= 1) {
        return {
            service: "douyin",
            kind: "single",
            title: item?.desc,
            items: [{ url: canonicalUrl }],
        };
    }

    return {
        service: "douyin",
        kind: "douyin-mix",
        collectionKey: buildCollectionKey("douyin", "mix", String(mixId)),
        title: item?.mix_info?.mix_name,
        items: expandedItems,
    };
};

const expandTikTok = async (inputUrl) => {
    const playlistIdFromUrl = extractTikTokPlaylistId(inputUrl);
    if (playlistIdFromUrl) {
        const items = await fetchTikTokPlaylistItems(playlistIdFromUrl);
        if (items.length > 1) {
            let title;
            try {
                const firstUrl = items[0]?.url ? new URL(items[0].url) : null;
                const match = firstUrl?.pathname?.match(/^\/@([^/]+)\//);
                if (match?.[1]) title = `@${match[1]} playlist`;
            } catch {
                // ignore
            }

            return {
                service: "tiktok",
                kind: "tiktok-playlist",
                collectionKey: buildCollectionKey(
                    "tiktok",
                    "playlist",
                    String(playlistIdFromUrl),
                ),
                title,
                items,
            };
        }

        return {
            service: "tiktok",
            kind: "single",
            items: [{ url: inputUrl }],
        };
    }

    let postId = extractTikTokVideoId(inputUrl);

    if (!postId) {
        // Attempt resolving short-link style URLs (vt/vm/t) into a canonical video link.
        const resolved = await resolveTikTokShortLink(inputUrl);
        if (resolved) {
            postId = extractTikTokVideoId(resolved);
        }
    }

    if (!postId) {
        return {
            service: "tiktok",
            kind: "single",
            items: [{ url: inputUrl }],
        };
    }

    const detail = await fetchTikTokVideoDetail(postId);
    if (detail?.error) {
        return {
            service: "tiktok",
            kind: "single",
            items: [{ url: inputUrl }],
        };
    }

    const item = detail?.item;
    const authorId = item?.author?.uniqueId;
    const canonicalUrl = authorId
        ? `https://www.tiktok.com/@${authorId}/video/${postId}`
        : `https://www.tiktok.com/@i/video/${postId}`;

    const playlistId = item?.playlistId;
    if (!playlistId) {
        return {
            service: "tiktok",
            kind: "single",
            title: item?.desc,
            items: [
                {
                    url: canonicalUrl,
                    title: item?.desc,
                    duration: toSeconds(item?.video?.duration ?? item?.music?.duration),
                },
            ],
        };
    }

    const playlistItems = await fetchTikTokPlaylistItems(playlistId);

    if (playlistItems.length <= 1) {
        return {
            service: "tiktok",
            kind: "single",
            title: item?.desc,
            items: [{ url: canonicalUrl }],
        };
    }

    return {
        service: "tiktok",
        kind: "tiktok-playlist",
        collectionKey: buildCollectionKey("tiktok", "playlist", String(playlistId)),
        title: authorId ? `@${authorId} playlist` : undefined,
        items: playlistItems,
    };
};

export const expandURL = async (url) => {
    const input = String(url || "");
    let parsed;
    try {
        parsed = new URL(input);
    } catch {
        return {
            service: undefined,
            kind: "single",
            items: [],
        };
    }

    if (isBilibiliHost(parsed.hostname)) {
        return expandBilibili(input);
    }

    if (isDouyinHost(parsed.hostname)) {
        return expandDouyin(input);
    }

    if (isTikTokHost(parsed.hostname)) {
        return expandTikTok(input);
    }

    return {
        service: undefined,
        kind: "single",
        items: [{ url: input }],
    };
};
