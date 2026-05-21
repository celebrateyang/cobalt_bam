import { genericUserAgent } from "../../config.js";

const findBalancedJson = (text, marker) => {
    const markerIndex = text.indexOf(marker);
    if (markerIndex === -1) return;

    const start = text.indexOf("{", markerIndex);
    if (start === -1) return;

    let depth = 0,
        inString = false,
        quote = "",
        escape = false;

    for (let i = start; i < text.length; i++) {
        const char = text[i];

        if (escape) {
            escape = false;
            continue;
        }

        if (inString) {
            if (char === "\\") {
                escape = true;
            } else if (char === quote) {
                inString = false;
            }
            continue;
        }

        if (char === "\"" || char === "'") {
            inString = true;
            quote = char;
            continue;
        }

        if (char === "{") {
            depth++;
        } else if (char === "}") {
            depth--;
            if (depth === 0) {
                return text.slice(start, i + 1);
            }
        }
    }
}

const parseEmbeddedSongInfo = (html) => {
    const raw = findBalancedJson(html, "var phpParam");
    if (!raw) return;

    try {
        return JSON.parse(raw)?.song_info?.data;
    } catch {
        return;
    }
}

const getSongInfoFromApi = async (hash) => {
    const url = new URL("https://m.kugou.com/app/i/getSongInfo.php");
    url.searchParams.set("cmd", "playInfo");
    url.searchParams.set("hash", hash);

    return fetch(url, {
        headers: {
            "User-Agent": genericUserAgent,
            "Referer": "https://m.kugou.com/",
        },
    })
        .then(r => r.json())
        .catch(() => {});
}

const normalizeCover = (url) => (
    typeof url === "string" && url
        ? url.replace("{size}", "480").replace(/^http:\/\//, "https://")
        : undefined
);

const getPlayableUrl = (info) => {
    if (typeof info?.url === "string" && info.url) {
        return info.url;
    }

    if (Array.isArray(info?.backup_url)) {
        return info.backup_url.find(url => typeof url === "string" && url);
    }
}

const getDuration = (info) => {
    const seconds = Number(info?.timeLength);
    if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds);

    const milliseconds = Number(info?.extra?.["128timelength"]);
    if (Number.isFinite(milliseconds) && milliseconds > 0) {
        return Math.round(milliseconds / 1000);
    }
}

export default async function({ id }) {
    const page = await fetch(`https://m.kugou.com/mixsong/${id}.html`, {
        headers: {
            "User-Agent": genericUserAgent,
        },
    })
        .then(r => r.text())
        .catch(() => {});

    if (!page) return { error: "fetch.fail" };

    let info = parseEmbeddedSongInfo(page);
    const hash = info?.hash || page.match(/"hash"\s*:\s*"([A-Fa-f0-9]{32})"/)?.[1];

    if ((!info || !getPlayableUrl(info)) && hash) {
        info = await getSongInfoFromApi(hash);
    }

    const file = getPlayableUrl(info);
    if (!file) return { error: "fetch.empty" };

    const title = info.songName || info.audio_name || info.fileName;
    const artist = info.singerName || info.author_name;
    const album = info.album_name;
    const duration = getDuration(info);
    const extension = info.extName || "mp3";

    const fileMetadata = {
        title,
        artist,
        album,
    };

    return {
        urls: file,
        duration,
        cover: normalizeCover(info.album_img || info.imgUrl),
        filenameAttributes: {
            service: "kugou",
            id: info.hash || hash || id,
            title,
            author: artist,
            extension,
        },
        fileMetadata,
        isAudioOnly: true,
        bestAudio: extension === "mp3" ? "mp3" : undefined,
    };
}
