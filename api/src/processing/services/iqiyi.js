import { parseSafeGenericURL } from "../generic/url-safety.js";

const PLAYER_API = "https://mesh.if.iqiyi.com/player/lw/lwplay/accelerator.js";
const VIDEO_RESOLVER = "https://data.video.iqiyi.com/videos";
const TVID_MASK = 0x75706971676cn;

const browserHeaders = (pageUrl) => ({
    accept: "application/json,text/plain,*/*",
    referer: pageUrl,
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
});

const parseBase36BigInt = (value) => {
    let result = 0n;
    for (const character of String(value || "").toLowerCase()) {
        const digit = parseInt(character, 36);
        if (!Number.isInteger(digit) || digit < 0 || digit >= 36) return null;
        result = result * 36n + BigInt(digit);
    }
    return result;
};

export const decodeIqiyiTvid = (pageId) => {
    const encoded = parseBase36BigInt(pageId);
    if (encoded === null) return null;

    let tvid = encoded ^ TVID_MASK;
    if (tvid < 900000n) tvid = 100n * (tvid + 900000n);
    return tvid > 0n ? tvid.toString() : null;
};

export const decodeIqiyiPlayerData = (encrypted) => {
    if (typeof encrypted !== "string" || !encrypted) return null;
    try {
        return JSON.parse([...encrypted]
            .map((character) => String.fromCharCode(character.charCodeAt(0) ^ 90))
            .join(""));
    } catch {
        return null;
    }
};

