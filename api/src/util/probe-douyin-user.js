import { readFile } from "node:fs/promises";

const DESKTOP_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
const MOBILE_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

const DEFAULT_TIMEOUT_MS = 20000;

const parseArgs = () => {
    const args = process.argv.slice(2);
    const options = {
        pages: 1,
        count: 18,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        api: "all",
        cookie: process.env.DOUYIN_COOKIE || "",
        cookiePath: process.env.COOKIE_PATH || "src/cookies.json",
    };

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        const next = args[i + 1];

        if (arg === "--url" && next) {
            options.url = next;
            i += 1;
        } else if (arg === "--sec-user-id" && next) {
            options.secUserId = next;
            i += 1;
        } else if (arg === "--cookie" && next) {
            options.cookie = next;
            i += 1;
        } else if (arg === "--cookie-path" && next) {
            options.cookiePath = next;
            i += 1;
        } else if (arg === "--pages" && next) {
            const parsed = Number.parseInt(next, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
                options.pages = Math.min(parsed, 20);
            }
            i += 1;
        } else if (arg === "--count" && next) {
            const parsed = Number.parseInt(next, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
                options.count = Math.min(parsed, 50);
            }
            i += 1;
        } else if (arg === "--timeout-ms" && next) {
            const parsed = Number.parseInt(next, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
                options.timeoutMs = parsed;
            }
            i += 1;
        } else if (arg === "--api" && next) {
            options.api = next;
            i += 1;
        }
    }

    if (!options.secUserId && options.url) {
        try {
            const url = new URL(options.url);
            const match =
                url.pathname.match(/^\/user\/([^/]+)/) ||
                url.pathname.match(/^\/share\/user\/([^/]+)/);
            if (match?.[1]) {
                options.secUserId = decodeURIComponent(match[1]);
            }
        } catch {
            // ignore
        }
    }

    return options;
};

const loadDouyinCookieFromFile = async (cookiePath) => {
    if (!cookiePath) return "";

    try {
        const raw = await readFile(cookiePath, "utf8");
        const json = JSON.parse(raw);
        const entries = Array.isArray(json?.douyin) ? json.douyin : [];
        return entries.find((entry) => typeof entry === "string" && entry.trim()) || "";
    } catch {
        return "";
    }
};

const parseSetCookiePairs = (setCookieHeader) => {
    if (!setCookieHeader) return [];

    const pairs = [];
    const regex = /(?:^|,\s*)([A-Za-z0-9_]+)=([^;,\r\n]+)/g;
    let match;

    while ((match = regex.exec(setCookieHeader)) !== null) {
        const [, name, value] = match;
        if (name && value) pairs.push([name, value]);
    }

    return pairs;
};

const parseCookieHeader = (cookieHeader) => {
    const map = new Map();
    for (const part of String(cookieHeader || "").split(";")) {
        const trimmed = part.trim();
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;
        const name = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim();
        if (name && value) map.set(name, value);
    }
    return map;
};

const cookieMapToHeader = (cookieMap) =>
    [...cookieMap.entries()].map(([name, value]) => `${name}=${value}`).join("; ");

const mergeSetCookie = (cookieMap, headers) => {
    const setCookie = headers?.get?.("set-cookie");
    for (const [name, value] of parseSetCookiePairs(setCookie)) {
        cookieMap.set(name, value);
    }
};

const summarizeText = (text) => ({
    hasRouterData: text.includes("window._ROUTER_DATA"),
    hasRenderData: text.includes("window._RENDER_DATA"),
    hasAwemeId: /aweme_id|modal_id|\/video\/\d{10,}/.test(text),
    hasBytedAcrawler: text.includes("byted_acrawler"),
    hasAcSignature: text.includes("__ac_signature"),
    hasWafChallenge:
        text.includes("waf-jschallenge") ||
        text.includes("_wafchallengeid") ||
        text.includes("WAFJS"),
    title: text.match(/<title>(.*?)<\/title>/i)?.[1],
});

const summarizeJson = (json) => {
    const awemeList =
        (Array.isArray(json?.aweme_list) && json.aweme_list) ||
        (Array.isArray(json?.data?.aweme_list) && json.data.aweme_list) ||
        (Array.isArray(json?.item_list) && json.item_list) ||
        [];

    return {
        statusCode: json?.status_code ?? json?.statusCode ?? json?.code,
        statusMsg: json?.status_msg ?? json?.statusMsg ?? json?.message,
        hasMore: json?.has_more ?? json?.hasMore ?? json?.data?.has_more,
        maxCursor: json?.max_cursor ?? json?.maxCursor ?? json?.data?.max_cursor,
        awemeCount: awemeList.length,
        awemeIds: awemeList
            .map((item) => item?.aweme_id || item?.awemeId || item?.aweme?.aweme_id)
            .filter(Boolean)
            .slice(0, 10),
    };
};

