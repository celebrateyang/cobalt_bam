import express from "express";
import rateLimit from "express-rate-limit";
import { clerkClient, verifyToken } from "@clerk/express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { services } from "../processing/service-config.js";
import * as store from "../db/personal-agent.js";
import { agentError, grantSchema, resolveSchema, queueIdentity, productSchema, checkoutSchema, checkoutStatusSchema } from "../personal-agent/policy.js";
import { createCheckoutService } from "../personal-agent/checkout.js";

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
    version: 2, name: "FreeSaveVideo personal agent API",
    authentication: { type: "user_created_bearer_token", prefix: "fsv_agent_", maximumLifetimeDays: 30 },
    managementPath: "/en/account/agents", restBasePath: "/agent/v1", mcpPath: "/agent/mcp",
    operations: ["get_capabilities", "get_balance", "resolve_media", "list_payment_products", "create_checkout", "get_checkout"],
    services: Object.keys(services),
    pricing: { pointsPerStartedMinute: 2, unknownDurationPoints: 2,
        chargedWhen: "Media resolution succeeds. Saving the file is performed by the caller.",
        membership: "Existing download pass limits apply, only with explicit grant permission.",
        creditProductsPath: "/payments/credits/products", membershipProductsPath: "/payments/memberships/products" },
    limits: { maximumDailyCallsPerGrant: 100, callsPerMinutePerUser: 10, concurrentCallsPerUser: 2, dailyResetTimezone: "UTC" },
    delivery: { statuses: ["redirect", "tunnel", "picker", "local-processing"],
        directBridge: ["tiktok", "deeplearningai"], urlsMayExpire: true,
        cors: "Direct fetch, then browser extension, then user browser handoff. No automatic proxy fallback." },
    payments: { automaticRecharge: false, userConfirmationRequired: true, checkoutSupported:true,
        productsPath:"/agent/v1/products", createPath:"/agent/v1/checkouts", statusPath:"/agent/v1/checkouts/{checkoutId}",
        scopes:["payments:create","payments:read"], currencies:["CNY","USD"], amountUnit:"minor currency unit (CNY fen / USD cents)",
        dailyBudget:"Sum of newly created checkout amounts per grant since 00:00 UTC, including expired and failed orders. Not an automatic debit budget.",
        continuation:"Wait until readyToContinue is true. Read balance, then resume the original task with existing download permissions. Never claim a payment succeeded based on a browser redirect." },
};
export const agentOpenApi = {
    openapi: "3.1.0", info: { title: "FreeSaveVideo personal agent API", version: "2.0.0" },
    servers: [{ url: "https://api.freesavevideo.online" }],
    components: { securitySchemes: { agentToken: { type: "http", scheme: "bearer", bearerFormat: "fsv_agent_" } } },
    paths: {
        "/agent/v1/products": {get:{operationId:"list_payment_products",description:"Public catalog. Amounts use minor currency units: fen or cents.",
            parameters:[{name:"kind",in:"query",required:true,schema:{type:"string",enum:["credits","memberships"]}},
                {name:"provider",in:"query",schema:{type:"string",enum:["wechat","nowpayments","buymeacoffee"],default:"wechat"}}],
            responses:{"200":{description:"Products with enabled flags, currency, amountFen and benefits"},"400":{description:"Invalid kind/provider"}}}},
        "/agent/v1/checkouts": {post:{operationId:"create_checkout",security:[{agentToken:[]}],
            description:"Requires payments:create. Create an unpaid order within grant currency and amount limits. Present confirmationUrl to the user. Only the user can confirm and pay. Reuse the same idempotencyKey on retries; deduplication has no one-hour cutoff.",
            requestBody:{required:true,content:{"application/json":{schema:{type:"object",additionalProperties:false,
                required:["kind","productKey","idempotencyKey"],properties:{kind:{type:"string",enum:["credits","memberships"]},
                    provider:{type:"string",enum:["wechat","nowpayments","buymeacoffee"],default:"wechat"},
                    productKey:{type:"string",minLength:1,maxLength:80},idempotencyKey:{type:"string",pattern:"^[a-zA-Z0-9_-]{8,80}$"}}}}}},
            responses:{"200":{description:"Checkout ID, product/amount, confirmationUrl, status and readyToContinue:false"},
                "400":{description:"Invalid input or unavailable product"},"401":{description:"Invalid credential"},
                "403":{description:"Purchase scope, currency, per-order or daily order ceiling denied"},"409":{description:"Key already used with different input"},"429":{description:"Call limit reached"}}}},
        "/agent/v1/checkouts/{checkoutId}": {get:{operationId:"get_checkout",security:[{agentToken:[]}],
            description:"Requires payments:read. Only checkouts created by this credential are visible. Poll no more than once per 15 seconds. Resume only if readyToContinue:true; payment does not expand existing download permissions.",
            parameters:[{name:"checkoutId",in:"path",required:true,schema:{type:"string",format:"uuid"}}],
            responses:{"200":{description:"Verified order status, paidAt and readyToContinue; no user profile or provider notifications"},
                "401":{description:"Invalid credential"},"403":{description:"Scope denied"},"404":{description:"Checkout not found for this credential"},"429":{description:"Call limit reached"},"502":{description:"Order reconciliation unavailable"}}}},
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

export const createPersonalAgentRouter = ({ resolveMedia, authenticate = authenticateOwner, db = store, payments } = {}) => {
    const router = express.Router();
    const checkout = createCheckoutService({db,payments});
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
    route("get", "/v1/products", async (req,res) => {
        const input = productSchema.safeParse(req.query);
        if (!input.success) throw agentError("AGENT_INVALID_REQUEST");
        res.json({status:"success",data:{...input.data,products:await checkout.products(input.data)}});
    });
    // The confirmation page uses a real Clerk owner session, never an agent token.
    route("get", "/checkouts/:id", async (req,res) => {
        if (!checkoutStatusSchema.safeParse({checkoutId:req.params.id}).success) throw agentError("AGENT_INVALID_REQUEST");
        const user = await owner(req);
        res.json({status:"success",data:await checkout.status(await checkout.find(req.params.id,user.id),user,true)});
    });
    route("post", "/checkouts/:id/confirm", async (req,res) => {
        if (!checkoutStatusSchema.safeParse({checkoutId:req.params.id}).success || req.body?.confirmed!==true
            || Object.keys(req.body).some(key => key!=="confirmed")) throw agentError("AGENT_CONFIRMATION_REQUIRED");
        const user = await owner(req);
        res.json({status:"success",data:await checkout.confirm(await checkout.find(req.params.id,user.id),user)});
    });
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
            const scope = {get_balance:"balance:read",resolve_media:"media:resolve",create_checkout:"payments:create",get_checkout:"payments:read"}[operation];
            if (!grant.scopes.includes(scope)) throw agentError("AGENT_SCOPE_DENIED",403);
            if (operation === "get_balance") {
                result = { status: 200, body: { status: "success", data: { points: Number(grant.points),
                    maxPointsPerCall: grant.max_points_per_call, allowMembership: grant.allow_membership,
                    dailyCalls: grant.daily_calls, expiresAt: Number(grant.expires_at),
                    purchaseCurrency:grant.purchase_currency,maxPurchaseAmount:grant.max_purchase_amount,dailyPurchaseAmount:grant.daily_purchase_amount } } };
            } else if (operation === "create_checkout" || operation === "get_checkout") {
                const parsed = (operation==="create_checkout" ? checkoutSchema : checkoutStatusSchema).safeParse(input);
                if (!parsed.success) throw agentError("AGENT_INVALID_REQUEST");
                const data = operation==="create_checkout" ? await checkout.create(grant,parsed.data)
                    : await checkout.status(await checkout.find(parsed.data.checkoutId,grant.user_id,grant.id),
                        {id:grant.user_id,clerk_user_id:grant.clerk_user_id});
                result = {status:200,body:{status:"success",data}};
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
    route("post", "/v1/checkouts", async (req,res) => {
        const result = await execute(req,await grantFor(req),"create_checkout",req.body);
        res.status(result.status).json(result.body);
    });
    route("get", "/v1/checkouts/:id", async (req,res) => {
        const result = await execute(req,await grantFor(req),"get_checkout",{checkoutId:req.params.id});
        res.status(result.status).json(result.body);
    });
    route("post", "/mcp", async (req, res) => {
        const grant = await grantFor(req);
        const server = new McpServer({ name: "freesavevideo", version: "2.0.0" });
        const toolResult = result => ({ content: [{ type: "text", text: JSON.stringify(result.body) }], isError: result.status >= 400 || result.body?.status === "error" });
        server.registerTool("get_capabilities", { description: "Read supported services, prices and download delivery requirements", annotations: { readOnlyHint: true } }, async () => ({ content: [{ type: "text", text: JSON.stringify(agentCapabilities) }] }));
        server.registerTool("list_payment_products", {description:"List available points and membership products. Amounts are in currency minor units; no order or payment is created.",inputSchema:productSchema.shape,annotations:{readOnlyHint:true}},
            async input => toolResult({status:200,body:{status:"success",data:{...input,products:await checkout.products(input)}}}));
        if (grant.scopes.includes("payments:create")) server.registerTool("create_checkout", {
            description:"Create an unpaid order awaiting user confirmation. Present confirmationUrl and amount to the user. Reuse idempotencyKey on retry. This never pays or renews automatically.",
            inputSchema:checkoutSchema.shape,annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:true}},
            async input => toolResult(await execute(req,grant,"create_checkout",input)));
        if (grant.scopes.includes("payments:read")) server.registerTool("get_checkout", {
            description:"Query this credential's own checkout. Continue the original task only when readyToContinue is true. Payment does not expand download permissions. Poll at most once every 15 seconds.",
            inputSchema:checkoutStatusSchema.shape,annotations:{readOnlyHint:true}},async input => toolResult(await execute(req,grant,"get_checkout",input)));
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
