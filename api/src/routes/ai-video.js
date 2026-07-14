import { createHash, timingSafeEqual } from "node:crypto";
import { Transform } from "node:stream";
import express from "express";
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";

import { getClient, query } from "../db/pg-client.js";
import { getUserByClerkId, upsertUserFromClerk } from "../db/users.js";
import {
    attachAiVideoUploadSession,
    cancelAiVideoJob,
    completeAiVideoUpload,
    createAiVideoJob,
    failAiVideoJob,
    getAiVideoJob,
    getAiVideoDraft,
    getAiVideoUploadSession,
    getAiVideoUsage,
    listAiVideoJobs,
    retryAiVideoJob,
    softDeleteAiVideoJob,
    updateAiVideoDraft,
} from "../db/ai-video.js";
import { createOpaqueObjectKey, getAiVideoObjectStorage } from "../ai-video/object-storage.js";
import { decryptUploadSession, encryptUploadSession } from "../ai-video/session-crypto.js";

const router = express.Router();
const supportedLanguages = new Set(["auto", "de", "en", "es", "fr", "ja", "ko", "ru", "th", "vi", "zh"]);
const jsonError = (res, status, code, message, context) => res.status(status).json({ status: "error", error: { code, message, ...(context ? { context } : {}) } });
const mapClerkUser = (user) => ({
    clerkUserId: user.id,
    primaryEmail: user.emailAddresses?.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress || user.emailAddresses?.[0]?.emailAddress || null,
    fullName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || null,
    avatarUrl: user.imageUrl || null,
});

const config = () => ({
    chunkSizeBytes: Number(process.env.AI_VIDEO_UPLOAD_CHUNK_BYTES || 16 * 1024 * 1024),
    maxFileBytes: Number(process.env.AI_VIDEO_MAX_FILE_BYTES || 1024 * 1024 * 1024),
    monthlySeconds: Number(process.env.AI_VIDEO_MONTHLY_SECONDS || 7200),
    sessionTtlMs: Number(process.env.AI_VIDEO_UPLOAD_SESSION_TTL_MS || 6 * 60 * 60 * 1000),
});

const loadUser = async (req, res) => {
    const auth = getAuth(req);
    if (!auth.userId) {
        jsonError(res, 401, "UNAUTHORIZED", "Unauthenticated");
        return null;
    }
    let user = await getUserByClerkId(auth.userId);
    if (!user) user = await upsertUserFromClerk(mapClerkUser(await clerkClient.users.getUser(auth.userId)));
    if (user?.is_disabled) {
        jsonError(res, 403, "ACCOUNT_DISABLED", "Account disabled");
        return null;
    }
    return user;
};

const validateJobInput = (body) => {
    const sourceKind = body?.sourceKind;
    if (sourceKind !== "upload" && sourceKind !== "download_import") return "sourceKind must be upload or download_import";
    if (!supportedLanguages.has(body?.sourceLanguage || "auto")) return "Unsupported source language";
    if (!supportedLanguages.has(body?.targetLanguage) || body.targetLanguage === "auto") return "Unsupported target language";
    if (!new Set(["translated", "bilingual"]).has(body?.subtitleMode)) return "subtitleMode must be translated or bilingual";
    if (sourceKind === "upload") {
        if (!Number.isSafeInteger(body?.sizeBytes) || body.sizeBytes <= 0) return "sizeBytes must be a positive integer";
        if (typeof body?.filename !== "string" || !body.filename.trim() || body.filename.length > 255) return "Invalid filename";
        if (typeof body?.contentType !== "string" || !body.contentType.startsWith("video/")) return "contentType must be video/*";
        if (typeof body?.fileFingerprint !== "string" || body.fileFingerprint.length < 16 || body.fileFingerprint.length > 512) return "Invalid fileFingerprint";
    } else if (typeof body?.mediaImportToken !== "string" || !body.mediaImportToken) {
        return "mediaImportToken is required";
    }
    return null;
};

router.use((_, res, next) => {
    if (process.env.AI_VIDEO_ENABLED === "1") return next();
    return jsonError(res, 503, "AI_VIDEO_NOT_ENABLED", "AI video studio is not enabled on this deployment");
});
router.use(clerkMiddleware());

router.get("/usage", async (req, res) => {
    try {
        const user = await loadUser(req, res); if (!user) return;
        const usage = await getAiVideoUsage({ userId: user.id, limitSeconds: config().monthlySeconds });
        return res.json({ status: "success", data: { usage } });
    } catch (error) {
        console.error("GET /user/ai-video/usage error:", error);
        return jsonError(res, 500, "SERVER_ERROR", "Failed to load AI video usage");
    }
});

