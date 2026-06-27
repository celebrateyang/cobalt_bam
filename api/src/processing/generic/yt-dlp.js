import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";

import { getCookie } from "../cookie/manager.js";

const DEFAULT_TIMEOUT_MS = 35000;
const MAX_CANDIDATE_LOGS = 8;

const parseNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
};

const parseHeight = (format) => {
    const direct = parseNumber(format?.height);
    if (direct > 0) return direct;

    const note = typeof format?.format_note === "string" ? format.format_note : "";
    const match = note.match(/(\d{3,4})p/i);
    return match ? parseNumber(match[1]) : 0;
};

const normalizeAudioExt = (value) => {
    const ext = String(value || "").toLowerCase();
    if (["m4a", "mp3", "opus", "ogg", "wav", "aac", "webm"].includes(ext)) {
        return ext === "aac" ? "m4a" : ext;
    }

    if (ext === "mp4") return "m4a";
    return "m4a";
};

const getQualityScore = (height, requestedQuality) => {
    if (requestedQuality > 0 && requestedQuality < 9000 && height > 0) {
        return -Math.abs(height - requestedQuality) * 2;
    }

    return height * 0.25;
};

const isSupportedUrl = (value) => {
    if (typeof value !== "string" || !value.trim()) return false;
    try {
        const parsed = new URL(value);
        return ["http:", "https:"].includes(parsed.protocol);
    } catch {
        return false;
    }
};

const cookieAttributeNames = new Set([
    "domain",
    "path",
    "expires",
    "max-age",
    "secure",
    "httponly",
    "samesite",
]);

const extractCookieHeader = (cookies = "") => {
    const pairs = String(cookies)
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const eq = part.indexOf("=");
            if (eq <= 0) return null;

            const name = part.slice(0, eq).trim();
            const value = part.slice(eq + 1).trim();
            if (!name || cookieAttributeNames.has(name.toLowerCase())) {
                return null;
            }

            return `${name}=${value}`;
        })
        .filter(Boolean);

    return pairs.length ? pairs.join("; ") : undefined;
};

const buildFormatHeaders = (format) => {
    const source = format?.http_headers && typeof format.http_headers === "object"
        ? format.http_headers
        : {};
    const headers = {};

    for (const [key, value] of Object.entries(source)) {
        if (typeof value === "string" && value.trim()) {
            headers[key] = value;
        }
    }

    const cookie = extractCookieHeader(format?.cookies);
    if (cookie) {
        headers.Cookie = cookie;
    }

    return Object.keys(headers).length ? headers : undefined;
};

const getHost = (value) => {
    try {
        return new URL(value).hostname.toLowerCase();
    } catch {
        return "";
    }
};

const runProcess = (command, args, timeoutMs) => new Promise((resolve) => {
    const child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let finished = false;

    const done = (result) => {
        if (finished) return;
        finished = true;
        resolve(result);
    };

    const timer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch {}
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
    });

    child.on("error", (error) => {
        clearTimeout(timer);
        done({ code: null, stdout, stderr, error, timedOut: false });
    });

    child.on("close", (code, signal) => {
        clearTimeout(timer);
        done({
            code,
            stdout,
            stderr,
            error: null,
            timedOut: signal === "SIGKILL",
        });
    });
});

let runnerPromise = null;

const probeYtDlp = async () => {
    const configured = String(process.env.YTDLP_BIN || "").trim();
    const candidates = [];

    if (configured) {
        candidates.push({ command: configured, prefixArgs: [] });
    }

    candidates.push(
        { command: "yt-dlp", prefixArgs: [] },
        { command: "python3", prefixArgs: ["-m", "yt_dlp"] },
        { command: "python", prefixArgs: ["-m", "yt_dlp"] },
        { command: "py", prefixArgs: ["-m", "yt_dlp"] },
    );

    for (const candidate of candidates) {
        const result = await runProcess(
            candidate.command,
            [...candidate.prefixArgs, "--version"],
            6000,
        );
        if (result.code === 0) {
            console.log(
                `======> [generic] yt-dlp runner selected: ${candidate.command} ${candidate.prefixArgs.join(" ")}`.trim(),
            );
            return candidate;
        }
    }

    return null;
};

