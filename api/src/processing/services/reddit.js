import { resolveRedirectingURL } from "../url.js";
import { genericUserAgent, env } from "../../config.js";
import { getCookie, updateCookieValues } from "../cookie/manager.js";

const redditVideoUrlPattern = /https:\/\/v\.redd\.it\/[a-z0-9]+/i;

const parseIsoDuration = (value) => {
    const match = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(value || "");
    if (!match) return;

    const seconds =
        (Number(match[1] || 0) * 3600)
        + (Number(match[2] || 0) * 60)
        + Number(match[3] || 0);

    if (!Number.isFinite(seconds) || seconds <= 0) return;
    return Math.round(seconds);
};

export const extractRedditVideoUrlFromRss = (rss, postId) => {
    if (typeof rss !== "string" || typeof postId !== "string") return;

    const postMarker = `<id>t3_${postId}</id>`;
    const markerIndex = rss.indexOf(postMarker);
    if (markerIndex < 0) return;

    const entryStart = rss.lastIndexOf("<entry", markerIndex);
    const entryEnd = rss.indexOf("</entry>", markerIndex);
    if (entryStart < 0 || entryEnd < 0) return;

    return rss.slice(entryStart, entryEnd).match(redditVideoUrlPattern)?.[0];
};

const getAdaptationSet = (manifest, contentType) => {
    const sets = manifest.match(/<AdaptationSet\b[\s\S]*?<\/AdaptationSet>/gi) || [];
    return sets.find((set) => new RegExp(`contentType=["']${contentType}["']`, "i").test(set));
};

