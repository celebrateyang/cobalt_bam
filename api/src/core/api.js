import cors from "cors";
import http from "node:http";
import { randomUUID } from "node:crypto";
import rateLimit from "express-rate-limit";
import { setGlobalDispatcher, EnvHttpProxyAgent, request as undiciRequest } from "undici";
import { getCommit, getBranch, getRemote, getVersion } from "@imput/version-info";

import jwt from "../security/jwt.js";
import stream from "../stream/stream.js";
import match from "../processing/match.js";
import matchAction from "../processing/match-action.js";

import { env } from "../config.js";
import { extract } from "../processing/url.js";
import { Bright, Cyan } from "../misc/console-text.js";
import { hashHmac } from "../security/secrets.js";
import { createStore } from "../store/redis-ratelimit.js";
import Store from "../store/store.js";
import { randomizeCiphers } from "../misc/randomize-ciphers.js";
import { verifyTurnstileToken } from "../security/turnstile.js";
import { friendlyServiceName } from "../processing/service-alias.js";
import { createStream, verifyStream } from "../stream/manage.js";
import { createResponse, normalizeRequest, getIP } from "../processing/request.js";
import { getHeaders } from "../stream/shared.js";
import { expandURL } from "../processing/expand.js";
import extractGeneric, {
    canAttemptGenericURL,
    getGenericServiceHost,
} from "../processing/generic/index.js";
import { requestUpstream } from "../processing/upstream/request.js";
import { setupTunnelHandler } from "./itunnel.js";
import { setupSignalingServer } from "./signaling.js";
import { tunnelDebugLog } from "../stream/debug-log.js";
import {
    getUpstreamHealthSnapshot,
    startUpstreamHealthChecks,
} from "../processing/upstream/pool.js";
import { requireAuth as requireAdminAuth } from "../middleware/admin-auth.js";

import * as APIKeys from "../security/api-keys.js";
import * as Cookies from "../processing/cookie/manager.js";
import * as YouTubeSession from "../processing/helpers/youtube-session.js";
import { verifyToken } from "@clerk/express";
import {
    consumeUserPoints,
    claimDownloadRequest,
    completeDownloadRequest,
    createPointsHold,
    completeMemberDownloadUsage,
    failDownloadRequest,
    FIRST_DOWNLOAD_GRACE_MAX_POINTS,
    getUserByClerkId,
    reserveMemberDownloadUsage,
    upsertUserFromClerk,
} from "../db/users.js";
import {
    completeDownloadAttempt,
    createDownloadAttempt,
    DOWNLOAD_ATTEMPT_STATUS,
} from "../db/download-attempts.js";

// 社交媒体路由
import socialMediaRouter from "../routes/social-media.js";
import { initDatabase } from "../db/social-media.js";
import userRouter from "../routes/user.js";
import platformRequestsRouter from "../routes/platform-requests.js";
import aiVideoRouter from "../routes/ai-video.js";
import { createMediaImportToken, getMediaImportCandidate } from "../ai-video/media-import-token.js";
import paymentsRouter from "../routes/payments.js";
// import { initSocialMedia } from "../setup-social.js"; // init 程序已禁用

const git = {
    branch: await getBranch(),
    commit: await getCommit(),
    remote: await getRemote(),
}

const version = await getVersion();

const acceptRegex = /^application\/json(; charset=utf-8)?$/;

const corsConfig = env.corsWildcard ? {} : {
    origin: env.corsURL,
    optionsSuccessStatus: 200
}

const fail = (res, code, context) => {
    const { status, body } = createResponse("error", { code, context });
    res.status(status).json(body);
}

const sanitizeLogHeaderValue = (value, maxLength) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.length > maxLength) return null;
    return trimmed;
};

const resolveDownloadLogEmail = ({ req, pointsUser, fallbackEmail } = {}) => {
    const headerEmail = sanitizeLogHeaderValue(req?.header("X-Clerk-Email"), 256);
    if (headerEmail) return headerEmail;

    const storedEmail = sanitizeLogHeaderValue(pointsUser?.primary_email, 256);
    if (storedEmail) return storedEmail;

    const fallback = sanitizeLogHeaderValue(fallbackEmail, 256);
    if (fallback) return fallback;

    return "unknown";
};

const readableDownloadErrors = new Map([
    ["error.api.auth.clerk.missing", "User authentication is required for this download."],
    ["error.api.auth.clerk.invalid", "User authentication is invalid or expired."],
    ["error.api.fetch.empty", "No downloadable media was found at this URL."],
    ["error.api.fetch.fail", "The target site could not be fetched or returned an unusable response."],
    ["error.api.generic", "The download request failed because of an unexpected server error."],
    ["error.api.invalid_body", "The submitted request body is invalid."],
    ["error.api.link.invalid", "The submitted URL is invalid or unsupported."],
    ["error.api.link.missing", "No URL was submitted."],
    ["error.api.link.unsupported", "This URL is not supported yet."],
    ["error.api.platform.unsupported", "This video platform is not supported yet."],
    ["error.api.douyin.user.unsupported", "Douyin profile pages are not supported. Ask the user to copy and submit the URL of a specific Douyin video."],
    ["error.api.bilibili.space.unsupported", "Bilibili space collection index pages are not supported. Ask the user to open one video inside the collection and submit that video URL."],
    ["error.api.youtube.login", "YouTube could not be processed because the upstream node may need refreshed YouTube cookies or account tokens. Ask the user to try again later."],
    ["error.api.youtube.link.unsupported", "YouTube channel pages are not supported. Ask the user to submit a specific video URL or playlist URL."],
    ["error.api.member.limit.exceeded", "The membership download limit has been reached."],
    ["error.api.membership.limit.exceeded", "The membership download limit has been reached."],
    ["error.api.points.insufficient", "The user does not have enough points for this download."],
    ["error.api.points.unavailable", "Points service is temporarily unavailable."],
    ["error.api.rate_exceeded", "The same download was submitted too frequently."],
    ["error.api.upstream.circuit_open", "The upstream processing node is in circuit cooldown after recent failures. Ask the user to retry in about 1 minute."],
    ["error.api.upstream.timeout", "The upstream processing node did not respond in time. This may be a temporary tunnel or processing delay. Ask the user to retry shortly."],
    ["error.api.upstream.network", "The upstream processing node could not be reached reliably. Ask the user to retry shortly."],
    ["error.api.upstream.incomplete", "The upstream processing node returned an incomplete response. Ask the user to retry shortly."],
    ["error.api.upstream.unavailable", "No upstream processing node is currently available. Ask the user to retry later."],
    ["error.api.youtube.timeout", "YouTube extraction itself exceeded its processing limit. Ask the user to retry later."],
    ["error.api.user.disabled", "This user account is disabled."],
]);

const getReadableDownloadError = (code, fallback = "The download request failed.") => {
    if (!code) return fallback;
    return readableDownloadErrors.get(code) || fallback;
};

const getUrlHost = (url) => {
    try {
        return new URL(url).host || null;
    } catch {
        return null;
    }
};

const toNullableInteger = (value) => {
    if (value == null) return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
};

const auditDropped = Symbol("download-attempt-audit-dropped");
const maxDownloadAttemptAuditQueue = 500;
const downloadAttemptAuditQueue = [];
let downloadAttemptAuditActive = false;

const runNextDownloadAttemptAuditTask = () => {
    if (downloadAttemptAuditActive) return;
    const next = downloadAttemptAuditQueue.shift();
    if (!next) return;

    downloadAttemptAuditActive = true;
    next.task()
        .then(next.resolve, next.reject)
        .finally(() => {
            downloadAttemptAuditActive = false;
            runNextDownloadAttemptAuditTask();
        });
};