router.post("/jobs", async (req, res) => {
    let created;
    let user;
    let storage;
    let storageSession;
    let objectKey;
    try {
        user = await loadUser(req, res); if (!user) return;
        const validationError = validateJobInput(req.body);
        if (validationError) return jsonError(res, 400, "AI_VIDEO_INVALID_REQUEST", validationError);
        const limits = config();
        if (req.body.sourceKind === "upload" && req.body.sizeBytes > limits.maxFileBytes) {
            return jsonError(res, 413, "AI_VIDEO_FILE_TOO_LARGE", "Video file exceeds the 1 GiB limit");
        }
        if (req.body.sourceKind === "download_import") {
            return jsonError(res, 501, "AI_VIDEO_IMPORT_NOT_READY", "Trusted download import tokens are not available in 3A");
        }
        created = await createAiVideoJob({
            userId: user.id,
            sourceKind: req.body.sourceKind,
            filename: req.body.filename.trim(),
            contentType: req.body.contentType,
            sizeBytes: req.body.sizeBytes,
            sourceLanguage: req.body.sourceLanguage || "auto",
            targetLanguage: req.body.targetLanguage,
            subtitleMode: req.body.subtitleMode,
            monthlySeconds: limits.monthlySeconds,
        });
        storage = getAiVideoObjectStorage();
        objectKey = createOpaqueObjectKey(process.env.AI_VIDEO_STORAGE_PREFIX);
        storageSession = await storage.startResumableUpload({ objectKey, contentType: req.body.contentType });
        const expiresAt = Date.now() + limits.sessionTtlMs;
        const upload = await attachAiVideoUploadSession({
            jobId: created.job.id,
            userId: user.id,
            objectKey,
            encryptedSession: encryptUploadSession(storageSession),
            totalBytes: req.body.sizeBytes,
            chunkSizeBytes: limits.chunkSizeBytes,
            fileFingerprint: req.body.fileFingerprint,
            expiresAt,
        });
        return res.status(201).json({
            status: "success",
            data: { job: created.job, usage: created.usage, uploadSessionId: upload.id, chunkSizeBytes: limits.chunkSizeBytes, committedBytes: 0, expiresAt },
        });
    } catch (error) {
        if (storage && storageSession) await storage.abortResumableUpload({ sessionUri: storageSession }).catch(() => {});
        if (storage && objectKey) await storage.deleteObject(objectKey).catch(() => {});
        if (created?.job?.id && user?.id) await failAiVideoJob({ jobId: created.job.id, userId: user.id, errorCode: "AI_VIDEO_UPLOAD_INIT_FAILED" }).catch(() => {});
        const statusByCode = { MEMBERSHIP_REQUIRED: 403, AI_VIDEO_CONCURRENCY_LIMIT: 409, AI_VIDEO_QUOTA_EXCEEDED: 429, AI_VIDEO_UPLOAD_CAPACITY: 503 };
        if (statusByCode[error.code]) return jsonError(res, statusByCode[error.code], error.code, error.message, error.usage);
        console.error("POST /user/ai-video/jobs error:", error);
        return jsonError(res, 500, "SERVER_ERROR", "Failed to create AI video job");
    }
});

router.get("/jobs", async (req, res) => {
    try {
        const user = await loadUser(req, res); if (!user) return;
        const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
        const before = req.query.cursor && /^\d+$/.test(req.query.cursor) ? Number(req.query.cursor) : null;
        const jobs = await listAiVideoJobs({ userId: user.id, limit, before });
        return res.json({ status: "success", data: { jobs, nextCursor: jobs.length === limit ? String(jobs.at(-1).createdAt) : null } });
    } catch (error) {
        console.error("GET /user/ai-video/jobs error:", error);
        return jsonError(res, 500, "SERVER_ERROR", "Failed to list AI video jobs");
    }
});

router.get("/jobs/:jobId", async (req, res) => {
    try {
        const user = await loadUser(req, res); if (!user) return;
        const job = await getAiVideoJob({ jobId: req.params.jobId, userId: user.id });
        return job ? res.json({ status: "success", data: { job } }) : jsonError(res, 404, "AI_VIDEO_JOB_NOT_FOUND", "Job not found");
    } catch (error) {
        return jsonError(res, 500, "SERVER_ERROR", "Failed to load AI video job");
    }
});