const resolveRunner = async () => {
    if (!runnerPromise) {
        runnerPromise = probeYtDlp();
    }
    return runnerPromise;
};

const parseCookieHeaderPairs = (cookieHeader = "") => {
    return String(cookieHeader)
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const eq = part.indexOf("=");
            if (eq <= 0) return null;

            const name = part.slice(0, eq).trim();
            const value = part.slice(eq + 1).trim();
            if (!name || !value) return null;

            return { name, value };
        })
        .filter(Boolean);
};

const buildNetscapeCookieFile = async ({
    cookieHeader = "",
    domains = [],
    comment = "Generated by cobalt generic yt-dlp extractor",
}) => {
    const pairs = parseCookieHeaderPairs(cookieHeader);
    if (!pairs.length || !Array.isArray(domains) || !domains.length) {
        return null;
    }

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "generic-ytdlp-cookies-"));
    const filePath = path.join(tempDir, "cookies.txt");
    const expiry = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;

    const lines = [
        "# Netscape HTTP Cookie File",
        `# ${comment}`,
    ];

    for (const { name, value } of pairs) {
        const secure = name.startsWith("__Secure-") || name.startsWith("__Host-") ? "TRUE" : "FALSE";

        for (const domain of domains) {
            lines.push(`${domain}\tTRUE\t/\t${secure}\t${expiry}\t${name}\t${value}`);
        }
    }

    await writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
    return { tempDir, filePath };
};

const parseJson = (stdoutText = "") => {
    const trimmed = String(stdoutText).trim();
    if (!trimmed) return null;

    try {
        return JSON.parse(trimmed);
    } catch {
        const lines = trimmed
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        for (let i = lines.length - 1; i >= 0; i -= 1) {
            try {
                return JSON.parse(lines[i]);
            } catch {}
        }
    }

    return null;
};

const buildFilenameAttributes = ({ originUrl, title, uploader, extension, height }) => {
    const host = (() => {
        try {
            return new URL(originUrl).hostname;
        } catch {
            return "generic";
        }
    })();

    return {
        service: host,
        id: "generic",
        title: title || host,
        author: uploader || undefined,
        qualityLabel: height ? `${height}p` : extension.toUpperCase(),
        extension,
    };
};

const isSohuExtractor = (info) => {
    const extractor = String(info?.extractor || "").toLowerCase();
    const extractorKey = String(info?.extractor_key || "").toLowerCase();
    return extractor === "sohu" || extractorKey === "sohu";
};

const isLinkedInExtractor = (info) => {
    const extractor = String(info?.extractor || "").toLowerCase();
    const extractorKey = String(info?.extractor_key || "").toLowerCase();
    return extractor === "linkedin" || extractorKey === "linkedin";
};

const isWatermarkedFormat = (format = {}) => {
    const fields = [
        format?.format_id,
        format?.format,
        format?.format_note,
        format?.quality,
        format?.preference,
    ].map((value) => String(value || "").toLowerCase());

    return fields.some((value) => value.includes("watermark"));
};

