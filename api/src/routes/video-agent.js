import express from "express";
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";
import { create as contentDisposition } from "content-disposition-header";
import { agentError, createProject, deleteProject, getProject, listProjects, ownedProject, transaction } from "../db/video-agent.js";
import { addSource, completeUpload, getUpload, putUpload } from "../video-agent/materials.js";
import { getAiVideoObjectStorage } from "../ai-video/object-storage.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (res, error) => {
    const tokenStatus = { AI_VIDEO_IMPORT_TOKEN_INVALID: 400, AI_VIDEO_IMPORT_TOKEN_USER_MISMATCH: 403, AI_VIDEO_IMPORT_TOKEN_EXPIRED: 410 };
    const status = error.status || tokenStatus[error.code] || 500;
    if (status >= 500) console.error(`[VIDEO AGENT] request_failed code=${error.code || "SERVER_ERROR"}`);
    return res.status(status).json({ status: "error", error: { code: error.code || "SERVER_ERROR", message: status >= 500 ? "Video Agent request failed" : error.message, ...(error.context ? { context: error.context } : {}) } });
};

// Dependencies are injectable for HTTP integration tests; production uses Clerk and PostgreSQL.
export const createVideoAgentRouter = ({ authenticate, operations = {} } = {}) => {
    const router = express.Router();
    const db = { createProject, deleteProject, getProject, listProjects, addSource, completeUpload, getUpload, putUpload, ...operations };
    router.use((req, res, next) => {
        res.setHeader("Cache-Control", "no-store");
        if (process.env.VIDEO_AGENT_ENABLED !== "1") return fail(res, agentError("VIDEO_AGENT_NOT_ENABLED", 503, "Video Agent is not enabled"));
        next();
    });
    if (!authenticate) router.use(clerkMiddleware());
    router.use(async (req, res, next) => {
        try {
            if (authenticate) req.agentUser = await authenticate(req);
            else {
                const { getUserByClerkId, upsertUserFromClerk } = await import("../db/users.js");
                const auth = getAuth(req);
                if (!auth.userId) throw agentError("UNAUTHORIZED", 401, "Sign in required");
                let user = await getUserByClerkId(auth.userId);
                if (!user) {
                    const profile = await clerkClient.users.getUser(auth.userId);
                    user = await upsertUserFromClerk({ clerkUserId: profile.id,
                        primaryEmail: profile.emailAddresses?.find((item) => item.id === profile.primaryEmailAddressId)?.emailAddress || profile.emailAddresses?.[0]?.emailAddress || null,
                        fullName: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.username || null, avatarUrl: profile.imageUrl || null });
                }
                req.agentUser = user;
            }
            if (!req.agentUser) throw agentError("UNAUTHORIZED", 401, "Sign in required");
            if (req.agentUser.is_disabled) throw agentError("ACCOUNT_DISABLED", 403, "Account disabled");
            next();
        } catch (error) { fail(res, error); }
    });
    const route = (method, path, action) => router[method](path, async (req, res) => {
        try {
            for (const [key, value] of Object.entries(req.params)) if (key.endsWith("Id") && !uuid.test(value)) throw agentError("VIDEO_AGENT_INVALID_REQUEST", 400, "Invalid resource id");
            await action(req, res, { userId: req.agentUser.id, ...req.params });
        } catch (error) { fail(res, error); }
    });
    const success = (res, data, status = 200) => res.status(status).json({ status: "success", data });
    route("post", "/projects", async (req, res, input) => {
        const title = req.body?.title;
        if (typeof title !== "string" || !title.trim() || title.length > 120 || /[\x00-\x1f]/.test(title)) throw agentError("VIDEO_AGENT_INVALID_REQUEST", 400, "Invalid project title");
        success(res, { project: await db.createProject({ ...input, title: title.trim() }) }, 201);
    });
    route("get", "/projects", async (req, res, input) => {
        let cursor = null;
        if (req.query.cursor) {
            const parts = String(req.query.cursor).split(":");
            if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || !Number.isSafeInteger(Number(parts[0])) || !uuid.test(parts[1])) throw agentError("VIDEO_AGENT_INVALID_REQUEST", 400, "Invalid cursor");
            cursor = { at: Number(parts[0]), id: parts[1] };
        }
        success(res, await db.listProjects({ ...input, cursor, limit: Math.min(50, Math.max(1, Math.floor(Number(req.query.limit) || 20))) }));
    });
    route("get", "/projects/:projectId", async (_req, res, input) => success(res, await db.getProject(input)));
    route("delete", "/projects/:projectId", async (_req, res, input) => { await db.deleteProject(input); res.status(204).end(); });
    route("post", "/projects/:projectId/sources", async (req, res, input) => success(res, await db.addSource({ ...input, body: req.body }), req.body?.kind === "download_import" ? 202 : 201));
    const uploadPath = "/projects/:projectId/sources/:sourceId";
    route("get", `${uploadPath}/upload`, async (_req, res, input) => success(res, await db.getUpload(input)));
    route("put", `${uploadPath}/upload`, async (req, res, input) => {
        if (!req.is("application/octet-stream")) throw agentError("VIDEO_AGENT_INVALID_REQUEST", 415, "Chunk must be application/octet-stream");
        success(res, await db.putUpload({ ...input, offset: req.header("Upload-Offset") ? Number(req.header("Upload-Offset")) : NaN,
            length: Number(req.header("Content-Length")), digest: req.header("Digest")?.match(/^sha-256=(.+)$/)?.[1], body: req }));
    });
    route("post", `${uploadPath}/upload-complete`, async (_req, res, input) => success(res, await db.completeUpload(input), 202));
    route("get", "/projects/:projectId/assets/:assetId/download", async (req, res, input) => {
        const asset = await transaction(async (client) => {
            await ownedProject(client, input);
            const result = await client.query(`SELECT a.*,s.mime,s.filename FROM video_agent_assets a JOIN video_agent_sources s ON s.id=a.source_id
                WHERE a.id=$1 AND a.project_id=$2 AND a.status='ready' AND s.status='ready' AND a.expires_at>$3`, [input.assetId, input.projectId, Date.now()]);
            if (!result.rowCount) throw agentError("VIDEO_AGENT_ASSET_UNAVAILABLE", 404, "Asset is unavailable or expired");
            return result.rows[0];
        });
        const storage = getAiVideoObjectStorage();
        const disposition = contentDisposition(asset.filename);
        if (process.env.AI_VIDEO_STORAGE_PROVIDER === "gcs" || (!process.env.AI_VIDEO_STORAGE_PROVIDER && process.env.NODE_ENV === "production")) {
            const url = await storage.createDownloadUrl(asset.object_key, 10 * 60 * 1000, { responseDisposition: disposition, responseType: asset.mime });
            return req.query.url === "1" ? success(res, { url, expiresAt: Date.now() + 10 * 60 * 1000 }) : res.redirect(302, url);
        }
        if (req.query.url === "1") return success(res, { url: null });
        res.setHeader("Content-Type", asset.mime);
        res.setHeader("Content-Disposition", disposition);
        const stream = storage.openReadStream(asset.object_key);
        stream.on("error", () => { if (!res.headersSent) fail(res, agentError("VIDEO_AGENT_STORAGE_ERROR", 502, "Storage error")); else res.destroy(); });
        stream.pipe(res);
    });
    return router;
};

export default createVideoAgentRouter();