router.get("/jobs/:jobId/draft", async (req, res) => {
    try {
        const user = await loadUser(req, res); if (!user) return;
        const draft = await getAiVideoDraft({ jobId: req.params.jobId, userId: user.id });
        if (!draft) return jsonError(res, 404, "AI_VIDEO_JOB_NOT_FOUND", "Job not found");
        if (draft.job.status !== "draft_ready") return jsonError(res, 409, "AI_VIDEO_DRAFT_NOT_READY", "Draft is not ready", { job: draft.job });
        return res.json({ status: "success", data: { ...draft, sourcePreviewUrl: `/user/ai-video/jobs/${draft.job.id}/source` } });
    } catch (error) {
        console.error("GET AI video draft error:", error);
        return jsonError(res, 500, "SERVER_ERROR", "Failed to load AI video draft");
    }
});

router.put("/jobs/:jobId/draft", async (req, res) => {
    try {
        const user = await loadUser(req, res); if (!user) return;
        const expectedRevision = Number(req.body?.revision);
        const segments = Array.isArray(req.body?.segments) ? req.body.segments : [];
        const clips = Array.isArray(req.body?.clips) ? req.body.clips : [];
        if (!Number.isInteger(expectedRevision) || segments.length > 2000 || clips.length > 5) {
            return jsonError(res, 400, "AI_VIDEO_DRAFT_INVALID", "Invalid draft payload");
        }
        for (const segment of segments) {
            if (typeof segment.id !== "string" || !Number.isInteger(segment.segmentIndex) || typeof segment.translatedText !== "string" || segment.translatedText.length > 4000) {
                return jsonError(res, 400, "AI_VIDEO_DRAFT_INVALID", "Invalid subtitle segment");
            }
        }
        const current = await getAiVideoDraft({ jobId: req.params.jobId, userId: user.id });
        if (!current) return jsonError(res, 404, "AI_VIDEO_JOB_NOT_FOUND", "Job not found");
        const durationMs = current.job.sourceDurationMs || 0;
        for (const clip of clips) {
            const length = Number(clip.endMs) - Number(clip.startMs);
            if (typeof clip.id !== "string" || !Number.isInteger(clip.startMs) || !Number.isInteger(clip.endMs) || clip.startMs < 0 || clip.endMs > durationMs || length < 15000 || length > 90000 || typeof clip.enabled !== "boolean" || !Number.isFinite(clip.focusX) || clip.focusX < 0 || clip.focusX > 1 || typeof clip.title !== "string" || clip.title.length > 120) {
                return jsonError(res, 400, "AI_VIDEO_DRAFT_INVALID", "Invalid highlight clip");
            }
        }
        const result = await updateAiVideoDraft({ jobId: req.params.jobId, userId: user.id, expectedRevision, segments, clips });
        if (result.reason === "revision_conflict") return jsonError(res, 409, "AI_VIDEO_DRAFT_REVISION_CONFLICT", "Draft was changed elsewhere", { revision: result.revision });
        if (result.reason) return jsonError(res, result.reason === "not_found" ? 404 : 409, "AI_VIDEO_DRAFT_NOT_EDITABLE", "Draft is not editable");
        return res.json({ status: "success", data: result });
    } catch (error) {
        console.error("PUT AI video draft error:", error);
        return jsonError(res, 500, "SERVER_ERROR", "Failed to save AI video draft");
    }
});

router.get("/jobs/:jobId/source", async (req, res) => {
    try {
        const user = await loadUser(req, res); if (!user) return;
        const job = await getAiVideoJob({ jobId: req.params.jobId, userId: user.id });
        if (!job?.sourceObjectKey) return jsonError(res, 404, "AI_VIDEO_SOURCE_NOT_FOUND", "Source is unavailable");
        const storage = getAiVideoObjectStorage();
        try {
            const url = await storage.createDownloadUrl(job.sourceObjectKey, 10 * 60 * 1000);
            return res.redirect(302, url);
        } catch (error) {
            if (process.env.AI_VIDEO_STORAGE_PROVIDER === "gcs") throw error;
            res.setHeader("Content-Type", job.sourceMime || "video/mp4");
            return storage.openReadStream(job.sourceObjectKey).pipe(res);
        }
    } catch (error) {
        console.error("GET AI video source error:", error);
        return jsonError(res, 502, "AI_VIDEO_STORAGE_ERROR", "Failed to load source preview");
    }
});

