import { env } from "../../config.js";

// Mobile UA is required for the share page logic to work without X-Bogus
// Verified working as of Dec 2025
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
const PAGE_TIMEOUT_MS = 15000;
const CANDIDATE_PROBE_TIMEOUT_MS = 4500;
const SHARE_PAGE_RETRIES = 1;
const DISCOVER_PAGE_RETRIES = 1;
const MAX_DISCOVER_PLAY_URL_CANDIDATES = 12;
const MAX_PRIMARY_MEDIA_CANDIDATE_ATTEMPTS = 5;
const MAX_DISCOVER_MEDIA_CANDIDATE_ATTEMPTS = 8;
const WAF_RETRY_AFTER_SECONDS = 60;
const isUpstreamServer = (() => {
    const raw = String(process.env.IS_UPSTREAM_SERVER || "").toLowerCase().trim();
    return raw === "true" || raw === "1";
})();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseSetCookiePairs = (setCookieHeader) => {
    if (typeof setCookieHeader !== "string" || !setCookieHeader) return [];

    const pairs = [];
    const regex = /(?:^|,\s*)([A-Za-z0-9_]+)=([^;,\r\n]+)/g;
    let match;

    while ((match = regex.exec(setCookieHeader)) !== null) {
        const [, name, value] = match;
        if (!name || !value) continue;
        pairs.push([name, value]);
    }

    return pairs;
};

const mergeCookieFromResponse = (cookieMap, headers) => {
    if (!cookieMap || !(cookieMap instanceof Map) || !headers?.get) return;

    const setCookie = headers.get("set-cookie");
    if (!setCookie) return;

    for (const [name, value] of parseSetCookiePairs(setCookie)) {
        // Keep only the high-value cookies used by Douyin anti-bot layers.
        if (
            name === "ttwid" ||
            name === "msToken" ||
            name === "__ac_nonce" ||
            name === "__ac_signature" ||
            name === "odin_tt"
        ) {
            cookieMap.set(name, value);
        }
    }
};

const cookieMapToHeader = (cookieMap) => {
    if (!cookieMap || !(cookieMap instanceof Map) || cookieMap.size === 0) {
        return "";
    }

    return [...cookieMap.entries()]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
};

const looksLikeWafChallenge = (html) => {
    if (!html) return false;

    // ByteDance WAF JS challenge pages return HTML (often 2-5KB) without router data.
    return (
        html.includes("waf-jschallenge") ||
        html.includes("lf-waf-jschallenge") ||
        html.includes("_wafchallengeid") ||
        html.includes("WAFJS") ||
        html.includes("Please wait")
    );
};

const getUpstreamTargetUrl = ({ videoId, shortLink }) => {
    if (videoId) return `https://www.douyin.com/video/${videoId}`;
    if (shortLink) return `https://douyin.com/_shortLink/${shortLink}`;
    return null;
};

const logUpstreamUsed = (reason, { videoId, shortLink, targetUrl, status }) => {
    let upstreamOrigin;
    try {
        upstreamOrigin = new URL(env.instagramUpstreamURL).origin;
    } catch {
        upstreamOrigin = "unknown";
    }

    console.log("[douyin] resolved via upstream", {
        reason,
        upstream: upstreamOrigin,
        status,
        videoId,
        shortLink,
        targetUrl,
    });
};

const isPrivateHostname = (hostname) => {
    if (!hostname || typeof hostname !== "string") return false;
    const host = hostname.toLowerCase();

    if (host === "localhost" || host === "::1") return true;
    if (host.endsWith(".local")) return true;
    if (/^127\./.test(host)) return true;
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;

    return false;
};

const normalizeUpstreamTunnelUrl = (url, endpointOrigin) => {
    if (typeof url !== "string" || !url) return null;

    const endpoint = new URL(endpointOrigin);

    try {
        const parsed = new URL(url);
        if (parsed.pathname !== "/tunnel") return parsed.toString();

        // Always force tunnel URLs to the configured upstream public origin.
        // This avoids leaking upstream internal API_URL values (e.g. 192.168.x.x:9000).
        if (parsed.origin !== endpoint.origin || isPrivateHostname(parsed.hostname)) {
            const normalized = new URL(parsed.pathname + parsed.search + parsed.hash, endpoint.origin);
            return normalized.toString();
        }

        return parsed.toString();
    } catch {
        // Handle relative tunnel URLs.
        if (url.startsWith("/tunnel?")) {
            return new URL(url, endpoint.origin).toString();
        }
        return null;
    }
};

const requestUpstreamCobalt = async (targetUrl, options = {}) => {
    // Reuse INSTAGRAM_UPSTREAM_* for Douyin as well.
    if (!env.instagramUpstreamURL) return null;

    let upstreamOrigin;
    try {
        upstreamOrigin = new URL(env.instagramUpstreamURL).origin;
    } catch {
        upstreamOrigin = "invalid";
    }

    try {
        if (upstreamOrigin !== "invalid" && upstreamOrigin === new URL(env.apiURL).origin) {
            console.warn("[douyin] upstream skipped (same origin)", { upstream: upstreamOrigin });
            return null;
        }
    } catch {
        // ignore
    }

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

    const configuredTimeoutMs =
        typeof env.instagramUpstreamTimeoutMs === "number" &&
        Number.isFinite(env.instagramUpstreamTimeoutMs) &&
        env.instagramUpstreamTimeoutMs > 0
            ? env.instagramUpstreamTimeoutMs
            : 15000;

    const fastAttempt =
        options?.quickMode === true
            ? Math.max(6000, Math.min(9000, configuredTimeoutMs))
            : null;
    const timeoutPlan = [fastAttempt, configuredTimeoutMs]
        .filter((v) => typeof v === "number" && Number.isFinite(v) && v > 0)
        .filter((v, idx, arr) => arr.indexOf(v) === idx);

    for (let attempt = 0; attempt < timeoutPlan.length; attempt++) {
        const timeoutMs = timeoutPlan[attempt];
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            console.log("[douyin] upstream request", {
                upstream: upstreamOrigin,
                targetUrl,
                attempt: `${attempt + 1}/${timeoutPlan.length}`,
                timeoutMs,
                mode: options?.quickMode ? "quick" : "normal",
            });

            const res = await fetch(endpoint, {
                method: "POST",
                signal: controller.signal,
                headers,
                body: JSON.stringify({ url: String(targetUrl) }),
            });

            const payload = await res.json().catch(() => null);
            const duration =
                typeof payload?.duration === "number" &&
                Number.isFinite(payload.duration)
                    ? payload.duration
                    : undefined;

            console.log("[douyin] upstream response", {
                upstream: upstreamOrigin,
                http: res.status,
                ok: res.ok,
                status: payload?.status,
                error: payload?.error?.code,
                hasUrl: Boolean(payload?.url),
                attempt: `${attempt + 1}/${timeoutPlan.length}`,
            });

            if (!res.ok || !payload || typeof payload !== "object") {
                if (attempt < timeoutPlan.length - 1) {
                    await sleep(250 + attempt * 200);
                    continue;
                }
                return null;
            }
            if (!["redirect", "tunnel"].includes(payload.status) || !payload.url) {
                if (attempt < timeoutPlan.length - 1) {
                    await sleep(250 + attempt * 200);
                    continue;
                }
                return null;
            }

            let normalizedUrl = payload.url;
            let relayUrl = null;
            let isTunnelLikeUrl = false;

            try {
                const parsedPayloadUrl = new URL(payload.url);
                isTunnelLikeUrl = parsedPayloadUrl.pathname === "/tunnel";
            } catch {
                isTunnelLikeUrl = typeof payload.url === "string" && payload.url.startsWith("/tunnel?");
            }

            // Some upstreams incorrectly label tunnel URLs as `status=redirect`.
            // Detect by URL shape and force relay-mode handling.
            if (payload.status === "tunnel" || isTunnelLikeUrl) {
                const rewritten = normalizeUpstreamTunnelUrl(payload.url, endpoint.origin);
                if (rewritten) {
                    normalizedUrl = rewritten;
                    if (rewritten !== payload.url) {
                        console.log("[douyin] upstream tunnel url rewritten", {
                            from: payload.url,
                            to: rewritten,
                        });
                    }
                }

                try {
                    const relay = new URL("/relay", endpoint.origin);
                    relay.searchParams.set("service", "douyin");
                    relay.searchParams.set("url", normalizedUrl);
                    relayUrl = relay.toString();

                    console.log("[douyin] upstream tunnel relay prepared", {
                        upstream: upstreamOrigin,
                        relay: relayUrl,
                        originalStatus: payload.status,
                        tunnelLike: isTunnelLikeUrl,
                    });
                } catch {
                    relayUrl = null;
                }
            }

            return {
                status: payload.status,
                url: normalizedUrl,
                filename: payload.filename,
                relayUrl,
                duration,
            };
        } catch (e) {
            console.warn("Douyin upstream request failed:", {
                message: e?.message || "unknown",
                attempt: `${attempt + 1}/${timeoutPlan.length}`,
                timeoutMs,
                mode: options?.quickMode ? "quick" : "normal",
            });
            if (attempt < timeoutPlan.length - 1) {
                await sleep(250 + attempt * 200);
                continue;
            }
            return null;
        } finally {
            clearTimeout(timeout);
        }
    }

    return null;
};

