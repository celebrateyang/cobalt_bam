import { query } from "../db/pg-client.js";

const reasons = new Set(["paid_not_received", "payment_issue", "trust", "still_paying", "not_now"]);
const issues = new Set(["page", "method", "declined", "other"]);

export const normalizeBuyMeACoffeeFeedback = (body) => {
    if (!body || !reasons.has(body.reason) ||
        (body.reason === "payment_issue" ? !issues.has(body.issue) : body.issue != null && body.issue !== "") ||
        (body.note != null && typeof body.note !== "string") || (body.note?.length || 0) > 500) return null;
    return { reason: body.reason, issue: body.reason === "payment_issue" ? body.issue : null,
        note: (body.note || "").trim(), received_at: Date.now() };
};

// A single response per order makes retries idempotent and bounds stored input.
// Financial fields and order timestamps are deliberately untouched.
export const recordBuyMeACoffeeFeedback = async ({ id, kind, clerkUserId, feedback }, queryFn = query) => {
    if (!Number.isSafeInteger(id) || id <= 0 || !["credit", "membership"].includes(kind) || !clerkUserId) return null;
    const normalized = normalizeBuyMeACoffeeFeedback(feedback);
    if (!normalized) return null;
    const table = kind === "membership" ? "membership_orders" : "credit_orders";
    const result = await queryFn(`UPDATE ${table}
        SET provider_data = CASE WHEN status = 'CREATED' AND NOT (COALESCE(provider_data, '{}'::jsonb) ? 'bmc_feedback')
            THEN COALESCE(provider_data, '{}'::jsonb) || jsonb_build_object('bmc_feedback', $3::jsonb)
            ELSE provider_data END
        WHERE id = $1 AND clerk_user_id = $2 AND provider = 'buymeacoffee'
        RETURNING status, provider_data->'bmc_feedback' AS feedback`, [id, clerkUserId, JSON.stringify(normalized)]);
    return result.rows[0] || null;
};
