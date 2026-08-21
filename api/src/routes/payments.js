import express from "express";
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";
import { nanoid } from "nanoid";

import { MEMBER_DOWNLOAD_LIMITS, upsertUserFromClerk } from "../db/users.js";
import {
    createCreditOrder,
    getCreditOrderById,
    getCreditOrderByOutTradeNo,
    markCreditOrderPaid,
    updateCreditOrderProviderData,
} from "../db/credit-orders.js";
import {
    createMembershipOrder,
    ensureMembershipCheckoutPlan,
    getMembershipOrderById,
    getMembershipOrderByOutTradeNo,
    markMembershipOrderPaid,
    reverseMembershipOrderPayment,
    updateMembershipOrderProviderData,
} from "../db/membership-orders.js";
import {
    applyPayPalMembershipPayment,
    attachPayPalMembershipSubscription,
    closePayPalMembershipSubscriptionRecord,
    createPayPalMembershipSubscriptionRecord,
    getCurrentPayPalMembershipSubscriptionForUser,
    getPayPalMembershipSubscriptionByExternalId,
    getPayPalMembershipSubscriptionByOutTradeNo,
    getPayPalMembershipSubscriptionForUser,
    reversePayPalMembershipPayment,
    updatePayPalMembershipSubscriptionStatus,
} from "../db/paypal-membership-subscriptions.js";

import {
    createWechatNativeTransaction,
    decryptWechatpayEventResource,
    isWechatPayConfigured,
    queryWechatTransactionByOutTradeNo,
    verifyWechatpaySignature,
} from "../payments/wechatpay.js";
import {
    PAYPAL_MEMBERSHIP_PRODUCTS,
    WECHAT_MEMBERSHIP_PRODUCTS,
    getMembershipProductDescription,
    getPayPalMembershipPlanId,
    getPayPalMembershipProductByKey,
    getWechatMembershipProductByKey,
} from "../payments/membership-products.js";

import {
    PayPalRequestError,
    canCapturePayPalOrder,
    cancelPayPalSubscription,
    capturePayPalOrder,
    createPayPalOrder,
    createPayPalSubscription,
    getCompletedPayPalCapture,
    getPayPalClientId,
    getPayPalEnvironment,
    getPayPalOrder,
    getPayPalOrderStatus,
    getPayPalPlan,
    getPayPalPayerActionUrl,
    getPayPalRequestIssue,
    getPayPalSdkUrl,
    getPayPalSubscription,
    getPayPalSubscriptionApprovalUrl,
    isPayPalCheckoutConfigured,
    isPayPalWebhookConfigured,
    parsePayPalAmount,
    verifyPayPalWebhookSignature,
} from "../payments/paypal.js";

const router = express.Router();

const WECHAT_CREDIT_PRODUCTS = [
    {
        key: "points_50",
        points: 50,
        unitPriceFen: 2,
        amountFen: 100,
        currency: "CNY",
    },
    {
        key: "points_100",
        points: 100,
        unitPriceFen: 2,
        amountFen: 200,
        currency: "CNY",
    },
    {
        key: "points_500",
        points: 500,
        unitPriceFen: 1,
        amountFen: 500,
        currency: "CNY",
    },
    {
        key: "points_1000",
        points: 1000,
        unitPriceFen: 0.8,
        amountFen: 800,
        currency: "CNY",
    },
    {
        key: "points_2500",
        points: 2500,
        unitPriceFen: 0.8,
        amountFen: 2000,
        currency: "CNY",
    },
    {
        key: "points_6250",
        points: 8000,
        unitPriceFen: 0.625,
        amountFen: 5000,
        currency: "CNY",
    },
];

const PAYPAL_CREDIT_PRODUCTS = [
    {
        key: "paypal_usd_199",
        points: 600,
        amountFen: 199,
        currency: "USD",
        unitPriceFen: 0.332,
    },
    {
        key: "paypal_usd_499",
        points: 2000,
        amountFen: 499,
        currency: "USD",
        unitPriceFen: 0.25,
    },
    {
        key: "paypal_usd_999",
        points: 5000,
        amountFen: 999,
        currency: "USD",
        unitPriceFen: 0.2,
    },
    {
        key: "paypal_usd_1999",
        points: 12000,
        amountFen: 1999,
        currency: "USD",
        unitPriceFen: 0.167,
    },
    {
        key: "paypal_usd_4999",
        points: 35000,
        amountFen: 4999,
        currency: "USD",
        unitPriceFen: 0.143,
    },
];

const getWechatProductByKey = (key) =>
    WECHAT_CREDIT_PRODUCTS.find((p) => p.key === key);
const getPayPalProductByKey = (key) =>
    PAYPAL_CREDIT_PRODUCTS.find((p) => p.key === key);
const isClerkApiConfigured = !!process.env.CLERK_SECRET_KEY;
const isClerkAuthConfigured =
    isClerkApiConfigured && !!process.env.CLERK_PUBLISHABLE_KEY;

const sanitizeAttribution = (value) => {
    const sanitizeTouch = (touch) => {
        if (!touch || typeof touch !== "object") return null;
        const clean = (field) =>
            typeof field === "string" ? field.trim().slice(0, 200) : "";
        const source = clean(touch.source);
        const medium = clean(touch.medium);
        const landingPath = clean(touch.landingPath);
        const capturedAt = Number(touch.capturedAt);
        if (!source || !medium || !landingPath || !Number.isFinite(capturedAt)) {
            return null;
        }

        const sanitized = { source, medium, landingPath, capturedAt };
        for (const field of ["campaign", "content", "term"]) {
            const fieldValue = clean(touch[field]);
            if (fieldValue) sanitized[field] = fieldValue;
        }
        return sanitized;
    };

    const firstTouch = sanitizeTouch(value?.firstTouch);
    const lastTouch = sanitizeTouch(value?.lastTouch);
    return firstTouch && lastTouch ? { firstTouch, lastTouch } : null;
};

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

const jsonError = (res, status, code, message, context) => {
    return res.status(status).json({
        status: "error",
        error: { code, message, ...(context ? { context } : {}) },
    });
};

const getPayPalPendingError = (paypalOrder) => {
    const status = getPayPalOrderStatus(paypalOrder);
    if (status === "PAYER_ACTION_REQUIRED") {
        return {
            code: "PAYPAL_PAYER_ACTION_REQUIRED",
            message: "PayPal requires another action from the payer",
        };
    }
    return {
        code: "PAYPAL_ORDER_NOT_APPROVED",
        message: "PayPal order has not been approved by the payer",
    };
};

const getPayPalErrorContext = ({ paypalOrder, error }) => ({
    paypal: {
        status: getPayPalOrderStatus(paypalOrder) || null,
        issue: getPayPalRequestIssue(error),
        debugId: error?.debugId || null,
        payerActionUrl: getPayPalPayerActionUrl(paypalOrder),
    },
});

const normalizeProvider = (rawProvider, fallback = "wechat") => {
    const normalized = String(rawProvider || "")
        .trim()
        .toLowerCase();
    if (["wechat", "paypal"].includes(normalized)) {
        return normalized;
    }
    return fallback;
};

const buildPublicProducts = (provider) => {
    if (provider === "paypal") {
        const enabled = isPayPalCheckoutConfigured();
        return PAYPAL_CREDIT_PRODUCTS.map((product) => ({
            key: product.key,
            points: product.points,
            unitPriceFen: product.unitPriceFen,
            amountFen: product.amountFen,
            currency: product.currency,
            enabled,
        }));
    }

    return WECHAT_CREDIT_PRODUCTS.map((product) => ({
        key: product.key,
        points: product.points,
        unitPriceFen: product.unitPriceFen,
        amountFen: product.amountFen,
        currency: product.currency,
        enabled: true,
    }));
};

