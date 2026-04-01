import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";

import { getCookie } from "../cookie/manager.js";
import { sanitizeString } from "../create-filename.js";

const DEFAULT_TIMEOUT_MS = 45000;
const MIN_GOOD_URL_SCORE = -100;
const MAX_CANDIDATE_LOGS = 10;

const normalizeIp = (value) => {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!trimmed) return "";

    const first = trimmed.split(",")[0].trim();
    if (!first) return "";

    if (first.startsWith("::ffff:")) {
        return first.slice("::ffff:".length).toLowerCase();
    }

    return first.toLowerCase();
};

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

const getUrlAccessibilityScore = (rawUrl, requestClientIp) => {
    if (typeof rawUrl !== "string" || !rawUrl) return Number.NEGATIVE_INFINITY;

    try {
        const parsed = new URL(rawUrl);
        let score = 0;

        const ipBypass = String(parsed.searchParams.get("ipbypass") || "").toLowerCase();
        const hasIpParam = parsed.searchParams.has("ip");
        const boundIp = normalizeIp(parsed.searchParams.get("ip") || "");
        const requestIp = normalizeIp(requestClientIp);
        const hasIpBypass = ipBypass === "yes" || ipBypass === "1" || ipBypass === "true";

        if (!hasIpParam) {
            score += 30;
        } else if (requestIp && boundIp && requestIp === boundIp) {
            // URL is IP-bound but to the same client IP that will download it.
            score += 220;
        } else if (hasIpBypass) {
            score += 90;
        } else {
            // IP-bound URLs are usually inaccessible outside the bound IP.
            score -= 220;
        }

        const client = String(parsed.searchParams.get("c") || "").toUpperCase();
        if (client.startsWith("ANDROID")) score += 20;
        if (client.startsWith("IOS")) score -= 10;

        const rateBypass = String(parsed.searchParams.get("ratebypass") || "").toLowerCase();
        if (rateBypass === "yes" || rateBypass === "1" || rateBypass === "true") {
            score += 70;
        }

        const itag = parseNumber(parsed.searchParams.get("itag"));
        if ([18, 22].includes(itag)) score += 20;

        return score;
    } catch {
        return Number.NEGATIVE_INFINITY;
    }
};

const runProcess = (command, args, timeoutMs) => new Promise((resolve) => {
    const child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let finished = false;

    const done = (result) => {
        if (finished) return;
        finished = true;
        resolve(result);
    };

    const timer = setTimeout(() => {
        timedOut = true;
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
        done({
            code: null,
            stdout,
            stderr,
            timedOut,
            error,
        });
    });

    child.on("close", (code) => {
        clearTimeout(timer);
        done({
            code,
            stdout,
            stderr,
            timedOut,
            error: null,
        });
    });
});

let ytDlpCommandPromise = null;

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
                `======> [youtube] yt-dlp runner selected: ${candidate.command} ${candidate.prefixArgs.join(" ")}`.trim(),
            );
            return candidate;
        }
    }

    return null;
};

const resolveYtDlpCommand = async () => {
    if (!ytDlpCommandPromise) {
        ytDlpCommandPromise = probeYtDlp();
    }
    return ytDlpCommandPromise;
};

const parseYtDlpError = (stderrText = "") => {
    const stderr = String(stderrText).toLowerCase();

    if (stderr.includes("private video")) return "content.video.private";
    if (stderr.includes("sign in to confirm your age") || stderr.includes("age-restricted")) {
        return "content.video.age";
    }
    if (stderr.includes("sign in to confirm you") || stderr.includes("not a bot")) {
        return "youtube.login";
    }
    if (stderr.includes("video unavailable") || stderr.includes("this video is unavailable")) {
        return "content.video.unavailable";
    }

    return "fetch.fail";
};

const parseYtDlpJson = (stdoutText = "") => {
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

const buildNetscapeCookieFile = async (cookieHeader = "") => {
    const pairs = parseCookieHeaderPairs(cookieHeader);
    if (!pairs.length) return null;

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "ytcookies-"));
    const filePath = path.join(tempDir, "cookies.txt");
    const expiry = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;

    const lines = [
        "# Netscape HTTP Cookie File",
        "# Generated by cobalt youtube service",
    ];

    for (const { name, value } of pairs) {
        const secure = name.startsWith("__Secure-") || name.startsWith("__Host-") ? "TRUE" : "FALSE";
        lines.push(`.youtube.com\tTRUE\t/\t${secure}\t${expiry}\t${name}\t${value}`);
        lines.push(`.google.com\tTRUE\t/\t${secure}\t${expiry}\t${name}\t${value}`);
    }

    await writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
    return { tempDir, filePath };
};

