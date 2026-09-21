import express from "express";
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";
import { create as contentDisposition } from "content-disposition-header";
import { agentError, createProject, deleteProject, getProject, listProjects, ownedProject, transaction } from "../db/video-agent.js";
import { addSource, completeUpload, getUpload, putUpload } from "../video-agent/materials.js";
import { getAiVideoObjectStorage } from "../ai-video/object-storage.js";
import { getPlan, getCurrentPlan,getRun, listEvents, listRevisions, listRuns, submitCommand } from "../video-agent/execution.js";
import { admissionEnabled,executionReady,getExecutionUsage } from "../video-agent/admission.js";
import {getPublishedResults,getEditableResults} from "../video-agent/results.js";
import {saveUserMessage,listMessages} from "../video-agent/conversation.js";
import {planMessage} from "../video-agent/planner.js";
import {getTtsConfig,ttsConfigured} from "../video-agent/tts-config.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const activeStreams = new Map();
const fail = (res, error) => {
    const tokenStatus = { AI_VIDEO_IMPORT_TOKEN_INVALID: 400, AI_VIDEO_IMPORT_TOKEN_USER_MISMATCH: 403, AI_VIDEO_IMPORT_TOKEN_EXPIRED: 410 };
    const status = error.status || tokenStatus[error.code] || 500;
    if (status >= 500) console.error(`[VIDEO AGENT] request_failed code=${error.code || "SERVER_ERROR"}`);
    return res.status(status).json({ status: "error", error: { code: error.code || "SERVER_ERROR", message: status >= 500 ? "Video Agent request failed" : error.message, ...(error.context ? { context: error.context } : {}) } });
};