const buildPublicMembershipProducts = (provider) => {
    if (provider === "paypal") {
        const checkoutEnabled = isPayPalCheckoutConfigured();
        return PAYPAL_MEMBERSHIP_PRODUCTS.map((product) => ({
            key: product.key,
            planKey: product.planKey,
            durationDays: product.durationDays,
            amountFen: product.amountFen,
            currency: product.currency,
            billingType: product.billingType,
            enabled:
                checkoutEnabled &&
                (product.billingType === "one_time" ||
                    !!getPayPalMembershipPlanId(product)),
        }));
    }

    return WECHAT_MEMBERSHIP_PRODUCTS.map((product) => ({
        key: product.key,
        planKey: product.planKey,
        durationDays: product.durationDays,
        amountFen: product.amountFen,
        currency: product.currency,
        billingType: "one_time",
        enabled: true,
    }));
};

const isMatchingPayPalMembershipPlan = ({ product, paypalPlan }) => {
    const regularCycle = (Array.isArray(paypalPlan?.billing_cycles)
        ? paypalPlan.billing_cycles
        : []
    ).find((cycle) => String(cycle?.tenure_type).toUpperCase() === "REGULAR");
    const fixedPrice = regularCycle?.pricing_scheme?.fixed_price || {};
    const intervalUnit = String(
        regularCycle?.frequency?.interval_unit || "",
    ).toUpperCase();
    const intervalCount = Number(regularCycle?.frequency?.interval_count);
    const expectedInterval = product.planKey === "member_yearly" ? "YEAR" : "MONTH";
    return (
        parsePayPalAmount(fixedPrice.value) === product.amountFen &&
        String(fixedPrice.currency_code || "").toUpperCase() === product.currency &&
        intervalUnit === expectedInterval &&
        intervalCount === 1 &&
        String(paypalPlan?.status || "").toUpperCase() === "ACTIVE"
    );
};

const toHeaderRecord = (headers) => {
    const record = {};
    for (const [key, value] of Object.entries(headers || {})) {
        if (typeof value === "string") {
            record[key] = value;
        } else if (Array.isArray(value)) {
            record[key] = value.join(", ");
        }
    }
    return record;
};

const resolvePayPalOrderIdFromEvent = (event) => {
    const resource = event?.resource || {};
    return String(
        resource?.supplementary_data?.related_ids?.order_id ||
            resource?.id ||
            "",
    ).trim();
};

const resolveOutTradeNoFromPayPalOrder = (paypalOrder) => {
    const purchaseUnits = Array.isArray(paypalOrder?.purchase_units)
        ? paypalOrder.purchase_units
        : [];
    return String(
        purchaseUnits.find((unit) => unit?.custom_id)?.custom_id || "",
    ).trim();
};

const PAYPAL_SUBSCRIPTION_EVENT_STATUS = Object.freeze({
    "BILLING.SUBSCRIPTION.CREATED": "APPROVAL_PENDING",
    "BILLING.SUBSCRIPTION.ACTIVATED": "ACTIVE",
    "BILLING.SUBSCRIPTION.UPDATED": "ACTIVE",
    "BILLING.SUBSCRIPTION.SUSPENDED": "SUSPENDED",
    "BILLING.SUBSCRIPTION.CANCELLED": "CANCELLED",
    "BILLING.SUBSCRIPTION.EXPIRED": "EXPIRED",
    "BILLING.SUBSCRIPTION.PAYMENT.FAILED": "PAST_DUE",
});

const resolvePayPalSubscriptionIdFromEvent = (event) => {
    const resource = event?.resource || {};
    if (String(event?.event_type || "").startsWith("BILLING.SUBSCRIPTION.")) {
        return String(resource?.id || "").trim();
    }
    return String(
        resource?.billing_agreement_id ||
            resource?.billing_agreement?.id ||
            "",
    ).trim();
};

const resolvePayPalCaptureIdFromReversalEvent = (event) => {
    const resource = event?.resource || {};
    const relatedCaptureId = String(
        resource?.supplementary_data?.related_ids?.capture_id ||
            resource?.capture_id ||
            "",
    ).trim();
    if (relatedCaptureId) return relatedCaptureId;
    const upLink = (Array.isArray(resource?.links) ? resource.links : []).find(
        (link) => String(link?.rel || "").toLowerCase() === "up",
    );
    if (upLink?.href) {
        try {
            const segments = new URL(upLink.href).pathname.split("/").filter(Boolean);
            const capturesIndex = segments.lastIndexOf("captures");
            if (capturesIndex >= 0 && segments[capturesIndex + 1]) {
                return segments[capturesIndex + 1];
            }
        } catch {}
    }
    return event?.event_type === "PAYMENT.CAPTURE.REVERSED"
        ? String(resource?.id || "").trim()
        : "";
};

const handlePayPalSubscriptionWebhook = async (event) => {
    const eventType = String(event?.event_type || "");
    const paypalSubscriptionId = resolvePayPalSubscriptionIdFromEvent(event);
    if (!paypalSubscriptionId) {
        return { ok: false, code: "SUBSCRIPTION_ID_MISSING" };
    }
    let record = await getPayPalMembershipSubscriptionByExternalId(
        paypalSubscriptionId,
    );
    if (!record && event?.resource?.custom_id) {
        record = await getPayPalMembershipSubscriptionByOutTradeNo(
            String(event.resource.custom_id),
        );
        if (record && !record.paypal_subscription_id) {
            record = await attachPayPalMembershipSubscription({
                id: record.id,
                paypalSubscriptionId,
                providerData: { recovered_from_webhook: event?.id || null },
            });
        }
    }
    if (!record) return { ok: false, code: "SUBSCRIPTION_NOT_FOUND" };
    const product = getPayPalMembershipProductByKey(record.product_key);
    if (!product || product.billingType !== "subscription") {
        return { ok: false, code: "PRODUCT_NOT_FOUND" };
    }

    if (eventType === "PAYMENT.SALE.COMPLETED") {
        const amount = event?.resource?.amount || {};
        const amountFen = parsePayPalAmount(amount?.total ?? amount?.value);
        const currency = String(
            amount?.currency || amount?.currency_code || "",
        ).toUpperCase();
        const paidAtRaw = event?.resource?.create_time || event?.create_time;
        const parsedPaidAt = paidAtRaw ? Date.parse(paidAtRaw) : Number.NaN;
        return await applyPayPalMembershipPayment({
            paypalSubscriptionId,
            paypalSaleId: String(event?.resource?.id || "").trim(),
            paypalEventId: String(event?.id || "").trim(),
            amountFen,
            currency,
            paidAt: Number.isFinite(parsedPaidAt) ? parsedPaidAt : Date.now(),
            durationDays: product.durationDays,
            rawEvent: event,
        });
    }

    if (["PAYMENT.SALE.REFUNDED", "PAYMENT.SALE.REVERSED"].includes(eventType)) {
        const reversedAtRaw = event?.resource?.update_time || event?.create_time;
        const reversedAt = reversedAtRaw ? Date.parse(reversedAtRaw) : Number.NaN;
        return await reversePayPalMembershipPayment({
            paypalSubscriptionId,
            paypalSaleId: String(
                event?.resource?.sale_id || event?.resource?.id || "",
            ).trim(),
            reversedAt: Number.isFinite(reversedAt) ? reversedAt : Date.now(),
            durationDays: product.durationDays,
            rawEvent: event,
            refundedAmountFen: parsePayPalAmount(
                event?.resource?.amount?.total ?? event?.resource?.amount?.value,
            ),
            refundCurrency:
                event?.resource?.amount?.currency ||
                event?.resource?.amount?.currency_code,
            fullReversal: eventType === "PAYMENT.SALE.REVERSED",
        });
    }

    let status = PAYPAL_SUBSCRIPTION_EVENT_STATUS[eventType];
    if (!status) return { ok: true, code: "IGNORED" };
    const resourceStatus = String(event?.resource?.status || "").toUpperCase();
    if (
        eventType !== "BILLING.SUBSCRIPTION.PAYMENT.FAILED" &&
        [
            "APPROVAL_PENDING",
            "APPROVED",
            "ACTIVE",
            "SUSPENDED",
            "CANCELLED",
            "EXPIRED",
        ].includes(resourceStatus)
    ) {
        status = resourceStatus;
    }
    const cancelAtPeriodEnd = ["CANCELLED", "EXPIRED"].includes(status);
    const subscription = await updatePayPalMembershipSubscriptionStatus({
        paypalSubscriptionId,
        status,
        cancelAtPeriodEnd,
        providerData: {
            paypal_status_event: eventType,
            paypal_status_event_id: event?.id || null,
        },
    });
    return { ok: !!subscription, code: subscription ? "UPDATED" : "NOT_FOUND" };
};

