import { clerkClient } from "@clerk/express";
import { query } from "../db/pg-client.js";
import { matchBuyMeACoffeeAccount } from "./buymeacoffee-account.js";
import { bindBuyMeACoffeeOrder, setBuyMeACoffeeReviewReason } from "../db/buymeacoffee-matching.js";
import { markCreditOrderPaid } from "../db/credit-orders.js";
import { ensureMembershipCheckoutPlan, markMembershipOrderPaid } from "../db/membership-orders.js";

export const fulfillBuyMeACoffeePurchase = async (parsed, payload, { user, manual = false, note = "" } = {}) => {
    const review = async result => {
        if (!result.ok) await setBuyMeACoffeeReviewReason(parsed.transactionId, result.code);
        return result;
    };
    const receipt = (await query(`SELECT refunded,fulfilled_manually,bound_order_code
        FROM buymeacoffee_receipts WHERE transaction_id=$1`, [parsed.transactionId])).rows[0];
    if (!receipt || receipt.refunded) return review({ ok: false, code: "RECEIPT_NOT_PAYABLE" });
    if (receipt.fulfilled_manually) return { ok: true, code: "ALREADY_PAID" };
    const paid = await query(`SELECT id FROM credit_orders WHERE provider='buymeacoffee'
        AND provider_transaction_id=$1 AND status='PAID'
        UNION ALL SELECT id FROM membership_orders WHERE provider='buymeacoffee'
        AND provider_transaction_id=$1 AND status='PAID'`, [parsed.transactionId]);
    if (paid.rows.length) return { ok: true, code: "ALREADY_PAID" };
    if (!manual && !user && !parsed.outTradeNo && !receipt.bound_order_code) {
        let match;
        try { match = await matchBuyMeACoffeeAccount(parsed.supporterEmail, { clerkUsers: clerkClient.users, query }); }
        catch (error) { await setBuyMeACoffeeReviewReason(parsed.transactionId, "ACCOUNT_LOOKUP_FAILED"); throw error; }
        if (!match.ok) return review(match);
        user = match.user;
    }
    if (!manual && parsed.product.kind === "membership") await ensureMembershipCheckoutPlan(parsed.product.planKey);
    // Admin chooses the recipient explicitly, rather than trusting a legacy code.
    const bound = await bindBuyMeACoffeeOrder({ parsed: user ? { ...parsed, outTradeNo: undefined } : parsed, user, manual, note });
    if (!bound.ok || !bound.outTradeNo) return review(bound);
    const result = await (parsed.product.kind === "membership" ? markMembershipOrderPaid : markCreditOrderPaid)({
        outTradeNo: bound.outTradeNo, providerTransactionId: parsed.transactionId,
        paidAt: parsed.paidAt, totalFen: parsed.amountFen,
        rawNotify: { source: "buymeacoffee_webhook", event: payload },
    });
    return review(result);
};