const queueDownloadAttemptAuditTask = (task, label) => {
    if (downloadAttemptAuditQueue.length >= maxDownloadAttemptAuditQueue) {
        console.warn(`[download-attempts] ${label} dropped: audit queue full`);
        return Promise.resolve(auditDropped);
    }

    return new Promise((resolve, reject) => {
        downloadAttemptAuditQueue.push({ task, resolve, reject });
        runNextDownloadAttemptAuditTask();
    });
};

const scheduleDownloadAttemptCreate = (payload) => {
    if (isUpstreamServer) {
        return Promise.resolve(null);
    }

    return queueDownloadAttemptAuditTask(
        () => createDownloadAttempt(payload),
        "create",
    ).catch((error) => {
        console.error("[download-attempts] create failed:", error);
        return null;
    });
};

const scheduleDownloadAttemptComplete = (createTask, payload) => {
    if (isUpstreamServer) {
        return Promise.resolve(null);
    }

    const afterCreate =
        createTask && typeof createTask.then === "function"
            ? createTask
            : Promise.resolve();

    return afterCreate
        .then((createResult) => {
            if (createResult === auditDropped) return null;
            return queueDownloadAttemptAuditTask(
                () => completeDownloadAttempt(payload),
                "complete",
            );
        })
        .catch((error) => {
            console.error("[download-attempts] complete failed:", error);
            return null;
        });
};

const logDownloadRequest = ({ email, url, requestId, time }) => {
    const normalizedUrl =
        typeof url === "string" ? url.trim().slice(0, 8192) : "";
    if (!normalizedUrl) return;

    const normalizedEmail = sanitizeLogHeaderValue(email, 256) ?? "unknown";
    console.log(
        `[DOWNLOAD REQUEST] request_id=${requestId ?? "n/a"} time=${time ?? new Date().toISOString()} email=${normalizedEmail} url=${normalizedUrl}`,
    );
};

const isUpstreamServer = (() => {
    const raw = String(process.env.IS_UPSTREAM_SERVER || "").toLowerCase().trim();
    return raw === "true" || raw === "1";
})();
const serverRole = isUpstreamServer ? "upstream" : "api";
const genericFallbackErrors = new Set(["platform.unsupported"]);

const isClerkAuthConfigured =
    !!process.env.CLERK_SECRET_KEY && !!process.env.CLERK_PUBLISHABLE_KEY;

const downloadDedupe = new Store("download_dedupe");

const durationToPoints = (durationSeconds) => {
    if (
        typeof durationSeconds !== "number" ||
        !Number.isFinite(durationSeconds) ||
        durationSeconds <= 0
    ) {
        return 2;
    }

    const basePoints = Math.ceil(durationSeconds / 60);
    return basePoints * 2;
};

const getClerkUserIdFromTokenHeader = async (req) => {
    const token = sanitizeLogHeaderValue(req.header("X-Clerk-Token"), 8192);
    if (!token) {
        return { ok: false, reason: "missing" };
    }

    try {
        const payload = await verifyToken(token, {
            secretKey: process.env.CLERK_SECRET_KEY,
        });

        const clerkUserId = typeof payload?.sub === "string" ? payload.sub : null;
        if (!clerkUserId) {
            return { ok: false, reason: "invalid" };
        }

        return { ok: true, clerkUserId };
    } catch {
        return { ok: false, reason: "invalid" };
    }
};

const resolveDedupeIdentity = (req, clerkUserId) => {
    if (clerkUserId) {
        return `clerk:${clerkUserId}`;
    }

    if (req.authType === "key") {
        const authHeader = sanitizeLogHeaderValue(req.header("Authorization"), 256);
        if (authHeader) return `key:${authHeader}`;
    }

    if (req.rateLimitKey) {
        const rateKey =
            Buffer.isBuffer(req.rateLimitKey)
                ? req.rateLimitKey.toString("base64url")
                : String(req.rateLimitKey);
        return `session:${rateKey}`;
    }

    return `ip:${getIP(req)}`;
};

const normalizeUpstreamTunnelUrl = (value, upstreamOrigin) => {
    if (typeof value !== "string") return value;

    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        return value;
    }

    if (parsed.pathname !== "/tunnel") {
        return value;
    }

    return new URL(
        parsed.pathname + parsed.search + parsed.hash,
        upstreamOrigin,
    ).toString();
};

const isHlsContentType = (value) => {
    const contentType = String(value || "").toLowerCase();
    return contentType.includes("mpegurl") || contentType.includes("vnd.apple.mpegurl");
};

const probeUpstreamTunnelIsHls = async (url) => {
    try {
        const { body, headers } = await undiciRequest(url, {
            method: "GET",
            headers: {
                Range: "bytes=0-0",
            },
            maxRedirections: 4,
            headersTimeout: 8_000,
            bodyTimeout: 8_000,
        });

        try { body.destroy?.(); } catch {}
        return isHlsContentType(headers?.["content-type"]);
    } catch {
        return false;
    }
};

