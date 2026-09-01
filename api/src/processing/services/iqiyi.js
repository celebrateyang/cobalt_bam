const PLAYER_API = "https://mesh.if.iqiyi.com/player/lw/lwplay/accelerator.js";
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
            typeof video?.m3u8 === "string" &&
            video.m3u8.length > 0 &&
            Number(video?.isPreview || 0) === 0
        ))
        .map((video) => ({
            video,
            directUrl: buildIqiyiDirectUrl(video.m3u8, video.duration),
        }))
        .filter((candidate) => candidate.directUrl)
        .sort((a, b) => qualityDistance(a.video, quality) - qualityDistance(b.video, quality));

    return candidates[0] || null;
};

export default async function({ pageId, quality, url, fetchImpl = fetch }) {
    try {
        const tvid = decodeIqiyiTvid(pageId);
        if (!tvid) return { error: "fetch.empty" };

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

        const { video, directUrl } = selected;
        const height = qualityHeight.get(Number(video.bid));
        return {
            service: "iqiyi",
            urls: directUrl,
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
