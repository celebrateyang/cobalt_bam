import express from "express";
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";

import {
    consumeUserPoints,
    getOrCreateClipboardPersonalProfile,
    getUserByClerkId,
    finalizePointsHold,
    listUsers,
    releasePointsHold,
    rotateClipboardPersonalCode,
    touchClipboardPersonalDevice,
    updateUserPoints,
    upsertUserFromClerk,
} from "../db/users.js";
import {
    claimReferralReward,
    getReferrerProfileByReferralCode,
} from "../db/referrals.js";
import {
    createPromotionSubmission,
    getPromotionTypeConfig,
    listPromotionSubmissions,
    listPromotionSubmissionsForUser,
    reviewPromotionSubmission,
} from "../db/promotion-submissions.js";
import {
    hasPaidCreditOrderByClerkUserId,
    listCreditOrders,
    listCreditOrdersForUser,
} from "../db/credit-orders.js";
import {
    clearCollectionMemoryForUser,
    getDownloadedItemKeysForCollection,
    markDownloadedItemsForCollection,
} from "../db/collection-memory.js";
import {
    createFeedback,
    listFeedback,
    listFeedbackForUser,
    processFeedback,
} from "../db/feedback.js";
import { requireAuth as requireAdminAuth } from "../middleware/admin-auth.js";
import {
    buildClipboardPersonalSessionId,
    createClipboardPersonalWsTicket,
} from "../core/clipboard-personal.js";
import {
    getClipboardPersonalSessionRuntime,
    invalidateClipboardPersonalSession,
} from "../core/signaling.js";

const router = express.Router();

const isClerkApiConfigured = !!process.env.CLERK_SECRET_KEY;
const isClerkAuthConfigured =
    isClerkApiConfigured && !!process.env.CLERK_PUBLISHABLE_KEY;
const requirePaidForRandomChat = ["1", "true", "yes", "on"].includes(
    String(process.env.CHAT_REQUIRE_PAID || "").toLowerCase().trim(),
);

const REFERRAL_CLAIM_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const mapClerkUser = (clerkUser) => {
    const primaryEmail =
        clerkUser.emailAddresses?.find(
            (e) => e.id === clerkUser.primaryEmailAddressId,
        )?.emailAddress ??
        clerkUser.emailAddresses?.[0]?.emailAddress ??
        null;

    const fullName =
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
        clerkUser.username ||
        null;

    return {
        clerkUserId: clerkUser.id,
        primaryEmail,
        fullName,
        avatarUrl: clerkUser.imageUrl,
    };
};

const jsonError = (res, status, code, message) => {
    return res.status(status).json({
        status: "error",
        error: { code, message },
    });
};