const resolveShortLinkFinalUrl = async (shortLink) => {
    const baseUrl = `https://v.douyin.com/${shortLink}/`;

    const headers = {
        "user-agent": MOBILE_UA,
    };

    try {
        const res = await fetch(baseUrl, {
            method: "HEAD",
            redirect: "manual",
            headers,
            signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        });

        const location = res.headers.get("location");
        if (location) return new URL(location, baseUrl).href;
    } catch {
        // ignore and try GET
    }

    try {
        const res = await fetch(baseUrl, {
            method: "GET",
            redirect: "manual",
            headers,
            signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        });

        const location = res.headers.get("location");
        if (location) return new URL(location, baseUrl).href;
    } catch {
        // ignore
    }

    const res = await fetch(baseUrl, {
        method: "HEAD",
        redirect: "follow",
        headers,
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });

    return res.url;
};

const toSeconds = (value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return value > 1000 ? Math.round(value / 1000) : Math.round(value);
};

const parseTotalLength = (headers) => {
    const contentRange = headers.get("content-range");
    if (contentRange) {
        const match = contentRange.match(/\/(\d+)$/);
        if (match) {
            const total = parseInt(match[1]);
            if (Number.isFinite(total) && total > 0) return total;
        }
    }

    const contentLength = headers.get("content-length");
    if (!contentLength) return undefined;
    const parsed = parseInt(contentLength);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const classifyMediaUrl = (url) => {
    if (typeof url !== "string" || !url) return "unknown";

    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        const path = parsed.pathname.toLowerCase();

        if (host.endsWith("douyinvod.com")) return "douyinvod";
        if (host.includes("bytevod")) return "bytevod";
        if (host.endsWith("zjcdn.com")) return "zjcdn";
        if (path.includes("/aweme/v1/play")) return "aweme-api";

        return "other";
    } catch {
        return "unknown";
    }
};

const mediaClassScore = (mediaClass) => {
    switch (mediaClass) {
        case "douyinvod":
            return 40;
        case "bytevod":
            return 35;
        case "other":
            return 20;
        case "zjcdn":
            return 10;
        case "aweme-api":
            return 5;
        default:
            return 0;
    }
};

const shouldPreferRedirectForMediaClass = (mediaClass) =>
    mediaClass === "douyinvod" || mediaClass === "bytevod";

const shouldAllowZjcdnRedirect = ({ mediaClass, bytes }) =>
    mediaClass === "zjcdn" &&
    typeof bytes === "number" &&
    Number.isFinite(bytes) &&
    bytes >= env.douyinUpstreamMinBytes;