const parseManifestDuration = (manifest) => {
    let duration = 0;
    for (const match of manifest.matchAll(/^#EXTINF:([0-9.]+)/gm)) {
        duration += Number(match[1]) || 0;
    }
    return duration;
};

const getMediaUrls = (manifest) => String(manifest || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

const isIqiyiCdnUrl = (value) => {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" &&
            (parsed.hostname === "data.video.iqiyi.com" ||
                parsed.hostname.endsWith(".video.iqiyi.com"));
    } catch {
        return false;
    }
};

export const buildIqiyiDirectUrl = (manifest, expectedDuration) => {
    const mediaUrls = getMediaUrls(manifest);
    if (!mediaUrls.length || mediaUrls.some((value) => !isIqiyiCdnUrl(value))) {
        return null;
    }

    const first = new URL(mediaUrls[0]);
    if (mediaUrls.some((value) => {
        const candidate = new URL(value);
        return candidate.origin !== first.origin || candidate.pathname !== first.pathname;
    })) return null;

    const manifestDuration = parseManifestDuration(manifest);
    if (
        Number(expectedDuration) > 0 &&
        Math.abs(manifestDuration - Number(expectedDuration)) > 8
    ) return null;

    // iQIYI represents one progressive MPEG-TS object as byte-range URLs in
    // its media playlist. Removing only the byte-range parameters returns the
    // complete object while preserving the signed routing parameters.
    first.searchParams.delete("start");
    first.searchParams.delete("end");
    first.searchParams.delete("contentlength");
    return first.toString();
};

export const getIqiyiFragmentPaths = (video) => {
    if (!Array.isArray(video?.fs) || video.fs.length === 0 || video.fs.length > 500) {
        return null;
    }

    const fragments = video.fs.map((fragment) => ({
        path: typeof fragment?.l === "string" ? fragment.l : "",
        duration: Number(fragment?.d),
    }));
    if (fragments.some(({ path, duration }) => (
        !/^\/v[0-9]+\/[A-Za-z0-9/_-]+\.(?:f4v|flv)(?:\?[^\r\n]*)?$/i.test(path) ||
        !Number.isFinite(duration) ||
        duration <= 0
    ))) return null;

    const fragmentDuration = fragments.reduce((total, fragment) => total + fragment.duration, 0) / 1000;
    if (
        Number(video.duration) > 0 &&
        Math.abs(fragmentDuration - Number(video.duration)) > 8
    ) return null;

    return fragments.map(({ path }) => path);
};

const isSafeResolvedFragment = (value, expectedPath) => {
    try {
        const parsed = parseSafeGenericURL(value);
        if (!parsed) return false;
        return parsed.protocol === "https:" &&
            !parsed.username &&
            !parsed.password &&
            !parsed.port &&
            !/[\r\n']/.test(parsed.toString()) &&
            parsed.pathname === `/videos${new URL(expectedPath, VIDEO_RESOLVER).pathname}`;
    } catch {
        return false;
    }
};

export const resolveIqiyiFragments = async (paths, pageUrl, fetchImpl = fetch) => {
    if (!Array.isArray(paths) || paths.length === 0) return null;

    const urls = [];
    for (const path of paths) {
        const response = await fetchImpl(`${VIDEO_RESOLVER}${path}`, {
            headers: browserHeaders(pageUrl),
            signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) return null;

        const resolved = await response.json();
        if (!isSafeResolvedFragment(resolved?.l, path)) return null;
        urls.push(new URL(resolved.l).toString());
    }
    return urls;
};

const qualityHeight = new Map([
    [200, 360],
    [300, 540],
    [500, 720],
    [600, 1080],
]);

const qualityDistance = (video, requestedQuality) => {
    const height = qualityHeight.get(Number(video?.bid)) || 0;
    if (!Number(requestedQuality) || Number(requestedQuality) >= 9000) return -height;
    return Math.abs(height - Number(requestedQuality));
};

export const selectIqiyiVideo = ({ playerData, tvid, quality }) => {
    if (
        String(playerData?.data?.tvid || "") !== String(tvid) ||
        !playerData?.data?.program ||
        !Array.isArray(playerData.data.program.video)
    ) return null;

    const candidates = playerData.data.program.video
        .filter((video) => (
            typeof video?.vid === "string" &&
            (
                (typeof video?.m3u8 === "string" && video.m3u8.length > 0) ||
                Array.isArray(video?.fs)
            ) &&
            Number(video?.isPreview || 0) === 0
        ))
        .map((video) => ({
            video,
            directUrl: buildIqiyiDirectUrl(video.m3u8, video.duration),
            fragmentPaths: getIqiyiFragmentPaths(video),
        }))
        .filter((candidate) => candidate.directUrl || candidate.fragmentPaths)
        .sort((a, b) => qualityDistance(a.video, quality) - qualityDistance(b.video, quality));

    return candidates[0] || null;
};

export const resolveIqiyiShortLink = async (shortLink, fetchImpl = fetch) => {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(shortLink || "")) return null;
    let target = new URL(`https://qy.net/${shortLink}`);
    for (let hop = 0; hop < 5; hop++) {
        const response = await fetchImpl(target, {
            method: "HEAD",
            redirect: "manual",
            headers: browserHeaders(target.toString()),
            signal: AbortSignal.timeout(15000),
        });
        const location = response.headers.get("location");
        if (![301, 302, 303, 307, 308].includes(response.status) || !location) return null;
        target = new URL(location, target);
        if (!["https:", "http:"].includes(target.protocol) || target.username || target.password || target.port) return null;
        if (["iqiyi.com", "www.iqiyi.com", "m.iqiyi.com"].includes(target.hostname)) {
            const pageId = /^\/v_([0-9a-z]{6,32})\.html$/i.exec(target.pathname)?.[1];
            if (pageId) return { pageId, url: target.toString() };
            const tvid = target.searchParams.get("tvid");
            if (["/mp/sharePlay.html", "/playShare.html"].includes(target.pathname) && /^[1-9][0-9]{0,19}$/.test(tvid || "")) {
                return { tvid, url: target.toString() };
            }
        } else if (target.hostname !== "qy.net") return null;
    }
    return null;
};

export default async function({ pageId, tvid: suppliedTvid, shortLink, quality, url, fetchImpl = fetch }) {
    try {
        if (shortLink) {
            const resolved = await resolveIqiyiShortLink(shortLink, fetchImpl);
            if (!resolved) return { error: "fetch.empty" };
            ({ pageId, tvid: suppliedTvid, url } = resolved);
        }
        const tvid = suppliedTvid || decodeIqiyiTvid(pageId);
        if (!/^[1-9][0-9]{0,19}$/.test(tvid || "")) return { error: "fetch.empty" };

        const api = new URL(PLAYER_API);
        for (const [key, value] of Object.entries({
            tvid,
            ad_cid: "",
            disableDRM: "false",
            cpt: "0",
            apiVer: "3",
            format: "json",
            timestamp: Date.now().toString(),
        })) api.searchParams.set(key, value);

        const response = await fetchImpl(api, { headers: browserHeaders(url) });
        if (!response.ok) return { error: "fetch.fail" };

        const accelerator = await response.json();
        const videoInfo = accelerator?.videoInfo;
        if (
            String(videoInfo?.tvId || "") !== tvid ||
            videoInfo?.effective === false ||
            videoInfo?.downloadAllowed === false
        ) return { error: "fetch.empty" };

        const playerData = decodeIqiyiPlayerData(accelerator?.ev);
        if (playerData?.code !== "A00000") return { error: "fetch.fail" };

        const selected = selectIqiyiVideo({ playerData, tvid, quality });
        if (!selected) return { error: "fetch.empty" };

        const { video, directUrl, fragmentPaths } = selected;
        const urls = directUrl || await resolveIqiyiFragments(fragmentPaths, url, fetchImpl);
        if (!urls) return { error: "fetch.empty" };
        const height = qualityHeight.get(Number(video.bid));
        return {
            service: "iqiyi",
            urls,
            duration: Number(video.duration) || undefined,
            filenameAttributes: {
                service: "iqiyi",
                id: tvid,
                title: videoInfo.title || `iqiyi_${tvid}`,
                resolution: height ? `${height}p` : undefined,
                extension: "mp4",
            },
        };
    } catch (error) {
        console.warn(
            `[iqiyi] extraction failed: ${error?.code || error?.name || "Error"}: ${error?.message || "unknown"}`
        );
        return { error: "fetch.fail" };
    }
}
