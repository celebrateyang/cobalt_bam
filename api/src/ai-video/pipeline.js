import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import {
    applyAiVideoTranslations,
    commitAiVideoUsage,
    failAiVideoProcessingJob,
    finishAiVideoCancellation,
    finishAiVideoDraft,
    getAiVideoWorkerTranscript,
    getAiVideoWorkerJob,
    releaseAiVideoUsage,
    replaceAiVideoClips,
    replaceAiVideoTranscript,
    reserveAiVideoUsage,
    updateAiVideoJobStage,
    updateAiVideoProbe,
} from "../db/ai-video.js";
import { getAiVideoObjectStorage } from "./object-storage.js";
import { createAiVideoWorkDir, extractAudioChunks, probeVideo } from "./media.js";
import { deterministicHighlights, maxHighlightClipsForDuration, normalizeHighlightClips } from "./highlights.js";
import { ingestAiVideoImport } from "./import-source.js";
import {
    classifyProviderError,
    openAiHighlightProvider,
    openAiSpeechProvider,
    openAiTranslationProvider,
} from "./providers.js";

const nonRetryableCodes = new Set([
    "AI_VIDEO_NO_VIDEO_STREAM",
    "AI_VIDEO_NO_AUDIO_STREAM",
    "AI_VIDEO_INVALID_DURATION",
    "AI_VIDEO_SOURCE_TOO_LONG",
    "AI_VIDEO_SOURCE_TOO_SHORT",
    "AI_VIDEO_AUDIO_EXTRACTION_EMPTY",
    "AI_VIDEO_NO_SPEECH",
    "AI_VIDEO_QUOTA_EXCEEDED",
]);

const checkCancellation = async ({ jobId, workerId }) => {
    const job = await getAiVideoWorkerJob({ jobId, workerId });
    if (!job || job.status === "cancel_requested") {
        const error = new Error("AI video job was cancelled");
        error.code = "AI_VIDEO_CANCELLED";
        throw error;
    }
    return job;
};

const transition = async ({ jobId, workerId, status, progress }) => {
    const job = await updateAiVideoJobStage({ jobId, workerId, status, progress });
    if (!job) await checkCancellation({ jobId, workerId });
    return job;
};