// Dependencies are injectable for HTTP integration tests; production uses Clerk and PostgreSQL.
export const createVideoAgentRouter = ({ authenticate, operations = {} } = {}) => {
    const router = express.Router();
    const db = { createProject, deleteProject, getProject, listProjects, addSource, completeUpload, getUpload, putUpload,saveUserMessage,listMessages,planMessage,
        getPlan,getCurrentPlan, getRun, listEvents, listRevisions, listRuns, submitCommand, ...operations };
    router.use((req, res, next) => {
        res.setHeader("Cache-Control", "no-store");
        const existingControl = req.method === "GET" || req.method === "DELETE" || (req.method === "POST" && (/^\/projects\/[^/]+\/commands$/.test(req.path) || /^\/projects\/[^/]+\/runs\/[^/]+\/cancel$/.test(req.path)));
        if (process.env.VIDEO_AGENT_ENABLED !== "1" && !existingControl) return fail(res, agentError("VIDEO_AGENT_NOT_ENABLED", 503, "Video Agent is not enabled"));
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
    const limit = (req) => Math.min(100, Math.max(1, Math.floor(Number(req.query.limit) || 20)));
    const cursor = (req) => {
        if (!req.query.cursor) return null;
        const parts = String(req.query.cursor).split(":");
        if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || !Number.isSafeInteger(Number(parts[0])) || !uuid.test(parts[1])) throw agentError("VIDEO_AGENT_INVALID_REQUEST", 400, "Invalid cursor");
        return { at: Number(parts[0]), id: parts[1] };
    };
    const eventAfter = (req) => {
        const after = String(req.query.after ?? "0");
        if (!/^\d{1,19}$/.test(after) || BigInt(after) > 9223372036854775807n) throw agentError("VIDEO_AGENT_EVENT_CURSOR_INVALID", 400, "Invalid event cursor");
        return after;
    };
    route("get", "/capabilities", async (_req, res) => {
        const commandsEnabled=process.env.VIDEO_AGENT_ENABLED==="1";
        const runAcceptanceEnabled=commandsEnabled && process.env.VIDEO_AGENT_RUNS_ENABLED==="1" && admissionEnabled();
        const pipelineReady=await executionReady(),dubbingReady=await executionReady({dubbing:true});
        const config=ttsConfigured()?getTtsConfig():null;
        success(res,{commandsEnabled,runAcceptanceEnabled,executionEnabled:runAcceptanceEnabled && pipelineReady,
            pipelineReady,admissionPolicy:admissionEnabled()?"shared_monthly_seconds":"disabled",operations:["highlight_clips"],
            dubbingEnabled:runAcceptanceEnabled && dubbingReady,
            dubbing:config?{voiceId:config.voiceId,maxRunChars:config.maxRunChars,maxRunAudioMs:config.maxRunAudioMs,
                maxRunMicroUsd:config.maxRunMicroUsd,rateMicroUsdPerMillionChars:config.rateMicroUsdPerMillionChars}:null});
    });
    route("get","/usage",async(_req,res,input)=>success(res,await getExecutionUsage(input)));
    route("post", "/projects/:projectId/commands", async (req, res, input) => {
        const receipt = await db.submitCommand({ ...input, body: req.body });
        success(res, receipt, receipt.status === "accepted" ? 202 : 200);
    });
    route("get", "/projects/:projectId/revisions", async (req, res, input) => {
        const raw = req.query.cursor;
        if (raw !== undefined && (!/^\d+$/.test(String(raw)) || !Number.isSafeInteger(Number(raw)) || Number(raw) > 2147483647)) throw agentError("VIDEO_AGENT_INVALID_REQUEST", 400, "Invalid revision cursor");
        success(res, await db.listRevisions({ ...input, before: raw === undefined ? null : Number(raw), limit: limit(req) }));
    });
    route("get", "/projects/:projectId/plans/:planId", async (_req, res, input) => success(res, await db.getPlan(input)));
    route("get", "/projects/:projectId/plan", async (_req, res, input) => success(res, await db.getCurrentPlan(input)));
    route("get", "/projects/:projectId/runs", async (req, res, input) => success(res, await db.listRuns({ ...input, cursor: cursor(req), limit: limit(req) })));
    route("get", "/projects/:projectId/runs/:runId", async (_req, res, input) => success(res, await db.getRun(input)));
    for (const action of ["cancel", "retry"]) route("post", `/projects/:projectId/runs/:runId/${action}`, async (req, res, input) => {
        if (!req.body || Object.keys(req.body).some((key) => !["expectedRevision", "idempotencyKey"].includes(key))) throw agentError("VIDEO_AGENT_COMMAND_INVALID", 400, "Invalid control command");
        const receipt = await db.submitCommand({ ...input, body: { type: `${action}_run`, expectedRevision: req.body.expectedRevision, idempotencyKey: req.body.idempotencyKey, input: { runId: input.runId } } });
        success(res, receipt, receipt.status === "accepted" ? 202 : 200);
    });
    route("get", "/projects/:projectId/events", async (req, res, input) => {
        success(res, await db.listEvents({ ...input, after: eventAfter(req), limit: limit(req) }));
    });
    route("get", "/projects/:projectId/events/stream", async (req, res, input) => {
        let after = eventAfter(req);
        let batch = await db.listEvents({ ...input, after, limit: 50 }); // Authenticate ownership before sending headers.
        const streamCount = activeStreams.get(input.userId) || 0;
        if (streamCount >= 2) throw agentError("VIDEO_AGENT_STREAM_LIMIT", 429, "Too many active streams");
        activeStreams.set(input.userId, streamCount + 1);
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();
        const controller = new AbortController();
        res.on("close", () => controller.abort());
        const deadline = setTimeout(() => controller.abort(), 25000);
        const endAt = Date.now() + 25000;
        try {
            while (!controller.signal.aborted && Date.now() < endAt) {
                if (batch.resetRequired) { res.write(`event: reset\ndata: ${JSON.stringify(batch)}\n\n`); break; }
                for (const event of batch.events) {
                    if (controller.signal.aborted) break;
                    if (!res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)) {
                        await new Promise((resolve) => { const finish = () => { res.off("drain", finish); controller.signal.removeEventListener("abort", finish); resolve(); }; res.once("drain", finish); controller.signal.addEventListener("abort", finish, { once: true }); });
                    }
                    after = event.id;
                }
                if (!batch.hasMore) {
                    res.write(": heartbeat\n\n");
                    await new Promise((resolve) => { const finish = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", finish); resolve(); }; const timer = setTimeout(finish, 1000); controller.signal.addEventListener("abort", finish, { once: true }); });
                }
                if (controller.signal.aborted) break;
                batch = await db.listEvents({ ...input, after, limit: 50 });
            }
        } catch (error) { if (!controller.signal.aborted) res.write(`event: error\ndata: ${JSON.stringify({ code: error.status < 500 ? error.code : "VIDEO_AGENT_STREAM_FAILED" })}\n\n`); }
        finally { clearTimeout(deadline); const remaining = (activeStreams.get(input.userId) || 1) - 1; if (remaining) activeStreams.set(input.userId, remaining); else activeStreams.delete(input.userId); res.end(); }
    });
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
    route("get","/projects/:projectId/messages",async(req,res,input)=>success(res,await db.listMessages({...input,cursor:cursor(req),limit:limit(req)})));
    route("post","/projects/:projectId/messages",async(req,res,input)=>{
        if(!req.body || Object.keys(req.body).some(key=>!["content","clientMessageId"].includes(key)))throw agentError("VIDEO_AGENT_MESSAGE_INVALID",400,"Invalid conversation message");
        const result=await db.saveUserMessage({...input,content:req.body.content,clientMessageId:req.body.clientMessageId});
        success(res,{message:result.message},result.created?201:200);
    });
    route("post","/projects/:projectId/messages/:messageId/plan",async(req,res,input)=>{
        if(req.body && Object.keys(req.body).length)throw agentError("VIDEO_AGENT_MESSAGE_INVALID",400,"Planner request body must be empty");
        const controller=new AbortController();
        const close=()=>controller.abort(Object.assign(new Error("Client disconnected"),{code:"VIDEO_AGENT_CLIENT_DISCONNECTED"}));
        req.once("aborted",close);
        const authorization=req.header("authorization") || "";
        const clerkToken=/^Bearer ([^\s]+)$/u.exec(authorization)?.[1] || null;
        try{success(res,await db.planMessage({...input,clerkToken,signal:controller.signal}));}finally{req.off("aborted",close);}
    });
    route("get", "/projects/:projectId/runs/:runId/results", async (_req,res,input)=>success(res,await getPublishedResults(input)));
    route("get", "/projects/:projectId/runs/:runId/editable", async (_req,res,input)=>success(res,await getEditableResults(input)));
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
        const formats={rendered_video:["mp4","video/mp4"],dub_audio:["wav","audio/wav"],subtitle_srt:["srt","application/x-subrip"],subtitle_vtt:["vtt","text/vtt"],subtitle_ass:["ass","text/plain; charset=utf-8"]};
        if(asset.kind!=="source"){
            if(!formats[asset.kind])throw agentError("VIDEO_AGENT_ASSET_UNAVAILABLE",404,"Asset unavailable");
            const [extension,mime]=formats[asset.kind];asset.mime=mime;asset.filename=`video-agent-${asset.id}.${extension}`;
            const published=await transaction(async client=>{
                const rows=(await client.query(`SELECT s.checkpoint FROM video_agent_steps s JOIN video_agent_runs r ON r.id=s.run_id WHERE r.project_id=$1 AND r.status IN ('completed','partially_completed') AND s.stage='publish_results' AND s.status='succeeded'`,[input.projectId])).rows;
                return rows.some(row=>row.checkpoint.results?.some(clip=>clip.video.id===asset.id || clip.dubAudio?.id===asset.id || Object.values(clip.subtitles).some(item=>item.id===asset.id)));
            });
            if(!published)throw agentError("VIDEO_AGENT_ASSET_UNAVAILABLE",404,"Asset not published");
        }
        const head=await storage.headObject(asset.object_key);
        if(head.generation!==asset.generation || head.sizeBytes!==Number(asset.size_bytes))throw agentError("VIDEO_AGENT_ASSET_UNAVAILABLE",404,"Asset changed");
        const preview = req.query.preview === "1" && ["rendered_video", "dub_audio", "subtitle_vtt"].includes(asset.kind);
        const disposition = contentDisposition(asset.filename, preview ? { type: "inline" } : undefined);
        const proxyPreview=req.query.proxy === "1" && preview;
        if (!proxyPreview && (process.env.AI_VIDEO_STORAGE_PROVIDER === "gcs" || (!process.env.AI_VIDEO_STORAGE_PROVIDER && process.env.NODE_ENV === "production"))) {
            const url = await storage.createDownloadUrl(asset.object_key, 10 * 60 * 1000, { responseDisposition: disposition, responseType: asset.mime });
            return req.query.url === "1" ? success(res, { url, expiresAt: Date.now() + 10 * 60 * 1000 }) : res.redirect(302, url);
        }
        if (req.query.url === "1" && !proxyPreview) return success(res, { url: null });
        res.setHeader("Content-Type", asset.mime);
        res.setHeader("Content-Disposition", disposition);
        const stream = storage.openReadStream(asset.object_key);
        stream.on("error", () => { if (!res.headersSent) fail(res, agentError("VIDEO_AGENT_STORAGE_ERROR", 502, "Storage error")); else res.destroy(); });
        stream.pipe(res);
    });
    return router;
};

export default createVideoAgentRouter();
