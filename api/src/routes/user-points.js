// Balance reads deliberately have no Clerk profile or user-write dependency.
export const createUserPointsHandler = ({
    getAuth,
    getUserByClerkId,
    getActiveMembershipForUser,
}) => async (req, res) => {
    const fail = (status, code, message) => res.status(status).json({
        status: "error", error: { code, message },
    });
    res.set("Cache-Control", "no-store");
    try {
        const { userId } = getAuth(req);
        if (!userId) return fail(401, "UNAUTHORIZED", "Unauthenticated");

        const user = await getUserByClerkId(userId);
        if (!user) return fail(404, "USER_NOT_SYNCED", "User profile has not been synced yet");
        if (user.is_disabled) {
            return fail(403,
                user.signup_block_reason === "duplicate_normalized_email"
                    ? "DUPLICATE_SIGNUP_BLOCKED" : "ACCOUNT_DISABLED",
                "This account is not allowed to register.");
        }
        const membership = await getActiveMembershipForUser(user.id);
        return res.json({
            status: "success",
            data: { user: {
                points: user.points,
                membership,
                referral_code: user.referral_code,
                download_success_count: user.download_success_count,
                first_download_grace_eligible: user.first_download_grace_eligible,
                first_download_grace_used: user.first_download_grace_used,
            } },
        });
    } catch (error) {
        console.error("GET /user/points error:", error);
        return fail(500, "SERVER_ERROR", "Failed to load user points");
    }
};