const request = async ({ label, url, ua, referer, cookieMap, timeoutMs }) => {
    const startedAt = Date.now();
    const headers = {
        "user-agent": ua,
        referer,
        accept: "application/json,text/plain,text/html,*/*",
    };

    const cookie = cookieMapToHeader(cookieMap);
    if (cookie) headers.cookie = cookie;

    try {
        const res = await fetch(url, {
            headers,
            redirect: "follow",
            signal: AbortSignal.timeout(timeoutMs),
        });
        mergeSetCookie(cookieMap, res.headers);

        const text = await res.text();
        const contentType = res.headers.get("content-type") || "";
        const base = {
            label,
            status: res.status,
            contentType,
            finalUrl: res.url,
            bytes: Buffer.byteLength(text),
            durationMs: Date.now() - startedAt,
            cookieKeys: [...cookieMap.keys()].sort(),
        };

        if (contentType.includes("application/json")) {
            let json = null;
            try {
                json = text ? JSON.parse(text) : null;
            } catch {
                // ignore
            }
            return {
                ...base,
                json: json ? summarizeJson(json) : null,
                sample: text.slice(0, 300),
            };
        }

        return {
            ...base,
            html: summarizeText(text),
            sample: text.slice(0, 300),
        };
    } catch (error) {
        return {
            label,
            error: error?.name || "Error",
            message: error?.message || String(error),
            durationMs: Date.now() - startedAt,
        };
    }
};

const buildApiUrls = ({ secUserId, count, cursor }) => {
    const encoded = encodeURIComponent(secUserId);
    const webPost = new URL("https://www.douyin.com/aweme/v1/web/aweme/post/");
    webPost.searchParams.set("device_platform", "webapp");
    webPost.searchParams.set("aid", "6383");
    webPost.searchParams.set("channel", "channel_pc_web");
    webPost.searchParams.set("sec_user_id", secUserId);
    webPost.searchParams.set("max_cursor", String(cursor));
    webPost.searchParams.set("locate_query", "false");
    webPost.searchParams.set("show_live_replay_strategy", "1");
    webPost.searchParams.set("count", String(count));
    webPost.searchParams.set("publish_video_strategy_type", "2");

    const profile = new URL("https://www.douyin.com/aweme/v1/web/user/profile/other/");
    profile.searchParams.set("device_platform", "webapp");
    profile.searchParams.set("aid", "6383");
    profile.searchParams.set("sec_user_id", secUserId);

    return [
        {
            key: "profile",
            label: "web profile",
            url: profile.toString(),
            ua: DESKTOP_UA,
            referer: `https://www.douyin.com/user/${encoded}`,
        },
        {
            key: "web",
            label: `web post cursor=${cursor}`,
            url: webPost.toString(),
            ua: DESKTOP_UA,
            referer: `https://www.douyin.com/user/${encoded}`,
        },
        {
            key: "mobile-old",
            label: `mobile old post cursor=${cursor}`,
            url: `https://m.douyin.com/web/api/v2/aweme/post/?sec_uid=${encoded}&count=${count}&max_cursor=${cursor}&aid=1128`,
            ua: MOBILE_UA,
            referer: "https://m.douyin.com/",
        },
        {
            key: "ies-old",
            label: `ies old post cursor=${cursor}`,
            url: `https://www.iesdouyin.com/web/api/v2/aweme/post/?sec_uid=${encoded}&count=${count}&max_cursor=${cursor}&aid=1128`,
            ua: MOBILE_UA,
            referer: "https://www.iesdouyin.com/",
        },
    ];
};

const main = async () => {
    const options = parseArgs();
    if (!options.secUserId) {
        console.error(
            "Usage: pnpm douyin:probe-user -- --url <douyin-user-url> [--pages 2] [--cookie \"name=value; ...\"]",
        );
        console.error(
            "   or: pnpm douyin:probe-user -- --sec-user-id <sec_user_id> [--pages 2]",
        );
        process.exitCode = 1;
        return;
    }

    const fileCookie = options.cookie
        ? ""
        : await loadDouyinCookieFromFile(options.cookiePath);
    const cookieMap = parseCookieHeader(options.cookie || fileCookie);
    const encoded = encodeURIComponent(options.secUserId);

    console.log(
        JSON.stringify(
            {
                probe: "douyin-user",
                secUserId: options.secUserId,
                pages: options.pages,
                count: options.count,
                timeoutMs: options.timeoutMs,
                api: options.api,
                cookieSource: options.cookie
                    ? "arg/env"
                    : fileCookie
                        ? options.cookiePath
                        : "none",
                initialCookieKeys: [...cookieMap.keys()].sort(),
            },
            null,
            2,
        ),
    );

    const warmups = [
        {
            label: "desktop user page",
            url: `https://www.douyin.com/user/${encoded}`,
            ua: DESKTOP_UA,
            referer: "https://www.douyin.com/",
        },
        {
            label: "mobile share user page",
            url: `https://m.douyin.com/share/user/${encoded}`,
            ua: MOBILE_UA,
            referer: "https://m.douyin.com/",
        },
    ];

    for (const warmup of warmups) {
        const result = await request({
            ...warmup,
            cookieMap,
            timeoutMs: options.timeoutMs,
        });
        console.log(JSON.stringify(result, null, 2));
    }

    let cursor = 0;
    for (let page = 0; page < options.pages; page += 1) {
        const apiUrls = buildApiUrls({
            secUserId: options.secUserId,
            count: options.count,
            cursor,
        }).filter((entry) => options.api === "all" || entry.key === options.api);

        let nextCursor = null;
        for (const entry of apiUrls) {
            const result = await request({
                ...entry,
                cookieMap,
                timeoutMs: options.timeoutMs,
            });
            console.log(JSON.stringify(result, null, 2));

            if (result?.json?.awemeCount > 0) {
                nextCursor = result.json.maxCursor;
            }
        }

        if (nextCursor == null || nextCursor === cursor) {
            break;
        }
        cursor = nextCursor;
    }
};

await main();
