import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";

import { getCookie } from "../cookie/manager.js";
import { sanitizeString } from "../create-filename.js";

const DEFAULT_TIMEOUT_MS = 45000;
const MIN_GOOD_URL_SCORE = -140;
const MIN_PICKER_URL_SCORE = -180;
const MAX_CANDIDATE_LOGS = 10;
const MAX_PICKER_ITEMS_PER_GROUP = 6;

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

const parseFileSize = (format) => {
    return parseNumber(format?.filesize || format?.filesize_approx);
};

const formatSizeLabel = (bytes) => {
    const size = parseNumber(bytes);
    if (size <= 0) return undefined;

    const mb = size / (1024 * 1024);
    if (mb >= 100) return `${mb.toFixed(0)}MB`;
    if (mb >= 10) return `${mb.toFixed(1)}MB`;
    return `${mb.toFixed(2)}MB`;
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

const getBoundIpFromUrl = (rawUrl) => {
    if (typeof rawUrl !== "string" || !rawUrl) return "";

    try {
        const parsed = new URL(rawUrl);
        return normalizeIp(parsed.searchParams.get("ip") || "");
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

const normalizeVideoCodec = (value) => {
    const codec = String(value || "").toLowerCase();
    if (!codec || codec === "none") return "";
    if (codec.includes("av01") || codec.includes("av1")) return "av1";
    if (codec.includes("vp09") || codec.includes("vp9")) return "vp9";
    if (codec.includes("avc1") || codec.includes("h264")) return "h264";
    return codec;
};

const normalizeAudioCodec = (value) => {
    const codec = String(value || "").toLowerCase();
    if (!codec || codec === "none") return "";
    if (codec.includes("mp4a") || codec.includes("aac")) return "aac";
    if (codec.includes("opus")) return "opus";
    if (codec.includes("vorbis")) return "vorbis";
    return codec;
};

const getAutoPreferredContainer = (codec) => {
    if (codec === "h264") return "mp4";
    return "webm";
};

const resolveRequestedProfile = (o, targetQuality) => {
    const preferredCodec = String(o.codec || "h264").toLowerCase();
    const containerPreference = String(o.container || "auto").toLowerCase();
    const requestedQuality = targetQuality > 0 ? targetQuality : 1080;

    let effectiveQuality = requestedQuality;
    let fallbackReason;

    if (preferredCodec === "h264" && effectiveQuality > 1080) {
        effectiveQuality = 1080;
        fallbackReason = "h264_quality_capped_to_1080";
    }

    return {
        preferredCodec,
        containerPreference,
        preferredContainer:
            containerPreference === "auto"
                ? getAutoPreferredContainer(preferredCodec)
                : containerPreference,
        requestedQuality,
        effectiveQuality,
        preferMerge: !o.isAudioOnly && !o.isAudioMuted && effectiveQuality >= 720,
        fallbackReason,
    };
};

const collectCandidates = ({ formats, requestClientIp }) => {
    return formats
        .map((format) => {
            const url = typeof format?.url === "string" ? format.url : "";
            if (!url) return null;

            const hasVideo = format?.vcodec && format.vcodec !== "none";
            const hasAudio = format?.acodec && format.acodec !== "none";

            return {
                format,
                url,
                ext: String(format?.ext || "").toLowerCase(),
                height: parseHeight(format),
                width: parseNumber(format?.width),
                tbr: parseNumber(format?.tbr || format?.vbr || format?.abr),
                fileSize: parseFileSize(format),
                directAccessScore: getUrlAccessibilityScore(url, requestClientIp),
                serverAccessScore: getUrlAccessibilityScore(url, getBoundIpFromUrl(url)),
                videoCodec: normalizeVideoCodec(format?.vcodec),
                audioCodec: normalizeAudioCodec(format?.acodec),
                hasVideo,
                hasAudio,
            };
        })
        .filter(Boolean);
};

const getQualityScore = (height, targetQuality) => {
    if (targetQuality > 0 && targetQuality < 9000 && height > 0) {
        return -Math.abs(height - targetQuality) * 2;
    }

    return height * 0.2;
};

const scoreDirectCandidate = (candidate, profile) => {
    let score = candidate.directAccessScore;

    if (candidate.ext === profile.preferredContainer) score += 60;
    if (candidate.ext === "mp4") score += 20;
    if (candidate.videoCodec === profile.preferredCodec) score += 80;

    score += getQualityScore(candidate.height, profile.effectiveQuality);
    score += Math.min(candidate.tbr, 5000) / 12;
    return score;
};

const scoreMergeVideoCandidate = (candidate, profile) => {
    let score = candidate.serverAccessScore;

    if (candidate.ext === profile.preferredContainer) score += 40;
    if (candidate.videoCodec === profile.preferredCodec) score += 90;

    score += getQualityScore(candidate.height, profile.effectiveQuality);
    score += Math.min(candidate.tbr, 5000) / 12;
    return score;
};

const scoreAudioCandidate = (candidate) => {
    let score = candidate.serverAccessScore;

    if (candidate.ext === "m4a") score += 45;
    if (candidate.ext === "webm") score += 30;
    if (candidate.audioCodec === "aac") score += 20;
    if (candidate.audioCodec === "opus") score += 15;

    score += Math.min(candidate.tbr, 2000) / 8;
    return score;
};

const logCandidates = (label, candidates, scoreKey) => {
    console.log(`======> [youtube] candidate count mode=${label} total=${candidates.length}`);
    for (let i = 0; i < Math.min(MAX_CANDIDATE_LOGS, candidates.length); i += 1) {
        const candidate = candidates[i];
        const score = Number(candidate?.[scoreKey] ?? 0);

        try {
            const parsed = new URL(candidate.url);
            console.log(
                `======> [youtube][${label} ${i + 1}] fmt=${candidate.format.format_id} ext=${candidate.ext} h=${candidate.height} tbr=${candidate.tbr} score=${score.toFixed(2)} direct=${candidate.directAccessScore.toFixed(2)} server=${candidate.serverAccessScore.toFixed(2)} c=${parsed.searchParams.get("c") || "n/a"} ip=${parsed.searchParams.get("ip") || "n/a"} ipbypass=${parsed.searchParams.get("ipbypass") || "no"}`,
            );
        } catch {
            console.log(
                `======> [youtube][${label} ${i + 1}] fmt=${candidate.format.format_id} ext=${candidate.ext} h=${candidate.height} tbr=${candidate.tbr} score=${score.toFixed(2)} direct=${candidate.directAccessScore.toFixed(2)} server=${candidate.serverAccessScore.toFixed(2)}`,
            );
        }
    }
};

const matchesContainerPreference = (candidate, containerPreference) => {
    if (containerPreference === "auto") return true;
    if (containerPreference === "mkv") return true;
    return candidate.ext === containerPreference;
};

const filterVideoCandidates = ({ candidates, mode, profile }) => {
    return candidates
        .filter((candidate) => {
            const isMuxed = candidate.hasVideo && candidate.hasAudio;
            const isVideoOnly = candidate.hasVideo && !candidate.hasAudio;

            if (mode === "muxed" && !isMuxed) return false;
            if (mode === "videoOnly" && !isVideoOnly) return false;

            if (candidate.videoCodec !== profile.preferredCodec) return false;
            if (!matchesContainerPreference(candidate, profile.containerPreference)) return false;

            return true;
        })
        .map((candidate) => ({
            ...candidate,
            directScore: scoreDirectCandidate(candidate, profile),
            mergeScore: scoreMergeVideoCandidate(candidate, profile),
        }));
};

const filterAudioCandidates = ({ candidates }) => {
    return candidates
        .filter((candidate) => candidate.hasAudio && !candidate.hasVideo)
        .map((candidate) => ({
            ...candidate,
            audioScore: scoreAudioCandidate(candidate),
        }));
};

const pickSortedDirectCandidates = ({ candidates, profile }) => {
    return filterVideoCandidates({
        candidates,
        mode: "muxed",
        profile,
    })
        .filter((candidate) => candidate.directAccessScore > MIN_GOOD_URL_SCORE)
        .sort((a, b) => b.directScore - a.directScore);
};

const pickSortedMergeVideoCandidates = ({ candidates, profile }) => {
    return filterVideoCandidates({
        candidates,
        mode: "videoOnly",
        profile,
    })
        .filter((candidate) => candidate.serverAccessScore > MIN_GOOD_URL_SCORE)
        .sort((a, b) => b.mergeScore - a.mergeScore);
};

const pickSortedAudioCandidates = ({ candidates }) => {
    return filterAudioCandidates({ candidates })
        .filter((candidate) => candidate.serverAccessScore > MIN_GOOD_URL_SCORE)
        .sort((a, b) => b.audioScore - a.audioScore);
};

const getMergeOutputContainer = ({ videoCandidate, audioCandidate, profile }) => {
    if (profile.containerPreference === "mkv") return "mkv";

    const audioLooksLikeMp4 =
        audioCandidate.ext === "m4a"
        || audioCandidate.ext === "mp4"
        || audioCandidate.audioCodec === "aac";

    if (videoCandidate.ext === "mp4" && audioLooksLikeMp4) {
        return "mp4";
    }

    const audioLooksLikeWebm =
        audioCandidate.ext === "webm"
        || audioCandidate.audioCodec === "opus"
        || audioCandidate.audioCodec === "vorbis";

    if (videoCandidate.ext === "webm" && audioLooksLikeWebm) {
        return "webm";
    }

    if (profile.preferredCodec === "h264") {
        return null;
    }

    if (profile.containerPreference === "mp4" || profile.containerPreference === "webm") {
        return null;
    }

    return "mkv";
};

const getPairScore = ({ videoCandidate, audioCandidate, container, profile }) => {
    let score = videoCandidate.mergeScore + audioCandidate.audioScore;

    if (container === profile.preferredContainer) score += 50;
    if (container === "mp4") score += 15;
    if (container === "webm") score += 10;

    return score;
};

const pickMergeCandidatePair = ({ videoCandidates, audioCandidates, profile }) => {
    let best = null;

    for (const videoCandidate of videoCandidates.slice(0, MAX_CANDIDATE_LOGS)) {
        for (const audioCandidate of audioCandidates.slice(0, MAX_CANDIDATE_LOGS)) {
            const outputContainer = getMergeOutputContainer({
                videoCandidate,
                audioCandidate,
                profile,
            });

            if (!outputContainer) continue;

            const pairScore = getPairScore({
                videoCandidate,
                audioCandidate,
                container: outputContainer,
                profile,
            });

            if (!best || pairScore > best.pairScore) {
                best = {
                    videoCandidate,
                    audioCandidate,
                    outputContainer,
                    pairScore,
                };
            }
        }
    }

    return best;
};

const buildFilenameAttributes = ({
    id,
    title,
    artist,
    width,
    height,
    extension,
    videoCodec,
}) => {
    const qualityLabel = height ? `${height}p` : undefined;
    const resolution = width && height ? `${width}x${height}` : undefined;

    return {
        service: "youtube",
        id,
        title,
        author: artist,
        resolution,
        qualityLabel,
        extension,
        youtubeFormat: videoCodec || (extension === "webm" ? "vp9" : "h264"),
    };
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
    const forceIpv4 = (() => {
        const raw = String(process.env.YTDLP_FORCE_IPV4 || "true").trim().toLowerCase();
        return !["0", "false", "no", "off"].includes(raw);
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

    if (forceIpv4) {
        args.push("--force-ipv4");
    }

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

const buildYoutubeResult = ({
    info,
    o,
    requestClientIp,
    targetQuality,
}) => {
    const allFormats = Array.isArray(info.formats) ? info.formats : [];
    const duration = parseNumber(info.duration);
    const title = String(info.title || `youtube_${o.id}`).trim() || `youtube_${o.id}`;
    const artist = String(info.channel || info.uploader || "").trim();
    const subtitles = pickSubtitleUrl(info, o.subtitleLang);
    const profile = resolveRequestedProfile(o, targetQuality);
    const candidates = collectCandidates({
        formats: allFormats,
        requestClientIp,
    });
    const directCandidates = pickSortedDirectCandidates({
        candidates,
        profile,
    });
    const mergeVideoCandidates = pickSortedMergeVideoCandidates({
        candidates,
        profile,
    });
    const audioCandidates = pickSortedAudioCandidates({
        candidates,
    });

    console.log(
        `======> [youtube] strategy quality_requested=${profile.requestedQuality} quality_effective=${profile.effectiveQuality} codec=${profile.preferredCodec} container=${profile.containerPreference} prefer_merge=${profile.preferMerge ? "yes" : "no"} fallback=${profile.fallbackReason || "none"}`,
    );

    logCandidates("direct", directCandidates, "directScore");
    logCandidates("mergeVideo", mergeVideoCandidates, "mergeScore");
    logCandidates("audioOnly", audioCandidates, "audioScore");

    const fileMetadata = {
        title,
        artist: artist || undefined,
    };

    if (o.isAudioOnly) {
        const selected = audioCandidates[0];
        if (!selected) {
            return { error: "youtube.no_matching_format" };
        }

        const audioExt = selected.ext || "m4a";
        const bestAudio = audioExt === "m4a" ? "m4a" : (audioExt === "mp3" ? "mp3" : "opus");
        return {
            type: "proxy",
            isAudioOnly: true,
            urls: selected.url,
            audioFilename: sanitizeString(title),
            fileMetadata,
            bestAudio,
            subtitles,
            originalRequest: {
                ...o,
                dispatcher: undefined,
                itag: {
                    video: selected.format?.format_id || selected.format?.itag,
                    audio: selected.format?.format_id || selected.format?.itag,
                },
                innertubeClient: "yt-dlp",
            },
            duration,
        };
    }

    if (o.isAudioMuted) {
        const selected = mergeVideoCandidates[0] || directCandidates[0];
        if (!selected) {
            return { error: "youtube.no_matching_format" };
        }

        return {
            type: "proxy",
            forceRedirect: true,
            urls: selected.url,
            subtitles,
            filenameAttributes: buildFilenameAttributes({
                id: o.id,
                title,
                artist,
                width: selected.width,
                height: selected.height,
                extension: selected.ext || "mp4",
                videoCodec: selected.videoCodec,
            }),
            fileMetadata,
            originalRequest: {
                ...o,
                dispatcher: undefined,
                itag: {
                    video: selected.format?.format_id || selected.format?.itag,
                    audio: selected.format?.format_id || selected.format?.itag,
                },
                innertubeClient: "yt-dlp",
            },
            duration,
        };
    }

    const mergePair = pickMergeCandidatePair({
        videoCandidates: mergeVideoCandidates,
        audioCandidates,
        profile,
    });

    if (profile.preferMerge && mergePair) {
        return {
            type: "merge",
            urls: [mergePair.videoCandidate.url, mergePair.audioCandidate.url],
            subtitles,
            filenameAttributes: buildFilenameAttributes({
                id: o.id,
                title,
                artist,
                width: mergePair.videoCandidate.width,
                height: mergePair.videoCandidate.height,
                extension: mergePair.outputContainer,
                videoCodec: mergePair.videoCandidate.videoCodec,
            }),
            fileMetadata,
            originalRequest: {
                ...o,
                dispatcher: undefined,
                itag: {
                    video: mergePair.videoCandidate.format?.format_id || mergePair.videoCandidate.format?.itag,
                    audio: mergePair.audioCandidate.format?.format_id || mergePair.audioCandidate.format?.itag,
                },
                innertubeClient: "yt-dlp",
            },
            duration,
        };
    }

    const selected = directCandidates[0];
    if (!selected) {
        if (mergePair) {
            return {
                type: "merge",
                urls: [mergePair.videoCandidate.url, mergePair.audioCandidate.url],
                subtitles,
                filenameAttributes: buildFilenameAttributes({
                    id: o.id,
                    title,
                    artist,
                    width: mergePair.videoCandidate.width,
                    height: mergePair.videoCandidate.height,
                    extension: mergePair.outputContainer,
                    videoCodec: mergePair.videoCandidate.videoCodec,
                }),
                fileMetadata,
                originalRequest: {
                    ...o,
                    dispatcher: undefined,
                    itag: {
                        video: mergePair.videoCandidate.format?.format_id || mergePair.videoCandidate.format?.itag,
                        audio: mergePair.audioCandidate.format?.format_id || mergePair.audioCandidate.format?.itag,
                    },
                    innertubeClient: "yt-dlp",
                },
                duration,
            };
        }

        console.log("======> [youtube] no acceptable direct or merge candidate selected");
        return { error: "youtube.no_matching_format" };
    }

    return {
        type: "proxy",
        forceRedirect: true,
        urls: selected.url,
        subtitles,
        filenameAttributes: buildFilenameAttributes({
            id: o.id,
            title,
            artist,
            width: selected.width,
            height: selected.height,
            extension: selected.ext || "mp4",
            videoCodec: selected.videoCodec,
        }),
        fileMetadata,
        originalRequest: {
            ...o,
            dispatcher: undefined,
            itag: {
                video: selected.format?.format_id || selected.format?.itag,
                audio: selected.format?.format_id || selected.format?.itag,
            },
            innertubeClient: "yt-dlp",
        },
        duration,
    };
};

export default async function youtube(o) {
    const requestClientIp = normalizeIp(o.requestClientIp || "");
    const browserCookieHeader = getCookie("youtube")?.toString() || "";
    const targetQuality = o.quality === "max" ? 9000 : parseNumber(o.quality) || 1080;
    const mode = o.isAudioOnly ? "audio" : (o.isAudioMuted ? "mute" : "video");

    const attempts = [
        {
            name: "no_cookie",
            cookieHeader: "",
            requestClientIp,
        },
    ];

    if (browserCookieHeader) {
        // Cookie mode: avoid injecting client IP headers to reduce account risk.
        attempts.push({
            name: "browser_cookie",
            cookieHeader: browserCookieHeader,
            requestClientIp: "",
        });
    }

    let lastError = "fetch.fail";
    for (const attempt of attempts) {
        console.log(
            `======> [youtube] yt-dlp parse start id=${o.id} mode=${mode} quality=${targetQuality} client_ip=${attempt.requestClientIp || "n/a"} cookie=${attempt.cookieHeader ? "yes" : "no"} attempt=${attempt.name}`,
        );

        const extracted = await runYtDlp({
            id: o.id,
            requestClientIp: attempt.requestClientIp,
            cookieHeader: attempt.cookieHeader,
        });

        if (extracted.error) {
            console.log(`======> [youtube] yt-dlp parse failed: ${extracted.message || extracted.error}`);
            lastError = extracted.error;
            continue;
        }

        const built = buildYoutubeResult({
            info: extracted.info,
            o,
            requestClientIp: attempt.requestClientIp,
            targetQuality,
        });

        if (!built?.error) {
            return built;
        }

        lastError = built.error;
    }

    return { error: lastError };
}
