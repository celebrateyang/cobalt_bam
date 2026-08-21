import { getClient, query } from "./pg-client.js";

const initializePayPalMembershipSubscriptionsSchema = async () => {
    await query(`
        CREATE TABLE IF NOT EXISTS paypal_membership_subscriptions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            clerk_user_id TEXT NOT NULL,
            local_subscription_id INTEGER,
            out_trade_no TEXT NOT NULL UNIQUE,
            product_key TEXT NOT NULL,
            plan_key TEXT NOT NULL,
            paypal_plan_id TEXT NOT NULL,
            paypal_subscription_id TEXT UNIQUE,
            status TEXT NOT NULL,
            amount_fen INTEGER NOT NULL,
            currency TEXT NOT NULL DEFAULT 'USD',
            cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
            provider_data JSONB,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (local_subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL
        );
    `);
    await query(`
        CREATE INDEX IF NOT EXISTS idx_paypal_membership_subscriptions_user
        ON paypal_membership_subscriptions(user_id, created_at DESC);
    `);
    await query(`
        CREATE TABLE IF NOT EXISTS paypal_membership_payments (
            id SERIAL PRIMARY KEY,
            paypal_membership_subscription_id INTEGER NOT NULL,
            paypal_sale_id TEXT NOT NULL UNIQUE,
            paypal_event_id TEXT UNIQUE,
            amount_fen INTEGER NOT NULL,
            currency TEXT NOT NULL,
            paid_at BIGINT NOT NULL,
            reversed_at BIGINT,
            raw_event JSONB,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            FOREIGN KEY (paypal_membership_subscription_id)
                REFERENCES paypal_membership_subscriptions(id) ON DELETE CASCADE
        );
    `);
};

let schemaPromise = null;
export const ensurePayPalMembershipSubscriptionsSchema = async () => {
    if (!schemaPromise) {
        schemaPromise = initializePayPalMembershipSubscriptionsSchema().catch(
            (error) => {
                schemaPromise = null;
                throw error;
            },
        );
    }
    return await schemaPromise;
};

export const createPayPalMembershipSubscriptionRecord = async ({
    userId,
    clerkUserId,
    outTradeNo,
    productKey,
    planKey,
    paypalPlanId,
    amountFen,
    currency,
    providerData = null,
}) => {
    await ensurePayPalMembershipSubscriptionsSchema();
    const now = Date.now();
    const result = await query(
        `INSERT INTO paypal_membership_subscriptions (
            user_id, clerk_user_id, out_trade_no, product_key, plan_key,
            paypal_plan_id, status, amount_fen, currency, provider_data,
            created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,'APPROVAL_PENDING',$7,$8,$9,$10,$10)
         RETURNING *;`,
        [
            userId,
            clerkUserId,
            outTradeNo,
            productKey,
            planKey,
            paypalPlanId,
            amountFen,
            currency,
            providerData,
            now,
        ],
    );
    return result.rows[0] || null;
};

export const attachPayPalMembershipSubscription = async ({
    id,
    paypalSubscriptionId,
    providerData,
}) => {
    await ensurePayPalMembershipSubscriptionsSchema();
    const result = await query(
        `UPDATE paypal_membership_subscriptions
         SET paypal_subscription_id = $2,
             status = 'APPROVAL_PENDING',
             provider_data = COALESCE(provider_data, '{}'::jsonb) || $3::jsonb,
             updated_at = $4
         WHERE id = $1
         RETURNING *;`,
        [id, paypalSubscriptionId, providerData || {}, Date.now()],
    );
    return result.rows[0] || null;
};

export const closePayPalMembershipSubscriptionRecord = async ({
    id,
    providerData = null,
}) => {
    await ensurePayPalMembershipSubscriptionsSchema();
    const result = await query(
        `UPDATE paypal_membership_subscriptions
         SET status = 'CANCELLED', cancel_at_period_end = true,
             provider_data = COALESCE(provider_data, '{}'::jsonb) || $2::jsonb,
             updated_at = $3
         WHERE id = $1 RETURNING *`,
        [id, providerData || {}, Date.now()],
    );
    return result.rows[0] || null;
};

export const getPayPalMembershipSubscriptionByExternalId = async (
    paypalSubscriptionId,
) => {
    await ensurePayPalMembershipSubscriptionsSchema();
    const result = await query(
        `SELECT * FROM paypal_membership_subscriptions
         WHERE paypal_subscription_id = $1`,
        [paypalSubscriptionId],
    );
    return result.rows[0] || null;
};