export const collectCandidates = (formats = [], info = {}) => {
    const trustSohuMp4AsMuxed = isSohuExtractor(info);
    const trustLinkedInMp4AsMuxed = isLinkedInExtractor(info);

    return formats
        .map((format) => {
            const url = typeof format?.url === "string" ? format.url : "";
            if (!isSupportedUrl(url)) return null;

            const ext = String(format?.ext || "").toLowerCase() || "mp4";
            const videoCodec = String(format?.vcodec || "").toLowerCase();
            const audioCodec = String(format?.acodec || "").toLowerCase();
            const protocol = String(format?.protocol || "").toLowerCase();
            const audioExt = String(format?.audio_ext || "").toLowerCase();
            const videoExt = String(format?.video_ext || "").toLowerCase();
            const resolution = String(format?.resolution || "").toLowerCase();
            const hasVideo =
                (videoCodec !== "" && videoCodec !== "none")
                || (videoExt !== "" && videoExt !== "none");
            const hasAudio =
                (audioCodec !== "" && audioCodec !== "none")
                || (audioExt !== "" && audioExt !== "none")
                || resolution === "audio only"
                // yt-dlp's Sohu extractor reports its progressive MP4 files as
                // audio_ext=none even though the files contain AAC audio.
                || (trustSohuMp4AsMuxed && ext === "mp4" && !protocol.includes("m3u8"))
                // LinkedIn public posts expose progressive MP4 files in HTML,
                // but yt-dlp labels their audio extension as none.
                || (trustLinkedInMp4AsMuxed && ext === "mp4" && !protocol.includes("m3u8"));

            return {
                url,
                ext,
                height: parseHeight(format),
                width: parseNumber(format?.width),
                tbr: parseNumber(format?.tbr || format?.vbr || format?.abr),
                fileSize: parseNumber(format?.filesize || format?.filesize_approx),
                headers: buildFormatHeaders(format),
                hasVideo,
                hasAudio,
                isHLS: protocol.includes("m3u8"),
                isDash: protocol.includes("dash") || protocol.includes("http_dash_segments"),
                protocol,
                formatId: format?.format_id || format?.itag,
                isWatermarked: isWatermarkedFormat(format),
            };
        })
        .filter(Boolean);
};

const logCandidates = (label, candidates) => {
    console.log(`======> [generic] candidate count mode=${label} total=${candidates.length}`);
    for (let i = 0; i < Math.min(MAX_CANDIDATE_LOGS, candidates.length); i += 1) {
        const candidate = candidates[i];
        console.log(
            `======> [generic][${label} ${i + 1}] fmt=${candidate.formatId || "n/a"} ext=${candidate.ext} h=${candidate.height} tbr=${candidate.tbr} hls=${candidate.isHLS} dash=${candidate.isDash}`,
        );
    }
};

const pickBestDirectVideo = ({ candidates, requestedQuality }) => {
    return candidates
        .filter((candidate) => candidate.hasVideo && candidate.hasAudio)
        .map((candidate) => ({
            ...candidate,
            score:
                getQualityScore(candidate.height, requestedQuality)
                + Math.min(candidate.tbr, 8000) / 10
                + (candidate.ext === "mp4" ? 40 : 0)
                + (candidate.isHLS ? -15 : 0),
        }))
        .sort((a, b) => b.score - a.score)[0];
};

const pickBestVideoOnly = ({ candidates, requestedQuality }) => {
    return candidates
        .filter((candidate) => candidate.hasVideo && !candidate.hasAudio && !candidate.isHLS)
        .map((candidate) => ({
            ...candidate,
            score:
                getQualityScore(candidate.height, requestedQuality)
                + Math.min(candidate.tbr, 8000) / 10
                + (candidate.ext === "mp4" ? 30 : 0),
        }))
        .sort((a, b) => b.score - a.score)[0];
};

const pickBestAudioOnly = ({ candidates }) => {
    return candidates
        .filter((candidate) => candidate.hasAudio && !candidate.hasVideo && !candidate.isHLS)
        .map((candidate) => ({
            ...candidate,
            score:
                Math.min(candidate.tbr, 2000) / 8
                + (candidate.ext === "m4a" ? 25 : 0)
                + (candidate.ext === "mp3" ? 15 : 0),
        }))
        .sort((a, b) => b.score - a.score)[0];
};

const pickBestHlsVideo = ({ candidates, requestedQuality }) => {
    return candidates
        .filter((candidate) => candidate.hasVideo && candidate.isHLS)
        .map((candidate) => ({
            ...candidate,
            score:
                getQualityScore(candidate.height, requestedQuality)
                + Math.min(candidate.tbr, 8000) / 10,
        }))
        .sort((a, b) => b.score - a.score)[0];
};

const getHlsFamilyKey = (formatId) => {
    const raw = String(formatId || "");
    if (!raw.startsWith("hls-")) return raw;

    const withoutAudio = raw.replace(/-audio(?:-.+)?$/i, "");
    return withoutAudio.replace(/-\d+$/i, "");
};

