import { spawn } from "node:child_process";
import { mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const ffprobePath = ffprobeStatic.path;

const runProcess = (command, args, { timeoutMs = 10 * 60 * 1000 } = {}) =>
    new Promise((resolve, reject) => {
        const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        const collect = (target) => (chunk) => {
            const next = target() + chunk.toString("utf8");
            return next.slice(-1024 * 1024);
        };
        child.stdout.on("data", (chunk) => { stdout = collect(() => stdout)(chunk); });
        child.stderr.on("data", (chunk) => { stderr = collect(() => stderr)(chunk); });
        const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
        child.once("error", (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.once("close", (code, signal) => {
            clearTimeout(timer);
            if (code === 0) return resolve({ stdout, stderr });
            const error = new Error(`Media process failed (${code ?? signal})`);
            error.code = "AI_VIDEO_MEDIA_PROCESS_FAILED";
            error.detail = stderr.slice(-4000);
            reject(error);
        });
    });

export const createAiVideoWorkDir = () => mkdtemp(path.join(os.tmpdir(), "fsv-ai-video-"));

export const probeVideo = async (inputPath) => {
    const { stdout } = await runProcess(ffprobePath, [
        "-v", "error",
        "-show_streams",
        "-show_format",
        "-of", "json",
        inputPath,
    ], { timeoutMs: 120000 });
    const parsed = JSON.parse(stdout);
    const video = parsed.streams?.find((stream) => stream.codec_type === "video");
    const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
    const durationSeconds = Number(parsed.format?.duration || video?.duration || audio?.duration);
    if (!video) {
        const error = new Error("Source has no video stream");
        error.code = "AI_VIDEO_NO_VIDEO_STREAM";
        throw error;
    }
    if (!audio) {
        const error = new Error("Source has no audio stream");
        error.code = "AI_VIDEO_NO_AUDIO_STREAM";
        throw error;
    }
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        const error = new Error("Source duration is invalid");
        error.code = "AI_VIDEO_INVALID_DURATION";
        throw error;
    }
    return {
        durationSeconds,
        durationMs: Math.round(durationSeconds * 1000),
        width: Number(video.width) || 0,
        height: Number(video.height) || 0,
        videoCodec: video.codec_name || null,
        audioCodec: audio.codec_name || null,
    };
};

export const extractAudioChunks = async ({ inputPath, outputDir, chunkSeconds = 600 }) => {
    const pattern = path.join(outputDir, "audio-%03d.mp3");
    await runProcess(ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-nostdin",
        "-i", inputPath,
        "-vn", "-map", "0:a:0",
        "-ac", "1", "-ar", "16000", "-b:a", "48k",
        "-f", "segment", "-segment_time", String(chunkSeconds),
        "-reset_timestamps", "1",
        pattern,
    ]);
    const names = (await readdir(outputDir)).filter((name) => /^audio-\d{3}\.mp3$/.test(name)).sort();
    if (!names.length) {
        const error = new Error("Audio extraction produced no chunks");
        error.code = "AI_VIDEO_AUDIO_EXTRACTION_EMPTY";
        throw error;
    }
    return names.map((name, index) => ({ path: path.join(outputDir, name), offsetSeconds: index * chunkSeconds }));
};