router.post("/jobs/:jobId/retry", async (req, res) => {
    try {
        const user = await loadUser(req, res); if (!user) return;
        const job = await retryAiVideoJob({ jobId: req.params.jobId, userId: user.id });
        return job ? res.json({ status: "success", data: { job } }) : jsonError(res, 409, "AI_VIDEO_JOB_NOT_RETRYABLE", "Job cannot be retried");
    } catch (error) {
        return jsonError(res, 500, "SERVER_ERROR", "Failed to retry job");
    }
});

router.get("/jobs/:jobId/upload", async (req, res) => {
    try {
        const user = await loadUser(req, res); if (!user) return;
        const session = await getAiVideoUploadSession({ jobId: req.params.jobId, userId: user.id });
        if (!session) return jsonError(res, 404, "AI_VIDEO_UPLOAD_NOT_FOUND", "Upload session not found");
        if (session.status === "active" && session.job_status !== "uploading") return jsonError(res, 409, "AI_VIDEO_UPLOAD_INACTIVE", "The job no longer accepts upload chunks");
        if (session.status === "active" && Number(session.expires_at) <= Date.now()) return jsonError(res, 410, "AI_VIDEO_UPLOAD_EXPIRED", "Upload session expired");
        if (session.status === "active") {
            const remote = await getAiVideoObjectStorage().queryUploadOffset({ sessionUri: decryptUploadSession(session.storage_session_encrypted), totalBytes: Number(session.total_bytes) });
            if (remote.committedBytes !== Number(session.committed_bytes)) {
                await query(`UPDATE ai_video_upload_sessions SET committed_bytes=$2, updated_at=$3 WHERE id=$1`, [session.id, remote.committedBytes, Date.now()]);
                session.committed_bytes = remote.committedBytes;
            }
        }
        return res.json({ status: "success", data: { uploadSessionId: session.id, status: session.status, committedBytes: Number(session.committed_bytes), totalBytes: Number(session.total_bytes), chunkSizeBytes: session.chunk_size_bytes, fileFingerprint: session.file_fingerprint, expiresAt: Number(session.expires_at) } });
    } catch (error) {
        console.error("GET AI video upload status error:", error);
        return jsonError(res, 502, "AI_VIDEO_STORAGE_ERROR", "Failed to query upload status");
    }
});

router.put("/jobs/:jobId/upload", async (req, res) => {
    const client = await getClient();
    let transaction = false;
    try {
        const user = await loadUser(req, res); if (!user) return;
        const offset = Number(req.header("Upload-Offset"));
        const length = Number(req.header("Content-Length"));
        const digest = req.header("Digest")?.match(/^sha-256=([A-Za-z0-9+/=]+)$/)?.[1];
        if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length <= 0 || !digest) {
            return jsonError(res, 400, "AI_VIDEO_UPLOAD_HEADERS_INVALID", "Upload-Offset, Content-Length and SHA-256 Digest are required");
        }
        await client.query("BEGIN"); transaction = true;
        const session = await getAiVideoUploadSession({ jobId: req.params.jobId, userId: user.id, forUpdate: true, client });
        if (!session) { await client.query("ROLLBACK"); transaction = false; return jsonError(res, 404, "AI_VIDEO_UPLOAD_NOT_FOUND", "Upload session not found"); }
        if (session.status !== "active" || session.job_status !== "uploading" || Number(session.expires_at) <= Date.now()) { await client.query("ROLLBACK"); transaction = false; return jsonError(res, 410, "AI_VIDEO_UPLOAD_EXPIRED", "Upload session is not active"); }
        const committed = Number(session.committed_bytes);
        const total = Number(session.total_bytes);
        if (offset !== committed) { await client.query("ROLLBACK"); transaction = false; return jsonError(res, 409, "AI_VIDEO_UPLOAD_OFFSET_MISMATCH", "Upload offset does not match", { committedBytes: committed }); }
        if (length > session.chunk_size_bytes || offset + length > total || (offset + length < total && length !== session.chunk_size_bytes)) {
            await client.query("ROLLBACK"); transaction = false; return jsonError(res, 400, "AI_VIDEO_UPLOAD_CHUNK_INVALID", "Invalid upload chunk size");
        }
        const hash = createHash("sha256");
        const hashingStream = new Transform({ transform(chunk, _, callback) { hash.update(chunk); callback(null, chunk); } });
        req.pipe(hashingStream);
        const storage = getAiVideoObjectStorage();
        const result = await storage.writeUploadChunk({ sessionUri: decryptUploadSession(session.storage_session_encrypted), body: hashingStream, offset, length, totalBytes: total });
        const actualDigest = hash.digest();
        const expectedDigest = Buffer.from(digest, "base64");
        if (expectedDigest.length !== actualDigest.length || !timingSafeEqual(expectedDigest, actualDigest)) {
            await storage.abortResumableUpload({ sessionUri: decryptUploadSession(session.storage_session_encrypted) }).catch(() => {});
            await storage.deleteObject(session.object_key).catch(() => {});
            await client.query(`UPDATE ai_video_upload_sessions SET status='aborted', updated_at=$2 WHERE id=$1`, [session.id, Date.now()]);
            await client.query("COMMIT"); transaction = false;
            return jsonError(res, 422, "AI_VIDEO_UPLOAD_DIGEST_MISMATCH", "Chunk digest does not match; upload was aborted");
        }
        await client.query(`UPDATE ai_video_upload_sessions SET committed_bytes=$2, last_chunk_sha256=$3, updated_at=$4 WHERE id=$1`, [session.id, result.committedBytes, actualDigest.toString("hex"), Date.now()]);
        await client.query("COMMIT"); transaction = false;
        res.setHeader("Upload-Offset", String(result.committedBytes));
        return res.status(204).end();
    } catch (error) {
        if (transaction) await client.query("ROLLBACK").catch(() => {});
        console.error("PUT AI video upload chunk error:", error);
        return jsonError(res, 502, "AI_VIDEO_STORAGE_ERROR", "Failed to store upload chunk");
    } finally {
        client.release();
    }
});