const pickBestHlsAudio = ({ candidates, preferredFamily }) => {
    const preferred = candidates
        .filter((candidate) => candidate.hasAudio && !candidate.hasVideo && candidate.isHLS)
        .filter((candidate) => !preferredFamily || getHlsFamilyKey(candidate.formatId) === preferredFamily)
        .map((candidate) => ({
            ...candidate,
            score:
                Math.min(candidate.tbr, 2000) / 8
                + (candidate.ext === "m4a" ? 25 : 0)
                + (candidate.ext === "mp4" ? 20 : 0),
        }))
        .sort((a, b) => b.score - a.score)[0];

    if (preferred) {
        return preferred;
    }

    return candidates
        .filter((candidate) => candidate.hasAudio && !candidate.hasVideo && candidate.isHLS)
        .map((candidate) => ({
            ...candidate,
            score:
                Math.min(candidate.tbr, 2000) / 8
                + (candidate.ext === "m4a" ? 25 : 0)
                + (candidate.ext === "mp4" ? 20 : 0),
        }))
        .sort((a, b) => b.score - a.score)[0];
};

const buildResponseBase = ({ info, url }) => {
    const title =
        String(info?.title || info?.fulltitle || "").trim()
        || new URL(url).hostname;
    const uploader = String(info?.uploader || info?.channel || info?.creator || "").trim();
    const service = new URL(url).hostname;

    return {
        title,
        uploader,
        service,
        fileMetadata: {
            title,
            artist: uploader || undefined,
        },
        headers: {
            referer: url,
            origin: new URL(url).origin,
        },
        audioFilename: title,
        genericExtractor: "yt-dlp",
    };
};

const withSelectedHeaders = (base, selected) => ({
    ...base,
    headers: {
        ...base.headers,
        ...selected?.headers,
    },
});

