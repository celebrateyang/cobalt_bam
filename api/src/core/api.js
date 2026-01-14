import cors from "cors";
import http from "node:http";
import rateLimit from "express-rate-limit";
import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";
import { getCommit, getBranch, getRemote, getVersion } from "@imput/version-info";

import jwt from "../security/jwt.js";
import stream from "../stream/stream.js";
import match from "../processing/match.js";

import { env } from "../config.js";
import { extract } from "../processing/url.js";
import { Bright, Cyan } from "../misc/console-text.js";
import { hashHmac } from "../security/secrets.js";
import { createStore } from "../store/redis-ratelimit.js";
import { randomizeCiphers } from "../misc/randomize-ciphers.js";
import { verifyTurnstileToken } from "../security/turnstile.js";
import { friendlyServiceName } from "../processing/service-alias.js";
import { verifyStream } from "../stream/manage.js";
import { createResponse, normalizeRequest, getIP } from "../processing/request.js";
import { expandURL } from "../processing/expand.js";
import { setupTunnelHandler } from "./itunnel.js";
import { setupSignalingServer } from "./signaling.js";

import * as APIKeys from "../security/api-keys.js";
import * as Cookies from "../processing/cookie/manager.js";
import * as YouTubeSession from "../processing/helpers/youtube-session.js";
import { verifyToken } from "@clerk/express";
import { consumeUserPoints, getUserByClerkId, upsertUserFromClerk } from "../db/users.js";

// 社交媒体路由
import socialMediaRouter from "../routes/social-media.js";
import { initDatabase } from "../db/social-media.js";
import userRouter from "../routes/user.js";
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

const isClerkAuthConfigured =
    !!process.env.CLERK_SECRET_KEY && !!process.env.CLERK_PUBLISHABLE_KEY;