const markPayPalOrderPaidFromOrder = async ({
    paypalOrder,
    expectedOrder = null,
    rawNotify,
}) => {
    const completed = getCompletedPayPalCapture(paypalOrder);
    if (!completed?.outTradeNo || !completed?.capture) {
        return { ok: false, code: "PAYPAL_CAPTURE_NOT_COMPLETED" };
    }

    const isMembershipOrder = completed.outTradeNo.startsWith("mbr_");
    const order =
        expectedOrder ||
        (isMembershipOrder
            ? await getMembershipOrderByOutTradeNo(completed.outTradeNo)
            : await getCreditOrderByOutTradeNo(completed.outTradeNo));
    if (!order || order.out_trade_no !== completed.outTradeNo) {
        return { ok: false, code: "ORDER_NOT_FOUND" };
    }
    if (order.provider !== "paypal") {
        return { ok: false, code: "PROVIDER_MISMATCH", order };
    }

    const paypalOrderId = String(paypalOrder?.id || "").trim();
    const storedPayPalOrderId = String(
        order?.provider_data?.paypal_order_id || "",
    ).trim();
    if (!paypalOrderId || storedPayPalOrderId !== paypalOrderId) {
        return { ok: false, code: "PAYPAL_ORDER_MISMATCH", order };
    }

    const captureAmount = completed.capture?.amount || {};
    const totalFen = parsePayPalAmount(captureAmount?.value);
    const currency = String(captureAmount?.currency_code || "").toUpperCase();
    if (!Number.isFinite(totalFen) || totalFen !== Number(order.amount_fen)) {
        return { ok: false, code: "AMOUNT_MISMATCH", order };
    }
    if (currency !== String(order.currency || "").toUpperCase()) {
        return { ok: false, code: "CURRENCY_MISMATCH", order };
    }

    const parsedPaidAt = completed.capture?.update_time
        ? Date.parse(completed.capture.update_time)
        : Number.NaN;
    const payment = {
        outTradeNo: order.out_trade_no,
        providerTransactionId: String(completed.capture.id || paypalOrderId),
        paidAt: Number.isFinite(parsedPaidAt) ? parsedPaidAt : Date.now(),
        rawNotify,
        totalFen,
    };
    return isMembershipOrder
        ? await markMembershipOrderPaid(payment)
        : await markCreditOrderPaid(payment);
};

router.get("/credits/products", (req, res) => {
    const provider = normalizeProvider(req.query?.provider, "wechat");
    res.json({
        status: "success",
        data: {
            provider,
            products: buildPublicProducts(provider),
        },
    });
});

router.get("/memberships/products", (req, res) => {
    const provider = normalizeProvider(req.query?.provider, "wechat");
    res.json({
        status: "success",
        data: {
            provider,
            products: buildPublicMembershipProducts(provider),
            limits: MEMBER_DOWNLOAD_LIMITS,
        },
    });
});

router.post("/wechat/notify", async (req, res) => {
    try {
        if (!isWechatPayConfigured()) {
            return res.status(500).json({
                code: "FAIL",
                message: "WeChat Pay is not configured",
            });
        }

        const signature = req.header("Wechatpay-Signature");
        const timestamp = req.header("Wechatpay-Timestamp");
        const nonce = req.header("Wechatpay-Nonce");
        const serial = req.header("Wechatpay-Serial");

        const rawBody = req.rawBody || JSON.stringify(req.body || {});

        const valid = await verifyWechatpaySignature({
            serial,
            signature,
            timestamp,
            nonce,
            body: rawBody,
        });

        if (valid === null) {
            return res.status(500).json({
                code: "FAIL",
                message: "certificate unavailable",
            });
        }

        if (!valid) {
            console.warn("WeChat Pay notify signature invalid");
            return res.status(401).json({
                code: "FAIL",
                message: "invalid signature",
            });
        }

        const transaction = decryptWechatpayEventResource(req.body);

        const configMchId = process.env.WECHATPAY_MCH_ID;
        const configAppId = process.env.WECHATPAY_APP_ID;
        if (
            (configMchId &&
                transaction?.mchid &&
                transaction.mchid !== configMchId) ||
            (configAppId && transaction?.appid && transaction.appid !== configAppId)
        ) {
            console.error("WeChat Pay notify merchant/app mismatch", {
                mchid: transaction?.mchid,
                appid: transaction?.appid,
            });
            return res.status(500).json({
                code: "FAIL",
                message: "merchant mismatch",
            });
        }

        if (transaction?.trade_state !== "SUCCESS") {
            return res.status(200).json({
                code: "SUCCESS",
                message: "ignored",
            });
        }

        const outTradeNo = transaction?.out_trade_no;
        const transactionId = transaction?.transaction_id;
        const totalFen = transaction?.amount?.total;
        const parsedPaidAt = transaction?.success_time
            ? Date.parse(transaction.success_time)
            : Number.NaN;
        const paidAt = Number.isFinite(parsedPaidAt) ? parsedPaidAt : Date.now();

        if (!outTradeNo || typeof totalFen !== "number") {
            return res.status(500).json({
                code: "FAIL",
                message: "missing out_trade_no/amount",
            });
        }

        const rawNotify = {
            headers: {
                "Wechatpay-Serial": serial,
                "Wechatpay-Signature": signature,
                "Wechatpay-Timestamp": timestamp,
                "Wechatpay-Nonce": nonce,
            },
            event: req.body,
            transaction,
        };
        const isMembershipOrder = String(outTradeNo).startsWith("mbr_");
        const result = isMembershipOrder
            ? await markMembershipOrderPaid({
                  outTradeNo,
                  providerTransactionId: transactionId,
                  paidAt,
                  rawNotify,
                  totalFen,
              })
            : await markCreditOrderPaid({
                  outTradeNo,
                  providerTransactionId: transactionId,
                  paidAt,
                  rawNotify,
                  totalFen,
              });

        if (!result.ok && result.code === "ORDER_NOT_FOUND") {
            console.error("WeChat Pay notify: order not found", outTradeNo);
            return res.status(500).json({
                code: "FAIL",
                message: "order not found",
            });
        }

        if (!result.ok && result.code === "AMOUNT_MISMATCH") {
            console.error("WeChat Pay notify: amount mismatch", {
                outTradeNo,
                totalFen,
            });
        } else if (!result.ok && result.code === "PLAN_NOT_FOUND") {
            console.error("WeChat Pay notify: membership plan not found", {
                outTradeNo,
            });
            return res.status(500).json({
                code: "FAIL",
                message: "plan not found",
            });
        }

        return res.status(200).json({
            code: "SUCCESS",
            message: "OK",
        });
    } catch (error) {
        console.error("POST /payments/wechat/notify error:", error);
        return res.status(500).json({
            code: "FAIL",
            message: "server error",
        });
    }
});

