import { createStream } from "../../stream/manage.js";

const THREADS_APP_ID = "238260118697367";
const THREADS_DOC_ID = "27551653811086797";
const THREADS_MOBILE_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const THREADS_PROVIDER_VARIABLES = [
    "BarcelonaHasInlineReplyComposer",
    "BarcelonaHasDearAlgoConsumption",
    "BarcelonaIsLoggedIn",
    "BarcelonaHasEventBadge",
    "BarcelonaGenAIRepliesEnabled",
    "BarcelonaIsSearchDiscoveryEnabled",
    "BarcelonaHasCommunities",
    "BarcelonaHasGameScoreShare",
    "BarcelonaHasPublicViewCountCard",
    "BarcelonaHasCommunityEntityCard",
    "BarcelonaHasScorecardCommunity",
    "BarcelonaHasMusic",
    "BarcelonaHasNewspaperLinkStyle",
    "BarcelonaHasMessaging",
    "BarcelonaHasViewerReplied",
    "BarcelonaHasGhostPostEmojiActivation",
    "BarcelonaOptionalCookiesEnabled",
    "BarcelonaHasDearAlgoWebProduction",
    "BarcelonaHasWebFavicons",
    "BarcelonaIsCrawler",
    "BarcelonaHasCommunityTopContributors",
    "BarcelonaCanSeeSponsoredContent",
    "BarcelonaShouldShowFediverseM075Features",
    "BarcelonaIsInternalUser",
];

const getObjectFromEntries = (name, data) => {
    const obj = data?.match(new RegExp('\\["' + name + '",.*?,({.*?}),\\d+\\]'))?.[1];
    return obj && JSON.parse(obj);
};

const jazoest = (token = "") =>
    "2" + [...String(token)].reduce((sum, char) => sum + char.charCodeAt(0), 0);

const firstValue = (value) => Array.isArray(value) ? value[0] : value;

const bestVideo = (versions = []) => {
    if (!Array.isArray(versions) || !versions.length) return;

    return versions
        .filter(item => item?.url)
        .reduce((best, item) => {
            if (!best) return item;
            const itemScore = (item.width || 0) * (item.height || 0);
            const bestScore = (best.width || 0) * (best.height || 0);
            return itemScore > bestScore ? item : best;
        }, null);
};

const bestImage = (imageVersions) => {
    const candidates = imageVersions?.candidates;
    if (!Array.isArray(candidates) || !candidates.length) return;

    return candidates.reduce((best, item) => {
        if (!best) return item;
        const itemScore = (item.width || 0) * (item.height || 0);
        const bestScore = (best.width || 0) * (best.height || 0);
        return itemScore > bestScore ? item : best;
    }, null);
};

const toSecondsMaybeMs = (value) => {
    const n = typeof value === "string" ? Number(value) : value;
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return;
    return n > 1000 ? n / 1000 : n;
};

const flattenMedia = (media) => {
    if (!media) return [];

    const threadItem = firstValue(media.thread_items);
    const post = threadItem?.post || media;
    const carousel = post.carousel_media;
    if (Array.isArray(carousel) && carousel.length) {
        return carousel;
    }

    return [post];
};