router.post("/jobs/:jobId/upload-complete", async (req, res) => {
    try {
        const user = await loadUser(req, res); if (!user) return;
        const session = await getAiVideoUploadSession({ jobId: req.params.jobId, userId: user.id });
        if (!session) return jsonError(res, 404, "AI_VIDEO_UPLOAD_NOT_FOUND", "Upload session not found");
        if (!new Set(["uploading", "queued_ingest"]).has(session.job_status)) return jsonError(res, 409, "AI_VIDEO_UPLOAD_INACTIVE", "The job no longer accepts upload completion");
        if (session.status !== "completed") {
            const remote = await getAiVideoObjectStorage().queryUploadOffset({ sessionUri: decryptUploadSession(session.storage_session_encrypted), totalBytes: Number(session.total_bytes) });
            if (!remote.completed || remote.committedBytes !== Number(session.total_bytes)) return jsonError(res, 409, "AI_VIDEO_UPLOAD_INCOMPLETE", "Upload is incomplete", { committedBytes: remote.committedBytes });
        }
        const object = await getAiVideoObjectStorage().headObject(session.object_key);
        const asset = await completeAiVideoUpload({ jobId: req.params.jobId, userId: user.id, generation: object.generation, sizeBytes: object.sizeBytes, checksumSha256: object.checksumSha256 });
        const job = await getAiVideoJob({ jobId: req.params.jobId, userId: user.id });
        return res.json({ status: "success", data: { job, assetId: asset?.id } });
    } catch (error) {
        console.error("POST AI video upload complete error:", error);
        return jsonError(res, error.code === "AI_VIDEO_UPLOAD_SIZE_MISMATCH" ? 422 : 502, error.code || "AI_VIDEO_STORAGE_ERROR", error.message || "Failed to complete upload");
    }
});

router.post("/jobs/:jobId/cancel", async (req, res) => {
    try {
        const user = await loadUser(req, res); if (!user) return;
        const job = await cancelAiVideoJob({ jobId: req.params.jobId, userId: user.id });
        return job ? res.json({ status: "success", data: { job } }) : jsonError(res, 409, "AI_VIDEO_JOB_NOT_CANCELLABLE", "Job is not cancellable");
    } catch { return jsonError(res, 500, "SERVER_ERROR", "Failed to cancel job"); }
});

router.delete("/jobs/:jobId", async (req, res) => {
    try {
        const user = await loadUser(req, res); if (!user) return;
        const deleted = await softDeleteAiVideoJob({ jobId: req.params.jobId, userId: user.id });
        return deleted ? res.status(204).end() : jsonError(res, 409, "AI_VIDEO_JOB_NOT_DELETABLE", "Job is running or not found");
    } catch { return jsonError(res, 500, "SERVER_ERROR", "Failed to delete job"); }
});

export default router;