export const processAiVideoJob = async ({ job, workerId }) => {
    const storage = getAiVideoObjectStorage();
    const workDir = await createAiVideoWorkDir();
    const sourcePath = path.join(workDir, "source-media");
    let stage = "ingesting";
    let usageCommitted = false;
    try {
        await checkCancellation({ jobId: job.id, workerId });
        const resumeFromDraftData = new Set(["translating", "analyzing"]).has(job.failedStage);
        let probe = job.sourceDurationMs
            ? { durationMs: job.sourceDurationMs, durationSeconds: job.sourceDurationMs / 1000, width: job.sourceWidth, height: job.sourceHeight }
            : null;
        let segments = resumeFromDraftData ? await getAiVideoWorkerTranscript({ jobId: job.id, workerId }) : [];
        const canResume = resumeFromDraftData && probe && segments.length > 0;

        if (!canResume) {
            let sourceIsLocal = false;
            if (!job.sourceObjectKey) {
                if (job.sourceKind === "download_import") {
                    await ingestAiVideoImport({ job, workerId, targetPath: sourcePath });
                    sourceIsLocal = true;
                } else {
                    const error = new Error("Source object is missing");
                    error.code = "AI_VIDEO_SOURCE_MISSING";
                    throw error;
                }
            }
            if (!sourceIsLocal) await pipeline(storage.openReadStream(job.sourceObjectKey), createWriteStream(sourcePath, { flags: "wx" }));

            stage = "probing";
            await transition({ jobId: job.id, workerId, status: stage, progress: 10 });
            probe = await probeVideo(sourcePath);
            const maxDuration = Number(process.env.AI_VIDEO_MAX_DURATION_SECONDS || 3600);
            if (probe.durationSeconds > maxDuration) {
                const error = new Error("Video exceeds the 60 minute limit");
                error.code = "AI_VIDEO_SOURCE_TOO_LONG";
                throw error;
            }
            if (probe.durationSeconds < 15) {
                const error = new Error("Video is shorter than the minimum clip duration");
                error.code = "AI_VIDEO_SOURCE_TOO_SHORT";
                throw error;
            }
            await updateAiVideoProbe({ jobId: job.id, workerId, durationMs: probe.durationMs, width: probe.width, height: probe.height });
            await reserveAiVideoUsage({
                jobId: job.id,
                userId: job.userId,
                durationSeconds: probe.durationSeconds,
                limitSeconds: Number(process.env.AI_VIDEO_MONTHLY_SECONDS || 7200),
            });
            await checkCancellation({ jobId: job.id, workerId });

            const chunks = await extractAudioChunks({
                inputPath: sourcePath,
                outputDir: workDir,
                chunkSeconds: Number(process.env.AI_VIDEO_AUDIO_CHUNK_SECONDS || 600),
            });

            stage = "transcribing";
            await transition({ jobId: job.id, workerId, status: stage, progress: 15 });
            await commitAiVideoUsage({ jobId: job.id });
            usageCommitted = true;
            const transcript = await openAiSpeechProvider.transcribe({ chunks, language: job.sourceLanguage });
            if (!transcript.length) {
                const error = new Error("No speech was detected");
                error.code = "AI_VIDEO_NO_SPEECH";
                throw error;
            }
            segments = transcript
                .filter((segment) => segment.endMs <= probe.durationMs + 1000)
                .map((segment, segmentIndex) => ({ ...segment, segmentIndex }));
            if (!segments.length) {
                const error = new Error("No timestamped speech was detected within the video duration");
                error.code = "AI_VIDEO_NO_SPEECH";
                throw error;
            }
            await replaceAiVideoTranscript({ jobId: job.id, segments });
            await checkCancellation({ jobId: job.id, workerId });
        } else {
            usageCommitted = true;
            console.log(`[AI VIDEO WORKER] job_id=${job.id} resume_from=${job.failedStage}`);
        }

        let translatedSegments = segments;
        if (job.failedStage !== "analyzing" || segments.some((segment) => !segment.translatedText)) {
            stage = "translating";
            await transition({ jobId: job.id, workerId, status: stage, progress: 50 });
            const translations = await openAiTranslationProvider.translate({
                segments,
                sourceLanguage: job.sourceLanguage,
                targetLanguage: job.targetLanguage,
            });
            await applyAiVideoTranslations({ jobId: job.id, translations });
            translatedSegments = segments.map((segment) => ({
                ...segment,
                translatedText: translations.find((item) => item.segmentIndex === segment.segmentIndex)?.translatedText || "",
            }));
            await checkCancellation({ jobId: job.id, workerId });
        }

        stage = "analyzing";
        await transition({ jobId: job.id, workerId, status: stage, progress: 65 });
        const maxClips = maxHighlightClipsForDuration(probe.durationMs);
        let suggested;
        try {
            suggested = await openAiHighlightProvider.suggest({ segments: translatedSegments, minSeconds: 15, maxSeconds: 90, maxClips });
        } catch (error) {
            console.warn(`[AI VIDEO WORKER] job_id=${job.id} stage=analyzing provider_fallback=true code=${error?.status || error?.code || "unknown"}`);
            suggested = [];
        }
        let clips = normalizeHighlightClips({ clips: suggested, durationMs: probe.durationMs, minSeconds: 15, maxSeconds: 90, maxClips });
        if (!clips.length) {
            clips = deterministicHighlights({ segments: translatedSegments, durationMs: probe.durationMs, minSeconds: 15, maxSeconds: 90, maxClips });
        }
        if (!clips.length) {
            const error = new Error("No valid highlight candidates could be generated");
            error.code = "AI_VIDEO_NO_VALID_HIGHLIGHTS";
            throw error;
        }
        await replaceAiVideoClips({ jobId: job.id, clips });
        await checkCancellation({ jobId: job.id, workerId });
        await finishAiVideoDraft({ jobId: job.id, workerId });
        console.log(`[AI VIDEO WORKER] job_id=${job.id} result=draft_ready segments=${segments.length} clips=${clips.length}`);
    } catch (error) {
        if (error.code === "AI_VIDEO_CANCELLED") {
            await finishAiVideoCancellation({ jobId: job.id, workerId });
            return;
        }
        if (!usageCommitted) await releaseAiVideoUsage({ jobId: job.id }).catch(() => {});
        const provider = classifyProviderError(error);
        const retryable = !nonRetryableCodes.has(error.code) && (
            provider.retryable
            || new Set(["AI_VIDEO_SOURCE_MISSING", "AI_VIDEO_MEDIA_PROCESS_FAILED", "AI_VIDEO_IMPORT_FETCH_FAILED", "AI_VIDEO_STORAGE_ERROR"]).has(error.code)
        );
        await failAiVideoProcessingJob({
            jobId: job.id,
            workerId,
            stage,
            errorCode: error.code || `AI_VIDEO_${stage.toUpperCase()}_FAILED`,
            retryable,
            detail: provider.detail,
        });
        console.error(`[AI VIDEO WORKER] job_id=${job.id} result=failed stage=${stage} code=${error.code || "unknown"} retryable=${retryable}`);
    } finally {
        await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
};
