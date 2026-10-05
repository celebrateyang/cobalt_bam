import express from "express";
import rateLimit from "express-rate-limit";
import { clerkClient, verifyToken } from "@clerk/express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { services } from "../processing/service-config.js";
import * as store from "../db/personal-agent.js";
import { agentError, grantSchema, resolveSchema, queueIdentity } from "../personal-agent/policy.js";

const errorResponse = error => ({ status: error.status || 500, body: { status: "error", error: {
    code: error.code || "AGENT_UNAVAILABLE", ...(error.context ? { context: error.context } : {}),
} } });
const bearer = req => /^Bearer ([^\s]+)$/i.exec(req.header("Authorization") || "")?.[1];
const authenticateOwner = async req => {
    const token = bearer(req);
    if (!token || token.startsWith("fsv_agent_")) throw agentError("UNAUTHORIZED",401);
    let payload;
    try { payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY }); }
    catch { throw agentError("UNAUTHORIZED",401); }
    if (!payload.sub || !payload.sid) throw agentError("UNAUTHORIZED",401);
    const { getUserByClerkId, upsertUserFromClerk } = await import("../db/users.js");
    let user = await getUserByClerkId(payload.sub);
    if (!user) {
        const profile = await clerkClient.users.getUser(payload.sub);
        user = await upsertUserFromClerk({ clerkUserId: profile.id,
            primaryEmail: profile.emailAddresses?.find(email => email.id === profile.primaryEmailAddressId)?.emailAddress || null,
            fullName: profile.username || null, avatarUrl: profile.imageUrl || null });
    }
    if (user.is_disabled) throw agentError("ACCOUNT_DISABLED",403);
    return user;
};
export const agentCapabilities = {
    version: 1, name: "FreeSaveVideo personal agent API",
    authentication: { type: "user_created_bearer_token", prefix: "fsv_agent_", maximumLifetimeDays: 30 },
    managementPath: "/en/account/agents", restBasePath: "/agent/v1", mcpPath: "/agent/mcp",
    operations: ["get_capabilities", "get_balance", "resolve_media"],
    services: Object.keys(services),
    pricing: { pointsPerStartedMinute: 2, unknownDurationPoints: 2,
        chargedWhen: "Media resolution succeeds. Saving the file is performed by the caller.",
        membership: "Existing download pass limits apply, only with explicit grant permission.",
        creditProductsPath: "/payments/credits/products", membershipProductsPath: "/payments/memberships/products" },
    limits: { maximumDailyCallsPerGrant: 100, callsPerMinutePerUser: 10, concurrentCallsPerUser: 2, dailyResetTimezone: "UTC" },
    delivery: { statuses: ["redirect", "tunnel", "picker", "local-processing"],
        directBridge: ["tiktok", "deeplearningai"], urlsMayExpire: true,
        cors: "Direct fetch, then browser extension, then user browser handoff. No automatic proxy fallback." },
    payments: { automaticRecharge: false, userConfirmationRequired: true },
};
export const agentOpenApi = {
    openapi: "3.1.0", info: { title: "FreeSaveVideo personal agent API", version: "1.0.0" },
    servers: [{ url: "https://api.freesavevideo.online" }],
    components: { securitySchemes: { agentToken: { type: "http", scheme: "bearer", bearerFormat: "fsv_agent_" } } },
    paths: {
        "/agent/v1/capabilities": { get: { operationId: "get_capabilities", responses: { "200": { description: "Services, pricing rules, permission and delivery guidance" } } } },
        "/agent/v1/balance": { get: { operationId: "get_balance", security: [{ agentToken: [] }], responses: { "200": { description: "Points balance and this grant's limits" }, "401": { description: "Invalid, expired or revoked token" }, "403": { description: "Scope denied" }, "429": { description: "Call limit reached" } } } },
        "/agent/v1/resolve": { post: { operationId: "resolve_media", security: [{ agentToken: [] }],
            description: "Resolve one media link. Successful resolution consumes points or an authorized membership download. Use the same idempotencyKey when retrying; inspect status before attempting a save.",
            requestBody: { required: true, content: { "application/json": { schema: { type: "object", additionalProperties: false,
                required: ["url", "idempotencyKey"], properties: {
                    url: { type: "string", format: "uri", maxLength: 4096 },
                    idempotencyKey: { type: "string", pattern: "^[a-zA-Z0-9_-]{8,80}$" },
                    downloadMode: { type: "string", enum: ["auto", "audio", "mute"], default: "auto" },
                    videoQuality: { type: "string", enum: ["1080", "720", "480", "360", "240", "144"], default: "720" },
                } } } } },
            responses: { "200": { description: "Existing downloader result plus points outcome; links may expire" }, "400": { description: "Invalid link or options" }, "401": { description: "Invalid token" }, "403": { description: "Scope, membership permission or points limit denied" }, "429": { description: "Call limit reached" } },
        } },
    },
};