const wrapUpstreamTunnelUrl = async (value, upstreamOrigin, {
    filename,
    service,
    type,
    isHLS,
} = {}) => {
    const normalizedUrl = normalizeUpstreamTunnelUrl(value, upstreamOrigin);
    if (typeof normalizedUrl !== "string") return normalizedUrl;

    let parsed;
    try {
        parsed = new URL(normalizedUrl);
    } catch {
        return normalizedUrl;
    }

    if (parsed.pathname !== "/tunnel") {
        return normalizedUrl;
    }

    const shouldRemuxHlsProxy =
        isHLS === true &&
        (!type || type === "proxy");
    const shouldProbeLegacyHls =
        isHLS !== true &&
        !type &&
        typeof filename === "string" &&
        /\.(mp4|mkv|mov)(?:$|[?#])/i.test(filename);
    const isLegacyHlsProxy =
        shouldProbeLegacyHls &&
        await probeUpstreamTunnelIsHls(normalizedUrl);
    const shouldRemux =
        shouldRemuxHlsProxy ||
        isLegacyHlsProxy;

    return createStream({
        type: shouldRemux ? "remux" : "proxy",
        url: normalizedUrl,
        service: service || "generic-upstream",
        filename: typeof filename === "string" && filename.trim()
            ? filename
            : "download.bin",
        isHLS: shouldRemux,
    });
};

const normalizeUpstreamBody = async (body, upstreamOrigin) => {
    if (!body || typeof body !== "object") return body;

    if (body.status === "tunnel" || body.status === "redirect") {
        return {
            ...body,
            url: await wrapUpstreamTunnelUrl(body.url, upstreamOrigin, {
                filename: body.filename,
                service: body.service,
                type: body.type,
                isHLS: body.isHLS,
            }),
        };
    }

    if (body.status === "local-processing" && Array.isArray(body.tunnel)) {
        return {
            ...body,
            tunnel: await Promise.all(
                body.tunnel.map((item) => wrapUpstreamTunnelUrl(item, upstreamOrigin, {
                    filename: body.output?.filename || body.filename,
                    service: body.service,
                }))
            ),
            fallback: body.fallback?.url
                ? {
                    ...body.fallback,
                    url: await wrapUpstreamTunnelUrl(body.fallback.url, upstreamOrigin, {
                        filename: body.fallback.filename || body.output?.filename || body.filename,
                        service: body.service,
                    }),
                }
                : body.fallback,
        };
    }

    if (body.status === "picker") {
        return {
            ...body,
            audio: typeof body.audio === "string"
                ? await wrapUpstreamTunnelUrl(body.audio, upstreamOrigin, {
                    filename: body.filename,
                    service: body.service,
                })
                : body.audio,
            picker: Array.isArray(body.picker)
                ? await Promise.all(body.picker.map(async (item) => {
                    if (!item || typeof item !== "object") return item;
                    return {
                        ...item,
                        url: await wrapUpstreamTunnelUrl(item.url, upstreamOrigin, {
                            filename: item.filename || body.filename,
                            service: item.service || body.service,
                        }),
                    };
                }))
                : body.picker,
        };
    }

    return body;
};

const requestGenericUpstream = async ({ payload, requestClientIp }) => {
    if (!env.genericUseUpstream || isUpstreamServer) {
        return null;
    }

    const upstream = await requestUpstream({
        payload,
        requestClientIp,
        service: "generic",
        timeoutMs: Math.max(env.upstreamTimeoutMs, env.genericYtDlpTimeoutMs),
    });

    if (!upstream?.body) return null;

    return {
        status: upstream.status,
        body: await normalizeUpstreamBody(upstream.body, upstream.upstreamOrigin),
    };
};

const attemptGenericFallback = async ({ request, requestClientIp }) => {
    const genericHost = getGenericServiceHost(request.url);

    if (!env.genericExtractorEnabled || !canAttemptGenericURL(request.url)) {
        return null;
    }

    const upstream = await requestGenericUpstream({
        payload: request,
        requestClientIp,
    });
    if (upstream?.body?.status && upstream.body.status !== "error") {
        console.log(
            `[GENERIC RESULT] extractor=upstream host=${genericHost} status=${upstream.body.status}`,
        );
        return upstream;
    }

    const extracted = await extractGeneric(request);
    if (extracted?.error) {
        const errorCode = extracted.error === "link.invalid"
            ? "error.api.link.invalid"
            : "error.api.fetch.fail";
        const context = errorCode === "error.api.link.invalid"
            ? undefined
            : { service: genericHost };

        return createResponse("error", {
            code: errorCode,
            context,
        });
    }

    return matchAction({
        r: extracted,
        host: "generic",
        isBatchRequest: request.batch === true,
        audioFormat: request.audioFormat,
        isAudioOnly: request.downloadMode === "audio",
        isAudioMuted: request.downloadMode === "mute",
        disableMetadata: request.disableMetadata,
        filenameStyle: request.filenameStyle,
        convertGif: request.convertGif,
        requestIP: undefined,
        audioBitrate: request.audioBitrate,
        alwaysProxy: request.alwaysProxy || env.genericForceTunnel || request.localProcessing === "forced",
        localProcessing: request.localProcessing,
    });
};

export const runAPI = async (express, app, __dirname, isPrimary = true) => {
    const startTime = new Date();
    const startTimestamp = startTime.getTime();

    const getServerInfo = () => {
        return JSON.stringify({
            cobalt: {
                version: version,
                url: env.apiURL,
                startTime: `${startTimestamp}`,
                batchMaxItems: env.batchMaxItems,
                turnstileSitekey: env.sessionEnabled ? env.turnstileSitekey : undefined,
                services: [...env.enabledServices].map(e => {
                    return friendlyServiceName(e);
                }),
            },
            git,
        });
    }

    const serverInfo = getServerInfo();

    const handleRateExceeded = (_, res) => {
        const { body } = createResponse("error", {
            code: "error.api.rate_exceeded",
            context: {
                limit: env.rateLimitWindow
            }
        });
        return res.status(429).json(body);
    };

    const keyGenerator = (req) => hashHmac(getIP(req), 'rate').toString('base64url');

    const sessionLimiter = rateLimit({
        windowMs: env.sessionRateLimitWindow * 1000,
        limit: env.sessionRateLimit,
        standardHeaders: 'draft-6',
        legacyHeaders: false,
        keyGenerator,
        store: await createStore('session'),
        handler: handleRateExceeded
    });

    const apiLimiter = rateLimit({
        windowMs: env.rateLimitWindow * 1000,
        limit: (req) => req.rateLimitMax || env.rateLimitMax,
        standardHeaders: 'draft-6',
        legacyHeaders: false,
        keyGenerator: req => req.rateLimitKey || keyGenerator(req),
        store: await createStore('api'),
        handler: handleRateExceeded
    });

    const apiTunnelLimiter = rateLimit({
        windowMs: env.tunnelRateLimitWindow * 1000,
        limit: env.tunnelRateLimitMax,
        standardHeaders: 'draft-6',
        legacyHeaders: false,
        keyGenerator: req => keyGenerator(req),
        store: await createStore('tunnel'),
        handler: (_, res) => {
            return res.sendStatus(429);
        }
    });

    app.set('trust proxy', ['loopback', 'uniquelocal']);

    // 社交媒体 API 路由 - 支持 GET/POST/PUT/DELETE
    const corsAllowedHeaders = [
        "Content-Type",
        "Authorization",
        "X-Clerk-Token",
        "X-Clerk-Email",
        "xrequestid",
        "XRequestId",
        "X-Request-Id",
        "X-FSV-Trace-ID",
        "Upload-Offset",
        "Digest",
    ];

    app.use('/social', cors({
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: corsAllowedHeaders,
        exposedHeaders: [
            'Ratelimit-Limit',
            'Ratelimit-Policy',
            'Ratelimit-Remaining',
            'Ratelimit-Reset',
            'X-FSV-Trace-ID',
            'X-FSV-App-Elapsed-Ms',
            'Server-Timing'
        ],
        ...corsConfig,
    }));

    app.use('/', cors({
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: corsAllowedHeaders,
        exposedHeaders: [
            'Ratelimit-Limit',
            'Ratelimit-Policy',
            'Ratelimit-Remaining',
            'Ratelimit-Reset',
            'X-FSV-Trace-ID',
            'X-FSV-App-Elapsed-Ms',
            'Server-Timing',
            'Upload-Offset'
        ],
        ...corsConfig,
    }));

    app.use((req, res, next) => {
        const incomingTraceId = sanitizeLogHeaderValue(req.header("X-FSV-Trace-ID"), 128);
        const traceId = incomingTraceId || randomUUID();
        const receivedAt = Date.now();
        req.traceId = traceId;
        req.fsvReceivedAt = receivedAt;
        res.setHeader("X-FSV-Trace-ID", traceId);

        const originalWriteHead = res.writeHead;
        res.writeHead = function(...args) {
            if (!res.headersSent) {
                const appElapsedMs = Date.now() - receivedAt;
                res.setHeader("X-FSV-App-Elapsed-Ms", String(appElapsedMs));
                res.setHeader("Server-Timing", `fsv_app;dur=${appElapsedMs}`);
                if (req.method === "POST" && req.path === "/") {
                    console.log(
                        `[DOWNLOAD STAGE] trace_id=${traceId} event=response_start role=${serverRole} app_elapsed_ms=${appElapsedMs}`,
                    );
                }
            }
            return originalWriteHead.apply(this, args);
        };

        if (req.method === "POST" && req.path === "/") {
            console.log(
                `[DOWNLOAD STAGE] trace_id=${traceId} event=request_received role=${serverRole}`,
            );
            res.on("finish", () => {
                console.log(
                    `[DOWNLOAD STAGE] trace_id=${traceId} event=response_complete role=${serverRole} http_status=${res.statusCode} app_elapsed_ms=${Date.now() - receivedAt}`,
                );
            });
        }

        next();
    });

    app.use(
        express.json({
            limit: "1mb",
            verify: (req, _, buf) => {
                req.rawBody = buf.toString("utf8");
            },
        }),
    );
    if (!isUpstreamServer) {
        app.use('/social', socialMediaRouter);
        app.use('/user/ai-video', aiVideoRouter);
        app.use('/user', userRouter);
        app.use('/platform-requests', platformRequestsRouter);
        app.use('/payments', paymentsRouter);
    } else {
        app.use(['/social', '/user', '/platform-requests', '/payments'], (_, res) => {
            res.sendStatus(404);
        });
    }

    app.post(['/', '/expand'], (req, res, next) => {
        if (!acceptRegex.test(req.header('Accept'))) {
            return fail(res, "error.api.header.accept");
        }
        if (!acceptRegex.test(req.header('Content-Type'))) {
            return fail(res, "error.api.header.content_type");
        }
        next();
    });

    app.post(['/', '/expand'], (req, res, next) => {
        if (!env.apiKeyURL) {
            return next();
        }

        const { success, error } = APIKeys.validateAuthorization(req);
        if (!success) {
            // We call next() here if either if:
            // a) we have user sessions enabled, meaning the request
            //    will still need a Bearer token to not be rejected, or
            // b) we do not require the user to be authenticated, and
            //    so they can just make the request with the regular
            //    rate limit configuration;
            // otherwise, we reject the request.
            if (
                (env.sessionEnabled || !env.authRequired)
                && ['missing', 'not_api_key'].includes(error)
            ) {
                return next();
            }

            return fail(res, `error.api.auth.key.${error}`);
        }

        req.authType = "key";
        return next();
    });

    app.post(['/', '/expand'], (req, res, next) => {
        if (!env.sessionEnabled || req.rateLimitKey) {
            return next();
        }

        try {
            const authorization = req.header("Authorization");
            if (!authorization) {
                return fail(res, "error.api.auth.jwt.missing");
            }

            if (authorization.length >= 256) {
                return fail(res, "error.api.auth.jwt.invalid");
            }

            const [type, token, ...rest] = authorization.split(" ");
            if (!token || type.toLowerCase() !== 'bearer' || rest.length) {
                return fail(res, "error.api.auth.jwt.invalid");
            }

            if (!jwt.verify(token, getIP(req, 32))) {
                return fail(res, "error.api.auth.jwt.invalid");
            }

            req.rateLimitKey = hashHmac(token, 'rate');
            req.authType = "session";
        } catch {
            return fail(res, "error.api.generic");
        }
        next();
    });

    app.post(['/', '/expand'], apiLimiter);
    app.use('/', express.json({ limit: "32kb" }));

    app.use('/', (err, req, res, next) => {
        if (!err) {
            return next();
        }

        const isBodyParserError =
            err instanceof SyntaxError ||
            err.type === 'entity.parse.failed' ||
            err.type === 'entity.too.large';

        if (!isBodyParserError) {
            return next(err);
        }

        const contentLength = req.header("content-length") || "n/a";
        const contentType = req.header("content-type") || "n/a";
        const ip = String(req.ip || "").replace(/^::ffff:/, "");
        console.warn(
            `[REQUEST INVALID_BODY] path=${req.path} parser_error=${err.type || err.name || "unknown"} content_type=${contentType} content_length=${contentLength} ip=${ip}`,
        );

        const { status, body } = createResponse("error", {
            code: "error.api.invalid_body",
        });
        return res.status(status).json(body);
    });

    app.post("/session", sessionLimiter, async (req, res) => {
        if (!env.sessionEnabled) {
            return fail(res, "error.api.auth.not_configured")
        }

        const turnstileResponse = req.header("cf-turnstile-response");

        if (!turnstileResponse) {
            return fail(res, "error.api.auth.turnstile.missing");
        }

        const turnstileResult = await verifyTurnstileToken(
            turnstileResponse,
            req.ip
        );

        if (!turnstileResult) {
            return fail(res, "error.api.auth.turnstile.invalid");
        }

        try {
            res.json(jwt.generate(getIP(req, 32)));
        } catch {
            return fail(res, "error.api.generic");
        }
    });

    app.post('/expand', async (req, res) => {
        const request = req.body;
        const requestId = req.traceId || randomUUID();
        const startedAtMs = Date.now();
        const submittedUrl = sanitizeLogHeaderValue(request?.url, 4096);

        console.log(
            `[EXPAND REQUEST] request_id=${requestId} url=${JSON.stringify(submittedUrl ?? "n/a")}`,
        );

        if (!request?.url) {
            console.warn(
                `[EXPAND RESULT] request_id=${requestId} url=${JSON.stringify(submittedUrl ?? "n/a")} http_status=400 error_code=error.api.link.missing elapsed_ms=${Date.now() - startedAtMs}`,
            );
            return fail(res, "error.api.link.missing");
        }

        try {
            const result = await expandURL(request.url);

            if (result?.error?.code) {
                console.warn(
                    `[EXPAND RESULT] request_id=${requestId} url=${JSON.stringify(submittedUrl ?? "n/a")} http_status=400 service=${result?.service ?? "n/a"} kind=${result?.kind ?? "n/a"} error_code=${result.error.code} elapsed_ms=${Date.now() - startedAtMs}`,
                );
                return res.status(400).json({
                    status: "error",
                    error: result.error,
                    service: result?.service,
                    kind: result?.kind,
                });
            }

            // If expansion failed or didn't return anything useful, fall back to single.
            const items = result?.items?.length ? result.items : [{ url: request.url }];

            console.log(
                `[EXPAND RESULT] request_id=${requestId} url=${JSON.stringify(submittedUrl ?? "n/a")} http_status=200 service=${result?.service ?? "n/a"} kind=${result?.kind || "single"} item_count=${items.length} elapsed_ms=${Date.now() - startedAtMs}`,
            );

            return res.status(200).json({
                status: "ok",
                service: result?.service,
                kind: result?.kind || "single",
                title: result?.title,
                collectionKey: result?.collectionKey,
                items,
            });
        } catch (error) {
            console.error(
                `[EXPAND RESULT] request_id=${requestId} url=${JSON.stringify(submittedUrl ?? "n/a")} http_status=200 result=exception error=${JSON.stringify(error?.message ?? "unknown")} elapsed_ms=${Date.now() - startedAtMs}`,
            );
            return res.status(200).json({
                status: "ok",
                kind: "single",
                items: [{ url: request.url }],
            });
        }
    });

    app.post('/', async (req, res) => {
        const request = req.body;

        if (!request.url) {
            return fail(res, "error.api.link.missing");
        }

        const normalized = await normalizeRequest(request);
        if (!normalized.success) {
            const requestType = request === null ? "null" : typeof request;
            const requestKeys = request && typeof request === "object" && !Array.isArray(request)
                ? Object.keys(request).slice(0, 32).join(",")
                : "n/a";
            const debug = normalized?.debug ? JSON.stringify(normalized.debug) : "n/a";
            console.warn(
                `[REQUEST INVALID_BODY] path=/ reason=schema_reject request_type=${requestType} keys=${requestKeys} debug=${debug}`,
            );
            return fail(res, "error.api.invalid_body");
        }
        const normalizedRequest = normalized.data;
        let email = resolveDownloadLogEmail({ req });
        const requestId = req.traceId || randomUUID();
        const requestTime = new Date().toISOString();
        const startedAtMs = Date.now();
        let downloadAttemptCreateTask = null;

        const recordEarlyDownloadFailure = (code, context = null) => {
            const { status } = createResponse("error", { code, context });
            const completedAt = Date.now();
            downloadAttemptCreateTask = scheduleDownloadAttemptCreate({
                requestId,
                userId: pointsUser?.id ?? null,
                clerkUserId,
                email,
                sourceUrl: normalizedRequest.url,
                sourceHost: getUrlHost(normalizedRequest.url),
                submittedAt: startedAtMs,
                metadata: {
                    authType: req.authType ?? "none",
                    isBatch: normalizedRequest?.batch === true,
                    stage: "early_failure",
                },
            });
            scheduleDownloadAttemptComplete(
                downloadAttemptCreateTask,
                {
                    requestId,
                    status: DOWNLOAD_ATTEMPT_STATUS.failed,
                    service: context?.service ?? getUrlHost(normalizedRequest.url),
                    httpStatus: status,
                    bodyStatus: "error",
                    errorCode: code,
                    errorMessage: getReadableDownloadError(code),
                    pointsOutcome: "skipped",
                    completedAt,
                    elapsedMs: completedAt - startedAtMs,
                },
            );
        };

        const isBypassRequest = req.authType === "key";
        let pointsUser = null;
        let clerkUserId = null;
        if (isClerkAuthConfigured && !isBypassRequest && !isUpstreamServer) {
            const auth = await getClerkUserIdFromTokenHeader(req);
            if (!auth.ok) {
                const code = auth.reason === "missing"
                    ? "error.api.auth.clerk.missing"
                    : "error.api.auth.clerk.invalid";
                recordEarlyDownloadFailure(code);
                return fail(res, code);
            }

            clerkUserId = auth.clerkUserId;

            try {
                if (!req.rateLimitKey) {
                    req.rateLimitKey = hashHmac(auth.clerkUserId, "rate");
                }
                req.authType ??= "clerk";

                pointsUser = await getUserByClerkId(auth.clerkUserId);
                if (!pointsUser) {
                    const fallbackPrimaryEmail = sanitizeLogHeaderValue(
                        req.header("X-Clerk-Email"),
                        256,
                    );
                    pointsUser = await upsertUserFromClerk({
                        clerkUserId: auth.clerkUserId,
                        primaryEmail: fallbackPrimaryEmail,
                        fullName: null,
                        avatarUrl: null,
                    });
                }

                if (pointsUser?.is_disabled) {
                    email = resolveDownloadLogEmail({
                        req,
                        pointsUser,
                        fallbackEmail: email,
                    });
                    recordEarlyDownloadFailure("error.api.user.disabled");
                    return fail(res, "error.api.user.disabled");
                }
            } catch (error) {
                console.error("Failed to load user for points enforcement:", error);
                recordEarlyDownloadFailure("error.api.points.unavailable");
                return fail(res, "error.api.points.unavailable");
            }
        }
        let membershipReservation = null;
        const requestClientIp = String(
            req.header("x-fsv-client-ip")
            || req.header("cf-connecting-ip")
            || req.header("x-forwarded-for")
            || req.header("x-real-ip")
            || req.ip
            || "",
        )
            .split(",")[0]
            .trim()
            .replace(/^::ffff:/, "");

        email = resolveDownloadLogEmail({ req, pointsUser, fallbackEmail: email });
        logDownloadRequest({
            email,
            url: normalizedRequest.url,
            requestId,
            time: requestTime,
        });
        downloadAttemptCreateTask = scheduleDownloadAttemptCreate({
            requestId,
            userId: pointsUser?.id ?? null,
            clerkUserId,
            email,
            sourceUrl: normalizedRequest.url,
            sourceHost: getUrlHost(normalizedRequest.url),
            submittedAt: startedAtMs,
            metadata: {
                authType: req.authType ?? "none",
                isBatch: normalizedRequest?.batch === true,
            },
        });

        let downloadRequestClaim = null;

        const failDownload = async (code, context, extra = {}) => {
            if (downloadRequestClaim) {
                try {
                    await failDownloadRequest(downloadRequestClaim);
                } catch (error) {
                    console.error("Failed to release download request claim:", error);
                }
                downloadRequestClaim = null;
            }
            const { status, body } = createResponse("error", {
                code,
                context,
                platformRequest: extra.platformRequest,
            });
            const completedAt = Date.now();
            scheduleDownloadAttemptComplete(
                downloadAttemptCreateTask,
                {
                    requestId,
                    status: extra.status || DOWNLOAD_ATTEMPT_STATUS.failed,
                    service:
                        extra.service ??
                        context?.service ??
                        getUrlHost(normalizedRequest.url),
                    httpStatus: status,
                    bodyStatus: "error",
                    errorCode: code,
                    errorMessage: getReadableDownloadError(code),
                    pointsOutcome: extra.pointsOutcome ?? "skipped",
                    pointsRequired: toNullableInteger(extra.pointsRequired),
                    pointsBefore: toNullableInteger(extra.pointsBefore),
                    pointsAfter: toNullableInteger(extra.pointsAfter),
                    completedAt,
                    elapsedMs: completedAt - startedAtMs,
                    metadata: extra.metadata ?? null,
                },
            );
            return res.status(status).json(body);
        };

        if (pointsUser && normalizedRequest.queueId) {
            try {
                const claim = await claimDownloadRequest({
                    userId: pointsUser.id,
                    queueId: normalizedRequest.queueId,
                    sourceUrl: normalizedRequest.url,
                });
                if (claim.status === "replay") {
                    const completedAt = Date.now();
                    const replayStatus = Number(claim.responseStatus) || 200;
                    const replayBodyStatus = claim.responseBody?.status ?? "unknown";
                    scheduleDownloadAttemptComplete(
                        downloadAttemptCreateTask,
                        {
                            requestId,
                            status:
                                replayStatus < 400 && replayBodyStatus !== "error"
                                    ? DOWNLOAD_ATTEMPT_STATUS.success
                                    : DOWNLOAD_ATTEMPT_STATUS.failed,
                            service:
                                claim.responseBody?.service ??
                                getUrlHost(normalizedRequest.url),
                            httpStatus: replayStatus,
                            bodyStatus: replayBodyStatus,
                            errorCode: claim.responseBody?.error?.code ?? null,
                            pointsOutcome:
                                claim.responseBody?.points?.outcome ??
                                "idempotency_replay",
                            completedAt,
                            elapsedMs: completedAt - startedAtMs,
                            metadata: {
                                queueId: normalizedRequest.queueId,
                                idempotencyReplay: true,
                            },
                        },
                    );
                    return res
                        .status(replayStatus)
                        .json(claim.responseBody);
                }
                if (!claim.ok) {
                    return failDownload("error.api.points.unavailable", null, {
                        pointsOutcome: "idempotency_conflict",
                        metadata: { idempotencyCode: claim.code },
                    });
                }
                if (claim.status === "claimed") {
                    downloadRequestClaim = {
                        userId: pointsUser.id,
                        queueId: normalizedRequest.queueId,
                        ownerToken: claim.ownerToken,
                    };
                }
            } catch (error) {
                console.error("Failed to claim download request:", error);
                return failDownload("error.api.points.unavailable");
            }
        }

        if (env.downloadDedupeTTL > 0) {
            try {
                const dedupeIdentity = resolveDedupeIdentity(req, clerkUserId);
                const dedupePayload = `${dedupeIdentity}|${JSON.stringify(normalizedRequest)}`;
                const dedupeKey = hashHmac(dedupePayload, "rate").toString("base64url");
                const seen = await downloadDedupe.get(dedupeKey);
                if (seen) {
                    const { body } = createResponse("error", {
                        code: "error.api.rate_exceeded",
                    });
                    const completedAt = Date.now();
                    scheduleDownloadAttemptComplete(
                        downloadAttemptCreateTask,
                        {
                            requestId,
                            status: DOWNLOAD_ATTEMPT_STATUS.failed,
                            service: getUrlHost(normalizedRequest.url),
                            httpStatus: 429,
                            bodyStatus: "error",
                            errorCode: "error.api.rate_exceeded",
                            errorMessage: getReadableDownloadError("error.api.rate_exceeded"),
                            pointsOutcome: "skipped",
                            completedAt,
                            elapsedMs: completedAt - startedAtMs,
                        },
                    );
                    if (downloadRequestClaim) {
                        await failDownloadRequest(downloadRequestClaim).catch(() => false);
                        downloadRequestClaim = null;
                    }
                    return res.status(429).json(body);
                }
                await downloadDedupe.set(dedupeKey, "1", env.downloadDedupeTTL);
            } catch {
                // fail open if dedupe storage is unavailable
            }
        }
        if (pointsUser) {
            try {
                membershipReservation = await reserveMemberDownloadUsage({
                    userId: pointsUser.id,
                    requestId,
                    sourceUrl: normalizedRequest.url,
                    isBatch: normalizedRequest?.batch === true,
                    metadata: {
                        stage: "request_reserved",
                    },
                });
                if (
                    membershipReservation?.membership &&
                    !membershipReservation.allowed
                ) {
                    console.warn(
                        `[DOWNLOAD MEMBER_LIMIT] request_id=${requestId} email=${email} reason=${membershipReservation.reason} daily=${membershipReservation.membership.usage.dailySuccessfulDownloads}/${membershipReservation.membership.limits.dailySuccessfulDownloads} monthly=${membershipReservation.membership.usage.monthlySuccessfulDownloads}/${membershipReservation.membership.limits.monthlySuccessfulDownloads}`,
                    );
                    return failDownload("error.api.membership.limit.exceeded", {
                        reason: membershipReservation.reason,
                        membership: membershipReservation.membership,
                    });
                }
            } catch (error) {
                console.error("Failed to reserve membership usage:", error);
                return failDownload("error.api.points.unavailable");
            }
        }
        const authType = req.authType ?? "none";

        const parsed = extract(
            normalizedRequest.url,
            APIKeys.getAllowedServices(req.rateLimitKey),
        );

        if (!parsed) {
            // console.log(`[DOWNLOAD REQUEST] Failed - Invalid URL: ${normalizedRequest.url}`);
            if (membershipReservation?.usageEvent?.id) {
                try {
                    await completeMemberDownloadUsage({
                        usageEventId: membershipReservation.usageEvent.id,
                        status: "failed",
                        metadata: {
                            bodyStatus: "error",
                            errorCode: "error.api.link.invalid",
                        },
                    });
                } catch (usageError) {
                    console.error("Failed to release member usage reservation:", usageError);
                }
            }
            return failDownload("error.api.link.invalid");
        }

        try {
            let result;

            if ("error" in parsed) {
                if (genericFallbackErrors.has(parsed.error)) {
                    const genericResult = await attemptGenericFallback({
                        request: {
                            ...normalizedRequest,
                            requestClientIp,
                        },
                        requestClientIp,
                    });
                    if (genericResult?.body?.status !== "error") {
                        result = genericResult;
                    }
                }

                if (!result) {
                    let context;
                    if (parsed.error === "platform.unsupported") {
                        context = { domain: parsed.domain };
                    } else if (parsed?.context) {
                        context = parsed.context;
                    } else if (genericFallbackErrors.has(parsed.error) && canAttemptGenericURL(normalizedRequest.url)) {
                        context = { service: getGenericServiceHost(normalizedRequest.url) };
                    }
                    if (membershipReservation?.usageEvent?.id) {
                        try {
                            await completeMemberDownloadUsage({
                                usageEventId: membershipReservation.usageEvent.id,
                                status: "failed",
                                service: context?.service ?? parsed?.host,
                                metadata: {
                                    bodyStatus: "error",
                                    errorCode: `error.api.${parsed.error}`,
                                },
                            });
                        } catch (usageError) {
                            console.error("Failed to release member usage reservation:", usageError);
                        }
                    }
                    return failDownload(`error.api.${parsed.error}`, context, {
                        service: context?.service ?? parsed?.host,
                        platformRequest: parsed.error === "platform.unsupported"
                            ? {
                                eligible: true,
                                domain: parsed.domain,
                            }
                            : undefined,
                    });
                }
            } else {
                result = await match({
                    host: parsed.host,
                    patternMatch: parsed.patternMatch,
                    params: {
                        ...normalizedRequest,
                        requestClientIp,
                        traceId: requestId,
                        traceReceivedAtMs: req.fsvReceivedAt,
                    },
                    authType,
                });
            }

            const resultBodyStatus = result?.body?.status ?? "unknown";
            const isBatchRequest = normalizedRequest?.batch === true;
            const isBrowserQueuedRequest =
                resultBodyStatus === "local-processing" ||
                (
                    normalizedRequest?.localProcessing === "forced" &&
                    resultBodyStatus === "tunnel"
                );
            const shouldDeferPointsCharge = isBrowserQueuedRequest;
            let pointsOutcome = "skipped";
            let pointsRequired = null;
            let pointsBefore = null;
            let pointsAfter = null;
            let pointsHoldId = null;
            let pointsHoldExpiresAt = null;
            let membershipPlan = null;
            let membershipLimit = null;

            if (
                membershipReservation?.usageEvent?.id &&
                resultBodyStatus === "error"
            ) {
                try {
                    await completeMemberDownloadUsage({
                        usageEventId: membershipReservation.usageEvent.id,
                        status: "failed",
                        service: result?.body?.service ?? parsed.host,
                        metadata: {
                            bodyStatus: resultBodyStatus,
                            errorCode: result?.body?.error?.code ?? null,
                        },
                    });
                } catch (usageError) {
                    console.error("Failed to release member usage reservation:", usageError);
                }
            }

            if (pointsUser && resultBodyStatus !== "error") {
                pointsRequired = durationToPoints(result?.body?.duration);
                pointsBefore = pointsUser.points;

                if (
                    membershipReservation?.allowed &&
                    membershipReservation.membership
                ) {
                    pointsOutcome = "member";
                    membershipPlan = membershipReservation.membership.planKey;
                    try {
                        await completeMemberDownloadUsage({
                            usageEventId: membershipReservation.usageEvent?.id,
                            status: "success",
                            service: result?.body?.service ?? parsed.host,
                            durationSeconds: result?.body?.duration,
                            pointsEquivalent: pointsRequired,
                            metadata: {
                                bodyStatus: resultBodyStatus,
                            },
                        });
                        membershipLimit = `${membershipReservation.membership.usage.dailySuccessfulDownloads}/${membershipReservation.membership.limits.dailySuccessfulDownloads},${membershipReservation.membership.usage.monthlySuccessfulDownloads}/${membershipReservation.membership.limits.monthlySuccessfulDownloads}`;
                    } catch (error) {
                        console.error("Failed to record member usage:", error);
                        pointsOutcome = "error";
                        return failDownload("error.api.points.unavailable", null, {
                            pointsOutcome,
                            service: result?.body?.service ?? parsed.host,
                        });
                    }
                } else if (shouldDeferPointsCharge) {
                    pointsOutcome = "hold";
                    const holdExpiresAt =
                        Date.now() + env.pointsHoldTtlSeconds * 1000;
                    try {
                        const hold = await createPointsHold({
                            userId: pointsUser.id,
                            points: pointsRequired,
                            expiresAt: holdExpiresAt,
                            reason: isBatchRequest
                                ? "batch_download"
                                : "queued_download",
                            sourceUrl: normalizedRequest.url,
                            queueId: normalizedRequest.queueId ?? null,
                            allowFirstDownloadGrace: true,
                            maxGracePoints: FIRST_DOWNLOAD_GRACE_MAX_POINTS,
                            idempotencyOwnerToken:
                                downloadRequestClaim?.ownerToken ?? null,
                            responseStatus: result.status,
                            responseBody: result.body,
                        });

                        if (!hold.ok) {
                            if (
                                hold.code === "IDEMPOTENCY_CONFLICT" ||
                                hold.code === "IDEMPOTENCY_FINALIZED" ||
                                hold.code === "IDEMPOTENCY_LOST"
                            ) {
                                pointsOutcome = "idempotency_conflict";
                                return failDownload(
                                    "error.api.points.unavailable",
                                    null,
                                    {
                                        pointsOutcome,
                                        pointsRequired,
                                        pointsBefore,
                                        pointsAfter,
                                        service: result?.body?.service ?? parsed.host,
                                    },
                                );
                            }
                            pointsOutcome = "insufficient";
                            return failDownload(
                                "error.api.points.insufficient",
                                {
                                    current: hold.current ?? pointsUser.points,
                                    required: pointsRequired,
                                },
                                {
                                    pointsOutcome,
                                    pointsRequired,
                                    pointsBefore,
                                    pointsAfter,
                                    service: result?.body?.service ?? parsed.host,
                                },
                            );
                        }

                        pointsOutcome = "held";
                        pointsRequired = hold.pointsRequired ?? pointsRequired;
                        pointsHoldId = hold.holdId;
                        pointsHoldExpiresAt = hold.expiresAt;
                        pointsBefore = hold.pointsBefore ?? pointsBefore;
                        pointsAfter = pointsBefore;
                    } catch (error) {
                        console.error("Failed to hold points:", error);
                        pointsOutcome = "error";
                        return failDownload("error.api.points.unavailable", null, {
                            pointsOutcome,
                            pointsRequired,
                            pointsBefore,
                            pointsAfter,
                            service: result?.body?.service ?? parsed.host,
                        });
                    }
                } else {
                    pointsOutcome = "attempt";
                    try {
                        const updated = await consumeUserPoints(
                            pointsUser.id,
                            pointsRequired,
                            {
                                allowFirstDownloadGrace: true,
                                maxGracePoints: FIRST_DOWNLOAD_GRACE_MAX_POINTS,
                                markDownloadSuccess: true,
                                queueId: normalizedRequest.queueId ?? null,
                                idempotencyOwnerToken:
                                    downloadRequestClaim?.ownerToken ?? null,
                                responseStatus: result.status,
                                responseBody: result.body,
                            },
                        );
                        if (!updated) {
                            pointsOutcome = "insufficient";
                            return failDownload(
                                "error.api.points.insufficient",
                                {
                                    current: pointsUser.points,
                                    required: pointsRequired,
                                },
                                {
                                    pointsOutcome,
                                    pointsRequired,
                                    pointsBefore,
                                    pointsAfter,
                                    service: result?.body?.service ?? parsed.host,
                                },
                            );
                        }

                        const chargeMeta = updated.chargeMeta ?? {};
                        pointsOutcome = chargeMeta.usedFirstDownloadGrace
                            ? "consumed_with_grace"
                            : "consumed";
                        pointsBefore = chargeMeta.pointsBefore ?? pointsBefore;
                        pointsAfter = chargeMeta.pointsAfter ?? updated.points;
                    } catch (error) {
                        console.error("Failed to consume points:", error);
                        pointsOutcome = "error";
                        return failDownload("error.api.points.unavailable", null, {
                            pointsOutcome,
                            pointsRequired,
                            pointsBefore,
                            pointsAfter,
                            service: result?.body?.service ?? parsed.host,
                        });
                    }
                }
            }

            const resultErrorCode = result?.body?.error?.code ?? "n/a";
            console.log(
                `[DOWNLOAD RESULT] request_id=${requestId} url=${normalizedRequest.url} email=${email} http_status=${result.status} body_status=${resultBodyStatus} error_code=${resultErrorCode} service=${result?.body?.service ?? parsed.host} points_outcome=${pointsOutcome} points_required=${pointsRequired ?? "n/a"} points_before=${pointsBefore ?? "n/a"} points_after=${pointsAfter ?? "n/a"} membership_plan=${membershipPlan ?? "n/a"} membership_usage=${membershipLimit ?? "n/a"} elapsed_ms=${Date.now() - startedAtMs}`,
            );

            const completedAt = Date.now();
            const isDownloadSuccess =
                resultBodyStatus !== "error" &&
                Number.isFinite(Number(result?.status)) &&
                Number(result.status) < 400;
            const normalizedErrorCode =
                resultErrorCode && resultErrorCode !== "n/a"
                    ? resultErrorCode
                    : null;
            scheduleDownloadAttemptComplete(
                downloadAttemptCreateTask,
                {
                    requestId,
                    status: isDownloadSuccess
                        ? DOWNLOAD_ATTEMPT_STATUS.success
                        : DOWNLOAD_ATTEMPT_STATUS.failed,
                    service: result?.body?.service ?? parsed.host,
                    httpStatus: toNullableInteger(result?.status),
                    bodyStatus: resultBodyStatus,
                    errorCode: normalizedErrorCode,
                    errorMessage: normalizedErrorCode
                        ? getReadableDownloadError(normalizedErrorCode)
                        : null,
                    pointsOutcome,
                    pointsRequired: toNullableInteger(pointsRequired),
                    pointsBefore: toNullableInteger(pointsBefore),
                    pointsAfter: toNullableInteger(pointsAfter),
                    completedAt,
                    elapsedMs: completedAt - startedAtMs,
                    metadata: {
                        membershipPlan,
                        membershipUsage: membershipLimit,
                        isBatch: isBatchRequest,
                        isBrowserQueued: isBrowserQueuedRequest,
                        queueId: normalizedRequest?.queueId ?? null,
                    },
                },
            );

            if (shouldDeferPointsCharge && result?.body && pointsOutcome !== "skipped") {
                result.body.points = {
                    outcome: pointsOutcome,
                    required: pointsRequired,
                    before: pointsBefore,
                    after: pointsAfter,
                    holdId: pointsHoldId,
                    holdExpiresAt: pointsHoldExpiresAt,
                };
            }

            if (process.env.AI_VIDEO_ENABLED === "1" && pointsUser && result?.body && isDownloadSuccess) {
                const candidate = getMediaImportCandidate(result.body);
                if (candidate) {
                    try {
                        result.body.mediaImportToken = createMediaImportToken({ userId: pointsUser.id, ...candidate });
                        result.body.mediaImportExpiresAt = Date.now() + 15 * 60 * 1000;
                    } catch (error) {
                        console.warn(`[AI VIDEO IMPORT] request_id=${requestId} token_issue_failed=${error.code || "unknown"}`);
                    }
                }
            }

            if (downloadRequestClaim) {
                try {
                    if (isDownloadSuccess) {
                        await completeDownloadRequest({
                            ...downloadRequestClaim,
                            responseStatus: result.status,
                            responseBody: result.body,
                        });
                    } else {
                        await failDownloadRequest(downloadRequestClaim);
                    }
                } catch (error) {
                    console.error("Failed to complete download request claim:", error);
                }
                downloadRequestClaim = null;
            }

            res.status(result.status).json(result.body);
        } catch (error) {
            // console.log(`[DOWNLOAD REQUEST] Processing failed for URL: ${normalizedRequest.url}, Error: ${error.message}`);
            if (membershipReservation?.usageEvent?.id) {
                try {
                    await completeMemberDownloadUsage({
                        usageEventId: membershipReservation.usageEvent.id,
                        status: "failed",
                        metadata: {
                            bodyStatus: "exception",
                        },
                    });
                } catch (usageError) {
                    console.error("Failed to release member usage reservation:", usageError);
                }
            }
            console.log(
                `[DOWNLOAD RESULT] request_id=${requestId} url=${normalizedRequest.url} email=${email} result=exception elapsed_ms=${Date.now() - startedAtMs}`,
            );
            const completedAt = Date.now();
            scheduleDownloadAttemptComplete(
                downloadAttemptCreateTask,
                {
                    requestId,
                    status: DOWNLOAD_ATTEMPT_STATUS.exception,
                    service: getUrlHost(normalizedRequest.url),
                    httpStatus: 500,
                    bodyStatus: "exception",
                    errorCode: "error.api.generic",
                    errorMessage: getReadableDownloadError("error.api.generic"),
                    pointsOutcome: "skipped",
                    completedAt,
                    elapsedMs: completedAt - startedAtMs,
                    metadata: {
                        message: error?.message ?? "unknown",
                    },
                },
            );
            if (downloadRequestClaim) {
                await failDownloadRequest(downloadRequestClaim).catch(() => false);
                downloadRequestClaim = null;
            }
            fail(res, "error.api.generic");
        }
    });

    app.use('/tunnel', cors({
        methods: ['GET', 'POST', 'OPTIONS'],
        exposedHeaders: [
            'Estimated-Content-Length',
            'Content-Disposition',
            'Content-Length',
            'Content-Range',
            'Accept-Ranges',
        ],
        ...corsConfig,
    }));

    app.get('/relay', async (req, res) => {
        if (!isUpstreamServer) {
            return res.sendStatus(404);
        }

        if (env.upstreamApiKey || env.instagramUpstreamApiKey) {
            const authHeader = req.header("Authorization") || "";
            if (authHeader !== `Api-Key ${env.upstreamApiKey || env.instagramUpstreamApiKey}`) {
                return res.sendStatus(401);
            }
        }

        const url = req.query.url;
        const service = req.query.service;
        if (!url || typeof url !== "string" || !service || typeof service !== "string") {
            return res.sendStatus(400);
        }

        if (!["douyin", "bilibili"].includes(service)) {
            return res.sendStatus(400);
        }

        let target;
        try {
            target = new URL(url);
        } catch {
            return res.sendStatus(400);
        }

        if (!["http:", "https:"].includes(target.protocol)) {
            return res.sendStatus(400);
        }

        // Upstream relay often receives signed tunnel URLs whose host points to
        // a public/protected domain (e.g. api1:9000). When relay runs on the
        // same host as that tunnel, external fetch may fail due ACL/port
        // restrictions, so re-enter local tunnel handler.
        const requestedHost = String(req.header("host") || "").toLowerCase();
        const targetHost = String(target.host || "").toLowerCase();
        let relayTarget = target;
        if (
            target.pathname === "/tunnel" &&
            (
                targetHost === requestedHost ||
                ["127.0.0.1", "localhost"].includes(String(target.hostname || "").toLowerCase())
            )
        ) {
            const localPort = Number.isFinite(Number(env.apiPort))
                ? String(env.apiPort)
                : "9000";
            relayTarget = new URL(target.pathname + target.search + target.hash, `http://127.0.0.1:${localPort}`);
        }

        const range = req.headers["range"];

        try {
            const { body: stream, headers, statusCode } = await undiciRequest(relayTarget.toString(), {
                headers: {
                    ...getHeaders(service),
                    ...(range ? { Range: range } : {}),
                },
                maxRedirections: 8,
            });

            res.status(statusCode);
            for (const headerName of ["accept-ranges", "content-type", "content-length", "content-range"]) {
                if (headers[headerName]) {
                    res.setHeader(headerName, headers[headerName]);
                }
            }

            stream.on("error", () => res.end());
            stream.on("close", () => res.end());
            stream.pipe(res);
        } catch {
            return res.sendStatus(502);
        }
    });

    app.get('/tunnel', async (req, res) => {
        const id = String(req.query.id);
        const exp = String(req.query.exp);
        const sig = String(req.query.sig);
        const sec = String(req.query.sec);
        const iv = String(req.query.iv);

        const checkQueries = id && exp && sig && sec && iv;
        const checkBaseLength = id.length === 21 && exp.length === 13;
        const checkSafeLength = sig.length === 43 && sec.length === 43 && iv.length === 22;

        if (!checkQueries || !checkBaseLength || !checkSafeLength) {
            return res.status(400).end();
        }

        if (req.query.p) {
            return res.status(200).end();
        }

        const streamInfo = await verifyStream(id, sig, exp, sec, iv);
        if (!streamInfo?.service) {
            return res.status(streamInfo.status).end();
        }

        if (streamInfo.bypassTunnelRateLimit !== true) {
            const passed = await new Promise((resolve) => {
                apiTunnelLimiter(req, res, (error) => {
                    if (error) {
                        resolve(false);
                        return;
                    }
                    resolve(true);
                });
            });

            if (!passed || res.headersSent) {
                return;
            }
        }

        streamInfo.tunnelId = id;
        const clientIp = String(
            req.headers["cf-connecting-ip"] ||
            req.headers["x-forwarded-for"] ||
            req.ip ||
            "unknown"
        ).split(",")[0].trim();
        tunnelDebugLog(
            `[TUNNEL OPEN] id=${id} service=${streamInfo.service} type=${streamInfo.type} range=${req.headers["range"] || "none"} ip=${clientIp}`,
        );

        if (streamInfo.type === 'proxy') {
            streamInfo.range = req.headers['range'];
        }

        return stream(res, streamInfo);
    });

    app.get('/', (_, res) => {
        res.type('json');
        res.status(200).send(env.envFile ? getServerInfo() : serverInfo);
    })

    app.get('/health', (_, res) => {
        res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
    })

    app.get('/ws/health', (_, res) => {
        res.status(200).json({
            status: 'websocket_ready',
            timestamp: new Date().toISOString(),
            path: '/ws'
        });
    })

    app.get('/upstreams/health', requireAdminAuth, (_, res) => {
        res.status(200).json(getUpstreamHealthSnapshot());
    })

    app.get('/favicon.ico', (req, res) => {
        res.status(404).end();
    })

    app.get('/*', (req, res) => {
        res.redirect('/');
    })

    // handle all express errors
    app.use((_, __, res, ___) => {
        return fail(res, "error.api.generic");
    })

    randomizeCiphers();
    setInterval(randomizeCiphers, 1000 * 60 * 30); // shuffle ciphers every 30 minutes

    env.subscribe(['externalProxy', 'httpProxyValues'], () => {
        // TODO: remove env.externalProxy in a future version
        const options = {};
        if (env.externalProxy) {
            options.httpProxy = env.externalProxy;
        }

        setGlobalDispatcher(
            new EnvHttpProxyAgent(options)
        );
    });

    const server = http.createServer(app);

    // 设置WebSocket信令服务器
    setupSignalingServer(server);

    server.listen({
        port: env.apiPort,
        host: env.listenAddress,
        reusePort: env.instanceCount > 1 || undefined
    }, async () => {
        if (isPrimary) {
            console.log(`\n` +
                Bright(Cyan("cobalt ")) + Bright("API ^ω^") + "\n" +

                "~~~~~~\n" +
                Bright("version: ") + version + "\n" +
                Bright("commit: ") + git.commit + "\n" +
                Bright("branch: ") + git.branch + "\n" +
                Bright("remote: ") + git.remote + "\n" +
                Bright("start time: ") + startTime.toUTCString() + "\n" +
                "~~~~~~\n" +

                Bright("url: ") + Bright(Cyan(env.apiURL)) + "\n" +
                Bright("port: ") + env.apiPort + "\n" +
                Bright("server role: ") + serverRole + "\n" +
                Bright("is upstream: ") + String(isUpstreamServer) + "\n" +

                "~~~~~~\n" +
                Bright("📊 Logging enabled: ") + "Video download requests will be tracked\n"
            );
            console.log(`[BOOT] server_role=${serverRole} is_upstream=${isUpstreamServer} api_url=${env.apiURL} port=${env.apiPort}`);
            if (!isUpstreamServer) {
                startUpstreamHealthChecks();
            }
        }

        // 初始化社交媒体数据库
        // try {
        //     await initSocialMedia();
        // } catch (error) {
        //     console.error("Failed to initialize social media module:", error);
        // }

        if (env.apiKeyURL) {
            APIKeys.setup(env.apiKeyURL);
        }

        if (env.cookiePath) {
            Cookies.setup(env.cookiePath);
        }

        if (env.ytSessionServer) {
            YouTubeSession.setup();
        }
    });

    setupTunnelHandler();
}