const isAwemeOnlyPayload = (item) => {
    const playUrls = item?.video?.play_addr?.url_list;
    const hasPlayUrls = Array.isArray(playUrls) && playUrls.length > 0;
    const allPlayAreAweme = hasPlayUrls
        ? playUrls.every((url) => /\/aweme\/v1\/play(?:wm)?\//i.test(String(url)))
        : false;

    const hasDownloadAddr =
        Array.isArray(item?.video?.download_addr?.url_list) &&
        item.video.download_addr.url_list.length > 0;

    const hasBitrate =
        Array.isArray(item?.video?.bit_rate) &&
        item.video.bit_rate.some(
            (entry) =>
                Array.isArray(entry?.play_addr?.url_list) &&
                entry.play_addr.url_list.length > 0,
        );

    return hasPlayUrls && allPlayAreAweme && !hasDownloadAddr && !hasBitrate;
};

const probeContentLength = async (url, timeoutMs = PAGE_TIMEOUT_MS) => {
    try {
        const res = await fetch(url, {
            method: "GET",
            redirect: "follow",
            headers: {
                "User-Agent": MOBILE_UA,
                // Request a single byte so we can read total length from Content-Range.
                Range: "bytes=0-0",
            },
            signal: AbortSignal.timeout(timeoutMs),
        });

        return {
            statusCode: res.status,
            bytes: parseTotalLength(res.headers),
            finalUrl: res.url,
        };
    } catch {
        return {
            statusCode: undefined,
            bytes: undefined,
            finalUrl: undefined,
        };
    }
};

const appendUniqueCandidate = (list, seen, raw) => {
    const url = normalizeMediaUrlCandidate(raw);
    if (!url || seen.has(url)) return;
    seen.add(url);
    list.push(url);
};

const resolveDirectUrlFromCandidates = async (
    probeCandidates,
    {
        reason = "primary",
        videoId,
        maxAttempts = probeCandidates.length,
    } = {},
) => {
    const candidates = Array.isArray(probeCandidates) ? probeCandidates : [];
    if (candidates.length === 0) {
        return {
            selectedUrl: undefined,
            directUrl: undefined,
            directHeadStatusCode: undefined,
            directProbeStatusCode: undefined,
            bytes: undefined,
            attempts: 0,
            cappedAttempts: 0,
        };
    }

    const cappedAttempts = Math.max(1, Math.min(maxAttempts, candidates.length));
    const targetProbeDepth =
        reason.startsWith("discover:")
            ? Math.min(cappedAttempts, 6)
            : Math.min(cappedAttempts, 4);
    const failures = [];
    let bestSuccess = null;
    let lastResult = {
        selectedUrl: candidates[0],
        directUrl: candidates[0],
        directHeadStatusCode: undefined,
        directProbeStatusCode: undefined,
        bytes: undefined,
        attempts: 0,
        cappedAttempts,
    };

    for (let index = 0; index < cappedAttempts; index++) {
        const candidate = candidates[index];
        let directUrl = candidate;
        let directHeadStatusCode;

        const {
            statusCode: directRangeStatusCode,
            bytes,
            finalUrl,
        } = await probeContentLength(directUrl, CANDIDATE_PROBE_TIMEOUT_MS);

        if (finalUrl) directUrl = finalUrl;

        const directProbeStatusCode =
            typeof directRangeStatusCode === "number"
                ? directRangeStatusCode
                : directHeadStatusCode;

        const result = {
            selectedUrl: candidate,
            directUrl,
            directHeadStatusCode,
            directProbeStatusCode,
            bytes,
            attempts: index + 1,
            cappedAttempts,
            mediaClass: classifyMediaUrl(directUrl),
        };

        lastResult = result;

        if (typeof directProbeStatusCode === "number" && directProbeStatusCode < 400) {
            const score = mediaClassScore(result.mediaClass);
            if (!bestSuccess || score > bestSuccess.score) {
                bestSuccess = { ...result, score };
            }

            // Stop early if we already have a strong/stable CDN result.
            if (score >= 35) break;

            // Keep probing a bit longer when best result is weak (e.g. zjcdn),
            // so we have a chance to find a better equivalent candidate.
            const scannedAttempts = index + 1;
            if (bestSuccess?.score >= 20 && scannedAttempts >= targetProbeDepth) {
                break;
            }

            continue;
        }

        failures.push({
            attempt: index + 1,
            head: directHeadStatusCode ?? "n/a",
            probe: directProbeStatusCode ?? "n/a",
        });
    }

    if (bestSuccess) {
        if (failures.length > 0 || bestSuccess.attempts > 1) {
            console.log("[douyin] media candidate retry success", {
                reason,
                videoId,
                attempts: bestSuccess.attempts,
                selected: bestSuccess.selectedUrl,
                resolved: bestSuccess.directUrl,
                probeStatus: bestSuccess.directProbeStatusCode,
                bytes: bestSuccess.bytes ?? "n/a",
                mediaClass: bestSuccess.mediaClass,
                failedStatuses: failures,
            });
        }
        const { score, ...resolved } = bestSuccess;
        return resolved;
    }

    if (candidates.length > 0) {
        console.warn("[douyin] media candidates exhausted", {
            reason,
            videoId,
            attempts: lastResult.attempts,
            cappedAttempts: lastResult.cappedAttempts,
            selected: lastResult.selectedUrl,
            resolved: lastResult.directUrl,
            probeStatus: lastResult.directProbeStatusCode ?? "n/a",
            mediaClass: lastResult.mediaClass,
            failedStatuses: failures,
        });
    }

    return lastResult;
};

const decodeDiscoverPlayUrl = (raw) => {
    if (typeof raw !== "string") return null;

    let url = raw.trim();
    if (!url) return null;

    // Some discover payloads embed escaped JSON URL fragments.
    for (let i = 0; i < 4; i++) {
        url = url
            .replace(/\\u0026/gi, "&")
            .replace(/\\u002f/gi, "/")
            .replace(/\\u003a/gi, ":")
            .replace(/\\x26/gi, "&")
            .replace(/\\\//g, "/");
    }

    // Decode generic unicode escapes such as \u003d / \u0025 if present.
    url = url.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
        try {
            return String.fromCharCode(parseInt(hex, 16));
        } catch {
            return _;
        }
    });

    url = url
        .replace(/&amp;/gi, "&")
        .replace(/\\+$/g, "");

    // Some responses embed URL-encoded payload fragments.
    for (let i = 0; i < 5; i++) {
        if (!/%[0-9a-f]{2}/i.test(url)) break;
        try {
            const decoded = decodeURIComponent(url);
            if (decoded === url) break;
            url = decoded;
        } catch {
            break;
        }
    }

    return normalizeMediaUrlCandidate(url);
};

const extractPercentEncodedPlayApiCandidates = (html, candidates, seen) => {
    const playApiKey = "%22playApi%22%3A%22";
    let position = 0;

    while (candidates.length < MAX_DISCOVER_PLAY_URL_CANDIDATES) {
        const keyStart = html.indexOf(playApiKey, position);
        if (keyStart < 0) break;

        const valueStart = keyStart + playApiKey.length;
        const valueEnd = html.indexOf("%22", valueStart);
        if (valueEnd < 0) break;

        const decoded = decodeDiscoverPlayUrl(html.slice(valueStart, valueEnd));
        if (decoded?.includes("/aweme/v1/play/")) {
            appendUniqueCandidate(candidates, seen, decoded);
        }

        position = valueEnd + 3;
    }
};