export const createPersonalAgentRouter = ({ resolveMedia, authenticate = authenticateOwner, db = store } = {}) => {
    const router = express.Router();
    router.use((_, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
    // An IP ceiling also bounds invalid credentials and MCP protocol traffic.
    router.use(rateLimit({ windowMs: 60000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false }));
    const route = (method, path, action) => router[method](path, async (req, res) => {
        try { await action(req, res); }
        catch (error) {
            const result = errorResponse(error);
            if (!error.status) console.error(`[PERSONAL AGENT] request_failed code=${result.body.error.code}`);
            res.status(result.status).json(result.body);
        }
    });
    const owner = async req => authenticate(req);
    route("get", "/v1/capabilities", async (_, res) => res.json(agentCapabilities));
    route("get", "/openapi.json", async (_, res) => res.json(agentOpenApi));
    route("get", "/grants", async (req, res) => res.json({ status: "success", data: await db.listGrants((await owner(req)).id) }));
    route("post", "/grants", async (req, res) => {
        const user = await owner(req);
        const parsed = grantSchema.safeParse(req.body);
        if (!parsed.success) throw agentError("AGENT_INVALID_GRANT");
        res.status(201).json({ status: "success", data: await db.createGrant(user.id,parsed.data) });
    });
    route("delete", "/grants/:id", async (req, res) => {
        const user = await owner(req);
        if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw agentError("AGENT_INVALID_GRANT");
        if (!await db.revokeGrant(user.id,req.params.id)) throw agentError("NOT_FOUND",404);
        res.json({ status: "success" });
    });
    route("get", "/calls", async (req, res) => res.json({ status: "success", data: await db.listCalls((await owner(req)).id) }));
    const grantFor = async req => {
        const token = bearer(req);
        if (!token || !/^fsv_agent_[a-zA-Z0-9_-]{43}$/.test(token)) throw agentError("AGENT_UNAUTHORIZED",401);
        const grant = await db.findGrant(token);
        if (!grant) throw agentError("AGENT_UNAUTHORIZED",401);
        if (grant.is_disabled) throw agentError("ACCOUNT_DISABLED",403);
        return grant;
    };
    const execute = async (req, grant, operation, input) => {
        let sourceHost;
        if (operation === "resolve_media") {
            try { sourceHost = new URL(input?.url).hostname; } catch { /* Invalid input is audited below. */ }
        }
        const callId = await db.startCall(grant,operation,sourceHost);
        let result;
        try {
            if (operation === "resolve_media") {
                const parsed = resolveSchema.safeParse(input);
                if (!parsed.success) throw agentError("AGENT_INVALID_REQUEST");
                input = parsed.data;
            }
            const scope = operation === "get_balance" ? "balance:read" : "media:resolve";
            if (!grant.scopes.includes(scope)) throw agentError("AGENT_SCOPE_DENIED",403);
            if (operation === "get_balance") {
                result = { status: 200, body: { status: "success", data: { points: Number(grant.points),
                    maxPointsPerCall: grant.max_points_per_call, allowMembership: grant.allow_membership,
                    dailyCalls: grant.daily_calls, expiresAt: Number(grant.expires_at) } } };
            } else {
                req.personalAgent = { grant, isActive: () => db.isGrantActive(grant.id) };
                req.authType = "personal_agent";
                req.rateLimitKey = `personal_agent_user_${grant.user_id}`;
                req.body = { url: input.url, downloadMode: input.downloadMode, videoQuality: input.videoQuality,
                    queueId: queueIdentity(grant.id,input.idempotencyKey), batch: false, localProcessing: "disabled" };
                result = await resolveMedia(req);
            }
        } catch (error) { result = errorResponse(error); }
        // Audit must be persisted before releasing the result; it contains no URLs or bearer credentials.
        await db.finishCall(callId,result);
        return result;
    };
    route("get", "/v1/balance", async (req, res) => {
        const result = await execute(req, await grantFor(req), "get_balance");
        res.status(result.status).json(result.body);
    });
    route("post", "/v1/resolve", async (req, res) => {
        const result = await execute(req, await grantFor(req), "resolve_media", req.body);
        res.status(result.status).json(result.body);
    });
    route("post", "/mcp", async (req, res) => {
        const grant = await grantFor(req);
        const server = new McpServer({ name: "freesavevideo", version: "1.0.0" });
        const toolResult = result => ({ content: [{ type: "text", text: JSON.stringify(result.body) }], isError: result.status >= 400 || result.body?.status === "error" });
        server.registerTool("get_capabilities", { description: "Read supported services, prices and download delivery requirements", annotations: { readOnlyHint: true } }, async () => ({ content: [{ type: "text", text: JSON.stringify(agentCapabilities) }] }));
        if (grant.scopes.includes("balance:read")) server.registerTool("get_balance", { description: "Read the user's points balance and grant limits", annotations: { readOnlyHint: true } }, async () => toolResult(await execute(req,grant,"get_balance")));
        if (grant.scopes.includes("media:resolve")) server.registerTool("resolve_media", {
            description: "Resolve one public media URL. Successful resolution consumes points up to the grant's limit, or an authorized membership download. Reuse idempotencyKey on retry. The caller saves the file; URLs may expire. Inspect picker/local-processing results and use browser handoff when needed.",
            inputSchema: resolveSchema.shape, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
        }, async input => toolResult(await execute(req,grant,"resolve_media",input)));
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        res.on("close", () => { void transport.close(); void server.close(); });
        await server.connect(transport);
        await transport.handleRequest(req,res,req.body);
    });
    route("get", "/mcp", async (_, res) => res.status(405).set("Allow", "POST").json({ error: "Stateless MCP: use POST" }));
    route("delete", "/mcp", async (_, res) => res.status(405).set("Allow", "POST").json({ error: "Stateless MCP: use POST" }));
    return router;
};
