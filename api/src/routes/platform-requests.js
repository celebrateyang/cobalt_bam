import express from "express";
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";

import {
    createPlatformRequest,
    findPlatformRequestByDomain,
    getPlatformRequest,
    listPlatformRequests,
    platformRequestStatuses,
    setPlatformRequestVote,
    updatePlatformRequest,
} from "../db/platform-requests.js";
import {
    getUserByClerkId,
    upsertUserFromClerk,
} from "../db/users.js";
import { requireAuth as requireAdminAuth } from "../middleware/admin-auth.js";
import { normalizePlatformDomain } from "../processing/platform-domain.js";
import { identifyService } from "../processing/url.js";

const router = express.Router();
const isClerkAuthConfigured = !!process.env.CLERK_SECRET_KEY && !!process.env.CLERK_PUBLISHABLE_KEY;

if (isClerkAuthConfigured) router.use(clerkMiddleware());

const jsonError = (res, status, code, message) => res.status(status).json({
    status: "error",
    error: { code, message },
});

const getOptionalClerkUserId = (req) => {
    if (!isClerkAuthConfigured) return null;
    try {
        return getAuth(req).userId || null;
    } catch {
        return null;
    }
};

const mapClerkUser = (clerkUser) => ({
    clerkUserId: clerkUser.id,
    primaryEmail:
        clerkUser.emailAddresses?.find((item) => item.id === clerkUser.primaryEmailAddressId)?.emailAddress
        ?? clerkUser.emailAddresses?.[0]?.emailAddress
        ?? null,
    fullName:
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ")
        || clerkUser.username
        || null,
    avatarUrl: clerkUser.imageUrl,
});

const requireLocalUser = async (req, res) => {
    if (!isClerkAuthConfigured) {
        jsonError(res, 503, "AUTH_NOT_CONFIGURED", "Authentication is not configured");
        return null;
    }

    const clerkUserId = getOptionalClerkUserId(req);
    if (!clerkUserId) {
        jsonError(res, 401, "UNAUTHORIZED", "Sign in is required");
        return null;
    }

    let user = await getUserByClerkId(clerkUserId);
    if (!user) {
        const clerkUser = await clerkClient.users.getUser(clerkUserId);
        user = await upsertUserFromClerk(mapClerkUser(clerkUser));
    }
    if (user?.is_disabled) {
        jsonError(res, 403, "ACCOUNT_DISABLED", "This account is disabled");
        return null;
    }
    return user;
};

const previewPlatform = async (value, clerkUserId = null) => {
    const platform = normalizePlatformDomain(value);
    if (!platform) return { result: "invalid" };

    const identified = identifyService(new URL(platform.homepageUrl));
    if (identified) {
        return {
            result: "already_supported",
            domain: platform.domain,
            homepageUrl: platform.homepageUrl,
            service: identified.service,
            temporarilyDisabled: !identified.enabled,
        };
    }

    const existing = await findPlatformRequestByDomain(platform.domain, clerkUserId);
    if (existing) {
        return {
            result: "already_requested",
            domain: platform.domain,
            homepageUrl: platform.homepageUrl,
            request: existing,
        };
    }

    return {
        result: "new",
        domain: platform.domain,
        homepageUrl: platform.homepageUrl,
    };
};

router.get("/admin", requireAdminAuth, async (req, res) => {
    try {
        const data = await listPlatformRequests({
            page: req.query.page,
            limit: req.query.limit,
            sort: req.query.sort,
            status: req.query.status,
            search: req.query.search,
        });
        res.json({ status: "success", data });
    } catch (error) {
        console.error("GET /platform-requests/admin error:", error);
        jsonError(res, 500, "SERVER_ERROR", "Failed to load platform requests");
    }
});

router.patch("/admin/:id", requireAdminAuth, async (req, res) => {
    try {
        const id = Number.parseInt(req.params.id, 10);
        const status = typeof req.body?.status === "string" ? req.body.status : "";
        const adminNote = typeof req.body?.adminNote === "string"
            ? req.body.adminNote.trim().slice(0, 2000) || null
            : null;
        if (!Number.isSafeInteger(id) || id <= 0 || !platformRequestStatuses.has(status)) {
            return jsonError(res, 400, "INVALID_REQUEST", "Invalid platform request update");
        }

        const request = await updatePlatformRequest({ id, status, adminNote });
        if (!request) return jsonError(res, 404, "NOT_FOUND", "Platform request not found");
        res.json({ status: "success", data: { request } });
    } catch (error) {
        console.error("PATCH /platform-requests/admin/:id error:", error);
        jsonError(res, 500, "SERVER_ERROR", "Failed to update platform request");
    }
});

