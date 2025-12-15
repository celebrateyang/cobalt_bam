import express from "express";
import { clerkClient, clerkMiddleware, getAuth, requireAuth } from "@clerk/express";

import { upsertUserFromClerk } from "../db/users.js";

const router = express.Router();

const isClerkConfigured = !!process.env.CLERK_SECRET_KEY;

if (!isClerkConfigured) {
    router.get("/me", (_, res) => {
        res.status(501).json({
            status: "error",
            error: {
                code: "CLERK_NOT_CONFIGURED",
                message: "Clerk is not configured on this server",
            },
        });
    });
} else {
    router.use(clerkMiddleware());

    router.get("/me", requireAuth(), async (req, res) => {
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

            const user = await upsertUserFromClerk({
                clerkUserId: auth.userId,
                primaryEmail,
                fullName,
                avatarUrl: clerkUser.imageUrl,
            });

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

export default router;