export default async function extractWithYtDlp({
    url,
    quality,
    downloadMode,
    timeoutMs,
    avoidWatermarked = false,
}) {
    const runner = await resolveRunner();
    if (!runner) {
        return { error: "fetch.fail", message: "yt-dlp executable not found" };
    }

    const requestedQuality = quality === "max" ? 9000 : parseNumber(quality) || 1080;
    const args = [
        ...runner.prefixArgs,
        "--ignore-config",
        "--dump-single-json",
        "--no-playlist",
        "--skip-download",
        "--no-warnings",
        "--retries", "2",
        "--socket-timeout", "15",
    ];

    const host = getHost(url);
    let cookieBundle = null;

    try {
        if (host === "vimeo.com" || host === "player.vimeo.com" || host.endsWith(".vimeo.com")) {
            const browserCookie = getCookie("vimeo")?.toString();
            if (browserCookie) {
                cookieBundle = await buildNetscapeCookieFile({
                    cookieHeader: browserCookie,
                    domains: [".vimeo.com", ".player.vimeo.com"],
                    comment: "Generated by cobalt generic yt-dlp extractor for Vimeo",
                });

                if (cookieBundle?.filePath) {
                    args.push("--cookies", cookieBundle.filePath);
                }

                args.push("--add-header", "Referer:https://vimeo.com/");
            }
        }

        args.push(url);

        const result = await runProcess(
            runner.command,
            args,
            timeoutMs || DEFAULT_TIMEOUT_MS,
        );

        if (result.error || result.timedOut || result.code !== 0) {
            return {
                error: "fetch.fail",
                message: result.error?.message || result.stderr || result.stdout || "yt-dlp failed",
            };
        }

        const info = parseJson(result.stdout);
        if (!info || typeof info !== "object") {
            return { error: "fetch.fail", message: "yt-dlp returned invalid JSON" };
        }

        if (isSupportedUrl(info?.url) && !Array.isArray(info?.formats)) {
            if (avoidWatermarked && isWatermarkedFormat(info)) {
                return { error: "fetch.fail", message: "yt-dlp returned only watermarked URL" };
            }

            const base = buildResponseBase({ info, url });
            const extension = String(info?.ext || "mp4").toLowerCase();
            return {
                ...withSelectedHeaders(base, {
                    headers: buildFormatHeaders(info),
                }),
                urls: info.url,
                bestAudio: normalizeAudioExt(extension),
                filenameAttributes: buildFilenameAttributes({
                    originUrl: url,
                    title: base.title,
                    uploader: base.uploader,
                    extension,
                    height: parseNumber(info?.height),
                }),
                isHLS: String(info?.protocol || "").toLowerCase().includes("m3u8"),
            };
        }

        const candidates = collectCandidates(
            Array.isArray(info?.formats) ? info.formats : [],
            info,
        ).filter((candidate) => !avoidWatermarked || !candidate.isWatermarked);
        const directVideo = pickBestDirectVideo({ candidates, requestedQuality });
        const videoOnly = pickBestVideoOnly({ candidates, requestedQuality });
        const audioOnly = pickBestAudioOnly({ candidates });
        const hlsVideo = pickBestHlsVideo({ candidates, requestedQuality });
        const hlsAudio = pickBestHlsAudio({
            candidates,
            preferredFamily: getHlsFamilyKey(hlsVideo?.formatId),
        });

        logCandidates("direct", directVideo ? [directVideo] : []);
        logCandidates("videoOnly", videoOnly ? [videoOnly] : []);
        logCandidates("audioOnly", audioOnly ? [audioOnly] : []);
        logCandidates("hls", hlsVideo ? [hlsVideo] : []);
        logCandidates("hlsAudio", hlsAudio ? [hlsAudio] : []);

        const base = buildResponseBase({ info, url });

        if (downloadMode === "audio") {
            const selected = audioOnly || hlsAudio || directVideo || hlsVideo;
            if (!selected) {
                return { error: "fetch.fail", message: "no audio candidate" };
            }

            return {
                ...withSelectedHeaders(base, selected),
                urls: selected.url,
                bestAudio: normalizeAudioExt(selected.ext),
                filenameAttributes: buildFilenameAttributes({
                    originUrl: url,
                    title: base.title,
                    uploader: base.uploader,
                    extension: normalizeAudioExt(selected.ext),
                }),
                isHLS: selected.isHLS,
            };
        }

        if (downloadMode === "mute") {
            const selected = directVideo || hlsVideo || videoOnly;
            if (!selected) {
                return { error: "fetch.fail", message: "no mute candidate" };
            }

            return {
                ...withSelectedHeaders(base, selected),
                urls: selected.url,
                filenameAttributes: buildFilenameAttributes({
                    originUrl: url,
                    title: base.title,
                    uploader: base.uploader,
                    extension: selected.ext || "mp4",
                    height: selected.height,
                }),
                isHLS: selected.isHLS,
                videoOnly: !selected.hasAudio,
            };
        }

        if (videoOnly && audioOnly) {
            return {
                ...withSelectedHeaders(base, videoOnly),
                urls: [videoOnly.url, audioOnly.url],
                bestAudio: normalizeAudioExt(audioOnly.ext),
                filenameAttributes: buildFilenameAttributes({
                    originUrl: url,
                    title: base.title,
                    uploader: base.uploader,
                    extension:
                        videoOnly.ext === "mp4" && ["m4a", "mp4"].includes(audioOnly.ext)
                            ? "mp4"
                            : "mkv",
                    height: videoOnly.height,
                }),
            };
        }

        if (hlsVideo && hlsAudio) {
            return {
                ...withSelectedHeaders(base, hlsVideo),
                urls: [hlsVideo.url, hlsAudio.url],
                bestAudio: normalizeAudioExt(hlsAudio.ext),
                filenameAttributes: buildFilenameAttributes({
                    originUrl: url,
                    title: base.title,
                    uploader: base.uploader,
                    extension: "mp4",
                    height: hlsVideo.height,
                }),
                isHLS: true,
            };
        }

        const selected = directVideo || hlsVideo;
        if (!selected) {
            return { error: "fetch.fail", message: "no usable video candidate" };
        }

        return {
            ...withSelectedHeaders(base, selected),
            urls: selected.url,
            bestAudio: normalizeAudioExt(selected.ext),
            filenameAttributes: buildFilenameAttributes({
                originUrl: url,
                title: base.title,
                uploader: base.uploader,
                extension: selected.ext || "mp4",
                height: selected.height,
            }),
            isHLS: selected.isHLS,
        };
    } finally {
        if (cookieBundle?.tempDir) {
            await rm(cookieBundle.tempDir, { recursive: true, force: true }).catch(() => {});
        }
    }
}