router.get("/", async (req, res) => {
    try {
        const data = await listPlatformRequests({
            page: req.query.page,
            limit: req.query.limit,
            sort: req.query.sort,
            status: req.query.status,
            search: req.query.search,
            clerkUserId: getOptionalClerkUserId(req),
        });
        res.json({ status: "success", data });
    } catch (error) {
        console.error("GET /platform-requests error:", error);
        jsonError(res, 500, "SERVER_ERROR", "Failed to load platform requests");
    }
});

router.post("/preview", async (req, res) => {
    try {
        const preview = await previewPlatform(req.body?.url, getOptionalClerkUserId(req));
        if (preview.result === "invalid") {
            return jsonError(res, 400, "INVALID_URL", "Enter a valid public website URL or domain");
        }
        res.json({ status: "success", data: preview });
    } catch (error) {
        console.error("POST /platform-requests/preview error:", error);
        jsonError(res, 500, "SERVER_ERROR", "Failed to preview platform request");
    }
});

router.post("/", async (req, res) => {
    try {
        const user = await requireLocalUser(req, res);
        if (!user) return;

        const preview = await previewPlatform(req.body?.url, user.clerk_user_id);
        if (preview.result === "invalid") {
            return jsonError(res, 400, "INVALID_URL", "Enter a valid public website URL or domain");
        }
        if (preview.result === "already_supported") {
            return res.json({ status: "success", data: preview });
        }
        if (preview.result === "already_requested") {
            return res.json({ status: "success", data: preview });
        }

        const source = req.body?.source === "unsupported_download"
            ? "unsupported_download"
            : "request_page";
        const created = await createPlatformRequest({
            domain: preview.domain,
            homepageUrl: preview.homepageUrl,
            userId: user.id,
            clerkUserId: user.clerk_user_id,
            source,
        });
        res.status(created.created ? 201 : 200).json({
            status: "success",
            data: {
                result: created.created ? "created" : "already_requested",
                domain: preview.domain,
                homepageUrl: preview.homepageUrl,
                request: created.request,
            },
        });
    } catch (error) {
        console.error("POST /platform-requests error:", error);
        jsonError(res, 500, "SERVER_ERROR", "Failed to create platform request");
    }
});

router.post("/:id/vote", async (req, res) => {
    try {
        const user = await requireLocalUser(req, res);
        if (!user) return;
        const id = Number.parseInt(req.params.id, 10);
        if (!Number.isSafeInteger(id) || id <= 0) return jsonError(res, 400, "INVALID_REQUEST", "Invalid request id");
        const request = await setPlatformRequestVote({
            requestId: id,
            userId: user.id,
            clerkUserId: user.clerk_user_id,
            voted: true,
        });
        if (!request) return jsonError(res, 404, "NOT_FOUND", "Platform request not found");
        res.json({ status: "success", data: { request } });
    } catch (error) {
        console.error("POST /platform-requests/:id/vote error:", error);
        jsonError(res, 500, "SERVER_ERROR", "Failed to vote for platform request");
    }
});

router.delete("/:id/vote", async (req, res) => {
    try {
        const user = await requireLocalUser(req, res);
        if (!user) return;
        const id = Number.parseInt(req.params.id, 10);
        if (!Number.isSafeInteger(id) || id <= 0) return jsonError(res, 400, "INVALID_REQUEST", "Invalid request id");
        const request = await setPlatformRequestVote({
            requestId: id,
            userId: user.id,
            clerkUserId: user.clerk_user_id,
            voted: false,
        });
        if (!request) return jsonError(res, 404, "NOT_FOUND", "Platform request not found");
        res.json({ status: "success", data: { request } });
    } catch (error) {
        console.error("DELETE /platform-requests/:id/vote error:", error);
        jsonError(res, 500, "SERVER_ERROR", "Failed to remove platform request vote");
    }
});

router.get("/:id", async (req, res) => {
    try {
        const id = Number.parseInt(req.params.id, 10);
        if (!Number.isSafeInteger(id) || id <= 0) return jsonError(res, 400, "INVALID_REQUEST", "Invalid request id");
        const request = await getPlatformRequest(id, getOptionalClerkUserId(req));
        if (!request) return jsonError(res, 404, "NOT_FOUND", "Platform request not found");
        res.json({ status: "success", data: { request } });
    } catch (error) {
        console.error("GET /platform-requests/:id error:", error);
        jsonError(res, 500, "SERVER_ERROR", "Failed to load platform request");
    }
});

export default router;

