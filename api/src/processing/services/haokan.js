const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const PAGE_TIMEOUT_MS = 15000;

const requestHeaders = {
    "user-agent": MOBILE_UA,
    referer: "https://haokan.baidu.com/",
};

const decodeHtmlEntities = (value) =>
    String(value || "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");

const sanitizeFilenamePart = (value) =>
    String(value || "")
        .trim()
        .replace(/[\\/:*?"<>|]+/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 100);

const extractJsonObject = (html, marker) => {
    const markerIndex = html.indexOf(marker);
    if (markerIndex < 0) return null;

    const start = html.indexOf("{", markerIndex);
    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = start; i < html.length; i++) {
        const char = html[i];

        if (escapeNext) {
            escapeNext = false;
            continue;
        }

        if (inString) {
            if (char === "\\") {
                escapeNext = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
        } else if (char === "{") {
            depth++;
        } else if (char === "}") {
            depth--;
            if (depth === 0) {
                return html.slice(start, i + 1);
            }
        }
    }

    return null;
};

const parsePreloadedState = (html) => {
    if (typeof html !== "string" || !html) return null;

    const json = extractJsonObject(html, "window.__PRELOADED_STATE__");
    if (!json) return null;

    try {
        return JSON.parse(json);
    } catch {
        return null;
    }
};

const getHeight = (entry) => {
    const hw = String(entry?.vodVideoHW || "");
    const values = hw
        .split("$$")
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0);

    if (values.length) return Math.max(...values);

    const key = String(entry?.key || "");
    const keyMatch = key.match(/(\d{3,4})p?/i);
    if (keyMatch) return Number(keyMatch[1]);

    const titleMatch = String(entry?.title || "").match(/(\d{3,4})p?/i);
    if (titleMatch) return Number(titleMatch[1]);

    return 0;
};

const collectFormats = (meta) => {
    const formats = [];
    const push = (entry) => {
        const url = typeof entry?.url === "string"
            ? entry.url
            : Object.entries(entry || {}).find(([key, value]) =>
                key.endsWith("UrlHttp") && typeof value === "string"
            )?.[1];

        if (!url || formats.some((format) => format.url === url)) return;

        formats.push({
            key: entry.key,
            title: entry.title,
            rank: Number(entry.rank),
            url,
            height: getHeight(entry),
        });
    };

    if (Array.isArray(meta?.clarityUrl)) {
        for (const entry of meta.clarityUrl) push(entry);
    }

    if (meta?.videoInfoExt && typeof meta.videoInfoExt === "object") {
        for (const [key, entry] of Object.entries(meta.videoInfoExt)) {
            push({ key, ...entry });
        }
    }

    return formats;
};

const pickFormat = (formats, quality) => {
    if (!formats.length) return null;

    const sorted = [...formats].sort((a, b) => {
        if (a.height !== b.height) return a.height - b.height;
        return (Number(a.rank) || 0) - (Number(b.rank) || 0);
    });

    if (quality === "max") return sorted.at(-1);

    const wanted = Number(quality);
    if (!Number.isFinite(wanted) || wanted <= 0) return sorted.at(-1);

    return sorted.reduce((best, current) => {
        const bestDiff = Math.abs((best.height || 0) - wanted);
        const currentDiff = Math.abs((current.height || 0) - wanted);
        if (currentDiff !== bestDiff) return currentDiff < bestDiff ? current : best;
        return (current.height || 0) > (best.height || 0) ? current : best;
    });
};

const extractVidFromContext = (context) => {
    if (typeof context !== "string" || !context) return null;

    try {
        const parsed = JSON.parse(context);
        const nid = String(parsed?.nid || "");
        const match = nid.match(/^sv_(\d+)$/);
        return match?.[1] || null;
    } catch {
        return null;
    }
};

const getPageCandidates = ({ pageUrl, vid, context }) => {
    const candidates = [pageUrl];
    const contextVid = extractVidFromContext(context);
    const canonicalVid = vid || contextVid;

    if (canonicalVid) {
        candidates.push(new URL(`https://haokan.baidu.com/v?vid=${encodeURIComponent(canonicalVid)}`));
    }

    return candidates.filter((candidate, index, list) =>
        list.findIndex((item) => item.toString() === candidate.toString()) === index
    );
};

const fetchVideoMeta = async (candidates, vid) => {
    for (let attempt = 0; attempt < 2; attempt++) {
        for (const candidate of candidates) {
            const response = await fetch(candidate, {
                headers: {
                    ...requestHeaders,
                    "cache-control": "no-cache",
                },
                signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
            });
            if (!response.ok) continue;

            const html = await response.text();
            const state = parsePreloadedState(html);
            const meta = state?.curVideoMeta;
            if (!meta) continue;
            if (vid && String(meta.id) !== String(vid)) continue;

            return { meta, pageUrl: candidate };
        }
    }

    return null;
};

export default async function haokan({ vid, quality, url }) {
    const pageUrl = url instanceof URL
        ? url
        : new URL(`https://haokan.baidu.com/v?vid=${encodeURIComponent(vid || "")}`);

    try {
        const resolvedVid = vid || extractVidFromContext(pageUrl.searchParams.get("context"));
        const result = await fetchVideoMeta(
            getPageCandidates({
                pageUrl,
                vid: resolvedVid,
                context: pageUrl.searchParams.get("context"),
            }),
            resolvedVid,
        );
        if (!result?.meta) return { error: "fetch.empty" };

        const { meta } = result;
        const formats = collectFormats(meta);
        const selected = pickFormat(formats, quality);
        if (!selected?.url) return { error: "fetch.empty" };

        const title = sanitizeFilenamePart(
            decodeHtmlEntities(meta.title || meta.seo_title || meta.id || vid)
        );
        const id = meta.id || vid || "video";
        const duration = Number(meta.duration);

        return {
            type: "video",
            urls: selected.url,
            original_url: result.pageUrl.toString(),
            filename: `${title || "haokan"}_${id}.mp4`,
            duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : undefined,
            thumb: meta.poster,
            headers: requestHeaders,
            fileMetadata: title ? { title } : undefined,
        };
    } catch {
        return { error: "fetch.fail" };
    }
}
