import express from "express";
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";

import { upsertUserFromClerk } from "../db/users.js";
import { requireAuth as requireAdminAuth } from "../middleware/admin-auth.js";

const router = express.Router();

const isClerkApiConfigured = !!process.env.CLERK_SECRET_KEY;
const isClerkAuthConfigured =
    isClerkApiConfigured && !!process.env.CLERK_PUBLISHABLE_KEY;

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

if (!isClerkApiConfigured) {
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
    } else {
        router.use(clerkMiddleware());

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
    }
}

export default router;
