import { genericUserAgent } from "../../config.js";
import { upsertVideoFromSync, updateAccount } from "../../db/social-media.js";
import { getCookie } from "../cookie/manager.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RECENT_LIMIT = 5;
const DEFAULT_PINNED_LIMIT = 3;

const IG_APP_ID = "936619743392459";
const IG_MOBILE_UA =
    "Instagram 275.0.0.27.98 Android (33/13; 280dpi; 720x1423; Xiaomi; Redmi 7; onclite; qcom; en_US; 458229237)";

const safeJson = async (res) => {
    try {
        return await res.json();
    } catch {
        return null;
    }
};

const uniqBy = (items, keyFn) => {
    const seen = new Set();
    const result = [];
    for (const item of items) {
        const key = keyFn(item);
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(item);
    }
    return result;
};

const parseTikTokEmbedItems = (html, username) => {
    const items = [];
    const matcher = /https:\/\/www\.tiktok\.com\/@([^/"\s]+)\/(video|photo)\/(\d+)/g;

    for (const match of html.matchAll(matcher)) {
        const matchedUser = match?.[1];
        const type = match?.[2];
        const id = match?.[3];
        if (!matchedUser || !type || !id) continue;

        if (username && matchedUser.toLowerCase() !== username.toLowerCase()) {
            continue;
        }

        items.push({
            url: `https://www.tiktok.com/@${matchedUser}/${type}/${id}`,
            video_id: id,
        });
    }

    return uniqBy(items, (i) => i.url);
};

const fetchTikTokCreatorItems = async (username, options) => {
    const recentLimit =
        typeof options?.recentLimit === "number" && options.recentLimit > 0
            ? Math.floor(options.recentLimit)
            : DEFAULT_RECENT_LIMIT;
    const pinnedLimit =
        typeof options?.pinnedLimit === "number" && options.pinnedLimit > 0
            ? Math.floor(options.pinnedLimit)
            : DEFAULT_PINNED_LIMIT;

    const url = `https://www.tiktok.com/embed/@${encodeURIComponent(username)}`;
    const res = await fetch(url, {
        headers: {
            "user-agent": genericUserAgent,
            accept: "text/html",
        },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!res.ok) {
        throw new Error(`tiktok embed fetch failed (status ${res.status})`);
    }

    const html = await res.text();
    const parsed = parseTikTokEmbedItems(html, username);

    const limit = pinnedLimit + recentLimit;
    const selected = parsed.slice(0, limit);

    return selected.map((item, index) => {
        const isPinned = index < pinnedLimit;
        const pinnedOrder = isPinned ? pinnedLimit - index : 0;
        return {
            ...item,
            is_pinned: isPinned,
            pinned_order: pinnedOrder,
        };
    });
};

const fetchTikTokOembed = async (videoUrl) => {
    const oembedUrl = new URL("https://www.tiktok.com/oembed");
    oembedUrl.searchParams.set("url", videoUrl);

    const res = await fetch(oembedUrl, {
        headers: {
            "user-agent": genericUserAgent,
            accept: "application/json",
        },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!res.ok) return null;

    const json = await safeJson(res);
    if (!json) return null;

    return {
        title: typeof json.title === "string" ? json.title : undefined,
        thumbnail_url:
            typeof json.thumbnail_url === "string" ? json.thumbnail_url : undefined,
        author_name:
            typeof json.author_name === "string" ? json.author_name : undefined,
    };
};

const fetchInstagramProfileInfo = async (username, { cookie } = {}) => {
    const apiUrl = new URL("https://www.instagram.com/api/v1/users/web_profile_info/");
    apiUrl.searchParams.set("username", username);

    const res = await fetch(apiUrl, {
        headers: {
            "user-agent": genericUserAgent,
            accept: "application/json",
            "x-ig-app-id": IG_APP_ID,
            referer: `https://www.instagram.com/${username}/`,
            "sec-fetch-site": "same-origin",
            "sec-fetch-mode": "cors",
            "sec-fetch-dest": "empty",
            "x-requested-with": "XMLHttpRequest",
            ...(cookie ? { cookie } : {}),
        },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!res.ok) {
        throw new Error(`instagram profile fetch failed (status ${res.status})`);
    }

    const json = await safeJson(res);
    if (!json) {
        throw new Error("instagram profile fetch returned invalid json");
    }

    return json;
};

const fetchInstagramUserFeed = async (userId, { cookie, count } = {}) => {
    if (!userId) throw new Error("instagram feed fetch requires a user id");
    if (!cookie) throw new Error("instagram feed fetch requires cookies");

    const apiUrl = new URL(`https://i.instagram.com/api/v1/feed/user/${userId}/`);
    if (count) apiUrl.searchParams.set("count", String(count));

    const res = await fetch(apiUrl, {
        headers: {
            "x-ig-app-locale": "en_US",
            "x-ig-device-locale": "en_US",
            "x-ig-mapped-locale": "en_US",
            "user-agent": IG_MOBILE_UA,
            "accept-language": "en-US",
            accept: "application/json",
            "x-ig-app-id": IG_APP_ID,
            // Instagram blocks this endpoint without Sec-Fetch headers in some environments.
            "sec-fetch-site": "none",
            "sec-fetch-mode": "cors",
            "sec-fetch-dest": "empty",
            cookie,
        },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!res.ok) {
        throw new Error(`instagram feed fetch failed (status ${res.status})`);
    }

    const json = await safeJson(res);
    if (!json) {
        throw new Error("instagram feed fetch returned invalid json");
    }

    return json;
};

const parseInstagramUserFeedVideos = (feedJson, options) => {
    const recentLimit =
        typeof options?.recentLimit === "number" && options.recentLimit > 0
            ? Math.floor(options.recentLimit)
            : DEFAULT_RECENT_LIMIT;
    const pinnedLimit =
        typeof options?.pinnedLimit === "number" && options.pinnedLimit > 0
            ? Math.floor(options.pinnedLimit)
            : DEFAULT_PINNED_LIMIT;

    const pinnedIds = Array.isArray(feedJson?.pinned_profile_grid_items_ids)
        ? feedJson.pinned_profile_grid_items_ids.map((id) => String(id))
        : [];
    const pinnedSet = new Set(pinnedIds);

    const items = Array.isArray(feedJson?.items) ? feedJson.items : [];

    const candidates = items
        .filter((item) => item?.code)
        .filter((item) => {
            if (item?.media_type === 2) return true;
            if (item?.product_type === "clips") return true;
            if (Array.isArray(item?.video_versions) && item.video_versions.length > 0) return true;
            return false;
        })
        .map((item) => {
            const shortcode = String(item.code);
            const productType = item?.product_type;
            const isReel = productType === "clips";
            const path = isReel ? "reel" : "p";

            const thumbnailUrl =
                typeof item?.image_versions2?.candidates?.[0]?.url === "string"
                    ? item.image_versions2.candidates[0].url
                    : "";

            const caption = item?.caption?.text ?? null;
            const title = typeof caption === "string" ? caption.trim() : "";

            const takenAtSeconds =
                typeof item?.taken_at === "number" ? item.taken_at : Number.NaN;
            const publishDate = Number.isFinite(takenAtSeconds)
                ? takenAtSeconds * 1000
                : null;

            const pk = item?.pk != null ? String(item.pk) : "";
            const isPinned = pk && pinnedSet.has(pk);

            return {
                url: `https://www.instagram.com/${path}/${shortcode}/`,
                video_id: shortcode,
                thumbnail_url: thumbnailUrl,
                title,
                publish_date: publishDate,
                is_pinned: isPinned,
                pinned_order: 0,
            };
        });

    const pinned = candidates.filter((c) => c.is_pinned).slice(0, pinnedLimit);
    const pinnedUrls = new Set(pinned.map((p) => p.url));

    const recent = candidates
        .filter((c) => !pinnedUrls.has(c.url))
        .slice(0, recentLimit);

    const orderedPinned = pinned.map((item, index) => ({
        ...item,
        pinned_order: pinned.length - index,
    }));

    return uniqBy([...orderedPinned, ...recent], (i) => i.url);
};

const parseInstagramProfileVideos = (profileJson, options) => {
    const recentLimit =
        typeof options?.recentLimit === "number" && options.recentLimit > 0
            ? Math.floor(options.recentLimit)
            : DEFAULT_RECENT_LIMIT;

    const edges =
        profileJson?.data?.user?.edge_owner_to_timeline_media?.edges ?? [];

    const candidates = edges
        .map((edge) => edge?.node)
        .filter((node) => node?.shortcode && node?.is_video)
        .map((node) => {
            const shortcode = String(node.shortcode);
            const productType = node?.product_type;
            const isReel = productType === "clips";
            const path = isReel ? "reel" : "p";

            const pinnedForUsers = node?.pinned_for_users;
            const isPinned =
                Array.isArray(pinnedForUsers) && pinnedForUsers.length > 0;

            const thumbnailUrl =
                typeof node?.thumbnail_src === "string"
                    ? node.thumbnail_src
                    : typeof node?.display_url === "string"
                        ? node.display_url
                        : "";

            const caption =
                node?.edge_media_to_caption?.edges?.[0]?.node?.text ?? null;
            const title =
                typeof caption === "string" ? caption.trim() : "";

            const takenAtSeconds =
                typeof node?.taken_at_timestamp === "number"
                    ? node.taken_at_timestamp
                    : Number.NaN;
            const publishDate = Number.isFinite(takenAtSeconds)
                ? takenAtSeconds * 1000
                : null;

            return {
                url: `https://www.instagram.com/${path}/${shortcode}/`,
                video_id: shortcode,
                thumbnail_url: thumbnailUrl,
                title,
                publish_date: publishDate,
                is_pinned: isPinned,
                pinned_order: 0,
            };
        });

    const pinned = candidates.filter((c) => c.is_pinned);
    const pinnedUrls = new Set(pinned.map((p) => p.url));

    const recent = candidates
        .filter((c) => !pinnedUrls.has(c.url))
        .slice(0, recentLimit);

    // Keep pinned first, preserve order from API response.
    const orderedPinned = pinned.map((item, index) => ({
        ...item,
        pinned_order: pinned.length - index,
    }));

    return uniqBy([...orderedPinned, ...recent], (i) => i.url);
};

const fetchInstagramOembed = async (videoUrl) => {
    const oembedUrl = new URL("https://i.instagram.com/api/v1/oembed/");
    oembedUrl.searchParams.set("url", videoUrl);

    const res = await fetch(oembedUrl, {
        headers: {
            "user-agent": IG_MOBILE_UA,
            "accept-language": "en-US",
            accept: "application/json",
        },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!res.ok) return null;

    const json = await safeJson(res);
    if (!json) return null;

    return {
        title: typeof json.title === "string" ? json.title : undefined,
        thumbnail_url:
            typeof json.thumbnail_url === "string" ? json.thumbnail_url : undefined,
        author_name:
            typeof json.author_name === "string" ? json.author_name : undefined,
    };
};

const getItemsForAccount = async (account, options) => {
    if (account.platform === "tiktok") {
        return await fetchTikTokCreatorItems(account.username, options);
    }

    if (account.platform === "instagram") {
        const profile = await fetchInstagramProfileInfo(account.username);
        const profileItems = parseInstagramProfileVideos(profile, options);

        const timeline = profile?.data?.user?.edge_owner_to_timeline_media;
        const timelineEdgesLen = Array.isArray(timeline?.edges) ? timeline.edges.length : 0;
        const timelineCount = typeof timeline?.count === "number" ? timeline.count : null;
        const hasUser = Boolean(profile?.data?.user);

        const needsFallback =
            !hasUser || (timelineCount && timelineCount > 0 && timelineEdgesLen === 0);

        if (!needsFallback) return profileItems;

        const cookie = getCookie("instagram")?.toString();
        if (!cookie) return profileItems;

        const authedProfile = hasUser
            ? profile
            : await fetchInstagramProfileInfo(account.username, { cookie });

        const userId = authedProfile?.data?.user?.id;
        if (!userId) return profileItems;

        const recentLimit =
            typeof options?.recentLimit === "number" && options.recentLimit > 0
                ? Math.floor(options.recentLimit)
                : DEFAULT_RECENT_LIMIT;
        const pinnedLimit =
            typeof options?.pinnedLimit === "number" && options.pinnedLimit > 0
                ? Math.floor(options.pinnedLimit)
                : DEFAULT_PINNED_LIMIT;

        const feed = await fetchInstagramUserFeed(userId, {
            cookie,
            count: pinnedLimit + recentLimit,
        });

        const feedItems = parseInstagramUserFeedVideos(feed, options);
        return feedItems.length > 0 ? feedItems : profileItems;
    }

    throw new Error(`unsupported platform: ${account.platform}`);
};

export const fetchOembedForAccount = async (account, url) => {
    if (account.platform === "tiktok") {
        return await fetchTikTokOembed(url);
    }
    if (account.platform === "instagram") {
        // Instagram's oembed endpoints frequently return 403 ("Private media")
        // even for public content. We rely on profile JSON for thumbnails.
        return null;
    }
    return null;
};

export const syncAccountVideos = async (account, options) => {
    const startedAt = Date.now();

    if (!account?.id || !account?.platform || !account?.username) {
        throw new Error("syncAccountVideos requires a social_accounts row");
    }

    const items = await getItemsForAccount(account, options);
    const upserts = [];

    for (const item of items) {
        const meta = await fetchOembedForAccount(account, item.url).catch(() => null);

        const title = meta?.title ?? item?.title ?? "";
        const thumbnailUrl = meta?.thumbnail_url ?? item?.thumbnail_url ?? "";
        const publishDate = item?.publish_date ?? null;

        const result = await upsertVideoFromSync({
            account_id: account.id,
            platform: account.platform,
            video_id: item.video_id,
            title,
            description: "",
            video_url: item.url,
            thumbnail_url: thumbnailUrl,
            duration: null,
            view_count: 0,
            like_count: 0,
            publish_date: publishDate,
            tags: [],
            is_featured: false,
            is_active: true,
            display_order: 0,
            source: "sync",
            is_pinned: item.is_pinned,
            pinned_order: item.pinned_order,
            synced_at: startedAt,
        });

        upserts.push(result);
    }

    const summary = upserts.reduce(
        (acc, cur) => {
            acc.total += 1;
            if (cur.action === "created") acc.created += 1;
            if (cur.action === "updated") acc.updated += 1;
            return acc;
        },
        { total: 0, created: 0, updated: 0 },
    );

    await updateAccount(account.id, {
        sync_last_run_at: startedAt,
        sync_error: null,
    });

    return {
        ...summary,
        started_at: startedAt,
        finished_at: Date.now(),
    };
};

