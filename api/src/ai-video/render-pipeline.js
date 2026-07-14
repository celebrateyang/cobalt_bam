import { createReadStream, createWriteStream } from "node:fs";
import { stat, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import {
    failAiVideoProcessingJob,
    finalizeAiVideoRenderedAsset,
    finishAiVideoCancellation,
    finishAiVideoRender,
    getAiVideoWorkerJob,
    getAiVideoWorkerRenderedAssets,
    getAiVideoWorkerRenderSnapshot,
    prepareAiVideoRenderedAsset,
    updateAiVideoRenderProgress,
} from "../db/ai-video.js";
import { createAiVideoWorkDir, renderVerticalClip } from "./media.js";
import { createOpaqueObjectKey, getAiVideoObjectStorage } from "./object-storage.js";
import { buildClipCues, renderAss, renderSrt, renderVtt } from "./subtitles.js";

const checkCancellation = async ({ jobId, workerId }) => {
    const current = await getAiVideoWorkerJob({ jobId, workerId });
    if (!current || current.status === "cancel_requested") throw Object.assign(new Error("Render cancelled"), { code: "AI_VIDEO_CANCELLED" });
};

const ensureStoredAsset = async ({ jobId, clipId, kind, revision, mime, localPath, expiresAt, existing }) => {
    const storage = getAiVideoObjectStorage();
    const localInfo = await stat(localPath);
    let asset = existing || await prepareAiVideoRenderedAsset({
        jobId, clipId, kind, revision, mime, expiresAt,
        objectKey: createOpaqueObjectKey(process.env.AI_VIDEO_STORAGE_PREFIX),
    });
    if (asset.object_generation !== "pending" && asset.cleanup_status === "active") return asset;
    try {
        const remote = await storage.headObject(asset.object_key);
        if (remote.sizeBytes === localInfo.size) {
            return finalizeAiVideoRenderedAsset({ assetId: asset.id, generation: remote.generation, sizeBytes: remote.sizeBytes });
        }
        await storage.deleteObject(asset.object_key, remote.generation);
    } catch (error) {
        if (!new Set(["ENOENT", 404]).has(error.code) && error.statusCode !== 404) throw error;
    }
    await pipeline(createReadStream(localPath), storage.createWriteStream(asset.object_key, { metadata: { contentType: mime } }));
    const remote = await storage.headObject(asset.object_key);
    if (remote.sizeBytes !== localInfo.size) throw Object.assign(new Error("Rendered asset size mismatch"), { code: "AI_VIDEO_STORAGE_ERROR" });
    asset = await finalizeAiVideoRenderedAsset({ assetId: asset.id, generation: remote.generation, sizeBytes: remote.sizeBytes });
    return asset;
};

export const processAiVideoRenderJob = async ({ job, workerId }) => {
    const storage = getAiVideoObjectStorage();
    const workDir = await createAiVideoWorkDir();
    const sourcePath = path.join(workDir, "source-media");
    try {
        const row = await getAiVideoWorkerRenderSnapshot({ jobId: job.id, workerId });
        const snapshot = row?.render_snapshot;
        const revision = Number(row?.render_revision);
        if (!snapshot?.clips?.length || !row.source_object_key || !Number.isInteger(revision)) {
            throw Object.assign(new Error("Render snapshot or source is missing"), { code: "AI_VIDEO_RENDER_SNAPSHOT_MISSING" });
        }
        await pipeline(storage.openReadStream(row.source_object_key), createWriteStream(sourcePath, { flags: "wx" }));
        const existingAssets = await getAiVideoWorkerRenderedAssets({ jobId: job.id, workerId, revision });
        const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
        for (let index = 0; index < snapshot.clips.length; index += 1) {
            await checkCancellation({ jobId: job.id, workerId });
            const clip = snapshot.clips[index];
            const duration = clip.endMs - clip.startMs;
            if (duration < 15_000 || duration > 90_000) throw Object.assign(new Error("Render clip duration is invalid"), { code: "AI_VIDEO_RENDER_CLIP_INVALID" });
            const cues = buildClipCues({ segments: snapshot.segments, clip, subtitleMode: snapshot.subtitleMode });
            const base = `clip-${index + 1}`;
            const assName = `${base}.ass`;
            const assPath = path.join(workDir, assName);
            const srtPath = path.join(workDir, `${base}.srt`);
            const vttPath = path.join(workDir, `${base}.vtt`);
            const outputPath = path.join(workDir, `${base}.mp4`);
            await Promise.all([
                writeFile(assPath, renderAss(cues, { bilingual: snapshot.subtitleMode === "bilingual" }), "utf8"),
                writeFile(srtPath, renderSrt(cues), "utf8"),
                writeFile(vttPath, renderVtt(cues), "utf8"),
            ]);
            const outputExisting = existingAssets.find((asset) => asset.clip_id === clip.id && asset.kind === "output" && asset.object_generation !== "pending");
            if (!outputExisting) {
                await renderVerticalClip({ inputPath: sourcePath, outputPath, workDir, assFilename: assName, startMs: clip.startMs, endMs: clip.endMs, focusX: clip.focusX });
            }
            const files = [
                { kind: "srt", mime: "application/x-subrip; charset=utf-8", localPath: srtPath },
                { kind: "vtt", mime: "text/vtt; charset=utf-8", localPath: vttPath },
                ...(outputExisting ? [] : [{ kind: "output", mime: "video/mp4", localPath: outputPath }]),
            ];
            for (const file of files) {
                await ensureStoredAsset({
                    jobId: job.id, clipId: clip.id, revision, expiresAt, ...file,
                    existing: existingAssets.find((asset) => asset.clip_id === clip.id && asset.kind === file.kind),
                });
            }
            await updateAiVideoRenderProgress({ jobId: job.id, workerId, progress: 76 + ((index + 1) / snapshot.clips.length) * 23 });
        }
        await checkCancellation({ jobId: job.id, workerId });
        await finishAiVideoRender({ jobId: job.id, workerId });
        console.log(`[AI VIDEO WORKER] job_id=${job.id} result=completed clips=${snapshot.clips.length} revision=${revision}`);
    } catch (error) {
        if (error.code === "AI_VIDEO_CANCELLED") {
            await finishAiVideoCancellation({ jobId: job.id, workerId });
            return;
        }
        const retryable = !new Set(["AI_VIDEO_RENDER_SNAPSHOT_MISSING", "AI_VIDEO_RENDER_CLIP_INVALID"]).has(error.code);
        await failAiVideoProcessingJob({ jobId: job.id, workerId, stage: "rendering", errorCode: error.code || "AI_VIDEO_RENDER_FAILED", retryable, detail: String(error.code || "render_error") });
        console.error(`[AI VIDEO WORKER] job_id=${job.id} result=failed stage=rendering code=${error.code || "unknown"} retryable=${retryable}`);
    } finally {
        await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
};
