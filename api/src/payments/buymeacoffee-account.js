// Exact addresses only: do not strip dots, plus aliases, or infer an account.
export const matchBuyMeACoffeeAccount = async (email, { clerkUsers, query }) => {
    const normalized = String(email || "").trim().toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        return { ok: false, code: "PAYMENT_EMAIL_MISSING" };
    }
    const profiles = await clerkUsers.getUserList({ emailAddress: [normalized], limit: 2 });
    if (profiles.totalCount > 1 || profiles.data.length > 1) return { ok: false, code: "EMAIL_AMBIGUOUS" };
    const profile = profiles.data[0];
    if (!profile) return { ok: false, code: "EMAIL_ACCOUNT_NOT_FOUND" };
    const verified = profile.emailAddresses?.some(address =>
        address.emailAddress?.trim().toLowerCase() === normalized && address.verification?.status === "verified");
    if (!verified) return { ok: false, code: "EMAIL_NOT_VERIFIED" };
    if (profile.banned || profile.locked) return { ok: false, code: "ACCOUNT_DISABLED" };
    const local = await query(`SELECT id, clerk_user_id, is_disabled FROM users
        WHERE clerk_user_id = $1 OR lower(trim(primary_email)) = $2`, [profile.id, normalized]);
    if (local.rows.length !== 1 || local.rows[0].clerk_user_id !== profile.id) {
        return { ok: false, code: local.rows.length > 1 ? "EMAIL_AMBIGUOUS" : "EMAIL_ACCOUNT_NOT_FOUND" };
    }
    if (local.rows[0].is_disabled) return { ok: false, code: "ACCOUNT_DISABLED" };
    return { ok: true, user: local.rows[0] };
};