const durationToPoints = (durationSeconds) => {
    if (
        typeof durationSeconds !== "number" ||
        !Number.isFinite(durationSeconds) ||
        durationSeconds <= 0
    ) {
        return 1;
    }

    return Math.ceil(durationSeconds / 60);
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
    app.use('/social', cors({
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        exposedHeaders: [
            'Ratelimit-Limit',
            'Ratelimit-Policy',
            'Ratelimit-Remaining',
            'Ratelimit-Reset'
        ],
        ...corsConfig,
    }));

    app.use('/', cors({
        methods: ['GET', 'POST'],
        exposedHeaders: [
            'Ratelimit-Limit',
            'Ratelimit-Policy',
            'Ratelimit-Remaining',
            'Ratelimit-Reset'
        ],
        ...corsConfig,
    }));

    app.use(
        express.json({
            limit: "1mb",
            verify: (req, _, buf) => {
                req.rawBody = buf.toString("utf8");
            },
        }),
    );
    app.use('/social', socialMediaRouter);
    app.use('/user', userRouter);
    app.use('/payments', paymentsRouter);

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
    app.use('/', express.json({ limit: 1024 }));

    app.use('/', (err, _, res, next) => {
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

        if (!request?.url) {
            return fail(res, "error.api.link.missing");
        }

        try {
            const result = await expandURL(request.url);

            // If expansion failed or didn't return anything useful, fall back to single.
            const items = result?.items?.length ? result.items : [{ url: request.url }];

            return res.status(200).json({
                status: "ok",
                service: result?.service,
                kind: result?.kind || "single",
                title: result?.title,
                collectionKey: result?.collectionKey,
                items,
            });
        } catch {
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

        const { success, data: normalizedRequest } = await normalizeRequest(request);
        if (!success) {
            return fail(res, "error.api.invalid_body");
        }

        const isBypassRequest = req.authType === "key";
        let pointsUser = null;
        let clerkUserId = null;
        if (isClerkAuthConfigured && !isBypassRequest) {
            const auth = await getClerkUserIdFromTokenHeader(req);
            if (!auth.ok) {
                return fail(
                    res,
                    auth.reason === "missing"
                        ? "error.api.auth.clerk.missing"
                        : "error.api.auth.clerk.invalid",
                );
            }

            clerkUserId = auth.clerkUserId;

            try {
                if (!req.rateLimitKey) {
                    req.rateLimitKey = hashHmac(auth.clerkUserId, "rate");
                }
                req.authType ??= "clerk";

                pointsUser = await getUserByClerkId(auth.clerkUserId);
                if (!pointsUser) {
                    pointsUser = await upsertUserFromClerk({
                        clerkUserId: auth.clerkUserId,
                        primaryEmail: null,
                        fullName: null,
                        avatarUrl: null,
                    });
                }

                if (pointsUser?.is_disabled) {
                    return fail(res, "error.api.user.disabled");
                }
            } catch (error) {
                console.error("Failed to load user for points enforcement:", error);
                return fail(res, "error.api.points.unavailable");
            }
        }

        const clientEmail = sanitizeLogHeaderValue(req.header("X-Clerk-Email"), 256);
        const email = clientEmail ?? "unknown";
        const requestId = Math.random().toString(36).slice(2, 10);
        const requestTime = new Date().toISOString();
        const authType = req.authType ?? "none";
        const startedAtMs = Date.now();
        console.log(
            `[DOWNLOAD REQUEST] id=${requestId} url=${normalizedRequest.url} auth=${authType} clerk_user_id=${clerkUserId ?? "unknown"} email=${email} time=${requestTime}`,
        );

        const parsed = extract(
            normalizedRequest.url,
            APIKeys.getAllowedServices(req.rateLimitKey),
        );

        if (!parsed) {
            // console.log(`[DOWNLOAD REQUEST] Failed - Invalid URL: ${normalizedRequest.url}`);
            return fail(res, "error.api.link.invalid");
        }

        if ("error" in parsed) {
            // console.log(`[DOWNLOAD REQUEST] Failed - Parse error for URL: ${normalizedRequest.url}, Error: ${parsed.error}`);
            let context;
            if (parsed?.context) {
                context = parsed.context;
            }
            return fail(res, `error.api.${parsed.error}`, context);
        }

        // console.log(`[DOWNLOAD REQUEST] Successfully parsed URL: ${normalizedRequest.url}, Service: ${parsed.host}`);

        try {
            const result = await match({
                host: parsed.host,
                patternMatch: parsed.patternMatch,
                params: normalizedRequest,
                authType,
            });

            const resultBodyStatus = result?.body?.status ?? "unknown";
            let pointsOutcome = "skipped";
            let pointsRequired = null;
            let pointsBefore = null;
            let pointsAfter = null;

            if (pointsUser && resultBodyStatus !== "error") {
                pointsOutcome = "attempt";
                pointsRequired = durationToPoints(result?.body?.duration);
                pointsBefore = pointsUser.points;
                try {
                    const updated = await consumeUserPoints(
                        pointsUser.id,
                        pointsRequired,
                    );
                    if (!updated) {
                        pointsOutcome = "insufficient";
                        console.log(
                            `[DOWNLOAD POINTS] id=${requestId} url=${normalizedRequest.url} result=insufficient current=${pointsBefore} required=${pointsRequired} auth=${authType} clerk_user_id=${clerkUserId ?? "unknown"} email=${email}`,
                        );
                        return fail(res, "error.api.points.insufficient", {
                            current: pointsUser.points,
                            required: pointsRequired,
                        });
                    }

                    pointsOutcome = "consumed";
                    pointsAfter = updated.points;
                    console.log(
                        `[DOWNLOAD POINTS] id=${requestId} url=${normalizedRequest.url} result=consumed before=${pointsBefore} after=${pointsAfter} required=${pointsRequired} auth=${authType} clerk_user_id=${clerkUserId ?? "unknown"} email=${email}`,
                    );
                } catch (error) {
                    console.error("Failed to consume points:", error);
                    pointsOutcome = "error";
                    console.log(
                        `[DOWNLOAD POINTS] id=${requestId} url=${normalizedRequest.url} result=error auth=${authType} clerk_user_id=${clerkUserId ?? "unknown"} email=${email}`,
                    );
                    return fail(res, "error.api.points.unavailable");
                }
            }

            console.log(
                `[DOWNLOAD RESULT] id=${requestId} url=${normalizedRequest.url} http_status=${result.status} body_status=${resultBodyStatus} service=${result?.body?.service ?? parsed.host} points_outcome=${pointsOutcome} points_required=${pointsRequired ?? "n/a"} points_before=${pointsBefore ?? "n/a"} points_after=${pointsAfter ?? "n/a"} auth=${authType} clerk_user_id=${clerkUserId ?? "unknown"} email=${email} elapsed_ms=${Date.now() - startedAtMs}`,
            );

            // console.log(`[DOWNLOAD REQUEST] Processing completed for URL: ${normalizedRequest.url}, Status: ${result.status}`);
            res.status(result.status).json(result.body);
        } catch (error) {
            // console.log(`[DOWNLOAD REQUEST] Processing failed for URL: ${normalizedRequest.url}, Error: ${error.message}`);
            console.log(
                `[DOWNLOAD RESULT] id=${requestId} url=${normalizedRequest.url} result=exception auth=${authType} clerk_user_id=${clerkUserId ?? "unknown"} email=${email} elapsed_ms=${Date.now() - startedAtMs}`,
            );
            fail(res, "error.api.generic");
        }
    });

    app.use('/tunnel', cors({
        methods: ['GET'],
        exposedHeaders: [
            'Estimated-Content-Length',
            'Content-Disposition'
        ],
        ...corsConfig,
    }));

    app.get('/tunnel', apiTunnelLimiter, async (req, res) => {
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

                "~~~~~~\n" +
                Bright("📊 Logging enabled: ") + "Video download requests will be tracked\n"
            );
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
