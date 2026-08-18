const browserUserAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/139.0.0.0 Safari/537.36";

const requestHeaders = () => ({
    accept: "application/json,text/plain,*/*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    referer: "https://v.qq.com/",
    "user-agent": browserUserAgent,
});

export const parseTencentResponse = (text) => {
    try {
        return JSON.parse(text);
    } catch {
        const match = text.match(/^[^(=]*[=(]([\s\S]*?)[);]*$/);
        if (!match) return null;
        try {
            return JSON.parse(match[1]);
        } catch {
            return null;
        }
    }
};

export const tencentDirectCdnHosts = [
    "ugcws.video.gtimg.com",
    "apd-vlive.apdcdn.tc.qq.com",
];

const toTencentDirectUrls = (rawUrl) => {
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol === "https:") return [parsed.toString()];

        return tencentDirectCdnHosts.map((hostname) => {
            const direct = new URL(parsed);
            direct.protocol = "https:";
            direct.hostname = hostname;
            direct.port = "";
            return direct.toString();
        });
    } catch {
        return [];
    }
};

export const resolveTencentVideo = async (video, fetchImpl = fetch) => {
    const api = new URL("https://vv.video.qq.com/getinfo");
    for (const [key, value] of Object.entries({
        vids: video.id,
        platform: "101001",
        charge: "0",
        otype: "json",
        defn: "fhd",
    })) api.searchParams.set(key, value);

    const response = await fetchImpl(api, {
        headers: requestHeaders(),
    });
    if (!response.ok) return null;

    const body = parseTencentResponse(await response.text());
    const info = body?.vl?.vi?.[0];
    if (
        Number(body?.em || 0) !== 0 ||
        Number(info?.drm) > 0 ||
        !info?.fn ||
        !info?.fvkey
    ) {
        return null;
    }

    const urls = (info.ul?.ui || [])
        .map((item) => {
            try {
                const url = new URL(`${item.url || ""}${info.fn}`);
                url.searchParams.set("vkey", info.fvkey);
                return url.toString();
            } catch {
                return null;
            }
        })
        .filter(Boolean)
        .flatMap(toTencentDirectUrls)
        .filter((value, index, list) => list.indexOf(value) === index);
    if (!urls.length) return null;

    return {
        ...video,
        urls,
        title: info.ti || video.title || null,
        width: Number(info.vw) || null,
        height: Number(info.vh) || null,
        duration: Number(info.td) || null,
        filesize: Number(info.fs) || null,
    };
};

export default async function({ videoId, fetchImpl = fetch }) {
    try {
        const video = await resolveTencentVideo({
            id: videoId,
            kind: "tencent_video",
        }, fetchImpl);
        if (!video?.urls?.length) return { error: "fetch.empty" };

        return {
            service: "tencent_video",
            urls: video.urls[0],
            urlCandidates: video.urls.slice(1),
            directClientDownload: true,
            filenameAttributes: {
                service: "tencent_video",
                id: videoId,
                title: video.title || `tencent_video_${videoId}`,
                resolution: video.width && video.height
                    ? `${video.width}x${video.height}`
                    : undefined,
                extension: "mp4",
            },
            duration: video.duration || undefined,
        };
    } catch (error) {
        console.warn(
            `[tencent_video] extraction failed: ${error?.code || error?.name || "Error"}: ${error?.message || "unknown"}`
        );
        return { error: "fetch.fail" };
    }
}