const pickSubtitleUrl = (info, subtitleLang) => {
    if (!subtitleLang) return undefined;

    const pools = [info?.subtitles, info?.automatic_captions].filter(Boolean);
    for (const pool of pools) {
        const keys = Object.keys(pool);
        const exact = keys.find((k) => k.toLowerCase() === subtitleLang.toLowerCase());
        const prefix = keys.find((k) => k.toLowerCase().startsWith(subtitleLang.toLowerCase()));
        const key = exact || prefix;
        if (!key) continue;

        const entries = Array.isArray(pool[key]) ? pool[key] : [];
        const selected =
            entries.find((entry) => entry?.ext === "vtt" && entry?.url)
            || entries.find((entry) => entry?.url);
        if (selected?.url) return selected.url;
    }

    return undefined;
};

const pickCandidate = ({
    formats,
    requestClientIp,
    targetQuality,
    mode,
}) => {
    const parsedFormats = formats
        .map((format) => {
            const url = typeof format?.url === "string" ? format.url : "";
            if (!url) return null;

            const hasVideo = format?.vcodec && format.vcodec !== "none";
            const hasAudio = format?.acodec && format.acodec !== "none";
            const isMuxed = hasVideo && hasAudio;
            const isVideoOnly = hasVideo && !hasAudio;
            const isAudioOnly = hasAudio && !hasVideo;

            if (mode === "muxed" && !isMuxed) return null;
            if (mode === "videoOnly" && !isVideoOnly) return null;
            if (mode === "audioOnly" && !isAudioOnly) return null;

            const ext = String(format?.ext || "").toLowerCase();
            const height = parseHeight(format);
            const tbr = parseNumber(format?.tbr || format?.vbr || format?.abr);
            const accessScore = getUrlAccessibilityScore(url, requestClientIp);

            let score = accessScore;
            if (ext === "mp4") score += 40;
            if (mode === "audioOnly" && ext === "m4a") score += 35;
            if (mode === "audioOnly" && ext === "mp3") score += 20;

            if (mode !== "audioOnly") {
                if (targetQuality > 0 && targetQuality < 9000 && height > 0) {
                    score -= Math.abs(height - targetQuality) * 2;
                } else {
                    score += height * 0.2;
                }
            }

            score += Math.min(tbr, 5000) / 12;

            return {
                format,
                url,
                ext,
                height,
                tbr,
                accessScore,
                score,
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);

    return parsedFormats;
};

const runYtDlp = async ({ id, requestClientIp, cookieHeader }) => {
    const runner = await resolveYtDlpCommand();
    if (!runner) {
        return { error: "fetch.fail", message: "yt-dlp executable not found" };
    }

    const timeoutMs = (() => {
        const parsed = parseInt(String(process.env.YTDLP_TIMEOUT_MS || ""), 10);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
        return DEFAULT_TIMEOUT_MS;
    })();

    const args = [
        ...runner.prefixArgs,
        "--ignore-config",
        "--dump-single-json",
        "--no-playlist",
        "--skip-download",
        "--no-warnings",
        "--retries", "2",
        "--socket-timeout", "15",
        "--extractor-args", "youtube:player_client=android_vr,android,web",
    ];

    if (requestClientIp) {
        args.push("--add-header", `X-Forwarded-For:${requestClientIp}`);
        args.push("--add-header", `X-Real-IP:${requestClientIp}`);
    }

    let cookieBundle = null;
    try {
        if (cookieHeader) {
            cookieBundle = await buildNetscapeCookieFile(cookieHeader);
            if (cookieBundle?.filePath) {
                args.push("--cookies", cookieBundle.filePath);
            }
        }

        args.push(`https://www.youtube.com/watch?v=${id}`);

        const result = await runProcess(runner.command, args, timeoutMs);
        if (result.error || result.timedOut || result.code !== 0) {
            const message = result.error?.message || result.stderr || result.stdout || "";
            return {
                error: parseYtDlpError(message),
                message,
            };
        }

        const parsed = parseYtDlpJson(result.stdout);
        if (!parsed || typeof parsed !== "object") {
            return {
                error: "fetch.fail",
                message: "yt-dlp returned invalid JSON",
            };
        }

        return { info: parsed };
    } finally {
        if (cookieBundle?.tempDir) {
            await rm(cookieBundle.tempDir, { recursive: true, force: true }).catch(() => {});
        }
    }
};

export default async function youtube(o) {
    const requestClientIp = normalizeIp(o.requestClientIp || "");
    const cookieHeader = getCookie("youtube")?.toString() || "";
    const targetQuality = o.quality === "max" ? 9000 : parseNumber(o.quality) || 1080;

    console.log(
        `======> [youtube] yt-dlp parse start id=${o.id} mode=${o.isAudioOnly ? "audio" : (o.isAudioMuted ? "mute" : "video")} quality=${targetQuality} client_ip=${requestClientIp || "n/a"} cookie=${cookieHeader ? "yes" : "no"}`,
    );

    const extracted = await runYtDlp({
        id: o.id,
        requestClientIp,
        cookieHeader,
    });

    if (extracted.error) {
        console.log(`======> [youtube] yt-dlp parse failed: ${extracted.message || extracted.error}`);
        return { error: extracted.error };
    }

    const info = extracted.info;
    const allFormats = Array.isArray(info.formats) ? info.formats : [];
    const duration = parseNumber(info.duration);
    const title = String(info.title || `youtube_${o.id}`).trim() || `youtube_${o.id}`;
    const artist = String(info.channel || info.uploader || "").trim();
    const subtitles = pickSubtitleUrl(info, o.subtitleLang);

    const mode = o.isAudioOnly ? "audioOnly" : (o.isAudioMuted ? "videoOnly" : "muxed");
    const candidates = pickCandidate({
        formats: allFormats,
        requestClientIp,
        targetQuality,
        mode,
    });

    console.log(`======> [youtube] candidate count mode=${mode} total=${candidates.length}`);
    for (let i = 0; i < Math.min(MAX_CANDIDATE_LOGS, candidates.length); i += 1) {
        const candidate = candidates[i];
        try {
            const parsed = new URL(candidate.url);
            console.log(
                `======> [youtube][candidate ${i + 1}] fmt=${candidate.format.format_id} ext=${candidate.ext} h=${candidate.height} tbr=${candidate.tbr} score=${candidate.score.toFixed(2)} access=${candidate.accessScore.toFixed(2)} c=${parsed.searchParams.get("c") || "n/a"} ip=${parsed.searchParams.get("ip") || "n/a"} ipbypass=${parsed.searchParams.get("ipbypass") || "no"}`,
            );
        } catch {
            console.log(
                `======> [youtube][candidate ${i + 1}] fmt=${candidate.format.format_id} ext=${candidate.ext} h=${candidate.height} tbr=${candidate.tbr} score=${candidate.score.toFixed(2)} access=${candidate.accessScore.toFixed(2)}`,
            );
        }
    }

    const selected = candidates[0];
    if (!selected || selected.accessScore <= MIN_GOOD_URL_SCORE) {
        console.log(
            `======> [youtube] no acceptable redirect url selected (best_access=${selected?.accessScore ?? "n/a"})`,
        );
        return { error: "youtube.no_matching_format" };
    }

    const height = selected.height || parseNumber(selected.format?.height);
    const width = parseNumber(selected.format?.width);
    const extension = selected.ext || "mp4";
    const qualityLabel = height ? `${height}p` : undefined;
    const resolution = width && height ? `${width}x${height}` : undefined;
    const youtubeFormat = extension === "webm" ? "vp9" : "h264";

    const fileMetadata = {
        title,
        artist: artist || undefined,
    };

    const originalRequest = {
        ...o,
        dispatcher: undefined,
        itag: {
            video: selected.format?.format_id || selected.format?.itag,
            audio: selected.format?.format_id || selected.format?.itag,
        },
        innertubeClient: "yt-dlp",
    };

    if (o.isAudioOnly) {
        const audioExt = extension || "m4a";
        const bestAudio = audioExt === "m4a" ? "m4a" : (audioExt === "mp3" ? "mp3" : "opus");
        return {
            type: "proxy",
            isAudioOnly: true,
            forceRedirect: true,
            urls: selected.url,
            filename: `${sanitizeString(title)}.${audioExt}`,
            fileMetadata,
            bestAudio,
            subtitles,
            originalRequest,
            duration,
        };
    }

    return {
        type: "proxy",
        forceRedirect: true,
        urls: selected.url,
        subtitles,
        filenameAttributes: {
            service: "youtube",
            id: o.id,
            title,
            author: artist,
            resolution,
            qualityLabel,
            extension,
            youtubeFormat,
        },
        fileMetadata,
        originalRequest,
        duration,
    };
}