export const getPayPalMembershipSubscriptionByOutTradeNo = async (
    outTradeNo,
) => {
    await ensurePayPalMembershipSubscriptionsSchema();
    const result = await query(
        `SELECT * FROM paypal_membership_subscriptions WHERE out_trade_no = $1`,
        [outTradeNo],
    );
    return result.rows[0] || null;
};

export const getPayPalMembershipSubscriptionForUser = async ({
    id,
    clerkUserId,
}) => {
    await ensurePayPalMembershipSubscriptionsSchema();
    const result = await query(
        `SELECT pms.*, s.current_period_start, s.current_period_end
         FROM paypal_membership_subscriptions pms
         LEFT JOIN subscriptions s ON s.id = pms.local_subscription_id
         WHERE pms.id = $1 AND pms.clerk_user_id = $2`,
        [id, clerkUserId],
    );
    return result.rows[0] || null;
};

export const getCurrentPayPalMembershipSubscriptionForUser = async (
    clerkUserId,
) => {
    await ensurePayPalMembershipSubscriptionsSchema();
    const result = await query(
        `SELECT pms.*, s.current_period_start, s.current_period_end
         FROM paypal_membership_subscriptions pms
         LEFT JOIN subscriptions s ON s.id = pms.local_subscription_id
         WHERE pms.clerk_user_id = $1
           AND pms.status IN ('APPROVAL_PENDING','APPROVED','ACTIVE','SUSPENDED','PAST_DUE','CANCELLED')
         ORDER BY pms.created_at DESC
         LIMIT 1`,
        [clerkUserId],
    );
    return result.rows[0] || null;
};

export const updatePayPalMembershipSubscriptionStatus = async ({
    paypalSubscriptionId,
    status,
    cancelAtPeriodEnd = false,
    providerData = null,
}) => {
    await ensurePayPalMembershipSubscriptionsSchema();
    const now = Date.now();
    const result = await query(
        `UPDATE paypal_membership_subscriptions
         SET status = CASE
                WHEN status = 'ACTIVE' AND $2 IN ('APPROVAL_PENDING','APPROVED')
                    THEN status
                WHEN cancel_at_period_end AND $2 IN ('APPROVAL_PENDING','APPROVED','ACTIVE')
                    THEN status
                ELSE $2
             END,
             cancel_at_period_end = cancel_at_period_end OR $3,
             provider_data = COALESCE(provider_data, '{}'::jsonb) || $4::jsonb,
             updated_at = $5
         WHERE paypal_subscription_id = $1
         RETURNING *;`,
        [paypalSubscriptionId, status, cancelAtPeriodEnd, providerData || {}, now],
    );
    if (cancelAtPeriodEnd) {
        await query(
            `UPDATE subscriptions
             SET cancel_at_period_end = true, updated_at = $2
             WHERE provider = 'paypal'
               AND provider_subscription_id = $1`,
            [paypalSubscriptionId, now],
        );
    }
    return result.rows[0] || null;
};