const extractPlayApiValueCandidates = (html, candidates, seen) => {
    if (typeof html !== "string" || !html) return;

    const valueRegex = /(?:\"|')playApi(?:\"|')\s*:\s*(?:\"|')([^\"']+)(?:\"|')/gi;
    let match;
    while ((match = valueRegex.exec(html)) !== null) {
        if (candidates.length >= MAX_DISCOVER_PLAY_URL_CANDIDATES) break;
        const decoded = decodeDiscoverPlayUrl(match[1]);
        appendUniqueCandidate(candidates, seen, decoded);
    }
};

const extractDirectVodCandidates = (html, candidates, seen) => {
    if (typeof html !== "string" || !html) return;

    const directVodRegex = /https?:\\?\/\\?\/[^"'<>\\\s]*(douyinvod\.com|zjcdn\.com|bytevod)[^"'<>\\\s]*/gi;
    let match;

    while ((match = directVodRegex.exec(html)) !== null) {
        if (candidates.length >= MAX_DISCOVER_PLAY_URL_CANDIDATES) break;
        const decoded = decodeDiscoverPlayUrl(match[0]);
        appendUniqueCandidate(candidates, seen, decoded);
    }
};

const extractGenericMediaCandidates = (html, candidates, seen) => {
    if (typeof html !== "string" || !html) return;

    const genericRegex =
        /https?:\\?\/\\?\/[^"'<>\\\s]*(?:aweme\/v1\/play\/\?|douyinvod\.com|zjcdn\.com|bytevod)[^"'<>\\\s]*/gi;
    let match;

    while ((match = genericRegex.exec(html)) !== null) {
        if (candidates.length >= MAX_DISCOVER_PLAY_URL_CANDIDATES) break;
        const decoded = decodeDiscoverPlayUrl(match[0]);
        appendUniqueCandidate(candidates, seen, decoded);
    }

    const percentEncodedRegex =
        /https%3A%2F%2F[^"'<>\\\s]*(?:%2Faweme%2Fv1%2Fplay%2F%3F|douyinvod\.com|zjcdn\.com|bytevod)[^"'<>\\\s]*/gi;
    while ((match = percentEncodedRegex.exec(html)) !== null) {
        if (candidates.length >= MAX_DISCOVER_PLAY_URL_CANDIDATES) break;
        const decoded = decodeDiscoverPlayUrl(match[0]);
        appendUniqueCandidate(candidates, seen, decoded);
    }

    const unicodeEscapedRegex =
        /https?:\\u002[fF]\\u002[fF][^"'<>\\\s]*(?:aweme\\u002[fF]v1\\u002[fF]play\\u002[fF]\\u003[fF]|douyinvod\.com|zjcdn\.com|bytevod)[^"'<>\\\s]*/gi;
    while ((match = unicodeEscapedRegex.exec(html)) !== null) {
        if (candidates.length >= MAX_DISCOVER_PLAY_URL_CANDIDATES) break;
        const decoded = decodeDiscoverPlayUrl(match[0]);
        appendUniqueCandidate(candidates, seen, decoded);
    }
};

const extractDiscoverPlayApiCandidates = (html) => {
    if (typeof html !== "string" || !html) return [];

    const candidates = [];
    const seen = new Set();
    const markers = [
        "https://www.douyin.com/aweme/v1/play/?",
        "https:\\/\\/www.douyin.com\\/aweme\\/v1\\/play\\/?",
    ];

    for (const marker of markers) {
        let position = 0;
        while (candidates.length < MAX_DISCOVER_PLAY_URL_CANDIDATES) {
            const start = html.indexOf(marker, position);
            if (start < 0) break;

            let end = start;
            while (end < html.length) {
                const ch = html[end];
                if (
                    ch === `"` ||
                    ch === `'` ||
                    ch === "<" ||
                    ch === ">" ||
                    ch === "\r" ||
                    ch === "\n" ||
                    ch === " " ||
                    ch === ")" ||
                    ch === "]"
                ) {
                    break;
                }
                end++;
            }

            const decoded = decodeDiscoverPlayUrl(html.slice(start, end));
            if (decoded?.includes("/aweme/v1/play/")) {
                appendUniqueCandidate(candidates, seen, decoded);
            }

            position = start + marker.length;
        }
    }

    // Some SSR payloads are URL-encoded blobs that contain playApi values.
    // Parse `%22playApi%22%3A%22https%3A%2F%2F...%22` style snippets.
    if (candidates.length < MAX_DISCOVER_PLAY_URL_CANDIDATES) {
        extractPercentEncodedPlayApiCandidates(html, candidates, seen);
    }

    if (candidates.length < MAX_DISCOVER_PLAY_URL_CANDIDATES) {
        extractPlayApiValueCandidates(html, candidates, seen);
    }

    if (candidates.length < MAX_DISCOVER_PLAY_URL_CANDIDATES) {
        extractDirectVodCandidates(html, candidates, seen);
    }

    if (candidates.length < MAX_DISCOVER_PLAY_URL_CANDIDATES) {
        extractGenericMediaCandidates(html, candidates, seen);
    }

    return candidates;
};

const fetchDiscoverPlayApiCandidates = async (videoId, meta = undefined) => {
    const discoverCookieMap = new Map();
    const discoverWarmupUrls = [
        `https://www.iesdouyin.com/share/video/${videoId}`,
        `https://www.douyin.com/video/${videoId}`,
    ];
    const discoverUrls = [
        `https://www.douyin.com/discover?modal_id=${videoId}`,
        `https://www.iesdouyin.com/discover?modal_id=${videoId}`,
    ];
    const discoverPlans = isUpstreamServer
        ? [
            { label: "desktop-priority", uas: [DESKTOP_UA], retries: DISCOVER_PAGE_RETRIES + 2 },
            { label: "mobile-fallback", uas: [MOBILE_UA], retries: 0 },
        ]
        : [
            { label: "default", uas: [DESKTOP_UA, MOBILE_UA], retries: DISCOVER_PAGE_RETRIES },
        ];
    let lastStatus;
    let lastSource = "n/a";
    let lastUA = "n/a";
    let lastPlan = "n/a";
    let sawWafChallenge = false;

    // Warm up cookie hints (ttwid/msToken), which improves discover SSR hit-rate
    // on some upstream regions where anonymous requests return reduced HTML.
    for (const warmupUrl of discoverWarmupUrls) {
        try {
            const warmupRes = await fetch(warmupUrl, {
                method: "GET",
                redirect: "manual",
                headers: {
                    "user-agent": DESKTOP_UA,
                    referer: "https://www.douyin.com/",
                },
                signal: AbortSignal.timeout(8000),
            });
            mergeCookieFromResponse(discoverCookieMap, warmupRes.headers);
        } catch {
            // non-fatal
        }
    }

    for (const plan of discoverPlans) {
        for (const discoverUrl of discoverUrls) {
            for (const discoverUA of plan.uas) {
                for (let attempt = 0; attempt <= plan.retries; attempt++) {
                    try {
                        const isDesktop = !discoverUA.includes("iPhone");
                        const cookieHeader = cookieMapToHeader(discoverCookieMap);
                        const res = await fetch(discoverUrl, {
                            headers: {
                                "user-agent": discoverUA,
                                referer: "https://www.douyin.com/",
                                accept: isDesktop
                                    ? "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
                                    : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                                "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
                                ...(isDesktop
                                    ? {
                                        "cache-control": "no-cache",
                                        pragma: "no-cache",
                                        "sec-ch-ua": "\"Chromium\";v=\"138\", \"Google Chrome\";v=\"138\", \"Not_A Brand\";v=\"99\"",
                                        "sec-ch-ua-mobile": "?0",
                                        "sec-ch-ua-platform": "\"Windows\"",
                                        "sec-fetch-dest": "document",
                                        "sec-fetch-mode": "navigate",
                                        "sec-fetch-site": "same-origin",
                                        "upgrade-insecure-requests": "1",
                                    }
                                    : {}),
                                ...(cookieHeader ? { cookie: cookieHeader } : {}),
                            },
                            signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
                        });

                        lastStatus = res.status;
                        lastSource = discoverUrl;
                        lastUA = discoverUA.includes("iPhone") ? "mobile" : "desktop";
                        lastPlan = plan.label;
                        mergeCookieFromResponse(discoverCookieMap, res.headers);
                        const html = await res.text();
                        if (!res.ok || looksLikeWafChallenge(html)) {
                            if (looksLikeWafChallenge(html)) sawWafChallenge = true;
                            if (attempt < plan.retries) {
                                await sleep(500 + Math.floor(Math.random() * 500));
                                continue;
                            }
                            break;
                        }

                        const candidates = extractDiscoverPlayApiCandidates(html);
                        if (candidates.length > 0) {
                            if (meta && typeof meta === "object") {
                                meta.sawWaf = sawWafChallenge;
                                meta.status = res.status;
                                meta.source = discoverUrl;
                                meta.ua = lastUA;
                                meta.plan = plan.label;
                            }
                            console.log("[douyin] discover play fallback extracted", {
                                videoId,
                                source: discoverUrl,
                                ua: lastUA,
                                plan: plan.label,
                                candidates: candidates.length,
                                cookieKeys: [...discoverCookieMap.keys()],
                            });
                            return candidates;
                        }

                        if (attempt < plan.retries) {
                            await sleep(300 + Math.floor(Math.random() * 300));
                            continue;
                        }
                    } catch (e) {
                        if (attempt < plan.retries) {
                            await sleep(300 + Math.floor(Math.random() * 300));
                            continue;
                        }
                        console.warn("[douyin] discover play fallback fetch failed", {
                            videoId,
                            source: discoverUrl,
                            ua: discoverUA.includes("iPhone") ? "mobile" : "desktop",
                            plan: plan.label,
                            message: e?.message || "unknown",
                        });
                        break;
                    }
                }
            }
        }
    }

    if (meta && typeof meta === "object") {
        meta.sawWaf = sawWafChallenge;
        meta.status = lastStatus;
        meta.source = lastSource;
        meta.ua = lastUA;
        meta.plan = lastPlan;
    }

    console.warn("[douyin] discover play fallback unavailable", {
        videoId,
        source: lastSource,
        ua: lastUA,
        plan: lastPlan,
        status: lastStatus ?? "n/a",
        waf: sawWafChallenge,
    });
    return [];
};

const tryResolveViaDiscover = async (videoId, reason = "generic", options = {}) => {
    const meta = {};
    const discoverCandidates = await fetchDiscoverPlayApiCandidates(videoId, meta);
    if (discoverCandidates.length === 0) {
        if (options.withMeta) {
            return {
                resolved: null,
                meta,
            };
        }
        return null;
    }

    const {
        selectedUrl,
        directUrl,
        directHeadStatusCode,
        directProbeStatusCode,
        bytes,
        attempts,
        cappedAttempts,
        mediaClass,
    } = await resolveDirectUrlFromCandidates(discoverCandidates, {
        reason: `discover:${reason}`,
        videoId,
        maxAttempts: MAX_DISCOVER_MEDIA_CANDIDATE_ATTEMPTS,
    });

    console.log("[douyin] discover fallback media probe", {
        reason,
        videoId,
        selected: selectedUrl,
        resolved: directUrl,
        directProbeStatusCode: directProbeStatusCode ?? "n/a",
        bytes: bytes ?? "n/a",
        attempts: `${attempts}/${cappedAttempts}`,
        mediaClass,
    });

    if (
        typeof directProbeStatusCode !== "number" ||
        directProbeStatusCode >= 400
    ) {
        if (options.withMeta) {
            return {
                resolved: null,
                meta,
            };
        }
        return null;
    }

    const resolved = {
        selectedUrl,
        directUrl,
        directHeadStatusCode,
        directProbeStatusCode,
        bytes,
        mediaClass,
    };
    if (options.withMeta) {
        return {
            resolved,
            meta,
        };
    }
    return resolved;
};

const buildRelayHeaders = () => {
    const headers = {
        "ngrok-skip-browser-warning": "true",
    };

    if (env.instagramUpstreamApiKey) {
        headers.Authorization = `Api-Key ${env.instagramUpstreamApiKey}`;
    }

    return headers;
};

const normalizeMediaUrlCandidate = (raw) => {
    if (typeof raw !== "string") return null;

    let url = raw.trim();
    if (!url) return null;

    if (url.startsWith("//")) {
        url = `https:${url}`;
    } else if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(url)) {
        url = `https://${url}`;
    }

    if (url.startsWith("http://") || url.startsWith("https://")) {
        return url;
    }

    return null;
};

const buildOrderedMediaCandidates = (item, videoUri) => {
    const directVod = [];
    const nonWatermarkedApi = [];
    const watermarkedApi = [];
    const others = [];
    const seen = new Set();

    const pushIntoBucket = (raw) => {
        const url = normalizeMediaUrlCandidate(raw);
        if (!url || seen.has(url)) return;
        seen.add(url);

        if (/douyinvod\.com|bytevod|tos-cn-ve-/i.test(url)) {
            directVod.push(url);
            return;
        }
        if (/\/aweme\/v1\/play\//i.test(url)) {
            nonWatermarkedApi.push(url);
            return;
        }
        if (/\/aweme\/v1\/playwm\//i.test(url)) {
            watermarkedApi.push(url);
            // Also enqueue a de-watermarked variant right away.
            pushIntoBucket(url.replace(/\/aweme\/v1\/playwm\//i, "/aweme/v1/play/"));
            return;
        }

        others.push(url);
    };

    const pushUrls = (value) => {
        if (!Array.isArray(value)) return;
        for (const raw of value) {
            pushIntoBucket(raw);
        }
    };

    pushUrls(item?.video?.download_addr?.url_list);
    pushUrls(item?.video?.play_addr?.url_list);

    if (Array.isArray(item?.video?.bit_rate)) {
        for (const bitrate of item.video.bit_rate) {
            pushUrls(bitrate?.play_addr?.url_list);
        }
    }

    if (videoUri) {
        pushIntoBucket(
            `https://aweme.snssdk.com/aweme/v1/play/?video_id=${videoUri}&ratio=1080p&line=0`,
        );
    }

    return [
        ...directVod,
        ...nonWatermarkedApi,
        ...watermarkedApi,
        ...others,
    ];
};

export default async function(obj) {
    let videoId = obj.id;

    if (!videoId && obj.shortLink) {
        try {
            const finalUrl = await resolveShortLinkFinalUrl(obj.shortLink);
            // https://www.douyin.com/video/73123456789...
            // or https://www.iesdouyin.com/share/video/73123456789...
            
            const match = finalUrl.match(/\/video\/(\d+)/) || finalUrl.match(/mid=(\d+)/) || finalUrl.match(/\/share\/video\/(\d+)/);
            if (match) {
                videoId = match[1];
            }
        } catch (e) {
            console.error("Douyin shortlink fetch failed:", e);

            const upstreamTargetUrl = getUpstreamTargetUrl({ shortLink: obj.shortLink });
            if (upstreamTargetUrl) {
                const upstream = await requestUpstreamCobalt(upstreamTargetUrl);
                if (upstream?.url) {
                    logUpstreamUsed("shortlink_fetch_failed", {
                        videoId,
                        shortLink: obj.shortLink,
                        targetUrl: upstreamTargetUrl,
                        status: upstream.status,
                    });
                    if (upstream.relayUrl) {
                        return {
                            filename: upstream.filename || `douyin_${obj.shortLink}.mp4`,
                            audioFilename: `douyin_${obj.shortLink}_audio`,
                            urls: upstream.relayUrl,
                            duration: upstream.duration,
                            headers: buildRelayHeaders(),
                        };
                    }
                    return {
                        filename: upstream.filename || `douyin_${obj.shortLink}.mp4`,
                        audioFilename: `douyin_${obj.shortLink}_audio`,
                        urls: upstream.url,
                        forceRedirect: true,
                        duration: upstream.duration,
                        headers: {
                            "User-Agent": MOBILE_UA,
                        },
                    };
                }
            }

            return { error: "fetch.short_link" };
        }
    }

    if (!videoId) return { error: "fetch.short_link" };

    // Fetch share page
    const shareUrls = [
        `https://www.iesdouyin.com/share/video/${videoId}`,
        `https://m.douyin.com/share/video/${videoId}`,
    ];
    let html;
    let shareUrl;
    let wafDetected = false;

    let lastFetchError;
    for (const candidateUrl of shareUrls) {
        shareUrl = candidateUrl;

        for (let attempt = 0; attempt <= SHARE_PAGE_RETRIES; attempt++) {
            try {
                const res = await fetch(candidateUrl, {
                    headers: {
                        "user-agent": MOBILE_UA,
                    },
                    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
                });

                const body = await res.text();

                if (!res.ok) {
                    // Douyin may return anti-bot blocks as HTTP errors.
                    if ([403, 412, 429].includes(res.status)) {
                        wafDetected = true;
                        console.warn(
                            `Douyin share page blocked (status ${res.status}, attempt ${attempt + 1})`,
                            { shareUrl: candidateUrl, bytes: body.length },
                        );

                        if (attempt < SHARE_PAGE_RETRIES) {
                            await sleep(800 + Math.floor(Math.random() * 800));
                            continue;
                        }

                        break;
                    }

                    lastFetchError = new Error(`Status ${res.status}`);
                    break;
                }

                if (looksLikeWafChallenge(body)) {
                    wafDetected = true;
                    console.warn(
                        `Douyin WAF challenge detected while fetching share page (attempt ${attempt + 1})`,
                        { shareUrl: candidateUrl, bytes: body.length },
                    );

                    if (attempt < SHARE_PAGE_RETRIES) {
                        // Backoff to avoid repeatedly hitting WAF on bursty traffic.
                        await sleep(800 + Math.floor(Math.random() * 800));
                        continue;
                    }

                    break;
                }

                html = body;
                break;
            } catch (e) {
                lastFetchError = e;

                if (attempt < SHARE_PAGE_RETRIES) {
                    await sleep(400 + Math.floor(Math.random() * 400));
                    continue;
                }

                break;
            }
        }

        if (html) break;
    }

    if (!html) {
        if (wafDetected) {
            const discover = await tryResolveViaDiscover(videoId, "waf_fetch");
            if (discover?.directUrl) {
                return {
                    filename: `douyin_${videoId}.mp4`,
                    audioFilename: `douyin_${videoId}_audio`,
                    urls: discover.directUrl,
                    forceRedirect: true,
                    headers: {
                        "User-Agent": MOBILE_UA,
                    },
                };
            }

            const upstreamTargetUrl = getUpstreamTargetUrl({ videoId, shortLink: obj.shortLink });
            if (upstreamTargetUrl) {
                console.warn("Douyin WAF challenge detected, trying upstream cobalt", {
                    targetUrl: upstreamTargetUrl,
                });

                const upstream = await requestUpstreamCobalt(upstreamTargetUrl);
                if (upstream?.url) {
                    logUpstreamUsed("waf_fetch", {
                        videoId,
                        shortLink: obj.shortLink,
                        targetUrl: upstreamTargetUrl,
                        status: upstream.status,
                    });
                    if (upstream.relayUrl) {
                        return {
                            filename: upstream.filename || `douyin_${videoId}.mp4`,
                            audioFilename: `douyin_${videoId}_audio`,
                            urls: upstream.relayUrl,
                            duration: upstream.duration,
                            headers: buildRelayHeaders(),
                        };
                    }
                    return {
                        filename: upstream.filename || `douyin_${videoId}.mp4`,
                        audioFilename: `douyin_${videoId}_audio`,
                        urls: upstream.url,
                        forceRedirect: true,
                        duration: upstream.duration,
                        headers: {
                            "User-Agent": MOBILE_UA,
                        },
                    };
                }
            }

            return { error: "fetch.rate", limit: WAF_RETRY_AFTER_SECONDS };
        }
        if (lastFetchError) {
            console.error("Douyin share page fetch failed:", lastFetchError);
        }
        return { error: "fetch.fail" };
    }

    // Extract _ROUTER_DATA
    let data;
    try {
        const jsonStr = html.match(/window\._ROUTER_DATA\s*=\s*(.*?)(?=<\/script>)/s);
        if (jsonStr) {
            data = JSON.parse(jsonStr[1].trim());
        } else {
            // Fallback for RENDER_DATA
            const renderStr = html.match(/window\._RENDER_DATA\s*=\s*(.*?)(?=<\/script>)/s);
            if (renderStr) {
                data = JSON.parse(decodeURIComponent(renderStr[1].trim()));
            }
        }
        
        if (!data) throw new Error("no router data found in html");
    } catch (e) {
        if (looksLikeWafChallenge(html)) {
            console.warn("Douyin WAF challenge detected while parsing share page", {
                shareUrl,
                bytes: html.length,
            });

            const discover = await tryResolveViaDiscover(videoId, "waf_parse");
            if (discover?.directUrl) {
                return {
                    filename: `douyin_${videoId}.mp4`,
                    audioFilename: `douyin_${videoId}_audio`,
                    urls: discover.directUrl,
                    forceRedirect: true,
                    headers: {
                        "User-Agent": MOBILE_UA,
                    },
                };
            }

            const upstreamTargetUrl = getUpstreamTargetUrl({ videoId, shortLink: obj.shortLink });
            if (upstreamTargetUrl) {
                console.warn("Douyin WAF challenge detected, trying upstream cobalt", {
                    targetUrl: upstreamTargetUrl,
                });

                const upstream = await requestUpstreamCobalt(upstreamTargetUrl);
                if (upstream?.url) {
                    logUpstreamUsed("waf_parse", {
                        videoId,
                        shortLink: obj.shortLink,
                        targetUrl: upstreamTargetUrl,
                        status: upstream.status,
                    });
                    if (upstream.relayUrl) {
                        return {
                            filename: upstream.filename || `douyin_${videoId}.mp4`,
                            audioFilename: `douyin_${videoId}_audio`,
                            urls: upstream.relayUrl,
                            duration: upstream.duration,
                            headers: buildRelayHeaders(),
                        };
                    }
                    return {
                        filename: upstream.filename || `douyin_${videoId}.mp4`,
                        audioFilename: `douyin_${videoId}_audio`,
                        urls: upstream.url,
                        forceRedirect: true,
                        duration: upstream.duration,
                        headers: {
                            "User-Agent": MOBILE_UA,
                        },
                    };
                }
            }

            return { error: "fetch.rate", limit: WAF_RETRY_AFTER_SECONDS };
        }
        console.error("Douyin data parse failed:", e);
        return { error: "fetch.fail" };
    }

    // Navigate JSON
    try {
        // Handle both _ROUTER_DATA structure and potential variations
        const loaderData = data.loaderData;
        if (!loaderData) throw new Error("no loaderData");

        const videoPageKey = Object.keys(loaderData).find(k => k.includes('video_') && k.includes('/page'));
        if (!videoPageKey) throw new Error("no video page key");

        const videoInfoRes = loaderData[videoPageKey].videoInfoRes;
        if (!videoInfoRes) throw new Error("no videoInfoRes");

        const filterReasons = Array.isArray(videoInfoRes.filter_list)
            ? videoInfoRes.filter_list
                .map((entry) => String(entry?.filter_reason || "").trim())
                .filter(Boolean)
            : [];

        const item = videoInfoRes.item_list ? videoInfoRes.item_list[0] : null;
        if (!item) {
            if (filterReasons.length) {
                console.warn("[douyin] video unavailable from share payload", {
                    videoId,
                    statusCode: videoInfoRes.status_code,
                    isOversea: videoInfoRes.is_oversea,
                    filterReasons,
                    upstream: isUpstreamServer,
                });
            }

            const discover = await tryResolveViaDiscover(videoId, "no_item_list");
            if (discover?.directUrl) {
                return {
                    filename: `douyin_${videoId}.mp4`,
                    audioFilename: `douyin_${videoId}_audio`,
                    urls: discover.directUrl,
                    forceRedirect: true,
                    headers: {
                        "User-Agent": MOBILE_UA,
                    },
                };
            }

            const upstreamTargetUrl = getUpstreamTargetUrl({ videoId, shortLink: obj.shortLink });
            if (upstreamTargetUrl && !isUpstreamServer) {
                console.warn("[douyin] no item list after local retries, trying upstream cobalt", {
                    videoId,
                    targetUrl: upstreamTargetUrl,
                    localAttempts: SHARE_PAGE_RETRIES + 1,
                });

                const upstream = await requestUpstreamCobalt(upstreamTargetUrl, {
                    quickMode: true,
                });
                if (upstream?.url) {
                    logUpstreamUsed("no_item_list", {
                        videoId,
                        shortLink: obj.shortLink,
                        targetUrl: upstreamTargetUrl,
                        status: upstream.status,
                    });
                    if (upstream.relayUrl) {
                        return {
                            filename: upstream.filename || `douyin_${videoId}.mp4`,
                            audioFilename: `douyin_${videoId}_audio`,
                            urls: upstream.relayUrl,
                            duration: upstream.duration,
                            headers: buildRelayHeaders(),
                        };
                    }
                    return {
                        filename: upstream.filename || `douyin_${videoId}.mp4`,
                        audioFilename: `douyin_${videoId}_audio`,
                        urls: upstream.url,
                        forceRedirect: true,
                        duration: upstream.duration,
                        headers: {
                            "User-Agent": MOBILE_UA,
                        },
                    };
                }
            }

            if (filterReasons.length) {
                return { error: "fetch.empty" };
            }

            throw new Error("no item list");
        }

        const videoUri = item.video.play_addr.uri;
        const title = item.desc;
        const duration = toSeconds(item?.video?.duration ?? item?.duration);

        let usedDiscoverFallback = false;
        const awemeOnlyPayload = isAwemeOnlyPayload(item);
        const probeCandidates = buildOrderedMediaCandidates(item, videoUri);

        let selectedMediaUrl;
        let directUrl;
        let directHeadStatusCode;
        let directProbeStatusCode;
        let contentLengthBytes;
        let attempts = 0;
        let cappedAttempts = 0;
        let mediaClass = "unknown";
        let discoverMeta = null;

        if (awemeOnlyPayload) {
            const discoverFirst = await tryResolveViaDiscover(videoId, "aweme_only_payload", { withMeta: true });
            discoverMeta = discoverFirst?.meta || null;
            if (discoverFirst?.resolved?.directUrl) {
                selectedMediaUrl = discoverFirst.resolved.selectedUrl;
                directUrl = discoverFirst.resolved.directUrl;
                directHeadStatusCode = discoverFirst.resolved.directHeadStatusCode;
                directProbeStatusCode = discoverFirst.resolved.directProbeStatusCode;
                contentLengthBytes = discoverFirst.resolved.bytes;
                mediaClass = discoverFirst.resolved.mediaClass;
                attempts = 1;
                cappedAttempts = 1;
                usedDiscoverFallback = true;
            }
        }

        if (!directUrl) {
            const primaryProbeAttempts = awemeOnlyPayload
                ? Math.min(2, MAX_PRIMARY_MEDIA_CANDIDATE_ATTEMPTS)
                : MAX_PRIMARY_MEDIA_CANDIDATE_ATTEMPTS;

            if (!awemeOnlyPayload) {
                // Resolve the redirect to get the direct CDN URL.
                const resolved = await resolveDirectUrlFromCandidates(probeCandidates, {
                    reason: "primary",
                    videoId,
                    maxAttempts: primaryProbeAttempts,
                });
                selectedMediaUrl = resolved.selectedUrl;
                directUrl = resolved.directUrl;
                directHeadStatusCode = resolved.directHeadStatusCode;
                directProbeStatusCode = resolved.directProbeStatusCode;
                contentLengthBytes = resolved.bytes;
                attempts = resolved.attempts;
                cappedAttempts = resolved.cappedAttempts;
                mediaClass = resolved.mediaClass;
            } else {
                // For aweme-only payloads, probe one candidate quickly first.
                const quickResolved = await resolveDirectUrlFromCandidates(probeCandidates, {
                    reason: "primary_quick",
                    videoId,
                    maxAttempts: 1,
                });
                selectedMediaUrl = quickResolved.selectedUrl;
                directUrl = quickResolved.directUrl;
                directHeadStatusCode = quickResolved.directHeadStatusCode;
                directProbeStatusCode = quickResolved.directProbeStatusCode;
                contentLengthBytes = quickResolved.bytes;
                attempts = quickResolved.attempts;
                cappedAttempts = quickResolved.cappedAttempts;
                mediaClass = quickResolved.mediaClass;

                const quickProbeUnresolved =
                    typeof directProbeStatusCode !== "number" ||
                    directProbeStatusCode >= 400;
                const shouldPrioritizeUpstream =
                    quickProbeUnresolved &&
                    !isUpstreamServer &&
                    Boolean(env.instagramUpstreamURL) &&
                    discoverMeta?.sawWaf === true;

                if (shouldPrioritizeUpstream) {
                    const upstreamTargetUrl = getUpstreamTargetUrl({
                        videoId,
                        shortLink: obj.shortLink,
                    });

                    if (upstreamTargetUrl) {
                        console.warn("[douyin] aweme-only quick probe failed under discover waf, prioritizing upstream", {
                            videoId,
                            directStatusCode: directProbeStatusCode,
                            upstreamTargetUrl,
                        });

                        const upstream = await requestUpstreamCobalt(upstreamTargetUrl, {
                            quickMode: true,
                        });
                        if (upstream?.url) {
                            logUpstreamUsed("aweme_only_waf_probe_status", {
                                videoId,
                                shortLink: obj.shortLink,
                                targetUrl: upstreamTargetUrl,
                                status: upstream.status,
                            });
                            if (upstream.relayUrl) {
                                return {
                                    filename: upstream.filename || `douyin_${videoId}.mp4`,
                                    audioFilename: `douyin_${videoId}_audio`,
                                    urls: upstream.relayUrl,
                                    duration: upstream.duration,
                                    headers: buildRelayHeaders(),
                                };
                            }
                            return {
                                filename: upstream.filename || `douyin_${videoId}.mp4`,
                                audioFilename: `douyin_${videoId}_audio`,
                                urls: upstream.url,
                                forceRedirect: true,
                                duration: upstream.duration,
                                headers: {
                                    "User-Agent": MOBILE_UA,
                                },
                            };
                        }
                    }
                }

                if (quickProbeUnresolved && primaryProbeAttempts > 1) {
                    console.warn("[douyin] aweme-only quick probe unresolved, probing extended primary candidates", {
                        videoId,
                        attempts: primaryProbeAttempts,
                    });

                    const resolved = await resolveDirectUrlFromCandidates(probeCandidates, {
                        reason: "primary",
                        videoId,
                        maxAttempts: primaryProbeAttempts,
                    });
                    selectedMediaUrl = resolved.selectedUrl;
                    directUrl = resolved.directUrl;
                    directHeadStatusCode = resolved.directHeadStatusCode;
                    directProbeStatusCode = resolved.directProbeStatusCode;
                    contentLengthBytes = resolved.bytes;
                    attempts = resolved.attempts;
                    cappedAttempts = resolved.cappedAttempts;
                    mediaClass = resolved.mediaClass;
                }
            }
        }

        console.log("[douyin] media url selected", {
            videoId,
            selected: selectedMediaUrl,
            resolved: directUrl,
            directHeadStatusCode: directHeadStatusCode ?? "n/a",
            directProbeStatusCode: directProbeStatusCode ?? "n/a",
            bytes: contentLengthBytes ?? "n/a",
            attempts: `${attempts}/${cappedAttempts}`,
            mediaClass,
        });

        // Treat undefined probe status as a failed candidate so we can continue
        // with discover/upstream fallback instead of returning an unknown-bad URL.
        if (typeof directProbeStatusCode !== "number") {
            directProbeStatusCode = 599;
        }

        if (typeof directProbeStatusCode === "number" && directProbeStatusCode >= 400) {
            const discover = await tryResolveViaDiscover(videoId, "direct_probe_status");
            if (discover?.directUrl) {
                selectedMediaUrl = discover.selectedUrl;
                directUrl = discover.directUrl;
                directHeadStatusCode = discover.directHeadStatusCode;
                directProbeStatusCode = discover.directProbeStatusCode;
                contentLengthBytes = discover.bytes;
                mediaClass = discover.mediaClass;
                usedDiscoverFallback = true;
            }
        }

        const shouldFallbackByDirectStatus =
            typeof directProbeStatusCode === "number" &&
            directProbeStatusCode >= 400;

        if (!env.instagramUpstreamURL && shouldFallbackByDirectStatus) {
            console.warn("[douyin] direct media probe failed and upstream is not configured", {
                videoId,
                directStatusCode: directProbeStatusCode,
                directUrl,
                upstream: isUpstreamServer,
            });

            // Upstream node cannot chain to another upstream by design.
            // Returning a known-bad aweme URL causes dead tunnel loops.
            return { error: "fetch.fail" };
        }

        if (env.instagramUpstreamURL && shouldFallbackByDirectStatus) {
            const upstreamTargetUrl = getUpstreamTargetUrl({
                videoId,
                shortLink: obj.shortLink,
            });
            if (upstreamTargetUrl) {
                console.warn("[douyin] direct media fallback condition met, trying upstream cobalt", {
                    videoId,
                    bytes: contentLengthBytes ?? "n/a",
                    directStatusCode: directProbeStatusCode ?? "n/a",
                    directUrl,
                    mediaClass,
                });
                const upstream = await requestUpstreamCobalt(upstreamTargetUrl, {
                    quickMode: awemeOnlyPayload,
                });
                if (upstream?.url) {
                    const upstreamReason = "direct_probe_status";
                    logUpstreamUsed(upstreamReason, {
                        videoId,
                        shortLink: obj.shortLink,
                        targetUrl: upstreamTargetUrl,
                        status: upstream.status,
                    });
                    if (upstream.relayUrl) {
                        return {
                            filename: upstream.filename || `douyin_${videoId}.mp4`,
                            audioFilename: `douyin_${videoId}_audio`,
                            urls: upstream.relayUrl,
                            duration: upstream.duration,
                            headers: buildRelayHeaders(),
                        };
                    }
                    return {
                        filename: upstream.filename || `douyin_${videoId}.mp4`,
                        audioFilename: `douyin_${videoId}_audio`,
                        urls: upstream.url,
                        forceRedirect: true,
                        duration: upstream.duration,
                        headers: {
                            "User-Agent": MOBILE_UA,
                        },
                    };
                }
            }

            // If direct media endpoint is already 4xx/5xx and upstream is unavailable,
            // return a hard failure instead of a tunnel that will certainly 404.
            if (shouldFallbackByDirectStatus) {
                return { error: "fetch.fail" };
            }
        }

        const allowZjcdnRedirect = shouldAllowZjcdnRedirect({
            mediaClass,
            bytes: contentLengthBytes,
        });
        const preferRedirect =
            shouldPreferRedirectForMediaClass(mediaClass) || allowZjcdnRedirect;

        return {
            filename: `douyin_${videoId}.mp4`,
            audioFilename: `douyin_${videoId}_audio`,
            urls: directUrl,
            forceRedirect: usedDiscoverFallback || preferRedirect,
            allowZjcdnRedirect,
            duration,
            headers: {
                "User-Agent": MOBILE_UA
            }
        };
    } catch (e) {
        console.error("Douyin extraction error:", e);
        return { error: "fetch.fail" };
    }
}
