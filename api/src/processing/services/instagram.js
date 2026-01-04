import { randomBytes } from "node:crypto";
import { resolveRedirectingURL } from "../url.js";
import { env, genericUserAgent } from "../../config.js";
import { createStream } from "../../stream/manage.js";
import { getCookie, updateCookie } from "../cookie/manager.js";

const INSTAGRAM_DEBUG = /^(1|true|yes)$/i.test(process.env.DEBUG_INSTAGRAM || "");
const truncate = (value, max = 250) => {
    const s = String(value ?? "");
    return s.length > max ? s.slice(0, max) + "..." : s;
};

const urlForLog = (value) => {
    try {
        const url = value instanceof URL ? value : new URL(String(value));
        url.username = url.password = url.hash = '';
        return truncate(url.toString());
    } catch {
        return truncate(value);
    }
};

const errorCauseForLog = (cause) => {
    if (!cause) return "";

    if (typeof cause === "string") {
        return truncate(cause, 200);
    }

    if (cause instanceof Error) {
        const code = cause.code || cause.name;
        const message = cause.message || String(cause);
        return truncate([code, message].filter(Boolean).join(" "), 200);
    }

    if (typeof cause === "object") {
        const code = cause.code || cause.name;
        const message = cause.message;
        return truncate([code, message].filter(Boolean).join(" "), 200);
    }

    return truncate(String(cause), 200);
};

const stripCookieKey = (cookieHeader, key) => {
    if (!cookieHeader) return "";
    const needle = String(key).toLowerCase() + "=";

    return String(cookieHeader)
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .filter((part) => !part.toLowerCase().startsWith(needle))
        .join("; ");
};

const commonHeaders = {
    "user-agent": genericUserAgent,
    "sec-gpc": "1",
    "sec-fetch-site": "same-origin",
    "x-ig-app-id": "936619743392459"
}

const mobileHeaders = {
    "x-ig-app-locale": "en_US",
    "x-ig-device-locale": "en_US",
    "x-ig-mapped-locale": "en_US",
    "user-agent": "Instagram 275.0.0.27.98 Android (33/13; 280dpi; 720x1423; Xiaomi; Redmi 7; onclite; qcom; en_US; 458229237)",
    "accept-language": "en-US",
    "x-fb-http-engine": "Liger",
    "x-fb-client-ip": "True",
    "x-fb-server-cluster": "True",
    "content-length": "0",
}

const embedHeaders = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-GB,en;q=0.9",
    "Cache-Control": "max-age=0",
    "Dnt": "1",
    "Priority": "u=0, i",
    "Sec-Ch-Ua": 'Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": "macOS",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": genericUserAgent,
}

const cachedDtsg = {
    value: '',
    expiry: 0
}

const getNumberFromQuery = (name, data) => {
    const s = data?.match(new RegExp(name + '=(\\d+)'))?.[1];
    if (+s) return +s;
}

const getObjectFromEntries = (name, data) => {
    const obj = data?.match(new RegExp('\\["' + name + '",.*?,({.*?}),\\d+\\]'))?.[1];
    return obj && JSON.parse(obj);
}