export const applyPayPalMembershipPayment = async ({
    paypalSubscriptionId,
    paypalSaleId,
    paypalEventId,
    amountFen,
    currency,
    paidAt,
    durationDays,
    rawEvent,
}) => {
    await ensurePayPalMembershipSubscriptionsSchema();
    const client = await getClient();
    const now = Date.now();
    const resolvedPaidAt = Number.isFinite(Number(paidAt)) ? Number(paidAt) : now;

    try {
        await client.query("BEGIN");
        const recordResult = await client.query(
            `SELECT * FROM paypal_membership_subscriptions
             WHERE paypal_subscription_id = $1 FOR UPDATE`,
            [paypalSubscriptionId],
        );
        const record = recordResult.rows[0] || null;
        if (!record) {
            await client.query("ROLLBACK");
            return { ok: false, code: "SUBSCRIPTION_NOT_FOUND" };
        }
        const unitAmountFen = Number(record.amount_fen);
        const paidAmountFen = Number(amountFen);
        const paidCycles =
            Number.isSafeInteger(paidAmountFen) &&
            unitAmountFen > 0 &&
            paidAmountFen % unitAmountFen === 0
                ? paidAmountFen / unitAmountFen
                : 0;
        if (
            paidCycles < 1 ||
            paidCycles > 12 ||
            String(record.currency).toUpperCase() !== String(currency).toUpperCase()
        ) {
            await client.query("ROLLBACK");
            return { ok: false, code: "AMOUNT_MISMATCH", subscription: record };
        }

        const existingPayment = await client.query(
            `SELECT * FROM paypal_membership_payments
             WHERE paypal_sale_id = $1 OR paypal_event_id = $2
             LIMIT 1`,
            [paypalSaleId, paypalEventId || null],
        );
        if (existingPayment.rows[0]) {
            await client.query("COMMIT");
            return {
                ok: true,
                code: "ALREADY_APPLIED",
                subscription: record,
                payment: existingPayment.rows[0],
            };
        }

        const planResult = await client.query(
            `SELECT * FROM plans WHERE key = $1 AND is_active = true FOR UPDATE`,
            [record.plan_key],
        );
        const plan = planResult.rows[0] || null;
        if (!plan) {
            await client.query("ROLLBACK");
            return { ok: false, code: "PLAN_NOT_FOUND", subscription: record };
        }

        const resolvedDurationDays =
            Math.max(1, Number(durationDays) || 1) * paidCycles;
        const durationMs = resolvedDurationDays * 86400000;
        const entitlementResult = await client.query(
            `SELECT * FROM subscriptions
             WHERE provider = 'paypal' AND provider_subscription_id = $1
             FOR UPDATE`,
            [paypalSubscriptionId],
        );
        let entitlement = entitlementResult.rows[0] || null;
        let periodBase = resolvedPaidAt;

        if (entitlement) {
            const maxActiveResult = await client.query(
                `SELECT MAX(current_period_end)::bigint AS max_end
                 FROM subscriptions
                 WHERE user_id = $1 AND status = 'active'
                   AND current_period_end > $2`,
                [record.user_id, resolvedPaidAt],
            );
            periodBase = Math.max(
                resolvedPaidAt,
                Number(entitlement.current_period_end) || 0,
                Number(maxActiveResult.rows[0]?.max_end) || 0,
            );
            const updated = await client.query(
                 `UPDATE subscriptions
                 SET plan_id = $2, status = 'active', current_period_start = $3,
                     current_period_end = $4, cancel_at_period_end = $5,
                     updated_at = $6
                 WHERE id = $1 RETURNING *`,
                [
                    entitlement.id,
                    plan.id,
                    resolvedPaidAt,
                    periodBase + durationMs,
                    record.cancel_at_period_end,
                    now,
                ],
            );
            entitlement = updated.rows[0] || null;
        } else {
            const bonusResult = await client.query(
                `SELECT MAX(current_period_end)::bigint AS max_end
                 FROM subscriptions
                 WHERE user_id = $1 AND status = 'active'
                   AND current_period_end > $2`,
                [record.user_id, resolvedPaidAt],
            );
            const priorEnd = Number(bonusResult.rows[0]?.max_end) || resolvedPaidAt;
            const bonusMs = Math.max(0, priorEnd - resolvedPaidAt);
            const inserted = await client.query(
                `INSERT INTO subscriptions (
                    user_id, plan_id, provider, provider_customer_id,
                    provider_subscription_id, status, current_period_start,
                    current_period_end, cancel_at_period_end, created_at, updated_at
                 ) VALUES ($1,$2,'paypal',$3,$4,'active',$5,$6,$7,$8,$8)
                 RETURNING *`,
                [
                    record.user_id,
                    plan.id,
                    record.clerk_user_id,
                    paypalSubscriptionId,
                    resolvedPaidAt,
                    resolvedPaidAt + durationMs + bonusMs,
                    record.cancel_at_period_end,
                    now,
                ],
            );
            entitlement = inserted.rows[0] || null;
        }

        const paymentResult = await client.query(
            `INSERT INTO paypal_membership_payments (
                paypal_membership_subscription_id, paypal_sale_id,
                paypal_event_id, amount_fen, currency, paid_at, raw_event,
                created_at, updated_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
             RETURNING *`,
            [
                record.id,
                paypalSaleId,
                paypalEventId || null,
                amountFen,
                String(currency).toUpperCase(),
                resolvedPaidAt,
                rawEvent || null,
                now,
            ],
        );
        await client.query(
            `INSERT INTO membership_orders (
                user_id, clerk_user_id, provider, product_key, plan_key,
                duration_days, amount_fen, currency, out_trade_no, status,
                provider_transaction_id, provider_data, raw_notify, paid_at,
                created_at, updated_at
             ) VALUES (
                $1,$2,'paypal',$3,$4,$5,$6,$7,$8,'PAID',$9,$10,$11,$12,$13,$13
             )
             ON CONFLICT (out_trade_no) DO NOTHING`,
            [
                record.user_id,
                record.clerk_user_id,
                record.product_key,
                record.plan_key,
                resolvedDurationDays,
                amountFen,
                String(currency).toUpperCase(),
                `psale_${paypalSaleId}`,
                paypalSaleId,
                { paypal_subscription_id: paypalSubscriptionId },
                rawEvent || null,
                resolvedPaidAt,
                now,
            ],
        );
        const updatedRecord = await client.query(
            `UPDATE paypal_membership_subscriptions
             SET local_subscription_id = $2,
                 status = CASE WHEN cancel_at_period_end THEN status ELSE 'ACTIVE' END,
                 updated_at = $3
             WHERE id = $1 RETURNING *`,
            [record.id, entitlement.id, now],
        );
        await client.query("COMMIT");
        return {
            ok: true,
            code: "PAID",
            subscription: updatedRecord.rows[0] || null,
            entitlement,
            payment: paymentResult.rows[0] || null,
        };
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {}
        throw error;
    } finally {
        client.release();
    }
};