const extractMedia = (media, postId, alwaysProxy) => {
    const items = flattenMedia(media);
    const picker = items.map((item, i) => {
        const video = bestVideo(item?.video_versions);
        const image = bestImage(item?.image_versions2);
        const type = video?.url ? "video" : "photo";
        const url = video?.url || image?.url;
        if (!url) return null;

        const ext = type === "video" ? "mp4" : "jpg";
        const filename = `threads_${postId}_${i + 1}.${ext}`;

        return {
            type,
            rawUrl: url,
            url: alwaysProxy
                ? createStream({ service: "threads", type: "proxy", url, filename })
                : url,
            thumb: image?.url
                ? createStream({
                    service: "threads",
                    type: "proxy",
                    url: image.url,
                    filename: `threads_${postId}_${i + 1}.jpg`,
                })
                : undefined,
        };
    }).filter(Boolean);

    if (picker.length > 1) {
        const duration = items.reduce((acc, item) => {
            const seconds = toSecondsMaybeMs(item?.video_duration);
            return seconds ? acc + seconds : acc;
        }, 0);

        return {
            picker: picker.map(({ rawUrl, ...item }) => item),
            duration: duration > 0 ? duration : undefined,
        };
    }

    const first = picker[0];
    if (!first) return;

    const firstItem = items[0];
    if (first.type === "video") {
        return {
            urls: first.rawUrl,
            filename: `threads_${postId}.mp4`,
            audioFilename: `threads_${postId}_audio`,
            duration: toSecondsMaybeMs(firstItem?.video_duration),
        };
    }

    return {
        urls: first.rawUrl,
        isPhoto: true,
        filename: `threads_${postId}.jpg`,
    };
};

export default async function threads({ username, postId, alwaysProxy, dispatcher }) {
    const path = username
        ? `/@${encodeURIComponent(username)}/post/${encodeURIComponent(postId)}`
        : `/t/${encodeURIComponent(postId)}`;
    const pageUrl = new URL(path, "https://www.threads.com");
    pageUrl.searchParams.set("__comet_req", "122");

    const pageRes = await fetch(pageUrl, {
        dispatcher,
        headers: {
            "user-agent": THREADS_MOBILE_UA,
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.9",
        },
    }).catch(() => null);

    const html = await pageRes?.text().catch(() => "");
    if (!html) return { error: "fetch.fail" };

    const numericPostId = html.match(/"post_id":"(\d+)"/)?.[1];
    const siteData = getObjectFromEntries("SiteData", html);
    const lsd = getObjectFromEntries("LSD", html)?.token;
    if (!numericPostId || !siteData || !lsd) return { error: "fetch.empty" };

    const variables = { postID: numericPostId };
    for (const name of THREADS_PROVIDER_VARIABLES) {
        variables[`__relay_internal__pv__${name}relayprovider`] = false;
    }

    const req = await fetch("https://www.threads.com/api/graphql/", {
        method: "POST",
        dispatcher,
        headers: {
            "user-agent": THREADS_MOBILE_UA,
            "content-type": "application/x-www-form-urlencoded",
            "accept": "application/json",
            "origin": "https://www.threads.com",
            "referer": pageUrl.toString(),
            "x-fb-lsd": lsd,
            "x-ig-app-id": THREADS_APP_ID,
        },
        body: new URLSearchParams({
            __user: "0",
            __a: "1",
            __req: "2",
            __hs: siteData.haste_session,
            dpr: "3",
            __ccg: "GOOD",
            __rev: String(siteData.__spin_r || siteData.client_revision || ""),
            __s: "::abcdef",
            __hsi: String(siteData.hsi || ""),
            __dyn: "",
            __csr: "",
            __comet_req: "122",
            lsd,
            jazoest: jazoest(lsd),
            __spin_r: String(siteData.__spin_r || ""),
            __spin_b: String(siteData.__spin_b || "trunk"),
            __spin_t: String(siteData.__spin_t || Math.floor(Date.now() / 1000)),
            __crn: "comet.barcelonawebloggedout.BarcelonaPermalinkMobilePostColumnRoute",
            fb_api_caller_class: "RelayModern",
            fb_api_req_friendly_name: "BarcelonaPermalinkMobilePostColumnPageQuery",
            variables: JSON.stringify(variables),
            server_timestamps: "true",
            doc_id: THREADS_DOC_ID,
        }),
    }).catch(() => null);

    const data = await req?.json().catch(() => null);
    if (!data || data.errors) return { error: "fetch.empty" };

    const result = extractMedia(data?.data?.media, numericPostId, alwaysProxy);
    return result || { error: "fetch.empty" };
}