router.post("/paypal/webhook", async (req, res) => {
    try {
        if (!isPayPalWebhookConfigured()) {
            return jsonError(
                res,
                500,
                "PAYPAL_WEBHOOK_NOT_CONFIGURED",
                "PayPal webhook is not configured",
            );
        }

        const rawBody = req.rawBody || JSON.stringify(req.body || {});
        const event = JSON.parse(rawBody);
        const headers = toHeaderRecord(req.headers);
        const verified = await verifyPayPalWebhookSignature({ headers, event });
        if (!verified) {
            console.error("PayPal webhook signature invalid");
            return jsonError(res, 403, "INVALID_SIGNATURE", "invalid signature");
        }

        const supportedEventTypes = new Set([
            "CHECKOUT.ORDER.APPROVED",
            "PAYMENT.CAPTURE.COMPLETED",
            "PAYMENT.CAPTURE.REFUNDED",
            "PAYMENT.CAPTURE.REVERSED",
            "PAYMENT.SALE.COMPLETED",
            "PAYMENT.SALE.REFUNDED",
            "PAYMENT.SALE.REVERSED",
            ...Object.keys(PAYPAL_SUBSCRIPTION_EVENT_STATUS),
        ]);
        if (!supportedEventTypes.has(event?.event_type)) {
            return res.status(200).json({ code: "SUCCESS", message: "ignored" });
        }

        if (
            ["PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED"].includes(
                event?.event_type,
            )
        ) {
            const captureId = resolvePayPalCaptureIdFromReversalEvent(event);
            if (captureId) {
                const result = await reverseMembershipOrderPayment({
                    providerTransactionId: captureId,
                    rawNotify: { source: "paypal_webhook", event },
                    refundedAmountFen: parsePayPalAmount(
                        event?.resource?.amount?.value,
                    ),
                    refundCurrency: event?.resource?.amount?.currency_code,
                    fullReversal:
                        event?.event_type === "PAYMENT.CAPTURE.REVERSED",
                });
                if (!result.ok && result.code !== "ORDER_NOT_FOUND") {
                    console.error("PayPal membership reversal was not applied", {
                        eventId: event?.id,
                        captureId,
                        code: result.code,
                    });
                }
            }
            return res.status(200).json({ code: "SUCCESS", message: "OK" });
        }

        if (
            String(event?.event_type || "").startsWith("BILLING.SUBSCRIPTION.") ||
            String(event?.event_type || "").startsWith("PAYMENT.SALE.")
        ) {
            const subscriptionResult = await handlePayPalSubscriptionWebhook(event);
            if (!subscriptionResult.ok) {
                console.error("PayPal subscription webhook was not applied", {
                    eventId: event?.id,
                    eventType: event?.event_type,
                    code: subscriptionResult.code,
                });
            }
            return res.status(200).json({ code: "SUCCESS", message: "OK" });
        }

        const paypalOrderId = resolvePayPalOrderIdFromEvent(event);
        if (!paypalOrderId) {
            console.error("PayPal webhook missing related order id", {
                eventId: event?.id,
            });
            return res.status(200).json({ code: "SUCCESS", message: "ignored" });
        }

        let paypalOrder = await getPayPalOrder(paypalOrderId);
        let expectedOrder = null;
        if (event.event_type === "CHECKOUT.ORDER.APPROVED") {
            const outTradeNo = resolveOutTradeNoFromPayPalOrder(paypalOrder);
            expectedOrder = outTradeNo
                ? outTradeNo.startsWith("mbr_")
                    ? await getMembershipOrderByOutTradeNo(outTradeNo)
                    : await getCreditOrderByOutTradeNo(outTradeNo)
                : null;
            const storedPayPalOrderId = String(
                expectedOrder?.provider_data?.paypal_order_id || "",
            ).trim();
            if (
                !expectedOrder ||
                expectedOrder.provider !== "paypal" ||
                storedPayPalOrderId !== paypalOrderId
            ) {
                console.error("PayPal approved webhook order mismatch", {
                    eventId: event?.id,
                    paypalOrderId,
                    outTradeNo,
                });
                return res
                    .status(200)
                    .json({ code: "SUCCESS", message: "ignored" });
            }

            try {
                paypalOrder = await capturePayPalOrder({
                    paypalOrderId,
                    outTradeNo,
                });
            } catch (error) {
                if (!(error instanceof PayPalRequestError)) throw error;
                paypalOrder = await getPayPalOrder(paypalOrderId);
            }
        }
        const result = await markPayPalOrderPaidFromOrder({
            paypalOrder,
            expectedOrder,
            rawNotify: {
                source: "paypal_webhook",
                event,
            },
        });
        if (!result.ok) {
            console.error("PayPal webhook could not credit order", {
                eventId: event?.id,
                paypalOrderId,
                code: result.code,
            });
        }

        return res.status(200).json({ code: "SUCCESS", message: "OK" });
    } catch (error) {
        console.error("POST /payments/paypal/webhook error:", {
            name: error?.name,
            message: error?.message,
            status: error?.status,
            debugId: error?.debugId,
        });
        return jsonError(res, 500, "SERVER_ERROR", "server error");
    }
});

