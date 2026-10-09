import { query } from "../db/pg-client.js";

export const BUYMEACOFFEE_STEPS = new Set([
    "code_copied", "code_copy_failed", "checkout_opened", "help_opened",
    "order_restored", "returned", "status_checked", "status_check_failed",
]);

// Browser observations are diagnostic only. They never change payment status.
export const recordBuyMeACoffeeStep = async ({ id, kind, clerkUserId, step }, queryFn = query) => {
    if (!Number.isSafeInteger(id) || id <= 0 || !["credit", "membership"].includes(kind) ||
        !clerkUserId || !BUYMEACOFFEE_STEPS.has(step)) return false;
    const table = kind === "membership" ? "membership_orders" : "credit_orders";
    await queryFn(`UPDATE ${table}
        SET provider_data = COALESCE(provider_data, '{}'::jsonb) || jsonb_build_object($3::text, $4::bigint)
        WHERE id = $1 AND clerk_user_id = $2 AND provider = 'buymeacoffee'
          AND NOT (COALESCE(provider_data, '{}'::jsonb) ? $3::text)`,
    [id, clerkUserId, `bmc_step_${step}`, Date.now()]);
    return true;
};