export const reversePayPalMembershipPayment = async ({
    paypalSubscriptionId,
    paypalSaleId,
    reversedAt,
    durationDays,
    rawEvent,
    refundedAmountFen,
    refundCurrency,
    fullReversal = false,
}) => {
    await ensurePayPalMembershipSubscriptionsSchema();
    const client = await getClient();
    const now = Date.now();
    try {
        await client.query("BEGIN");
        const paymentResult = await client.query(
            `SELECT p.*, pms.local_subscription_id,
                    pms.amount_fen AS unit_amount_fen
             FROM paypal_membership_payments p
             JOIN paypal_membership_subscriptions pms
               ON pms.id = p.paypal_membership_subscription_id
             WHERE p.paypal_sale_id = $1
               AND pms.paypal_subscription_id = $2
             FOR UPDATE OF p`,
            [paypalSaleId, paypalSubscriptionId],
        );
        const payment = paymentResult.rows[0] || null;
        if (!payment) {
            await client.query("ROLLBACK");
            return { ok: false, code: "PAYMENT_NOT_FOUND" };
        }
        if (payment.reversed_at) {
            await client.query("COMMIT");
            return { ok: true, code: "ALREADY_REVERSED" };
        }

        const isFullRefund =
            fullReversal ||
            (Number.isFinite(Number(refundedAmountFen)) &&
                Number(refundedAmountFen) >= Number(payment.amount_fen) &&
                String(refundCurrency || "").toUpperCase() ===
                    String(payment.currency || "").toUpperCase());
        if (!isFullRefund) {
            await client.query(
                `UPDATE paypal_membership_payments
                 SET raw_event = COALESCE(raw_event, '{}'::jsonb) || $2::jsonb,
                     updated_at = $3
                 WHERE id = $1`,
                [payment.id, rawEvent || {}, now],
            );
            await client.query("COMMIT");
            return { ok: true, code: "PARTIAL_REFUND_RECORDED" };
        }

        const paidCycles = Math.max(
            1,
            Math.round(Number(payment.amount_fen) / Number(payment.unit_amount_fen)),
        );
        const durationMs =
            Math.max(1, Number(durationDays) || 1) * paidCycles * 86400000;
        const entitlementResult = await client.query(
            `SELECT * FROM subscriptions WHERE id = $1 FOR UPDATE`,
            [payment.local_subscription_id],
        );
        const entitlement = entitlementResult.rows[0] || null;
        if (entitlement) {
            const reducedEnd = Math.max(
                Number(entitlement.current_period_start) || now,
                (Number(entitlement.current_period_end) || now) - durationMs,
            );
            await client.query(
                `UPDATE subscriptions
                 SET current_period_end = $2,
                     status = CASE WHEN $2 > $3 THEN 'active' ELSE 'canceled' END,
                     updated_at = $3
                 WHERE id = $1`,
                [entitlement.id, reducedEnd, now],
            );
        }
        await client.query(
            `UPDATE paypal_membership_payments
             SET reversed_at = $2,
                 raw_event = COALESCE(raw_event, '{}'::jsonb) || $3::jsonb,
                 updated_at = $4
             WHERE id = $1`,
            [payment.id, Number(reversedAt) || now, rawEvent || {}, now],
        );
        await client.query(
            `UPDATE membership_orders
             SET status = 'REFUNDED',
                 raw_notify = COALESCE(raw_notify, '{}'::jsonb) || $2::jsonb,
                 updated_at = $3
             WHERE out_trade_no = $1`,
            [`psale_${paypalSaleId}`, rawEvent || {}, now],
        );
        await client.query("COMMIT");
        return { ok: true, code: "REVERSED" };
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {}
        throw error;
    } finally {
        client.release();
    }
};