export default function instagram(obj) {
    const dispatcher = obj.dispatcher;
    const trace = randomBytes(2).toString("hex");

    const log = (...args) => {
        if (!INSTAGRAM_DEBUG) return;
        console.log(`[instagram:${trace}]`, ...args);
    };

    const logError = (...args) => {
        if (!INSTAGRAM_DEBUG) return;
        console.error(`[instagram:${trace}]`, ...args);
    };

    const logUpstream = (...args) => {
        console.log(`[instagram:${trace}] upstream`, ...args);
    };

    const logUpstreamError = (...args) => {
        console.error(`[instagram:${trace}] upstream`, ...args);
    };

    const requestUpstreamCobalt = async (postUrl) => {
        if (!env.instagramUpstreamURL) return null;

        try {
            if (new URL(env.instagramUpstreamURL).origin === new URL(env.apiURL).origin) {
                return null;
            }
        } catch {}

        const endpoint = new URL(env.instagramUpstreamURL);
        endpoint.pathname = "/";
        endpoint.search = "";
        endpoint.hash = "";

        const headers = {
            Accept: "application/json",
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
        };

        if (env.instagramUpstreamApiKey) {
            headers.Authorization = `Api-Key ${env.instagramUpstreamApiKey}`;
        }

        const timeoutMs =
            typeof env.instagramUpstreamTimeoutMs === "number" &&
            Number.isFinite(env.instagramUpstreamTimeoutMs) &&
            env.instagramUpstreamTimeoutMs > 0
                ? env.instagramUpstreamTimeoutMs
                : 12000;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const start = Date.now();
            logUpstream("-> request", "POST", urlForLog(endpoint), `target=${urlForLog(postUrl)}`);

            const res = await fetch(endpoint, {
                method: "POST",
                signal: controller.signal,
                headers,
                body: JSON.stringify({ url: String(postUrl) }),
            });

            const payload = await res.json().catch(() => null);
            logUpstream(
                "<- response",
                `http=${res.status}`,
                `time=${Date.now() - start}ms`,
                `status=${payload?.status || "?"}`,
                `has_url=${payload?.url ? "yes" : "no"}`
            );

            if (!res.ok) return null;
            if (!payload || typeof payload !== "object") return null;
            if (payload.status !== "redirect") return null;
            if (!payload.url) return null;

            return {
                url: payload.url,
                filename: payload.filename,
            };
        } catch (e) {
            const cause = errorCauseForLog(e?.cause);
            logUpstreamError(
                "request failed",
                cause ? `${String(e)}; cause=${cause}` : String(e)
            );
            return null;
        } finally {
            clearTimeout(timeout);
        }
    };

    const fetchLogged = async (label, url, options = {}) => {
        const start = Date.now();
        const method = options.method || "GET";
        log(`-> ${label}`, method, urlForLog(url));

        try {
            const res = await fetch(url, options);
            const durationMs = Date.now() - start;
            log(
                `<- ${label}`,
                `status=${res.status}`,
                `type=${res.headers.get("content-type") || ""}`,
                `time=${durationMs}ms`
            );
            return res;
        } catch (e) {
            const durationMs = Date.now() - start;
            const cause = errorCauseForLog(e?.cause);
            logError(
                `!! ${label}`,
                `time=${durationMs}ms`,
                cause ? `${String(e)}; cause=${cause}` : String(e)
            );
            throw e;
        }
    };

    async function findDtsgId(cookie) {
        try {
            if (cachedDtsg.expiry > Date.now()) return cachedDtsg.value;

            const data = await fetchLogged('homepage', 'https://www.instagram.com/', {
                headers: {
                    ...commonHeaders,
                    cookie
                },
                dispatcher
            }).then(r => r.text());

            const token = data.match(/"dtsg":{"token":"(.*?)"/)[1];
            log("dtsg token", token ? "found" : "missing");

            cachedDtsg.value = token;
            cachedDtsg.expiry = Date.now() + 86390000;

            if (token) return token;
            return false;
        }
        catch {}
    }

    async function request(url, cookie, method = 'GET', requestData) {
        let headers = {
            ...commonHeaders,
            'x-ig-www-claim': cookie?._wwwClaim || '0',
            'x-csrftoken': cookie?.values()?.csrftoken,
            cookie
        }
        if (method === 'POST') {
            headers['content-type'] = 'application/x-www-form-urlencoded';
        }

        const data = await fetchLogged('web api', url, {
            method,
            headers,
            body: requestData && new URLSearchParams(requestData),
            dispatcher
        });

        if (data.headers.get('X-Ig-Set-Www-Claim') && cookie)
            cookie._wwwClaim = data.headers.get('X-Ig-Set-Www-Claim');

        updateCookie(cookie, data.headers);
        return data.json();
    }

    async function getMediaId(id, { cookie, token } = {}) {
        const oembedURL = new URL('https://i.instagram.com/api/v1/oembed/');
        oembedURL.searchParams.set('url', `https://www.instagram.com/p/${id}/`);
        const label = token ? "oembed bearer" : cookie ? "oembed cookie" : "oembed anon";

        const res = await fetchLogged(label, oembedURL, {
            headers: {
                ...mobileHeaders,
                ...( token && { authorization: `Bearer ${token}` } ),
                cookie
            },
            dispatcher
        }).catch(() => null);

        if (!res) {
            log("oembed result", "request_failed");
            return;
        }

        const oembed = await res.json().catch(() => ({}));
        log("oembed result", `status=${res.status}`, `media_id=${oembed?.media_id ? "yes" : "no"}`);

        return oembed?.media_id;
    }

    async function requestMobileApi(mediaId, { cookie, token } = {}) {
        const label = token ? "mobile api bearer" : cookie ? "mobile api cookie" : "mobile api anon";
        const res = await fetchLogged(label, `https://i.instagram.com/api/v1/media/${mediaId}/info/`, {
            headers: {
                ...mobileHeaders,
                ...( token && { authorization: `Bearer ${token}` } ),
                cookie
            },
            dispatcher
        }).catch(() => null);

        if (!res) {
            log("mobile api result", "request_failed");
            return;
        }

        const mediaInfo = await res.json().catch(() => ({}));
        log(
            "mobile api result",
            `status=${res.status}`,
            `has_item=${mediaInfo?.items?.[0] ? "yes" : "no"}`
        );

        return mediaInfo?.items?.[0];
    }

    async function requestHTML(id, cookie) {
        const label = cookie ? "embed html cookie" : "embed html anon";
        const res = await fetchLogged(label, `https://www.instagram.com/p/${id}/embed/captioned/`, {
            headers: {
                ...embedHeaders,
                cookie
            },
            dispatcher
        }).catch(() => null);

        const data = await res?.text().catch(() => null);

        if (!data) {
            log("embed parse", "no_html");
            return false;
        }

        const initMatch = data?.match(/"init",\[\],\[(.*?)\]\],/);
        if (!initMatch?.[1]) {
            log("embed parse", "init_match_failed");
            return false;
        }

        let embedData;
        try {
            embedData = JSON.parse(initMatch[1]);
        } catch (e) {
            logError("embed parse", "init_json_parse_failed", String(e));
            return false;
        }

        if (!embedData || !embedData?.contextJSON) return false;

        try {
            embedData = JSON.parse(embedData.contextJSON);
        } catch (e) {
            logError("embed parse", "context_json_parse_failed", String(e));
            return false;
        }

        log("embed parse", `has_gql_data=${embedData?.gql_data != null ? "yes" : "no"}`);

        return embedData;
    }

    async function getGQLParams(id, cookie) {
        const label = cookie ? "post page cookie" : "post page anon";
        const req = await fetchLogged(label, `https://www.instagram.com/p/${id}/`, {
            headers: {
                ...embedHeaders,
                cookie
            },
            dispatcher
        });

        const html = await req.text();
        log("post page html", `len=${html?.length || 0}`);
        const siteData = getObjectFromEntries('SiteData', html);
        const polarisSiteData = getObjectFromEntries('PolarisSiteData', html);
        const webConfig = getObjectFromEntries('DGWWebConfig', html);
        const pushInfo = getObjectFromEntries('InstagramWebPushInfo', html);
        const lsd = getObjectFromEntries('LSD', html)?.token || randomBytes(8).toString('base64url');
        const csrf = getObjectFromEntries('InstagramSecurityConfig', html)?.csrf_token;
        log(
            "post page tokens",
            `lsd=${lsd ? "yes" : "no"}`,
            `csrf=${csrf ? "yes" : "no"}`,
            `appId=${webConfig?.appId ? "yes" : "no"}`
        );

        const anon_cookie = [
            csrf && "csrftoken=" + csrf,
            polarisSiteData?.device_id && "ig_did=" + polarisSiteData?.device_id,
            "wd=1280x720",
            "dpr=2",
            polarisSiteData?.machine_id && "mid=" + polarisSiteData.machine_id,
            "ig_nrcb=1"
        ].filter(a => a).join('; ');

        return {
            headers: {
                'x-ig-app-id': webConfig?.appId || '936619743392459',
                'X-FB-LSD': lsd,
                'X-CSRFToken': csrf,
                'X-Bloks-Version-Id': getObjectFromEntries('WebBloksVersioningID', html)?.versioningID,
                'x-asbd-id': 129477,
                cookie: anon_cookie
            },
            body: {
                __d: 'www',
                __a: '1',
                __s: '::' + Math.random().toString(36).substring(2).replace(/\d/g, '').slice(0, 6),
                __hs: siteData?.haste_session || '20126.HYP:instagram_web_pkg.2.1...0',
                __req: 'b',
                __ccg: 'EXCELLENT',
                __rev: pushInfo?.rollout_hash || '1019933358',
                __hsi: siteData?.hsi || '7436540909012459023',
                __dyn: randomBytes(154).toString('base64url'),
                __csr: randomBytes(154).toString('base64url'),
                __user: '0',
                __comet_req: getNumberFromQuery('__comet_req', html) || '7',
                av: '0',
                dpr: '2',
                lsd,
                jazoest: getNumberFromQuery('jazoest', html) || Math.floor(Math.random() * 10000),
                __spin_r: siteData?.__spin_r || '1019933358',
                __spin_b: siteData?.__spin_b || 'trunk',
                __spin_t: siteData?.__spin_t || Math.floor(new Date().getTime() / 1000),
            }
        };
    }

    async function requestGQL(id, cookie) {
        const label = cookie ? "graphql cookie" : "graphql anon";
        const variables = {
            shortcode: id,
            fetch_tagged_user_count: null,
            hoisted_comment_id: null,
            hoisted_reply_id: null
        };
        const hasMedia = (gql_data) => (
            gql_data?.xdt_shortcode_media != null
            || gql_data?.shortcode_media != null
        );

        // Prefer a lightweight GET request; this avoids CSRF/LSD plumbing and is often
        // less likely to be blocked than the full POST form.
        try {
            const getURL = new URL('https://www.instagram.com/graphql/query');
            getURL.searchParams.set('doc_id', '8845758582119845');
            getURL.searchParams.set('variables', JSON.stringify(variables));

            const getReq = await fetchLogged(label, getURL, {
                dispatcher,
                headers: {
                    ...commonHeaders,
                    ...(cookie ? { cookie: String(cookie) } : {}),
                    accept: "application/json,text/plain,*/*",
                }
            });

            const gql_data = await getReq.json()
                .then(r => r.data)
                .catch(() => null);

            log(
                "graphql data",
                `method=GET`,
                `has_data=${gql_data ? "yes" : "no"}`,
                `has_xdt=${gql_data?.xdt_shortcode_media ? "yes" : "no"}`,
                `has_shortcode=${gql_data?.shortcode_media ? "yes" : "no"}`
            );

            if (hasMedia(gql_data)) return { gql_data };
            if (!cookie) return { gql_data };
        } catch {}

        // Fallback to the original POST request.
        const { headers, body } = await getGQLParams(id, cookie);
        const combinedCookie = [
            headers.cookie,
            cookie ? stripCookieKey(String(cookie), "csrftoken") : "",
        ].filter(Boolean).join("; ");

        const postReq = await fetchLogged(label, 'https://www.instagram.com/graphql/query', {
            method: 'POST',
            dispatcher,
            headers: {
                ...embedHeaders,
                ...headers,
                ...(combinedCookie ? { cookie: combinedCookie } : {}),
                'content-type': 'application/x-www-form-urlencoded',
                'X-FB-Friendly-Name': 'PolarisPostActionLoadPostQueryQuery',
            },
            body: new URLSearchParams({
                ...body,
                fb_api_caller_class: 'RelayModern',
                fb_api_req_friendly_name: 'PolarisPostActionLoadPostQueryQuery',
                variables: JSON.stringify(variables),
                server_timestamps: true,
                doc_id: '8845758582119845'
            }).toString()
        });

        const gql_data = await postReq.json()
            .then(r => r.data)
            .catch(() => null);

        log(
            "graphql data",
            `method=POST`,
            `has_data=${gql_data ? "yes" : "no"}`,
            `has_xdt=${gql_data?.xdt_shortcode_media ? "yes" : "no"}`,
            `has_shortcode=${gql_data?.shortcode_media ? "yes" : "no"}`
        );

        return { gql_data };
    }

    async function getErrorContext(id) {
        try {
            const { headers, body } = await getGQLParams(id);

            const req = await fetchLogged('bulk-route-definitions', 'https://www.instagram.com/ajax/bulk-route-definitions/', {
                method: 'POST',
                dispatcher,
                headers: {
                    ...embedHeaders,
                    ...headers,
                    'content-type': 'application/x-www-form-urlencoded',
                    'X-Ig-D': 'www',
                },
                body: new URLSearchParams({
                    'route_urls[0]': `/p/${id}/`,
                    routing_namespace: 'igx_www',
                    ...body
                }).toString()
            });

            const response = await req.text();
            log("bulk-route-definitions body", `len=${response?.length || 0}`);
            if (response.includes('"tracePolicy":"polaris.privatePostPage"'))
                return { error: 'content.post.private' };

            const [, mediaId, mediaOwnerId] = response.match(
                /"media_id":\s*?"(\d+)","media_owner_id":\s*?"(\d+)"/
            ) || [];

            log(
                "bulk-route-definitions match",
                `media_id=${mediaId ? "yes" : "no"}`,
                `owner_id=${mediaOwnerId ? "yes" : "no"}`,
            );

            if (mediaId && mediaOwnerId) {
                const rulingURL = new URL('https://www.instagram.com/api/v1/web/get_ruling_for_media_content_logged_out');
                rulingURL.searchParams.set('media_id', mediaId);
                rulingURL.searchParams.set('owner_id', mediaOwnerId);

                const rulingResponse = await fetch(rulingURL, {
                    headers: {
                        ...headers,
                        ...commonHeaders
                    },
                    dispatcher,
                }).then(a => a.json()).catch(() => ({}));

                log(
                    "ruling response",
                    `has_title=${rulingResponse?.title ? "yes" : "no"}`,
                    truncate(rulingResponse?.title || "", 80)
                );

                if (rulingResponse?.title?.includes('Restricted'))
                    return { error: "content.post.age" };
            }
        } catch {
            logError("error context", "failed");
            return { error: "fetch.fail" };
        }

        log("error context", "empty");
        return { error: "fetch.empty" };
    }

    function extractOldPost(data, id, alwaysProxy) {
        const shortcodeMedia = data?.gql_data?.shortcode_media || data?.gql_data?.xdt_shortcode_media;
        const sidecar = shortcodeMedia?.edge_sidecar_to_children;

        if (sidecar) {
            const picker = sidecar.edges.filter(e => e.node?.display_url)
                .map((e, i) => {
                    const type = e.node?.is_video && e.node?.video_url ? "video" : "photo";

                    let url;
                    if (type === "video") {
                        url = e.node?.video_url;
                    } else if (type === "photo") {
                        url = e.node?.display_url;
                    }

                    let itemExt = type === "video" ? "mp4" : "jpg";

                    let proxyFile;
                    if (alwaysProxy) proxyFile = createStream({
                        service: "instagram",
                        type: "proxy",
                        url,
                        filename: `instagram_${id}_${i + 1}.${itemExt}`
                    });

                    return {
                        type,
                        url: proxyFile || url,
                        /* thumbnails have `Cross-Origin-Resource-Policy`
                        ** set to `same-origin`, so we need to proxy them */
                        thumb: createStream({
                            service: "instagram",
                            type: "proxy",
                            url: e.node?.display_url,
                            filename: `instagram_${id}_${i + 1}.jpg`
                        })
                    }
                });

            if (picker.length) return { picker }
        }

        if (shortcodeMedia?.video_url) {
            return {
                urls: shortcodeMedia.video_url,
                filename: `instagram_${id}.mp4`,
                audioFilename: `instagram_${id}_audio`
            }
        }

        if (shortcodeMedia?.display_url) {
            return {
                urls: shortcodeMedia.display_url,
                isPhoto: true,
                filename: `instagram_${id}.jpg`,
            }
        }
    }

    function extractNewPost(data, id, alwaysProxy) {
        const carousel = data.carousel_media;
        if (carousel) {
            const picker = carousel.filter(e => e?.image_versions2)
                .map((e, i) => {
                    const type = e.video_versions ? "video" : "photo";
                    const imageUrl = e.image_versions2.candidates[0].url;

                    let url = imageUrl;
                    let itemExt = type === "video" ? "mp4" : "jpg";

                    if (type === "video") {
                        const video = e.video_versions.reduce((a, b) => a.width * a.height < b.width * b.height ? b : a);
                        url = video.url;
                    }

                    let proxyFile;
                    if (alwaysProxy) proxyFile = createStream({
                        service: "instagram",
                        type: "proxy",
                        url,
                        filename: `instagram_${id}_${i + 1}.${itemExt}`
                    });

                    return {
                        type,
                        url: proxyFile || url,
                        /* thumbnails have `Cross-Origin-Resource-Policy`
                        ** set to `same-origin`, so we need to always proxy them */
                        thumb: createStream({
                            service: "instagram",
                            type: "proxy",
                            url: imageUrl,
                            filename: `instagram_${id}_${i + 1}.jpg`
                        })
                    }
                });

            if (picker.length) return { picker }
        } else if (data.video_versions) {
            const video = data.video_versions.reduce((a, b) => a.width * a.height < b.width * b.height ? b : a)
            return {
                urls: video.url,
                filename: `instagram_${id}.mp4`,
                audioFilename: `instagram_${id}_audio`
            }
        } else if (data.image_versions2?.candidates) {
            return {
                urls: data.image_versions2.candidates[0].url,
                isPhoto: true,
                filename: `instagram_${id}.jpg`,
            }
        }
    }

    async function getPost(id, alwaysProxy) {
        const hasData = (data) => {
            if (!data) return false;

            if ('gql_data' in data) {
                if (data.gql_data == null) return false;
                return (
                    data.gql_data.xdt_shortcode_media != null
                    || data.gql_data.shortcode_media != null
                );
            }

            return Boolean(
                data.carousel_media
                || data.video_versions
                || data.image_versions2?.candidates
            );
        };
        let data, result;
        log(
            "getPost start",
            id,
            `alwaysProxy=${!!alwaysProxy}`,
            `dispatcher=${dispatcher ? "yes" : "no"}`
        );
        try {
            const cookie = getCookie('instagram');

            const bearer = getCookie('instagram_bearer');
            const token = bearer?.values()?.token;

            log(
                "auth",
                `cookie=${cookie ? "yes" : "no"}`,
                `cookie_idx=${cookie?.meta?.idx ?? "n/a"}`,
                `bearer=${token ? "yes" : "no"}`,
                `bearer_idx=${bearer?.meta?.idx ?? "n/a"}`,
            );

            // web app graphql api first (no cookie, cookie)
            if (!hasData(data)) data = await requestGQL(id).catch(() => null);
            if (!hasData(data) && cookie) data = await requestGQL(id, cookie).catch(() => null);

            // mobile api (requires media_id)
            if (!hasData(data)) {
                // get media_id for mobile api, three methods
                let media_id = await getMediaId(id);
                if (!media_id && token) media_id = await getMediaId(id, { token });
                if (!media_id && cookie) media_id = await getMediaId(id, { cookie });
                log("media_id", media_id ? "found" : "missing");

                // mobile api (bearer)
                if (media_id && token) data = await requestMobileApi(media_id, { token });

                // mobile api (no cookie, cookie)
                if (media_id && !hasData(data)) data = await requestMobileApi(media_id);
                if (media_id && cookie && !hasData(data)) data = await requestMobileApi(media_id, { cookie });
            }

            // html embed last (no cookie, cookie)
            if (!hasData(data)) data = await requestHTML(id);
            if (!hasData(data) && cookie) data = await requestHTML(id, cookie);
        } catch {}

        if (!hasData(data)) {
            if (env.instagramUpstreamURL) {
                const upstreamUrl = `https://www.instagram.com/p/${id}/`;
                log("getPost", "no data, trying upstream", urlForLog(upstreamUrl));

                const upstream = await requestUpstreamCobalt(upstreamUrl);
                if (upstream?.url) {
                    log("getPost", "upstream ok");
                    return {
                        urls: upstream.url,
                        filename: upstream.filename || `instagram_${id}.mp4`,
                        audioFilename: `instagram_${id}_audio`,
                    };
                }

                log("getPost", "upstream failed");
            }

            log("getPost", "no data, entering error context");
            return getErrorContext(id);
        }

        if (data?.gql_data) {
            result = extractOldPost(data, id, alwaysProxy)
        } else {
            result = extractNewPost(data, id, alwaysProxy)
        }

        if (result) {
            log("getPost done", result?.picker ? "picker" : (result?.isPhoto ? "photo" : "video"));
            return result;
        }

        log("getPost done", "no result");
        return { error: "fetch.empty" }
    }

    async function usernameToId(username, cookie) {
        const url = new URL('https://www.instagram.com/api/v1/users/web_profile_info/');
            url.searchParams.set('username', username);

        try {
            const data = await request(url, cookie);
            return data?.data?.user?.id;
        } catch {}
    }

    async function getStory(username, id) {
        const cookie = getCookie('instagram');
        if (!cookie) return { error: "link.unsupported" };

        const userId = await usernameToId(username, cookie);
        if (!userId) return { error: "fetch.empty" };

        const dtsgId = await findDtsgId(cookie);

        const url = new URL('https://www.instagram.com/api/graphql/');
        const requestData = {
            fb_dtsg: dtsgId,
            jazoest: '26438',
            variables: JSON.stringify({
                reel_ids_arr : [ userId ],
            }),
            server_timestamps: true,
            doc_id: '25317500907894419'
        };

        let media;
        try {
            const data = (await request(url, cookie, 'POST', requestData));
            media = data?.data?.xdt_api__v1__feed__reels_media?.reels_media?.find(m => m.id === userId);
        } catch {}

        const item = media.items.find(m => m.pk === id);
        if (!item) return { error: "fetch.empty" };

        if (item.video_versions) {
            const video = item.video_versions.reduce((a, b) => a.width * a.height < b.width * b.height ? b : a)
            return {
                urls: video.url,
                filename: `instagram_${id}.mp4`,
                audioFilename: `instagram_${id}_audio`
            }
        }

        if (item.image_versions2?.candidates) {
            return {
                urls: item.image_versions2.candidates[0].url,
                isPhoto: true,
                filename: `instagram_${id}.jpg`,
            }
        }

        return { error: "link.unsupported" };
    }

    const { postId, shareId, storyId, username, alwaysProxy } = obj;

    if (shareId) {
        return resolveRedirectingURL(
            `https://www.instagram.com/share/${shareId}/`,
            dispatcher,
            // for some reason instagram decides to return HTML
            // instead of a redirect when requesting with a normal
            // browser user-agent
            {'User-Agent': 'curl/7.88.1'}
        ).then(match => instagram({
            ...obj, ...match,
            shareId: undefined
        }));
    }

    if (postId) return getPost(postId, alwaysProxy);
    if (username && storyId) return getStory(username, storyId);

    return { error: "fetch.empty" }
}