const sanitizeLogValue = (value, maxLength = 200) => {
    if (value === null || value === undefined) {
        return null;
    }

    const text = typeof value === "string" ? value : String(value);
    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength)}…`;
};

const getHeaderValue = (headers, name) => {
    const value = headers?.[name];
    if (Array.isArray(value)) {
        return value.join(", ");
    }
    return value ?? null;
};

const buildHoldLogContext = (req) => {
    const rawUrl = req.body?.url ?? req.body?.targetUrl ?? null;

    return {
        ip: sanitizeLogValue(req.ip, 80),
        forwarded: sanitizeLogValue(getHeaderValue(req.headers, "x-forwarded-for"), 200),
        cfConnectingIp: sanitizeLogValue(getHeaderValue(req.headers, "cf-connecting-ip"), 80),
        userAgent: sanitizeLogValue(getHeaderValue(req.headers, "user-agent"), 200),
        referer: sanitizeLogValue(getHeaderValue(req.headers, "referer"), 200),
        origin: sanitizeLogValue(getHeaderValue(req.headers, "origin"), 120),
        requestId: sanitizeLogValue(
            getHeaderValue(req.headers, "x-request-id")
                ?? req.body?.requestId
                ?? req.body?.request_id
                ?? null,
            120,
        ),
        reason: sanitizeLogValue(req.body?.reason ?? null, 120),
        queueId: sanitizeLogValue(req.body?.queueId ?? req.body?.queue_id ?? null, 120),
        itemId: sanitizeLogValue(req.body?.itemId ?? req.body?.item_id ?? null, 120),
        errorCode: sanitizeLogValue(req.body?.errorCode ?? req.body?.error_code ?? null, 120),
        url: sanitizeLogValue(rawUrl, 200),
    };
};

const CLIPBOARD_DEVICE_PLATFORMS = new Set([
    "web",
    "ios",
    "android",
    "macos",
    "windows",
    "linux",
    "unknown",
]);

const parseClipboardDeviceInput = (body = {}) => {
    const rawDeviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
    const rawDeviceName =
        typeof body?.deviceName === "string" ? body.deviceName.trim() : "";
    const rawPlatform =
        typeof body?.platform === "string"
            ? body.platform.trim().toLowerCase()
            : "";

    if (!rawDeviceId || rawDeviceId.length > 128) {
        return { ok: false, message: "deviceId is required (max 128 chars)" };
    }

    if (rawDeviceName.length > 64) {
        return { ok: false, message: "deviceName too long (max 64 chars)" };
    }

    const platform = CLIPBOARD_DEVICE_PLATFORMS.has(rawPlatform)
        ? rawPlatform
        : "unknown";

    return {
        ok: true,
        deviceId: rawDeviceId,
        deviceName: rawDeviceName || null,
        platform,
    };
};

// Public: lookup the inviter's display info for the invite landing page
router.get("/referrals/lookup", async (req, res) => {
    try {
        const rawCode = Array.isArray(req.query?.code)
            ? req.query.code[0]
            : req.query?.code;

        const referralCode =
            typeof rawCode === "string" ? rawCode.trim() : "";

        if (!referralCode) {
            return jsonError(
                res,
                400,
                "INVALID_INPUT",
                "referral code is required",
            );
        }

        if (referralCode.length > 64) {
            return jsonError(
                res,
                400,
                "INVALID_INPUT",
                "referral code is too long",
            );
        }

        const referrer = await getReferrerProfileByReferralCode(referralCode);
        if (!referrer) {
            return jsonError(
                res,
                404,
                "INVALID_CODE",
                "Referral code not found",
            );
        }

        return res.json({
            status: "success",
            data: {
                referrer,
            },
        });
    } catch (error) {
        console.error("GET /user/referrals/lookup error:", error);
        return jsonError(
            res,
            500,
            "SERVER_ERROR",
            "Failed to load referrer profile",
        );
    }
});

// Admin-only: list local users (paginated)
router.get("/admin/users", requireAdminAuth, async (req, res) => {
    try {
        const page = req.query?.page;
        const limit = req.query?.limit;
        const search = typeof req.query?.search === "string" ? req.query.search : "";
        const sort = typeof req.query?.sort === "string" ? req.query.sort : "created_at";
        const order = typeof req.query?.order === "string" ? req.query.order : "desc";

        const result = await listUsers({
            page,
            limit,
            search,
            sort,
            order,
        });

        res.json({
            status: "success",
            data: result,
        });
    } catch (error) {
        console.error("GET /user/admin/users error:", error);
        return jsonError(res, 500, "SERVER_ERROR", "Failed to load users");
    }
});

// Admin-only: list credit orders (paginated)
router.get("/admin/orders", requireAdminAuth, async (req, res) => {
    try {
        const page = req.query?.page;
        const limit = req.query?.limit;
        const userId = req.query?.userId;
        const status = typeof req.query?.status === "string" ? req.query.status : "";
        const provider =
            typeof req.query?.provider === "string" ? req.query.provider : "";
        const search = typeof req.query?.search === "string" ? req.query.search : "";
        const sort = typeof req.query?.sort === "string" ? req.query.sort : "created_at";
        const order = typeof req.query?.order === "string" ? req.query.order : "desc";

        const result = await listCreditOrders({
            page,
            limit,
            userId,
            status,
            provider,
            search,
            sort,
            order,
        });

        res.json({
            status: "success",
            data: result,
        });
    } catch (error) {
        console.error("GET /user/admin/orders error:", error);
        return jsonError(res, 500, "SERVER_ERROR", "Failed to load orders");
    }
});

// Admin-only: list user feedback (paginated)
router.get("/admin/feedback", requireAdminAuth, async (req, res) => {
    try {
        const page = req.query?.page;
        const limit = req.query?.limit;
        const search = typeof req.query?.search === "string" ? req.query.search : "";

        const result = await listFeedback({ page, limit, search });

        res.json({
            status: "success",
            data: result,
        });
    } catch (error) {
        console.error("GET /user/admin/feedback error:", error);
        return jsonError(res, 500, "SERVER_ERROR", "Failed to load feedback");
    }
});

// Admin-only: add/update process note for feedback.
router.post("/admin/feedback/:id/process", requireAdminAuth, async (req, res) => {
    try {
        const id = Number.parseInt(req.params?.id, 10);
        if (!Number.isFinite(id) || id <= 0) {
            return jsonError(res, 400, "INVALID_INPUT", "Invalid feedback id");
        }

        const processNoteRaw = req.body?.processNote;
        const processNote =
            typeof processNoteRaw === "string" ? processNoteRaw.trim() : "";

        if (processNote.length > 4000) {
            return jsonError(
                res,
                400,
                "INVALID_INPUT",
                "processNote is too long",
            );
        }

        const updated = await processFeedback({
            id,
            processNote,
        });

        if (!updated) {
            return jsonError(
                res,
                404,
                "NOT_FOUND",
                "Feedback not found",
            );
        }

        return res.json({
            status: "success",
            data: {
                feedback: updated,
            },
        });
    } catch (error) {
        console.error("POST /user/admin/feedback/:id/process error:", error);
        return jsonError(
            res,
            500,
            "SERVER_ERROR",
            "Failed to process feedback",
        );
    }
});

// Admin-only: list promotion submissions (paginated)
router.get("/admin/promotion-submissions", requireAdminAuth, async (req, res) => {
    try {
        const page = req.query?.page;
        const limit = req.query?.limit;
        const search = typeof req.query?.search === "string" ? req.query.search : "";
        const status = typeof req.query?.status === "string" ? req.query.status : "";

        const result = await listPromotionSubmissions({
            page,
            limit,
            search,
            status,
        });

        res.json({
            status: "success",
            data: result,
        });
    } catch (error) {
        console.error("GET /user/admin/promotion-submissions error:", error);
        return jsonError(
            res,
            500,
            "SERVER_ERROR",
            "Failed to load promotion submissions",
        );
    }
});

// Admin-only: review a promotion submission and optionally award points.
router.post(
    "/admin/promotion-submissions/:id/review",
    requireAdminAuth,
    async (req, res) => {
        try {
            const id = Number.parseInt(req.params?.id, 10);
            if (!Number.isFinite(id) || id <= 0) {
                return jsonError(res, 400, "INVALID_INPUT", "Invalid submission id");
            }

            const actionRaw = req.body?.action;
            const action = typeof actionRaw === "string" ? actionRaw.trim().toLowerCase() : "";
            if (action !== "approve" && action !== "reject") {
                return jsonError(
                    res,
                    400,
                    "INVALID_INPUT",
                    "action must be 'approve' or 'reject'",
                );
            }

            const rawAwardedPoints = req.body?.awardedPoints;
            const awardedPoints =
                rawAwardedPoints === undefined || rawAwardedPoints === null || rawAwardedPoints === ""
                    ? undefined
                    : typeof rawAwardedPoints === "string"
                        ? Number.parseInt(rawAwardedPoints, 10)
                        : rawAwardedPoints;

            if (action === "approve") {
                if (
                    awardedPoints !== undefined &&
                    (!Number.isFinite(awardedPoints) ||
                        !Number.isInteger(awardedPoints) ||
                        awardedPoints < 0)
                ) {
                    return jsonError(
                        res,
                        400,
                        "INVALID_INPUT",
                        "awardedPoints must be a non-negative integer",
                    );
                }
            }

            const adminNoteRaw = req.body?.adminNote;
            const adminNote =
                typeof adminNoteRaw === "string" ? adminNoteRaw.trim() : "";
            if (adminNote.length > 4000) {
                return jsonError(
                    res,
                    400,
                    "INVALID_INPUT",
                    "adminNote is too long",
                );
            }

            const result = await reviewPromotionSubmission({
                submissionId: id,
                reviewer: req.user?.username ?? req.user?.email ?? "admin",
                action,
                awardedPoints,
                adminNote: adminNote || null,
            });

            if (!result.ok) {
                if (result.code === "NOT_FOUND") {
                    return jsonError(
                        res,
                        404,
                        "NOT_FOUND",
                        "Promotion submission not found",
                    );
                }

                if (result.code === "ALREADY_REVIEWED") {
                    return jsonError(
                        res,
                        409,
                        "ALREADY_REVIEWED",
                        "Promotion submission has already been reviewed",
                    );
                }

                return jsonError(
                    res,
                    400,
                    "INVALID_INPUT",
                    "Invalid review request",
                );
            }

            return res.json({
                status: "success",
                data: {
                    submission: result.submission,
                    userPointsAfter: result.userPointsAfter ?? null,
                },
            });
        } catch (error) {
            console.error("POST /user/admin/promotion-submissions/:id/review error:", error);
            return jsonError(
                res,
                500,
                "SERVER_ERROR",
                "Failed to review promotion submission",
            );
        }
    },
);

const updatePointsHandler = async (req, res) => {
    try {
        const id = Number.parseInt(req.params?.id, 10);
        if (!Number.isFinite(id) || id <= 0) {
            return jsonError(res, 400, "INVALID_INPUT", "Invalid user id");
        }

        const rawPoints = req.body?.points;
        const points =
            typeof rawPoints === "string"
                ? Number.parseInt(rawPoints, 10)
                : rawPoints;

        if (!Number.isFinite(points) || !Number.isInteger(points) || points < 0) {
            return jsonError(
                res,
                400,
                "INVALID_INPUT",
                "points must be a non-negative integer",
            );
        }

        const user = await updateUserPoints(id, points);
        if (!user) {
            return jsonError(res, 404, "USER_NOT_FOUND", "User not found");
        }

        res.json({
            status: "success",
            data: {
                user,
            },
        });
    } catch (error) {
        console.error(`${req.method} /user/admin/users/:id/points error:`, error);
        return jsonError(res, 500, "SERVER_ERROR", "Failed to update points");
    }
};

// Admin-only: update user points (use POST to keep CORS simple)
router.post("/admin/users/:id/points", requireAdminAuth, updatePointsHandler);
// Optional: allow PATCH as well for REST-style clients.
router.patch("/admin/users/:id/points", requireAdminAuth, updatePointsHandler);

// Admin-only: list credit orders for a user (paginated)
router.get("/admin/users/:id/orders", requireAdminAuth, async (req, res) => {
    try {
        const id = Number.parseInt(req.params?.id, 10);
        if (!Number.isFinite(id) || id <= 0) {
            return jsonError(res, 400, "INVALID_INPUT", "Invalid user id");
        }

        const page = req.query?.page;
        const limit = req.query?.limit;
        const status = typeof req.query?.status === "string" ? req.query.status : "";
        const provider =
            typeof req.query?.provider === "string" ? req.query.provider : "";
        const search = typeof req.query?.search === "string" ? req.query.search : "";
        const sort = typeof req.query?.sort === "string" ? req.query.sort : "created_at";
        const order = typeof req.query?.order === "string" ? req.query.order : "desc";

        const result = await listCreditOrdersForUser({
            userId: id,
            page,
            limit,
            status,
            provider,
            search,
            sort,
            order,
        });

        res.json({
            status: "success",
            data: result,
        });
    } catch (error) {
        console.error("GET /user/admin/users/:id/orders error:", error);
        return jsonError(res, 500, "SERVER_ERROR", "Failed to load user orders");
    }
});

if (!isClerkApiConfigured) {
    router.get("/chat/eligibility", (_, res) => {
        res.status(501).json({
            status: "error",
            error: {
                code: "CLERK_NOT_CONFIGURED",
                message:
                    "Clerk is not configured on this server (missing CLERK_SECRET_KEY)",
            },
        });
    });

    router.get("/me", (_, res) => {
        res.status(501).json({
            status: "error",
            error: {
                code: "CLERK_NOT_CONFIGURED",
                message:
                    "Clerk is not configured on this server (missing CLERK_SECRET_KEY)",
            },
        });
    });

    router.post("/points/consume", (_, res) => {
        res.status(501).json({
            status: "error",
            error: {
                code: "CLERK_NOT_CONFIGURED",
                message:
                    "Clerk is not configured on this server (missing CLERK_SECRET_KEY)",
            },
        });
    });

    router.post("/feedback", (_, res) => {
        res.status(501).json({
            status: "error",
            error: {
                code: "CLERK_NOT_CONFIGURED",
                message:
                    "Clerk is not configured on this server (missing CLERK_SECRET_KEY)",
            },
        });
    });

    router.post("/promotion-submissions", (_, res) => {
        res.status(501).json({
            status: "error",
            error: {
                code: "CLERK_NOT_CONFIGURED",
                message:
                    "Clerk is not configured on this server (missing CLERK_SECRET_KEY)",
            },
        });
    });

    router.get("/promotion-submissions/my", (_, res) => {
        res.status(501).json({
            status: "error",
            error: {
                code: "CLERK_NOT_CONFIGURED",
                message:
                    "Clerk is not configured on this server (missing CLERK_SECRET_KEY)",
            },
        });
    });

    router.get("/feedback/my", (_, res) => {
        res.status(501).json({
            status: "error",
            error: {
                code: "CLERK_NOT_CONFIGURED",
                message:
                    "Clerk is not configured on this server (missing CLERK_SECRET_KEY)",
            },
        });
    });

    router.post("/admin/sync-all", requireAdminAuth, (_, res) => {
        res.status(501).json({
            status: "error",
            error: {
                code: "CLERK_NOT_CONFIGURED",
                message:
                    "Clerk is not configured on this server (missing CLERK_SECRET_KEY)",
            },
        });
    });
} else {
    // Admin-only: sync all Clerk users into local DB (for one-off backfills).
    router.post("/admin/sync-all", requireAdminAuth, async (req, res) => {
        try {
            let offset = 0;
            const limit = 100;
            let synced = 0;
            const failures = [];

            /* Clerk API: paginate through all users */
            while (true) {
                const page = await clerkClient.users.getUserList({
                    limit,
                    offset,
                });

                const clerkUsers = Array.isArray(page)
                    ? page
                    : Array.isArray(page?.data)
                        ? page.data
                        : [];

                for (const clerkUser of clerkUsers) {
                    try {
                        await upsertUserFromClerk(mapClerkUser(clerkUser));
                        synced += 1;
                    } catch (error) {
                        console.error(
                            "Sync clerk user failed:",
                            clerkUser.id,
                            error,
                        );
                        failures.push(clerkUser.id);
                    }
                }

                const totalCount =
                    typeof page?.totalCount === "number" ? page.totalCount : null;
                const hasNext = Array.isArray(page)
                    ? page.length === limit
                    : totalCount != null
                        ? offset + clerkUsers.length < totalCount
                        : clerkUsers.length === limit;

                if (!hasNext) break;
                offset += limit;
            }

            res.json({
                status: "success",
                data: {
                    synced,
                    failed: failures,
                },
            });
        } catch (error) {
            console.error("POST /user/admin/sync-all error:", error);
            res.status(500).json({
                status: "error",
                error: {
                    code: "SYNC_FAILED",
                    message: "Failed to sync Clerk users",
                },
            });
        }
    });

    if (!isClerkAuthConfigured) {
        router.get("/chat/eligibility", (_, res) => {
            res.status(501).json({
                status: "error",
                error: {
                    code: "CLERK_NOT_CONFIGURED",
                    message:
                        "Clerk request auth is not configured on this server (missing CLERK_PUBLISHABLE_KEY)",
                },
            });
        });

        router.get("/me", (_, res) => {
            res.status(501).json({
                status: "error",
                error: {
                    code: "CLERK_NOT_CONFIGURED",
                    message:
                        "Clerk request auth is not configured on this server (missing CLERK_PUBLISHABLE_KEY)",
                },
            });
        });

        router.post("/points/consume", (_, res) => {
            res.status(501).json({
                status: "error",
                error: {
                    code: "CLERK_NOT_CONFIGURED",
                    message:
                        "Clerk request auth is not configured on this server (missing CLERK_PUBLISHABLE_KEY)",
                },
            });
        });

        router.post("/feedback", (_, res) => {
            res.status(501).json({
                status: "error",
                error: {
                    code: "CLERK_NOT_CONFIGURED",
                    message:
                        "Clerk request auth is not configured on this server (missing CLERK_PUBLISHABLE_KEY)",
                },
            });
        });

        router.post("/promotion-submissions", (_, res) => {
            res.status(501).json({
                status: "error",
                error: {
                    code: "CLERK_NOT_CONFIGURED",
                    message:
                        "Clerk request auth is not configured on this server (missing CLERK_PUBLISHABLE_KEY)",
                },
            });
        });

        router.get("/promotion-submissions/my", (_, res) => {
            res.status(501).json({
                status: "error",
                error: {
                    code: "CLERK_NOT_CONFIGURED",
                    message:
                        "Clerk request auth is not configured on this server (missing CLERK_PUBLISHABLE_KEY)",
                },
            });
        });

        router.get("/feedback/my", (_, res) => {
            res.status(501).json({
                status: "error",
                error: {
                    code: "CLERK_NOT_CONFIGURED",
                    message:
                        "Clerk request auth is not configured on this server (missing CLERK_PUBLISHABLE_KEY)",
                },
            });
        });
    } else {
        router.use(clerkMiddleware());

        const ensureLocalUserByClerkId = async (clerkUserId) => {
            const existing = await getUserByClerkId(clerkUserId);
            if (existing) return existing;

            const clerkUser = await clerkClient.users.getUser(clerkUserId);
            return upsertUserFromClerk(mapClerkUser(clerkUser));
        };

        router.get("/me", async (req, res) => {
            try {
                const auth = getAuth(req);
                if (!auth.userId) {
                    return res.status(401).json({
                        status: "error",
                        error: {
                            code: "UNAUTHORIZED",
                            message: "Unauthenticated",
                        },
                    });
                }

                const clerkUser = await clerkClient.users.getUser(auth.userId);
                const user = await upsertUserFromClerk(mapClerkUser(clerkUser));

                res.json({
                    status: "success",
                    data: {
                        user,
                    },
                });
            } catch (error) {
                console.error("GET /user/me error:", error);
                res.status(500).json({
                    status: "error",
                    error: {
                        code: "SERVER_ERROR",
                        message: "Failed to load user profile",
                    },
                });
            }
        });

        router.get("/chat/eligibility", async (req, res) => {
            try {
                const auth = getAuth(req);
                if (!auth.userId) {
                    return jsonError(
                        res,
                        401,
                        "UNAUTHORIZED",
                        "Unauthenticated",
                    );
                }

                const hasPaidOrder = requirePaidForRandomChat
                    ? await hasPaidCreditOrderByClerkUserId(auth.userId)
                    : true;

                const eligible = requirePaidForRandomChat
                    ? hasPaidOrder
                    : true;

                return res.json({
                    status: "success",
                    data: {
                        eligible,
                        hasPaidOrder,
                        requirePaidOrder: requirePaidForRandomChat,
                    },
                });
            } catch (error) {
                console.error("GET /user/chat/eligibility error:", error);
                return jsonError(
                    res,
                    500,
                    "SERVER_ERROR",
                    "Failed to verify chat eligibility",
                );
            }
        });

        router.get("/clipboard/personal", async (req, res) => {
            try {
                const auth = getAuth(req);
                if (!auth.userId) {
                    return jsonError(
                        res,
                        401,
                        "UNAUTHORIZED",
                        "Unauthenticated",
                    );
                }

                await ensureLocalUserByClerkId(auth.userId);

                const profile = await getOrCreateClipboardPersonalProfile(auth.userId);
                if (!profile) {
                    return jsonError(res, 404, "USER_NOT_FOUND", "User not found");
                }

                const sessionId = buildClipboardPersonalSessionId(
                    auth.userId,
                    profile.codeVersion,
                );
                const runtime = getClipboardPersonalSessionRuntime(sessionId);

                return res.json({
                    status: "success",
                    data: {
                        personalCode: profile.personalCode,
                        codeVersion: profile.codeVersion,
                        hasActiveSession: runtime.hasActiveSession,
                        activeSession: runtime.hasActiveSession
                            ? {
                                sessionId,
                                onlinePeers: runtime.onlinePeers,
                                maxPeers: runtime.maxPeers,
                                expiresAt: runtime.expiresAt,
                            }
                            : null,
                    },
                });
            } catch (error) {
                console.error("GET /user/clipboard/personal error:", error);
                return jsonError(
                    res,
                    500,
                    "SERVER_ERROR",
                    "Failed to load personal clipboard session",
                );
            }
        });

        router.post("/clipboard/personal/open", async (req, res) => {
            try {
                const auth = getAuth(req);
                if (!auth.userId) {
                    return jsonError(
                        res,
                        401,
                        "UNAUTHORIZED",
                        "Unauthenticated",
                    );
                }

                const parsed = parseClipboardDeviceInput(req.body);
                if (!parsed.ok) {
                    return jsonError(res, 422, "INVALID_DEVICE", parsed.message);
                }

                await ensureLocalUserByClerkId(auth.userId);
                const profile = await getOrCreateClipboardPersonalProfile(auth.userId);
                if (!profile) {
                    return jsonError(res, 404, "USER_NOT_FOUND", "User not found");
                }

                const sessionId = buildClipboardPersonalSessionId(
                    auth.userId,
                    profile.codeVersion,
                );
                const ticket = createClipboardPersonalWsTicket({
                    clerkUserId: auth.userId,
                    sessionId,
                    deviceId: parsed.deviceId,
                    codeVersion: profile.codeVersion,
                    action: "create",
                });

                await touchClipboardPersonalDevice({
                    clerkUserId: auth.userId,
                    deviceId: parsed.deviceId,
                    deviceName: parsed.deviceName,
                    platform: parsed.platform,
                    ip: req.ip || null,
                    userAgent:
                        typeof req.headers?.["user-agent"] === "string"
                            ? req.headers["user-agent"]
                            : null,
                });

                const runtime = getClipboardPersonalSessionRuntime(sessionId);

                return res.json({
                    status: "success",
                    data: {
                        sessionType: "personal",
                        sessionId,
                        personalCode: profile.personalCode,
                        codeVersion: profile.codeVersion,
                        maxPeers: runtime.maxPeers,
                        onlinePeers: runtime.onlinePeers,
                        wsTicket: ticket.token,
                        wsTicketExpiresAt: ticket.expiresAt,
                    },
                });
            } catch (error) {
                console.error("POST /user/clipboard/personal/open error:", error);
                return jsonError(
                    res,
                    500,
                    "SERVER_ERROR",
                    "Failed to open personal clipboard session",
                );
            }
        });

        router.post("/clipboard/personal/join", async (req, res) => {
            try {
                const auth = getAuth(req);
                if (!auth.userId) {
                    return jsonError(
                        res,
                        401,
                        "UNAUTHORIZED",
                        "Unauthenticated",
                    );
                }

                const parsed = parseClipboardDeviceInput(req.body);
                if (!parsed.ok) {
                    return jsonError(res, 422, "INVALID_DEVICE", parsed.message);
                }

                await ensureLocalUserByClerkId(auth.userId);
                const profile = await getOrCreateClipboardPersonalProfile(auth.userId);
                if (!profile) {
                    return jsonError(res, 404, "USER_NOT_FOUND", "User not found");
                }

                const sessionId = buildClipboardPersonalSessionId(
                    auth.userId,
                    profile.codeVersion,
                );
                const ticket = createClipboardPersonalWsTicket({
                    clerkUserId: auth.userId,
                    sessionId,
                    deviceId: parsed.deviceId,
                    codeVersion: profile.codeVersion,
                    action: "join",
                });

                await touchClipboardPersonalDevice({
                    clerkUserId: auth.userId,
                    deviceId: parsed.deviceId,
                    deviceName: parsed.deviceName,
                    platform: parsed.platform,
                    ip: req.ip || null,
                    userAgent:
                        typeof req.headers?.["user-agent"] === "string"
                            ? req.headers["user-agent"]
                            : null,
                });

                const runtime = getClipboardPersonalSessionRuntime(sessionId);

                return res.json({
                    status: "success",
                    data: {
                        sessionType: "personal",
                        sessionId,
                        codeVersion: profile.codeVersion,
                        maxPeers: runtime.maxPeers,
                        onlinePeers: runtime.onlinePeers,
                        wsTicket: ticket.token,
                        wsTicketExpiresAt: ticket.expiresAt,
                    },
                });
            } catch (error) {
                console.error("POST /user/clipboard/personal/join error:", error);
                return jsonError(
                    res,
                    500,
                    "SERVER_ERROR",
                    "Failed to join personal clipboard session",
                );
            }
        });

        router.post("/clipboard/personal/reset-code", async (req, res) => {
            try {
                const auth = getAuth(req);
                if (!auth.userId) {
                    return jsonError(
                        res,
                        401,
                        "UNAUTHORIZED",
                        "Unauthenticated",
                    );
                }

                await ensureLocalUserByClerkId(auth.userId);
                const rotated = await rotateClipboardPersonalCode(auth.userId);
                if (!rotated) {
                    return jsonError(res, 404, "USER_NOT_FOUND", "User not found");
                }

                const previousSessionId = buildClipboardPersonalSessionId(
                    auth.userId,
                    rotated.previousCodeVersion,
                );
                const invalidation = invalidateClipboardPersonalSession(
                    previousSessionId,
                    "PERSONAL_CODE_ROTATED",
                );

                return res.json({
                    status: "success",
                    data: {
                        personalCode: rotated.personalCode,
                        codeVersion: rotated.codeVersion,
                        rotatedAt: rotated.rotatedAt,
                        invalidatedSessionId: invalidation.invalidated
                            ? previousSessionId
                            : null,
                        kickedPeers: invalidation.kickedPeers,
                    },
                });
            } catch (error) {
                console.error("POST /user/clipboard/personal/reset-code error:", error);
                return jsonError(
                    res,
                    500,
                    "SERVER_ERROR",
                    "Failed to reset personal clipboard code",
                );
            }
        });

        router.post("/referrals/claim", async (req, res) => {
            try {
                const auth = getAuth(req);
                if (!auth.userId) {
                    return jsonError(
                        res,
                        401,
                        "UNAUTHORIZED",
                        "Unauthenticated",
                    );
                }

                const rawCode =
                    req.body?.code ??
                    req.body?.referralCode ??
                    req.body?.referral_code ??
                    "";

                const referralCode =
                    typeof rawCode === "string" ? rawCode.trim() : "";

                if (!referralCode) {
                    return jsonError(
                        res,
                        400,
                        "INVALID_INPUT",
                        "referral code is required",
                    );
                }

                if (referralCode.length > 64) {
                    return jsonError(
                        res,
                        400,
                        "INVALID_INPUT",
                        "referral code is too long",
                    );
                }

                const clerkUser = await clerkClient.users.getUser(auth.userId);
                const clerkCreatedAt =
                    typeof clerkUser?.createdAt === "number"
                        ? clerkUser.createdAt
                        : null;

                if (
                    clerkCreatedAt != null &&
                    Date.now() - clerkCreatedAt > REFERRAL_CLAIM_MAX_AGE_MS
                ) {
                    return jsonError(
                        res,
                        400,
                        "REFERRAL_TOO_OLD",
                        "Referral claim window expired",
                    );
                }

                const user = await upsertUserFromClerk(mapClerkUser(clerkUser));

                const result = await claimReferralReward({
                    referralCode,
                    referredUserId: user.id,
                });

                if (!result.ok) {
                    if (result.code === "INVALID_CODE") {
                        return jsonError(
                            res,
                            404,
                            "INVALID_CODE",
                            "Referral code not found",
                        );
                    }

                    if (result.code === "SELF_REFERRAL") {
                        return jsonError(
                            res,
                            400,
                            "SELF_REFERRAL",
                            "Cannot refer yourself",
                        );
                    }

                    return jsonError(
                        res,
                        500,
                        "SERVER_ERROR",
                        "Failed to claim referral reward",
                    );
                }

                return res.json({
                    status: "success",
                    data: {
                        claimed: !!result.claimed,
                        rewardedPoints: result.claimed
                            ? result.rewardedPoints ?? 0
                            : 0,
                    },
                });
            } catch (error) {
                console.error("POST /user/referrals/claim error:", error);
                return jsonError(
                    res,
                    500,
                    "SERVER_ERROR",
                    "Failed to claim referral reward",
                );
            }
        });

        router.post("/points/consume", async (req, res) => {
            try {
                const auth = getAuth(req);
                if (!auth.userId) {
                    return jsonError(
                        res,
                        401,
                        "UNAUTHORIZED",
                        "Unauthenticated",
                    );
                }

                const rawPoints = req.body?.points;
                const points =
                    typeof rawPoints === "string"
                        ? Number.parseInt(rawPoints, 10)
                        : rawPoints;

                if (
                    !Number.isFinite(points) ||
                    !Number.isInteger(points) ||
                    points <= 0
                ) {
                    return jsonError(
                        res,
                        400,
                        "INVALID_INPUT",
                        "points must be a positive integer",
                    );
                }

                const clerkUser = await clerkClient.users.getUser(auth.userId);
                const user = await upsertUserFromClerk(mapClerkUser(clerkUser));

                const updated = await consumeUserPoints(user.id, points);
                if (!updated) {
                    return jsonError(
                        res,
                        409,
                        "INSUFFICIENT_POINTS",
                        "Not enough points",
                    );
                }

                return res.json({
                    status: "success",
                    data: {
                        user: updated,
                        deducted: points,
                    },
                });
            } catch (error) {
                console.error("POST /user/points/consume error:", error);
                return jsonError(
                    res,
                    500,
                    "SERVER_ERROR",
                    "Failed to deduct points",
                );
            }
        });

        router.post("/points/hold/finalize", async (req, res) => {
            try {
                const auth = getAuth(req);
                if (!auth.userId) {
                    return jsonError(
                        res,
                        401,
                        "UNAUTHORIZED",
                        "Unauthenticated",
                    );
                }

                const rawHoldId = req.body?.holdId ?? req.body?.hold_id ?? "";
                const holdId =
                    typeof rawHoldId === "string" ? rawHoldId.trim() : "";

                if (!holdId) {
                    return jsonError(
                        res,
                        400,
                        "INVALID_INPUT",
                        "holdId is required",
                    );
                }

                const logContext = buildHoldLogContext(req);
                console.log(`[hold-finalize] Request: userId=${auth.userId} holdId=${holdId} context=${JSON.stringify(logContext)}`);

                const clerkUser = await clerkClient.users.getUser(auth.userId);
                const user = await upsertUserFromClerk(mapClerkUser(clerkUser));

                const result = await finalizePointsHold({
                    userId: user.id,
                    holdId,
                    reason: req.body?.reason ?? null,
                });

                console.log(
                    `[hold-finalize] Result: request_id=${logContext.requestId ?? "none"} userId=${user.id} holdId=${holdId} ok=${result.ok} status=${result.status ?? "none"} charged=${result.charged ?? "none"} code=${result.code ?? "none"}`,
                );

                if (!result.ok) {
                    if (result.code === "HOLD_NOT_FOUND") {
                        return jsonError(
                            res,
                            404,
                            "HOLD_NOT_FOUND",
                            "Hold not found",
                        );
                    }

                    if (result.code === "HOLD_EXPIRED") {
                        return jsonError(
                            res,
                            410,
                            "HOLD_EXPIRED",
                            "Hold expired",
                        );
                    }

                    if (result.code === "INSUFFICIENT_POINTS") {
                        return jsonError(
                            res,
                            409,
                            "INSUFFICIENT_POINTS",
                            "Not enough points",
                        );
                    }

                    return jsonError(
                        res,
                        500,
                        "SERVER_ERROR",
                        "Failed to finalize points hold",
                    );
                }


                return res.json({
                    status: "success",
                    data: {
                        holdId,
                        status: result.status,
                        charged: result.charged ?? 0,
                        before: result.pointsBefore ?? null,
                        after: result.pointsAfter ?? null,
                    },
                });
            } catch (error) {
                console.error("POST /user/points/hold/finalize error:", error);
                return jsonError(
                    res,
                    500,
                    "SERVER_ERROR",
                    "Failed to finalize points hold",
                );
            }
        });

        router.post("/points/hold/release", async (req, res) => {
            try {
                const auth = getAuth(req);
                if (!auth.userId) {
                    return jsonError(
                        res,
                        401,
                        "UNAUTHORIZED",
                        "Unauthenticated",
                    );
                }

                const rawHoldId = req.body?.holdId ?? req.body?.hold_id ?? "";
                const holdId =
                    typeof rawHoldId === "string" ? rawHoldId.trim() : "";

                if (!holdId) {
                    return jsonError(
                        res,
                        400,
                        "INVALID_INPUT",
                        "holdId is required",
                    );
                }

                const logContext = buildHoldLogContext(req);
                console.log(`[hold-release] Request: userId=${auth.userId} holdId=${holdId} context=${JSON.stringify(logContext)}`);

                const clerkUser = await clerkClient.users.getUser(auth.userId);
                const user = await upsertUserFromClerk(mapClerkUser(clerkUser));

                const result = await releasePointsHold({
                    userId: user.id,
                    holdId,
                    reason: req.body?.reason ?? null,
                });

                console.log(`[hold-release] Result: request_id=${logContext.requestId ?? "none"} userId=${user.id} holdId=${holdId} ok=${result.ok} status=${result.status ?? 'none'} code=${result.code ?? 'none'}`);

                if (!result.ok) {
                    if (result.code === "HOLD_NOT_FOUND") {
                        return jsonError(
                            res,
                            404,
                            "HOLD_NOT_FOUND",
                            "Hold not found",
                        );
                    }

                    return jsonError(
                        res,
                        500,
                        "SERVER_ERROR",
                        "Failed to release points hold",
                    );
                }


                return res.json({
                    status: "success",
                    data: {
                        holdId,
                        status: result.status,
                    },
                });
            } catch (error) {
                console.error("POST /user/points/hold/release error:", error);
                return jsonError(
                    res,
                    500,
                    "SERVER_ERROR",
                    "Failed to release points hold",
                );
            }
        });

        router.get("/collection-memory", async (req, res) => {
            try {
                const auth = getAuth(req);
                if (!auth.userId) {
                    return jsonError(
                        res,
                        401,
                        "UNAUTHORIZED",
                        "Unauthenticated",
                    );
                }

                const collectionKey =
                    typeof req.query?.collectionKey === "string"
                        ? req.query.collectionKey.trim()
                        : "";

                if (!collectionKey) {
                    return jsonError(
                        res,
                        400,
                        "INVALID_INPUT",
                        "collectionKey is required",
                    );
                }

                const clerkUser = await clerkClient.users.getUser(auth.userId);
                const user = await upsertUserFromClerk(mapClerkUser(clerkUser));

                const { memory, itemKeys } =
                    await getDownloadedItemKeysForCollection({
                        userId: user.id,
                        collectionKey,
                    });

                return res.json({
                    status: "success",
                    data: {
                        collection: memory
                            ? {
                                collectionKey: memory.collection_key,
                                service: memory.service,
                                kind: memory.kind,
                                collectionId: memory.collection_id,
                                title: memory.title,
                                sourceUrl: memory.source_url,
                                lastMarkedAt: memory.last_marked_at,
                            }
                            : null,
                        downloadedItemKeys: itemKeys,
                    },
                });
            } catch (error) {
                console.error("GET /user/collection-memory error:", error);
                return jsonError(
                    res,
                    500,
                    "SERVER_ERROR",
                    "Failed to load collection memory",
                );
            }
        });

        router.post("/collection-memory/mark", async (req, res) => {
            try {
                const auth = getAuth(req);
                if (!auth.userId) {
                    return jsonError(
                        res,
                        401,
                        "UNAUTHORIZED",
                        "Unauthenticated",
                    );
                }

                const collectionKeyRaw = req.body?.collectionKey;
                const collectionKey =
                    typeof collectionKeyRaw === "string"
                        ? collectionKeyRaw.trim()
                        : "";

                if (!collectionKey) {
                    return jsonError(
                        res,
                        400,
                        "INVALID_INPUT",
                        "collectionKey is required",
                    );
                }

                const items = Array.isArray(req.body?.items) ? req.body.items : [];
                if (!items.length) {
                    return res.json({
                        status: "success",
                        data: { added: 0, updated: 0 },
                    });
                }

                const title =
                    typeof req.body?.title === "string" ? req.body.title : undefined;
                const sourceUrl =
                    typeof req.body?.sourceUrl === "string"
                        ? req.body.sourceUrl
                        : undefined;

                const clerkUser = await clerkClient.users.getUser(auth.userId);
                const user = await upsertUserFromClerk(mapClerkUser(clerkUser));

                const result = await markDownloadedItemsForCollection({
                    userId: user.id,
                    collectionKey,
                    title,
                    sourceUrl,
                    items,
                });

                if (!result.ok) {
                    return jsonError(
                        res,
                        400,
                        "INVALID_INPUT",
                        "Invalid collection memory payload",
                    );
                }

                return res.json({
                    status: "success",
                    data: {
                        added: result.added ?? 0,
                        updated: result.updated ?? 0,
                    },
                });
            } catch (error) {
                console.error("POST /user/collection-memory/mark error:", error);
                return jsonError(
                    res,
                    500,
                    "SERVER_ERROR",
                    "Failed to mark collection memory",
                );
            }
        });

        router.post("/collection-memory/clear", async (req, res) => {
            try {
                const auth = getAuth(req);
                if (!auth.userId) {
                    return jsonError(
                        res,
                        401,
                        "UNAUTHORIZED",
                        "Unauthenticated",
                    );
                }

                const collectionKeyRaw = req.body?.collectionKey;
                const collectionKey =
                    typeof collectionKeyRaw === "string"
                        ? collectionKeyRaw.trim()
                        : "";

                if (!collectionKey) {
                    return jsonError(
                        res,
                        400,
                        "INVALID_INPUT",
                        "collectionKey is required",
                    );
                }

                const clerkUser = await clerkClient.users.getUser(auth.userId);
                const user = await upsertUserFromClerk(mapClerkUser(clerkUser));

                const result = await clearCollectionMemoryForUser({
                    userId: user.id,
                    collectionKey,
                });

                if (!result.ok) {
                    return jsonError(
                        res,
                        400,
                        "INVALID_INPUT",
                        "Invalid collectionKey",
                    );
                }

                return res.json({
                    status: "success",
                    data: { deleted: result.deleted ?? 0 },
                });
            } catch (error) {
                console.error("POST /user/collection-memory/clear error:", error);
                return jsonError(
                    res,
                    500,
                    "SERVER_ERROR",
                    "Failed to clear collection memory",
                );
            }
        });

        router.get("/promotion-submissions/my", async (req, res) => {
            try {
                const auth = getAuth(req);
                if (!auth.userId) {
                    return jsonError(
                        res,
                        401,
                        "UNAUTHORIZED",
                        "Unauthenticated",
                    );
                }

                const page = req.query?.page;
                const limit = req.query?.limit;

                const result = await listPromotionSubmissionsForUser({
                    clerkUserId: auth.userId,
                    page,
                    limit,
                });

                return res.json({
                    status: "success",
                    data: result,
                });
            } catch (error) {
                console.error("GET /user/promotion-submissions/my error:", error);
                return jsonError(
                    res,
                    500,
                    "SERVER_ERROR",
                    "Failed to load promotion submissions",
                );
            }
        });

        router.post("/promotion-submissions", async (req, res) => {
            try {
                const auth = getAuth(req);
                if (!auth.userId) {
                    return jsonError(
                        res,
                        401,
                        "UNAUTHORIZED",
                        "Unauthenticated",
                    );
                }

                const rawPromotionType =
                    req.body?.promotionType ??
                    req.body?.type ??
                    req.body?.promotion_type;
                const promotionType =
                    typeof rawPromotionType === "string"
                        ? rawPromotionType.trim().toLowerCase()
                        : "";

                const rawAccessMethod =
                    req.body?.accessMethod ??
                    req.body?.access_method ??
                    req.body?.access;
                const accessMethod =
                    typeof rawAccessMethod === "string" ? rawAccessMethod.trim() : "";

                if (!promotionType) {
                    return jsonError(
                        res,
                        400,
                        "INVALID_INPUT",
                        "promotionType is required",
                    );
                }

                const typeConfig = getPromotionTypeConfig(promotionType);
                if (!typeConfig) {
                    return jsonError(
                        res,
                        400,
                        "INVALID_INPUT",
                        "promotionType must be 'post' or 'video'",
                    );
                }

                if (!accessMethod) {
                    return jsonError(
                        res,
                        400,
                        "INVALID_INPUT",
                        "accessMethod is required",
                    );
                }

                if (accessMethod.length > 4000) {
                    return jsonError(
                        res,
                        400,
                        "INVALID_INPUT",
                        "accessMethod is too long",
                    );
                }

                const clerkUser = await clerkClient.users.getUser(auth.userId);
                const user = await upsertUserFromClerk(mapClerkUser(clerkUser));

                const created = await createPromotionSubmission({
                    userId: user.id,
                    clerkUserId: auth.userId,
                    promotionType: typeConfig.key,
                    accessMethod,
                });

                if (!created.ok) {
                    return jsonError(
                        res,
                        400,
                        "INVALID_INPUT",
                        "Invalid promotion submission",
                    );
                }

                return res.json({
                    status: "success",
                    data: {
                        submission: created.submission,
                    },
                });
            } catch (error) {
                console.error("POST /user/promotion-submissions error:", error);
                return jsonError(
                    res,
                    500,
                    "SERVER_ERROR",
                    "Failed to submit promotion request",
                );
            }
        });

        router.get("/feedback/my", async (req, res) => {
            try {
                const auth = getAuth(req);
                if (!auth.userId) {
                    return jsonError(
                        res,
                        401,
                        "UNAUTHORIZED",
                        "Unauthenticated",
                    );
                }

                const page = req.query?.page;
                const limit = req.query?.limit;

                const result = await listFeedbackForUser({
                    clerkUserId: auth.userId,
                    page,
                    limit,
                });

                return res.json({
                    status: "success",
                    data: result,
                });
            } catch (error) {
                console.error("GET /user/feedback/my error:", error);
                return jsonError(
                    res,
                    500,
                    "SERVER_ERROR",
                    "Failed to load feedback",
                );
            }
        });

        router.post("/feedback", async (req, res) => {
            try {
                const auth = getAuth(req);
                if (!auth.userId) {
                    return jsonError(
                        res,
                        401,
                        "UNAUTHORIZED",
                        "Unauthenticated",
                    );
                }

                const videoUrlRaw = req.body?.videoUrl;
                const phenomenonRaw = req.body?.phenomenon;
                const suggestionRaw = req.body?.suggestion;

                const videoUrl =
                    typeof videoUrlRaw === "string" ? videoUrlRaw.trim() : "";
                const phenomenon =
                    typeof phenomenonRaw === "string" ? phenomenonRaw.trim() : "";
                const suggestion =
                    typeof suggestionRaw === "string"
                        ? suggestionRaw.trim()
                        : "";

                if (!videoUrl) {
                    return jsonError(
                        res,
                        400,
                        "INVALID_INPUT",
                        "videoUrl is required",
                    );
                }

                if (!phenomenon) {
                    return jsonError(
                        res,
                        400,
                        "INVALID_INPUT",
                        "phenomenon is required",
                    );
                }

                if (videoUrl.length > 2048) {
                    return jsonError(
                        res,
                        400,
                        "INVALID_INPUT",
                        "videoUrl is too long",
                    );
                }

                if (phenomenon.length > 8000) {
                    return jsonError(
                        res,
                        400,
                        "INVALID_INPUT",
                        "phenomenon is too long",
                    );
                }

                if (suggestion.length > 8000) {
                    return jsonError(
                        res,
                        400,
                        "INVALID_INPUT",
                        "suggestion is too long",
                    );
                }

                const clerkUser = await clerkClient.users.getUser(auth.userId);
                const user = await upsertUserFromClerk(mapClerkUser(clerkUser));

                const feedback = await createFeedback({
                    userId: user.id,
                    clerkUserId: auth.userId,
                    videoUrl,
                    phenomenon,
                    suggestion: suggestion || null,
                });

                res.json({
                    status: "success",
                    data: {
                        feedback,
                    },
                });
            } catch (error) {
                console.error("POST /user/feedback error:", error);
                return jsonError(
                    res,
                    500,
                    "SERVER_ERROR",
                    "Failed to submit feedback",
                );
            }
        });
    }
}

export default router;