if (!isClerkAuthConfigured) {
    router.post("/credits/wechat/native", (_, res) => {
        return jsonError(
            res,
            501,
            "CLERK_NOT_CONFIGURED",
            "Clerk request auth is not configured on this server",
        );
    });

    router.post("/credits/paypal/config", (_, res) => {
        return jsonError(
            res,
            501,
            "CLERK_NOT_CONFIGURED",
            "Clerk request auth is not configured on this server",
        );
    });

    router.post("/credits/paypal/orders", (_, res) => {
        return jsonError(
            res,
            501,
            "CLERK_NOT_CONFIGURED",
            "Clerk request auth is not configured on this server",
        );
    });

    router.post("/credits/paypal/orders/:id/capture", (_, res) => {
        return jsonError(
            res,
            501,
            "CLERK_NOT_CONFIGURED",
            "Clerk request auth is not configured on this server",
        );
    });

    router.post("/memberships/wechat/native", (_, res) => {
        return jsonError(
            res,
            501,
            "CLERK_NOT_CONFIGURED",
            "Clerk request auth is not configured on this server",
        );
    });

    router.use("/memberships/paypal", (_, res) => {
        return jsonError(
            res,
            501,
            "CLERK_NOT_CONFIGURED",
            "Clerk request auth is not configured on this server",
        );
    });

    router.get("/credits/orders/:id", (_, res) => {
        return jsonError(
            res,
            501,
            "CLERK_NOT_CONFIGURED",
            "Clerk request auth is not configured on this server",
        );
    });

    router.get("/memberships/orders/:id", (_, res) => {
        return jsonError(
            res,
            501,
            "CLERK_NOT_CONFIGURED",
            "Clerk request auth is not configured on this server",
        );
    });
} else {
    router.use(clerkMiddleware());

    router.post("/credits/paypal/config", async (req, res) => {
        try {
            const auth = getAuth(req);
            if (!auth.userId) {
                return jsonError(res, 401, "UNAUTHORIZED", "Unauthenticated");
            }
            if (!isPayPalCheckoutConfigured()) {
                return jsonError(
                    res,
                    501,
                    "PAYPAL_NOT_CONFIGURED",
                    "PayPal is not configured on this server",
                );
            }

            return res.json({
                status: "success",
                data: {
                    clientId: getPayPalClientId(),
                    environment: getPayPalEnvironment(),
                    sdkUrl: getPayPalSdkUrl(),
                },
            });
        } catch (error) {
            console.error("POST /payments/credits/paypal/config error:", {
                name: error?.name,
                message: error?.message,
                status: error?.status,
                debugId: error?.debugId,
            });
            return jsonError(
                res,
                502,
                "PAYPAL_CONFIG_FAILED",
                "Failed to initialize PayPal checkout",
            );
        }
    });

    router.post("/credits/paypal/orders", async (req, res) => {
        try {
            const auth = getAuth(req);
            if (!auth.userId) {
                return jsonError(res, 401, "UNAUTHORIZED", "Unauthenticated");
            }
            if (!isPayPalCheckoutConfigured()) {
                return jsonError(
                    res,
                    501,
                    "PAYPAL_NOT_CONFIGURED",
                    "PayPal is not configured on this server",
                );
            }

            const product = getPayPalProductByKey(req.body?.productKey);
            if (!product) {
                return jsonError(
                    res,
                    400,
                    "INVALID_PRODUCT",
                    "Invalid credit product",
                );
            }

            const clerkUser = await clerkClient.users.getUser(auth.userId);
            const user = await upsertUserFromClerk(mapClerkUser(clerkUser));
            const outTradeNo = `cpt_${nanoid(20)}`;
            const attribution = sanitizeAttribution(req.body?.attribution);
            const createdOrder = await createCreditOrder({
                userId: user.id,
                clerkUserId: user.clerk_user_id,
                provider: "paypal",
                productKey: product.key,
                points: product.points,
                amountFen: product.amountFen,
                currency: product.currency,
                outTradeNo,
                providerData: attribution ? { attribution } : null,
            });

            const paypalOrder = await createPayPalOrder({
                outTradeNo,
                amountFen: product.amountFen,
                currency: product.currency,
                points: product.points,
            });
            if (typeof paypalOrder?.id !== "string" || !paypalOrder.id) {
                return jsonError(
                    res,
                    502,
                    "PAYPAL_INVALID_RESPONSE",
                    "PayPal order response missing id",
                );
            }

            const order = await updateCreditOrderProviderData(createdOrder.id, {
                paypal_order_id: paypalOrder.id,
                paypal_status: paypalOrder.status || "CREATED",
            });
            return res.json({
                status: "success",
                data: {
                    order,
                    paypal: {
                        orderId: paypalOrder.id,
                        status: paypalOrder.status,
                    },
                },
            });
        } catch (error) {
            console.error("POST /payments/credits/paypal/orders error:", {
                name: error?.name,
                message: error?.message,
                status: error?.status,
                debugId: error?.debugId,
            });
            return jsonError(
                res,
                502,
                "PAYPAL_CREATE_ORDER_FAILED",
                "Failed to create PayPal order",
            );
        }
    });

    router.post("/credits/paypal/orders/:id/capture", async (req, res) => {
        try {
            const auth = getAuth(req);
            if (!auth.userId) {
                return jsonError(res, 401, "UNAUTHORIZED", "Unauthenticated");
            }
            if (!isPayPalCheckoutConfigured()) {
                return jsonError(
                    res,
                    501,
                    "PAYPAL_NOT_CONFIGURED",
                    "PayPal is not configured on this server",
                );
            }

            const id = Number.parseInt(req.params.id, 10);
            if (!Number.isFinite(id) || id <= 0) {
                return jsonError(res, 400, "INVALID_ID", "Invalid order id");
            }
            const order = await getCreditOrderById(id);
            if (!order || order.clerk_user_id !== auth.userId) {
                return jsonError(res, 404, "NOT_FOUND", "Order not found");
            }
            if (order.provider !== "paypal") {
                return jsonError(
                    res,
                    409,
                    "PROVIDER_MISMATCH",
                    "Order is not a PayPal order",
                );
            }

            const storedPayPalOrderId = String(
                order?.provider_data?.paypal_order_id || "",
            ).trim();
            const approvedPayPalOrderId = String(req.body?.paypalOrderId || "").trim();
            if (
                !storedPayPalOrderId ||
                !approvedPayPalOrderId ||
                storedPayPalOrderId !== approvedPayPalOrderId
            ) {
                return jsonError(
                    res,
                    409,
                    "PAYPAL_ORDER_MISMATCH",
                    "PayPal order does not match local order",
                );
            }

            let paypalOrder = await getPayPalOrder(storedPayPalOrderId);
            let paypalStatus = getPayPalOrderStatus(paypalOrder);
            await updateCreditOrderProviderData(order.id, {
                paypal_status: paypalStatus,
            });

            if (!["APPROVED", "COMPLETED"].includes(paypalStatus)) {
                const pendingError = getPayPalPendingError(paypalOrder);
                return jsonError(
                    res,
                    409,
                    pendingError.code,
                    pendingError.message,
                    getPayPalErrorContext({ paypalOrder }),
                );
            }

            let captureError = null;
            if (canCapturePayPalOrder(paypalOrder)) {
                try {
                    paypalOrder = await capturePayPalOrder({
                        paypalOrderId: storedPayPalOrderId,
                        outTradeNo: order.out_trade_no,
                    });
                } catch (error) {
                    if (!(error instanceof PayPalRequestError)) throw error;
                    captureError = error;
                    paypalOrder = await getPayPalOrder(storedPayPalOrderId);
                }
                paypalStatus = getPayPalOrderStatus(paypalOrder);
                await updateCreditOrderProviderData(order.id, {
                    paypal_status: paypalStatus,
                    ...(captureError
                        ? {
                              paypal_last_issue:
                                  getPayPalRequestIssue(captureError),
                              paypal_last_debug_id:
                                  captureError.debugId || null,
                          }
                        : {}),
                });
            }

            const result = await markPayPalOrderPaidFromOrder({
                paypalOrder,
                expectedOrder: order,
                rawNotify: {
                    source: "paypal_capture",
                    paypalOrder,
                },
            });
            if (!result.ok) {
                const issue = getPayPalRequestIssue(captureError);
                const pendingError = getPayPalPendingError(paypalOrder);
                const code = [
                    "ORDER_NOT_APPROVED",
                    "PAYER_ACTION_REQUIRED",
                ].includes(issue)
                    ? pendingError.code
                    : result.code || "PAYPAL_CAPTURE_NOT_COMPLETED";
                return jsonError(
                    res,
                    409,
                    code,
                    "PayPal payment is not completed",
                    getPayPalErrorContext({
                        paypalOrder,
                        error: captureError,
                    }),
                );
            }

            return res.json({
                status: "success",
                data: {
                    order: result.order,
                    paypal: {
                        orderId: storedPayPalOrderId,
                        status: paypalOrder?.status,
                    },
                },
            });
        } catch (error) {
            console.error("POST /payments/credits/paypal/orders/:id/capture error:", {
                name: error?.name,
                message: error?.message,
                status: error?.status,
                debugId: error?.debugId,
            });
            return jsonError(
                res,
                502,
                "PAYPAL_CAPTURE_FAILED",
                "Failed to capture PayPal order",
            );
        }
    });

    router.post("/memberships/paypal/orders", async (req, res) => {
        try {
            const auth = getAuth(req);
            if (!auth.userId) {
                return jsonError(res, 401, "UNAUTHORIZED", "Unauthenticated");
            }
            if (!isPayPalCheckoutConfigured()) {
                return jsonError(
                    res,
                    501,
                    "PAYPAL_NOT_CONFIGURED",
                    "PayPal is not configured on this server",
                );
            }
            const product = getPayPalMembershipProductByKey(req.body?.productKey);
            if (!product || product.billingType !== "one_time") {
                return jsonError(
                    res,
                    400,
                    "INVALID_PRODUCT",
                    "Invalid one-time membership product",
                );
            }

            const clerkUser = await clerkClient.users.getUser(auth.userId);
            const user = await upsertUserFromClerk(mapClerkUser(clerkUser));
            await ensureMembershipCheckoutPlan(product.planKey);
            const outTradeNo = `mbr_${nanoid(20)}`;
            const attribution = sanitizeAttribution(req.body?.attribution);
            const createdOrder = await createMembershipOrder({
                userId: user.id,
                clerkUserId: user.clerk_user_id,
                provider: "paypal",
                productKey: product.key,
                planKey: product.planKey,
                durationDays: product.durationDays,
                amountFen: product.amountFen,
                currency: product.currency,
                outTradeNo,
                providerData: attribution ? { attribution } : null,
            });
            const paypalOrder = await createPayPalOrder({
                outTradeNo,
                amountFen: product.amountFen,
                currency: product.currency,
                description: getMembershipProductDescription(product.key),
            });
            if (typeof paypalOrder?.id !== "string" || !paypalOrder.id) {
                return jsonError(
                    res,
                    502,
                    "PAYPAL_INVALID_RESPONSE",
                    "PayPal order response missing id",
                );
            }
            const order = await updateMembershipOrderProviderData(
                createdOrder.id,
                {
                    paypal_order_id: paypalOrder.id,
                    paypal_status: paypalOrder.status || "CREATED",
                },
            );
            return res.json({
                status: "success",
                data: {
                    order,
                    paypal: {
                        orderId: paypalOrder.id,
                        status: paypalOrder.status,
                    },
                },
            });
        } catch (error) {
            console.error("POST /payments/memberships/paypal/orders error:", error);
            return jsonError(
                res,
                502,
                "PAYPAL_CREATE_ORDER_FAILED",
                "Failed to create PayPal membership order",
            );
        }
    });

    router.post("/memberships/paypal/orders/:id/capture", async (req, res) => {
        try {
            const auth = getAuth(req);
            if (!auth.userId) {
                return jsonError(res, 401, "UNAUTHORIZED", "Unauthenticated");
            }
            const id = Number.parseInt(req.params.id, 10);
            const order = Number.isFinite(id)
                ? await getMembershipOrderById(id)
                : null;
            if (!order || order.clerk_user_id !== auth.userId) {
                return jsonError(res, 404, "NOT_FOUND", "Order not found");
            }
            if (order.provider !== "paypal") {
                return jsonError(
                    res,
                    409,
                    "PROVIDER_MISMATCH",
                    "Order is not a PayPal order",
                );
            }
            const storedPayPalOrderId = String(
                order?.provider_data?.paypal_order_id || "",
            ).trim();
            const approvedPayPalOrderId = String(
                req.body?.paypalOrderId || "",
            ).trim();
            if (!storedPayPalOrderId || storedPayPalOrderId !== approvedPayPalOrderId) {
                return jsonError(
                    res,
                    409,
                    "PAYPAL_ORDER_MISMATCH",
                    "PayPal order does not match local order",
                );
            }

            let paypalOrder = await getPayPalOrder(storedPayPalOrderId);
            let paypalStatus = getPayPalOrderStatus(paypalOrder);
            if (!['APPROVED', 'COMPLETED'].includes(paypalStatus)) {
                const pendingError = getPayPalPendingError(paypalOrder);
                return jsonError(
                    res,
                    409,
                    pendingError.code,
                    pendingError.message,
                    getPayPalErrorContext({ paypalOrder }),
                );
            }
            if (canCapturePayPalOrder(paypalOrder)) {
                try {
                    paypalOrder = await capturePayPalOrder({
                        paypalOrderId: storedPayPalOrderId,
                        outTradeNo: order.out_trade_no,
                    });
                } catch (error) {
                    if (!(error instanceof PayPalRequestError)) throw error;
                    paypalOrder = await getPayPalOrder(storedPayPalOrderId);
                }
                paypalStatus = getPayPalOrderStatus(paypalOrder);
                await updateMembershipOrderProviderData(order.id, {
                    paypal_status: paypalStatus,
                });
            }
            const result = await markPayPalOrderPaidFromOrder({
                paypalOrder,
                expectedOrder: order,
                rawNotify: { source: "paypal_capture", paypalOrder },
            });
            if (!result.ok) {
                return jsonError(
                    res,
                    409,
                    result.code || "PAYPAL_CAPTURE_NOT_COMPLETED",
                    "PayPal payment is not completed",
                );
            }
            return res.json({
                status: "success",
                data: {
                    order: result.order,
                    paypal: {
                        orderId: storedPayPalOrderId,
                        status: paypalOrder?.status,
                    },
                },
            });
        } catch (error) {
            console.error(
                "POST /payments/memberships/paypal/orders/:id/capture error:",
                error,
            );
            return jsonError(
                res,
                502,
                "PAYPAL_CAPTURE_FAILED",
                "Failed to capture PayPal membership order",
            );
        }
    });

    router.post("/memberships/paypal/subscriptions", async (req, res) => {
        let pendingRecord = null;
        try {
            const auth = getAuth(req);
            if (!auth.userId) {
                return jsonError(res, 401, "UNAUTHORIZED", "Unauthenticated");
            }
            if (!isPayPalCheckoutConfigured()) {
                return jsonError(
                    res,
                    501,
                    "PAYPAL_NOT_CONFIGURED",
                    "PayPal is not configured on this server",
                );
            }
            const product = getPayPalMembershipProductByKey(req.body?.productKey);
            const paypalPlanId = getPayPalMembershipPlanId(product);
            if (
                !product ||
                product.billingType !== "subscription" ||
                !paypalPlanId
            ) {
                return jsonError(
                    res,
                    400,
                    "INVALID_PRODUCT",
                    "Invalid or unconfigured PayPal subscription product",
                );
            }
            const requestOrigin = String(req.get("origin") || "").trim();
            let returnUrl;
            try {
                returnUrl = new URL(String(req.body?.returnUrl || ""));
            } catch {
                return jsonError(
                    res,
                    400,
                    "INVALID_RETURN_URL",
                    "Invalid return URL",
                );
            }
            if (
                !requestOrigin ||
                returnUrl.origin !== requestOrigin ||
                !["http:", "https:"].includes(returnUrl.protocol)
            ) {
                return jsonError(
                    res,
                    400,
                    "INVALID_RETURN_URL",
                    "Return URL must use the requesting site origin",
                );
            }

            const clerkUser = await clerkClient.users.getUser(auth.userId);
            const user = await upsertUserFromClerk(mapClerkUser(clerkUser));
            let existingSubscription =
                await getCurrentPayPalMembershipSubscriptionForUser(auth.userId);
            const existingStatus = String(
                existingSubscription?.status || "",
            ).toUpperCase();
            const pendingExpired =
                ["APPROVAL_PENDING", "APPROVED"].includes(existingStatus) &&
                Date.now() - Number(existingSubscription?.created_at || 0) >
                    30 * 60 * 1000;
            if (pendingExpired && existingSubscription) {
                if (existingSubscription.paypal_subscription_id) {
                    try {
                        await cancelPayPalSubscription({
                            subscriptionId:
                                existingSubscription.paypal_subscription_id,
                            reason: "Expired incomplete FreeSaveVideo checkout",
                        });
                    } catch (error) {
                        if (
                            !(error instanceof PayPalRequestError) ||
                            error.status !== 422
                        ) {
                            throw error;
                        }
                    }
                }
                await closePayPalMembershipSubscriptionRecord({
                    id: existingSubscription.id,
                    providerData: { checkout_expired_at: Date.now() },
                });
                existingSubscription = null;
            }
            if (
                existingSubscription &&
                !existingSubscription.cancel_at_period_end &&
                ["APPROVAL_PENDING", "APPROVED", "ACTIVE", "SUSPENDED", "PAST_DUE"].includes(
                    String(existingSubscription.status).toUpperCase(),
                )
            ) {
                return jsonError(
                    res,
                    409,
                    "PAYPAL_SUBSCRIPTION_ALREADY_EXISTS",
                    "An active PayPal membership subscription already exists",
                );
            }
            const paypalPlan = await getPayPalPlan(paypalPlanId);
            if (!isMatchingPayPalMembershipPlan({ product, paypalPlan })) {
                return jsonError(
                    res,
                    503,
                    "PAYPAL_PLAN_MISMATCH",
                    "PayPal subscription plan price or billing interval is misconfigured",
                );
            }
            await ensureMembershipCheckoutPlan(product.planKey);
            const outTradeNo = `psb_${nanoid(20)}`;
            const attribution = sanitizeAttribution(req.body?.attribution);
            const record = await createPayPalMembershipSubscriptionRecord({
                userId: user.id,
                clerkUserId: user.clerk_user_id,
                outTradeNo,
                productKey: product.key,
                planKey: product.planKey,
                paypalPlanId,
                amountFen: product.amountFen,
                currency: product.currency,
                providerData: attribution ? { attribution } : null,
            });
            pendingRecord = record;
            const successUrl = new URL(returnUrl);
            successUrl.searchParams.set("paypal_membership", "return");
            successUrl.searchParams.set("subscription_id", String(record.id));
            const cancelUrl = new URL(returnUrl);
            cancelUrl.searchParams.set("paypal_membership", "cancelled");
            cancelUrl.searchParams.set("subscription_id", String(record.id));
            const paypalSubscription = await createPayPalSubscription({
                planId: paypalPlanId,
                outTradeNo,
                returnUrl: successUrl.toString(),
                cancelUrl: cancelUrl.toString(),
            });
            const approvalUrl = getPayPalSubscriptionApprovalUrl(
                paypalSubscription,
            );
            if (!paypalSubscription?.id || !approvalUrl) {
                return jsonError(
                    res,
                    502,
                    "PAYPAL_INVALID_RESPONSE",
                    "PayPal subscription response is incomplete",
                );
            }
            const subscription = await attachPayPalMembershipSubscription({
                id: record.id,
                paypalSubscriptionId: paypalSubscription.id,
                providerData: { paypal_status: paypalSubscription.status },
            });
            return res.json({
                status: "success",
                data: {
                    subscription,
                    paypal: {
                        subscriptionId: paypalSubscription.id,
                        status: paypalSubscription.status,
                        approvalUrl,
                    },
                },
            });
        } catch (error) {
            if (pendingRecord?.id && !pendingRecord.paypal_subscription_id) {
                try {
                    await closePayPalMembershipSubscriptionRecord({
                        id: pendingRecord.id,
                        providerData: {
                            create_failed_at: Date.now(),
                            create_failed_message: String(error?.message || "").slice(
                                0,
                                500,
                            ),
                        },
                    });
                } catch (closeError) {
                    console.error(
                        "Failed to close incomplete PayPal subscription record:",
                        closeError,
                    );
                }
            }
            console.error(
                "POST /payments/memberships/paypal/subscriptions error:",
                error,
            );
            return jsonError(
                res,
                502,
                "PAYPAL_CREATE_SUBSCRIPTION_FAILED",
                "Failed to create PayPal subscription",
            );
        }
    });

    router.get("/memberships/paypal/subscription", async (req, res) => {
        try {
            const auth = getAuth(req);
            if (!auth.userId) {
                return jsonError(res, 401, "UNAUTHORIZED", "Unauthenticated");
            }
            let subscription = await getCurrentPayPalMembershipSubscriptionForUser(
                auth.userId,
            );
            if (
                subscription?.paypal_subscription_id &&
                isPayPalCheckoutConfigured()
            ) {
                try {
                    const paypalSubscription = await getPayPalSubscription(
                        subscription.paypal_subscription_id,
                    );
                    const paypalStatus = String(
                        paypalSubscription?.status || subscription.status,
                    ).toUpperCase();
                    const updated = await updatePayPalMembershipSubscriptionStatus({
                        paypalSubscriptionId: subscription.paypal_subscription_id,
                        status: paypalStatus,
                        cancelAtPeriodEnd: ["CANCELLED", "EXPIRED"].includes(
                            paypalStatus,
                        ),
                        providerData: { paypal_status: paypalStatus },
                    });
                    subscription = updated
                        ? { ...subscription, ...updated }
                        : subscription;
                } catch (error) {
                    console.error("PayPal subscription status sync failed:", {
                        subscriptionId: subscription.paypal_subscription_id,
                        message: error?.message,
                    });
                }
            }
            return res.json({ status: "success", data: { subscription } });
        } catch (error) {
            console.error("GET /payments/memberships/paypal/subscription error:", error);
            return jsonError(res, 500, "SERVER_ERROR", "Failed to load subscription");
        }
    });

    router.post("/memberships/paypal/subscriptions/:id/cancel", async (req, res) => {
        try {
            const auth = getAuth(req);
            if (!auth.userId) {
                return jsonError(res, 401, "UNAUTHORIZED", "Unauthenticated");
            }
            const id = Number.parseInt(req.params.id, 10);
            const subscription = Number.isFinite(id)
                ? await getPayPalMembershipSubscriptionForUser({
                      id,
                      clerkUserId: auth.userId,
                  })
                : null;
            if (!subscription?.paypal_subscription_id) {
                return jsonError(res, 404, "NOT_FOUND", "Subscription not found");
            }
            if (!subscription.cancel_at_period_end) {
                try {
                    await cancelPayPalSubscription({
                        subscriptionId: subscription.paypal_subscription_id,
                        reason: "Cancelled by the FreeSaveVideo member",
                    });
                } catch (error) {
                    if (!(error instanceof PayPalRequestError) || error.status !== 422) {
                        throw error;
                    }
                }
            }
            const updated = await updatePayPalMembershipSubscriptionStatus({
                paypalSubscriptionId: subscription.paypal_subscription_id,
                status: "CANCELLED",
                cancelAtPeriodEnd: true,
                providerData: { cancelled_by: "user", cancelled_at: Date.now() },
            });
            return res.json({ status: "success", data: { subscription: updated } });
        } catch (error) {
            console.error(
                "POST /payments/memberships/paypal/subscriptions/:id/cancel error:",
                error,
            );
            return jsonError(
                res,
                502,
                "PAYPAL_CANCEL_FAILED",
                "Failed to cancel PayPal subscription",
            );
        }
    });

    router.post("/credits/wechat/native", async (req, res) => {
        try {
            const auth = getAuth(req);
            if (!auth.userId) {
                return jsonError(res, 401, "UNAUTHORIZED", "Unauthenticated");
            }

            if (!isWechatPayConfigured()) {
                return jsonError(
                    res,
                    501,
                    "WECHATPAY_NOT_CONFIGURED",
                    "WeChat Pay is not configured on this server",
                );
            }

            const productKey = req.body?.productKey;
            const product = getWechatProductByKey(productKey);
            if (!product) {
                return jsonError(
                    res,
                    400,
                    "INVALID_PRODUCT",
                    "Invalid credit product",
                );
            }

            const clerkUser = await clerkClient.users.getUser(auth.userId);
            const user = await upsertUserFromClerk(mapClerkUser(clerkUser));

            const outTradeNo = `cpt_${nanoid(20)}`;
            const attribution = sanitizeAttribution(req.body?.attribution);
            const createdOrder = await createCreditOrder({
                userId: user.id,
                clerkUserId: user.clerk_user_id,
                provider: "wechat",
                productKey: product.key,
                points: product.points,
                amountFen: product.amountFen,
                currency: product.currency,
                outTradeNo,
                providerData: attribution ? { attribution } : null,
            });

            const description = `Points top-up ${product.points}`;
            const wechat = await createWechatNativeTransaction({
                outTradeNo,
                amountFen: product.amountFen,
                currency: product.currency,
                description,
                attach: JSON.stringify({
                    creditOrderId: createdOrder.id,
                    productKey: product.key,
                    clerkUserId: user.clerk_user_id,
                }),
            });

            const order = await updateCreditOrderProviderData(createdOrder.id, {
                code_url: wechat.codeUrl,
            });

            res.json({
                status: "success",
                data: {
                    order,
                    wechat: {
                        codeUrl: wechat.codeUrl,
                    },
                },
            });
        } catch (error) {
            console.error("POST /payments/credits/wechat/native error:", error);
            return jsonError(
                res,
                500,
                "SERVER_ERROR",
                "Failed to create payment",
            );
        }
    });

    router.post("/memberships/wechat/native", async (req, res) => {
        try {
            const auth = getAuth(req);
            if (!auth.userId) {
                return jsonError(res, 401, "UNAUTHORIZED", "Unauthenticated");
            }

            if (!isWechatPayConfigured()) {
                return jsonError(
                    res,
                    501,
                    "WECHATPAY_NOT_CONFIGURED",
                    "WeChat Pay is not configured on this server",
                );
            }

            const productKey = req.body?.productKey;
            const product = getWechatMembershipProductByKey(productKey);
            if (!product) {
                return jsonError(
                    res,
                    400,
                    "INVALID_PRODUCT",
                    "Invalid membership product",
                );
            }

            const clerkUser = await clerkClient.users.getUser(auth.userId);
            const user = await upsertUserFromClerk(mapClerkUser(clerkUser));
            await ensureMembershipCheckoutPlan(product.planKey);

            const outTradeNo = `mbr_${nanoid(20)}`;
            const attribution = sanitizeAttribution(req.body?.attribution);
            const createdOrder = await createMembershipOrder({
                userId: user.id,
                clerkUserId: user.clerk_user_id,
                provider: "wechat",
                productKey: product.key,
                planKey: product.planKey,
                durationDays: product.durationDays,
                amountFen: product.amountFen,
                currency: product.currency,
                outTradeNo,
                providerData: attribution ? { attribution } : null,
            });

            const description = getMembershipProductDescription(product.key);
            const wechat = await createWechatNativeTransaction({
                outTradeNo,
                amountFen: product.amountFen,
                currency: product.currency,
                description,
                attach: JSON.stringify({
                    membershipOrderId: createdOrder.id,
                    productKey: product.key,
                    clerkUserId: user.clerk_user_id,
                }),
            });

            const order = await updateMembershipOrderProviderData(
                createdOrder.id,
                {
                    code_url: wechat.codeUrl,
                },
            );

            res.json({
                status: "success",
                data: {
                    order,
                    wechat: {
                        codeUrl: wechat.codeUrl,
                    },
                },
            });
        } catch (error) {
            console.error("POST /payments/memberships/wechat/native error:", error);
            return jsonError(
                res,
                500,
                "SERVER_ERROR",
                "Failed to create membership payment",
            );
        }
    });

    router.get("/credits/orders/:id", async (req, res) => {
        try {
            const auth = getAuth(req);
            if (!auth.userId) {
                return jsonError(res, 401, "UNAUTHORIZED", "Unauthenticated");
            }

            const id = Number.parseInt(req.params.id, 10);
            if (!Number.isFinite(id)) {
                return jsonError(res, 400, "INVALID_ID", "Invalid order id");
            }

            const order = await getCreditOrderById(id);
            if (!order || order.clerk_user_id !== auth.userId) {
                return jsonError(res, 404, "NOT_FOUND", "Order not found");
            }

            const shouldSync =
                req.query?.sync === "1" ||
                req.query?.sync === "true" ||
                req.query?.sync === "yes";

            let resolvedOrder = order;

            if (
                shouldSync &&
                order.provider === "wechat" &&
                order.status !== "PAID" &&
                isWechatPayConfigured()
            ) {
                try {
                    const transaction = await queryWechatTransactionByOutTradeNo(
                        order.out_trade_no,
                    );

                    const configMchId = process.env.WECHATPAY_MCH_ID;
                    const configAppId = process.env.WECHATPAY_APP_ID;
                    if (
                        (configMchId &&
                            transaction?.mchid &&
                            transaction.mchid !== configMchId) ||
                        (configAppId &&
                            transaction?.appid &&
                            transaction.appid !== configAppId)
                    ) {
                        console.error("WeChat Pay sync merchant/app mismatch", {
                            mchid: transaction?.mchid,
                            appid: transaction?.appid,
                        });
                    } else if (transaction?.trade_state === "SUCCESS") {
                        const totalFen = transaction?.amount?.total;
                        const parsedPaidAt = transaction?.success_time
                            ? Date.parse(transaction.success_time)
                            : Number.NaN;
                        const paidAt = Number.isFinite(parsedPaidAt)
                            ? parsedPaidAt
                            : Date.now();

                        if (typeof totalFen === "number") {
                            const result = await markCreditOrderPaid({
                                outTradeNo: order.out_trade_no,
                                providerTransactionId:
                                    transaction?.transaction_id,
                                paidAt,
                                rawNotify: {
                                    source: "query",
                                    transaction,
                                },
                                totalFen,
                            });

                            if (result?.order) {
                                resolvedOrder = result.order;
                            }
                        }
                    }
                } catch (error) {
                    console.error(
                        "WeChat Pay sync order status failed:",
                        order?.out_trade_no,
                        error,
                    );
                }
            }

            if (
                shouldSync &&
                order.provider === "paypal" &&
                order.status !== "PAID" &&
                isPayPalCheckoutConfigured()
            ) {
                try {
                    const paypalOrderId = String(
                        order?.provider_data?.paypal_order_id || "",
                    ).trim();
                    if (paypalOrderId) {
                        const paypalOrder = await getPayPalOrder(paypalOrderId);
                        const result = await markPayPalOrderPaidFromOrder({
                            paypalOrder,
                            expectedOrder: order,
                            rawNotify: {
                                source: "paypal_order_sync",
                                paypalOrder,
                            },
                        });
                        if (result?.order) {
                            resolvedOrder = result.order;
                        }
                    }
                } catch (error) {
                    console.error(
                        "PayPal sync order status failed:",
                        order?.out_trade_no,
                        error,
                    );
                }
            }

            return res.json({
                status: "success",
                data: { order: resolvedOrder },
            });
        } catch (error) {
            console.error("GET /payments/credits/orders/:id error:", error);
            return jsonError(
                res,
                500,
                "SERVER_ERROR",
                "Failed to load order",
            );
        }
    });

    router.get("/memberships/orders/:id", async (req, res) => {
        try {
            const auth = getAuth(req);
            if (!auth.userId) {
                return jsonError(res, 401, "UNAUTHORIZED", "Unauthenticated");
            }

            const id = Number.parseInt(req.params.id, 10);
            if (!Number.isFinite(id)) {
                return jsonError(res, 400, "INVALID_ID", "Invalid order id");
            }

            const order = await getMembershipOrderById(id);
            if (!order || order.clerk_user_id !== auth.userId) {
                return jsonError(res, 404, "NOT_FOUND", "Order not found");
            }

            const shouldSync =
                req.query?.sync === "1" ||
                req.query?.sync === "true" ||
                req.query?.sync === "yes";

            let resolvedOrder = order;

            if (
                shouldSync &&
                order.provider === "wechat" &&
                order.status !== "PAID" &&
                isWechatPayConfigured()
            ) {
                try {
                    const transaction = await queryWechatTransactionByOutTradeNo(
                        order.out_trade_no,
                    );

                    const configMchId = process.env.WECHATPAY_MCH_ID;
                    const configAppId = process.env.WECHATPAY_APP_ID;
                    if (
                        (configMchId &&
                            transaction?.mchid &&
                            transaction.mchid !== configMchId) ||
                        (configAppId &&
                            transaction?.appid &&
                            transaction.appid !== configAppId)
                    ) {
                        console.error("WeChat Pay membership sync merchant/app mismatch", {
                            mchid: transaction?.mchid,
                            appid: transaction?.appid,
                        });
                    } else if (transaction?.trade_state === "SUCCESS") {
                        const totalFen = transaction?.amount?.total;
                        const parsedPaidAt = transaction?.success_time
                            ? Date.parse(transaction.success_time)
                            : Number.NaN;
                        const paidAt = Number.isFinite(parsedPaidAt)
                            ? parsedPaidAt
                            : Date.now();

                        if (typeof totalFen === "number") {
                            const result = await markMembershipOrderPaid({
                                outTradeNo: order.out_trade_no,
                                providerTransactionId:
                                    transaction?.transaction_id,
                                paidAt,
                                rawNotify: {
                                    source: "query",
                                    transaction,
                                },
                                totalFen,
                            });

                            if (result?.order) {
                                resolvedOrder = result.order;
                            }
                        }
                    }
                } catch (error) {
                    console.error(
                        "WeChat Pay sync membership order status failed:",
                        order?.out_trade_no,
                        error,
                    );
                }
            }

            return res.json({
                status: "success",
                data: { order: resolvedOrder },
            });
        } catch (error) {
            console.error("GET /payments/memberships/orders/:id error:", error);
            return jsonError(
                res,
                500,
                "SERVER_ERROR",
                "Failed to load membership order",
            );
        }
    });
}

export default router;