const getBestRepresentation = (adaptationSet) => {
    if (!adaptationSet) return;

    const representations = [];
    const pattern = /<Representation\b([^>]*)>[\s\S]*?<BaseURL>([^<]+)<\/BaseURL>[\s\S]*?<\/Representation>/gi;
    let match;

    while ((match = pattern.exec(adaptationSet))) {
        const height = Number(/\bheight=["'](\d+)["']/i.exec(match[1])?.[1] || 0);
        const bandwidth = Number(/\bbandwidth=["'](\d+)["']/i.exec(match[1])?.[1] || 0);
        representations.push({
            path: match[2].replace(/&amp;/g, "&"),
            score: (height * 1_000_000_000) + bandwidth,
        });
    }

    return representations.sort((a, b) => b.score - a.score)[0]?.path;
};

export const parseRedditDashManifest = (manifest, manifestUrl) => {
    if (typeof manifest !== "string" || !manifestUrl) return;

    const videoPath = getBestRepresentation(getAdaptationSet(manifest, "video"));
    if (!videoPath) return;

    const audioPath = getBestRepresentation(getAdaptationSet(manifest, "audio"));
    const duration = parseIsoDuration(
        /\bmediaPresentationDuration=["']([^"']+)["']/i.exec(manifest)?.[1]
    );

    return {
        fallback_url: new URL(videoPath, manifestUrl).toString(),
        audio_url: audioPath ? new URL(audioPath, manifestUrl).toString() : undefined,
        duration,
    };
};

export const fetchRedditVideoFromRss = async ({ postId, dispatcher, headers }) => {
    const rssUrl = `https://www.reddit.com/comments/${postId}/.rss`;
    const rss = await fetch(rssUrl, {
        dispatcher,
        headers: {
            "user-agent": headers["user-agent"],
            accept: "application/atom+xml, application/rss+xml, text/xml",
        },
    }).then(async (response) => response.ok ? response.text() : undefined).catch(() => {});

    const videoBaseUrl = extractRedditVideoUrlFromRss(rss, postId);
    if (!videoBaseUrl) return;

    const manifestUrl = `${videoBaseUrl}/DASHPlaylist.mpd`;
    const manifest = await fetch(manifestUrl, {
        dispatcher,
        headers: {
            "user-agent": headers["user-agent"],
            accept: "application/dash+xml, application/xml, text/xml",
        },
    }).then(async (response) => response.ok ? response.text() : undefined).catch(() => {});

    return parseRedditDashManifest(manifest, manifestUrl);
};

async function getAccessToken() {
    /* "cookie" in cookiefile needs to contain:
     * client_id, client_secret, refresh_token
     * e.g. client_id=bla; client_secret=bla; refresh_token=bla
     *
     * you can get these by making a reddit app and
     * authenticating an account against reddit's oauth2 api
     * see: https://github.com/reddit-archive/reddit/wiki/OAuth2
     *
     * any additional cookie fields are managed by this code and you
     * should not touch them unless you know what you're doing. **/
    const cookie = await getCookie('reddit');
    if (!cookie) return;

    const values = cookie.values(),
          needRefresh = !values.access_token
                        || !values.expiry
                        || Number(values.expiry) < new Date().getTime();
    if (!needRefresh) return values.access_token;

    const data = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
            'authorization': `Basic ${Buffer.from(
                [values.client_id, values.client_secret].join(':')
            ).toString('base64')}`,
            'content-type': 'application/x-www-form-urlencoded',
            'user-agent': genericUserAgent,
            'accept': 'application/json'
        },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(values.refresh_token)}`
    }).then(r => r.json()).catch(() => {});
    if (!data) return;

    const { access_token, refresh_token, expires_in } = data;
    if (!access_token) return;

    updateCookieValues(cookie, {
        ...cookie.values(),
        access_token, refresh_token,
        expiry: new Date().getTime() + (expires_in * 1000),
    });

    return access_token;
}

export default async function(obj) {
    let params = obj;
    const accessToken = await getAccessToken();
    const headers = {
        'user-agent': genericUserAgent,
        accept: 'application/json'
    };
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;

    if (params.shortId) {
        params = await resolveRedirectingURL(
            `https://www.reddit.com/video/${params.shortId}`,
            obj.dispatcher, headers
        );
    }

    if (!params.id && params.shareId) {
        params = await resolveRedirectingURL(
            `https://www.reddit.com/r/${params.sub}/s/${params.shareId}`,
            obj.dispatcher, headers
        );
    }

    if (!params?.id) return { error: "fetch.short_link" };

    const url = new URL(`https://www.reddit.com/comments/${params.id}.json`);

    if (accessToken) url.hostname = 'oauth.reddit.com';

    let data = await fetch(
        url, { headers, dispatcher: obj.dispatcher }
    ).then(r => r.json()).catch(() => {});

    const metadataFetchFailed = !Array.isArray(data);
    data = Array.isArray(data) ? data[0]?.data?.children[0]?.data : undefined;

    let sourceId;
    if (params.sub || params.user) {
        sourceId = `${String(params.sub || params.user).toLowerCase()}_${params.id}`;
    } else {
        sourceId = params.id;
    }

    if (data?.url?.endsWith('.gif')) return {
        typeId: "redirect",
        urls: data.url,
        filename: `reddit_${sourceId}.gif`,
    }

    const redditVideo = data?.secure_media?.reddit_video
        || await fetchRedditVideoFromRss({
            postId: params.id,
            dispatcher: obj.dispatcher,
            headers,
        });

    if (!redditVideo) {
        return { error: metadataFetchFailed ? "fetch.fail" : "fetch.empty" };
    }

    if (redditVideo.duration > env.durationLimit)
        return { error: "content.too_long" };

    const duration = redditVideo.duration;

    const video = redditVideo.fallback_url?.split('?')[0];
    if (!video) return { error: "fetch.empty" };

    let audio = false,
        audioFileLink = redditVideo.audio_url
            || `${redditVideo.fallback_url?.split('DASH')[0]}audio`;

    if (!redditVideo.audio_url && video.match('.mp4')) {
        audioFileLink = `${video.split('_')[0]}_audio.mp4`
    }

    // test the existence of audio
    await fetch(audioFileLink, { method: "HEAD" }).then(r => {
        if (Number(r.status) === 200) {
            audio = true
        }
    }).catch(() => {})

    // fallback for videos with variable audio quality
    if (!audio) {
        audioFileLink = `${video.split('_')[0]}_AUDIO_128.mp4`
        await fetch(audioFileLink, { method: "HEAD" }).then(r => {
            if (Number(r.status) === 200) {
                audio = true
            }
        }).catch(() => {})
    }

    if (!audio) return {
        typeId: "redirect",
        urls: video,
        duration,
    }

    return {
        typeId: "tunnel",
        type: "merge",
        urls: [video, audioFileLink],
        audioFilename: `reddit_${sourceId}_audio`,
        filename: `reddit_${sourceId}.mp4`,
        duration,
    }
}
