import { genericUserAgent } from "../config.js";
import { getRedirectingURL } from "../misc/utils.js";

const BILIBILI_HEADERS = Object.freeze({
    "user-agent": genericUserAgent,
    referer: "https://www.bilibili.com/",
    accept: "application/json, text/plain, */*",
});

const isBilibiliHost = (hostname) => {
    return (
        hostname === "b23.tv" ||
        hostname.endsWith(".bilibili.com") ||
        hostname === "bilibili.com" ||
        hostname.endsWith(".bilibili.tv") ||
        hostname === "bilibili.tv"
    );
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

const toSeconds = (value) =>
    typeof value === "number" && Number.isFinite(value)
        ? Math.round(value)
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

    const episodes = season.sections.flatMap((section) => section?.episodes ?? []);
    const items = episodes
        .map((ep) => {
            const duration = toSeconds(ep?.duration ?? ep?.arc?.duration);
            return {
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
        title: season.title,
        items: uniqBy(items, (i) => i.url),
    };
};

const bilibiliMultiPageFromView = (data) => {
    const pages = data?.pages;
    const bvid = data?.bvid;

    if (!bvid || !Array.isArray(pages) || pages.length <= 1) return;

    const items = pages
        .map((page) => ({
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

    if (!isBilibiliHost(parsed.hostname)) {
        return {
            service: undefined,
            kind: "single",
            items: [{ url: input }],
        };
    }

    return expandBilibili(input);
};
