import express from "express";
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";
import { nanoid } from "nanoid";

import { MEMBER_DOWNLOAD_LIMITS, upsertUserFromClerk, getActiveMembershipForUser } from "../db/users.js";
import { recordBuyMeACoffeeReceipt } from "../db/buymeacoffee-receipts.js";
import {
    createCreditOrder,
    getCreditOrderById,
    getCreditOrderByOutTradeNo,
    markCreditOrderPaid,
    updatePendingCreditOrder,
    updateCreditOrderProviderData,
} from "../db/credit-orders.js";
import {
    createMembershipOrder,
    ensureMembershipCheckoutPlan,
    getMembershipOrderById,
    getMembershipOrderByOutTradeNo,
    markMembershipOrderPaid,
    updateMembershipOrderProviderData,
    updatePendingMembershipOrder,
} from "../db/membership-orders.js";
import {
    createWechatNativeTransaction,
    decryptWechatpayEventResource,
    isWechatPayConfigured,
    queryWechatTransactionByOutTradeNo,
    verifyWechatpaySignature,
} from "../payments/wechatpay.js";
import {
    NOWPAYMENTS_MEMBERSHIP_PRODUCTS,
    WECHAT_MEMBERSHIP_PRODUCTS,
    getMembershipProductDescription,
    getNowPaymentsMembershipProductByKey,
    getWechatMembershipProductByKey,
} from "../payments/membership-products.js";

import {
    NowPaymentsRequestError,
    createNowInvoice,
    getNowPayment,
    getNowPaymentsPayoutCurrency,
    getNowPaymentsStatus,
    isDecimalAtLeast,
    isNowPaymentsConfigured,
    parseDecimalToMinorUnits,
    toPublicNowInvoice,
    verifyNowPaymentsIpnSignature,
} from "../payments/nowpayments.js";
import {
    BUYMEACOFFEE_CREDIT_PRODUCTS,
    BUYMEACOFFEE_MEMBERSHIP_PRODUCTS,
    isBuyMeACoffeeProductAvailable,
    getBuyMeACoffeeProductByKey,
    isBuyMeACoffeeConfigured,
    parseBuyMeACoffeePurchaseEvent,
    verifyBuyMeACoffeeSignature,
} from "../payments/buymeacoffee.js";

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

const NOWPAYMENTS_CREDIT_PRODUCTS = [
    {
        key: "nowpayments_usd_199",
        points: 600,
        amountFen: 199,
        currency: "USD",
        unitPriceFen: 0.332,
    },
    {
        key: "nowpayments_usd_499",
        points: 2000,
        amountFen: 499,
        currency: "USD",
        unitPriceFen: 0.25,
    },
    {
        key: "nowpayments_usd_999",
        points: 5000,
        amountFen: 999,
        currency: "USD",
        unitPriceFen: 0.2,
    },
    {
        key: "nowpayments_usd_1999",
        points: 12000,
        amountFen: 1999,
        currency: "USD",
        unitPriceFen: 0.167,
    },
    {
        key: "nowpayments_usd_4999",
        points: 35000,
        amountFen: 4999,
        currency: "USD",
        unitPriceFen: 0.143,
    },
];

const getWechatProductByKey = (key) =>
    WECHAT_CREDIT_PRODUCTS.find((p) => p.key === key);
const getNowPaymentsProductByKey = (key) =>
    NOWPAYMENTS_CREDIT_PRODUCTS.find((p) => p.key === key);
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

const normalizeProvider = (rawProvider, fallback = "wechat") => {
    const normalized = String(rawProvider || "")
        .trim()
        .toLowerCase();
    if (["wechat", "nowpayments", "buymeacoffee"].includes(normalized)) {
        return normalized;
    }
    return fallback;
};

const buildPublicProducts = (provider) => {
    if (provider === "buymeacoffee") {
        const enabled = isBuyMeACoffeeConfigured();
        return BUYMEACOFFEE_CREDIT_PRODUCTS.map((product) => ({
            key: product.key,
            points: product.points,
            unitPriceFen: product.unitPriceFen,
            amountFen: product.amountFen,
            currency: product.currency,
            enabled: enabled && isBuyMeACoffeeProductAvailable(product),
        }));
    }
    if (provider === "nowpayments") {
        const enabled = isNowPaymentsConfigured();
        return NOWPAYMENTS_CREDIT_PRODUCTS.map((product) => ({
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
    if (provider === "buymeacoffee") return BUYMEACOFFEE_MEMBERSHIP_PRODUCTS.map((product) => ({
        ...product, enabled: isBuyMeACoffeeConfigured() && isBuyMeACoffeeProductAvailable(product),
    }));
    if (provider === "nowpayments") {
        const enabled = isNowPaymentsConfigured();
        return NOWPAYMENTS_MEMBERSHIP_PRODUCTS.map((product) => ({
            key: product.key,
            planKey: product.planKey,
            durationDays: product.durationDays,
            amountFen: product.amountFen,
            currency: product.currency,
            billingType: product.billingType,
            entitlements: product.entitlements,
            limits: product.limits,
            enabled,
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

const parseNowPaymentsReturnUrl = (req) => {
    const rawReturnUrl = String(req.body?.returnUrl || "").trim();
    const rawOrigin = String(req.header("origin") || "").trim();
    let returnUrl;
    let requestOrigin;
    try {
        returnUrl = new URL(rawReturnUrl);
        requestOrigin = new URL(rawOrigin);
    } catch {
        return null;
    }
    if (
        returnUrl.origin !== requestOrigin.origin ||
        (returnUrl.protocol !== "https:" &&
            !(
                returnUrl.protocol === "http:" &&
                ["localhost", "127.0.0.1"].includes(returnUrl.hostname)
            ))
    ) {
        return null;
    }
    return returnUrl;
};

const buildNowPaymentsReturnUrls = ({ returnUrl, orderId, kind }) => {
    const makeUrl = (result) => {
        const url = new URL(returnUrl.toString());
        url.hash = "";
        url.searchParams.set("nowpayments", result);
        url.searchParams.set("nowpayments_order", String(orderId));
        url.searchParams.set("nowpayments_kind", kind);
        return url.toString();
    };
    return {
        successUrl: makeUrl("return"),
        cancelUrl: makeUrl("cancel"),
    };
};

const isTrustedNowPaymentsInvoiceUrl = (value) => {
    try {
        const url = new URL(String(value || ""));
        return (
            url.protocol === "https:" &&
            (url.hostname === "nowpayments.io" ||
                url.hostname.endsWith(".nowpayments.io"))
        );
    } catch {
        return false;
    }
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

const getNowPaymentsProviderData = (payment) => ({
    nowpayments_payment_id: String(payment?.payment_id || ""),
    nowpayments_invoice_id: String(payment?.invoice_id || ""),
    nowpayments_status: getNowPaymentsStatus(payment),
    pay_address: String(payment?.pay_address || ""),
    pay_amount: String(payment?.pay_amount ?? ""),
    pay_currency: String(payment?.pay_currency || "").toLowerCase(),
    actually_paid: String(payment?.actually_paid ?? ""),
    outcome_amount: String(payment?.outcome_amount ?? ""),
    outcome_currency: String(payment?.outcome_currency || "").toLowerCase(),
    expiration_estimate_date: payment?.expiration_estimate_date || null,
    nowpayments_updated_at: payment?.updated_at || null,
});

const applyNowPaymentsPaymentUpdate = async ({ payment, rawNotify }) => {
    const outTradeNo = String(payment?.order_id || "").trim();
    const paymentId = String(payment?.payment_id || "").trim();
    if (!outTradeNo || !/^\d+$/.test(paymentId)) {
        return { ok: false, code: "INVALID_PAYMENT_UPDATE" };
    }

    const isMembershipOrder = outTradeNo.startsWith("mbr_");
    const order = isMembershipOrder
        ? await getMembershipOrderByOutTradeNo(outTradeNo)
        : await getCreditOrderByOutTradeNo(outTradeNo);
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
    if (order.provider !== "nowpayments") {
        return { ok: false, code: "PROVIDER_MISMATCH", order };
    }

    const storedPaymentId = String(
        order?.provider_data?.nowpayments_payment_id || "",
    ).trim();
    const storedInvoiceId = String(
        order?.provider_data?.nowpayments_invoice_id || "",
    ).trim();
    const receivedInvoiceId = String(payment?.invoice_id || "").trim();
    if (storedInvoiceId) {
        if (storedInvoiceId !== receivedInvoiceId) {
            return { ok: false, code: "INVOICE_ID_MISMATCH", order };
        }
    } else if (!storedPaymentId || storedPaymentId !== paymentId) {
        return { ok: false, code: "PAYMENT_ID_MISMATCH", order };
    }

    const storedPayCurrency = String(
        order?.provider_data?.pay_currency || "",
    ).toLowerCase();
    const receivedPayCurrency = String(payment?.pay_currency || "").toLowerCase();
    if (
        storedPayCurrency &&
        receivedPayCurrency &&
        storedPayCurrency !== receivedPayCurrency
    ) {
        return { ok: false, code: "PAY_CURRENCY_MISMATCH", order };
    }

    const providerData = getNowPaymentsProviderData(payment);
    const status = getNowPaymentsStatus(payment);
    const updatePendingOrder = isMembershipOrder
        ? updatePendingMembershipOrder
        : updatePendingCreditOrder;

    if (status === "finished") {
        const expectedOutcomeCurrency = String(
            order?.provider_data?.expected_outcome_currency ||
                getNowPaymentsPayoutCurrency(),
        ).toLowerCase();
        const receivedOutcomeCurrency = String(
            payment?.outcome_currency || "",
        ).toLowerCase();
        if (receivedOutcomeCurrency !== expectedOutcomeCurrency) {
            await updatePendingOrder({
                id: order.id,
                status: "FAILED",
                providerData: {
                    ...providerData,
                    validation_error: "OUTCOME_CURRENCY_MISMATCH",
                    expected_outcome_currency: expectedOutcomeCurrency,
                },
                rawNotify,
            });
            return { ok: false, code: "OUTCOME_CURRENCY_MISMATCH", order };
        }
    }

    await updatePendingOrder({
        id: order.id,
        status:
            status === "expired"
                ? "CLOSED"
                : status === "failed"
                  ? "FAILED"
                  : "CREATED",
        providerData,
        rawNotify,
    });

    if (status !== "finished") {
        return { ok: true, code: "PENDING", order, paymentStatus: status };
    }

    const totalFen = parseDecimalToMinorUnits(payment?.price_amount);
    const priceCurrency = String(payment?.price_currency || "").toUpperCase();
    if (
        !Number.isFinite(totalFen) ||
        totalFen !== Number(order.amount_fen) ||
        priceCurrency !== String(order.currency || "").toUpperCase()
    ) {
        await updatePendingOrder({
            id: order.id,
            status: "FAILED",
            providerData: {
                ...providerData,
                validation_error: "PRICE_MISMATCH",
            },
            rawNotify,
        });
        return { ok: false, code: "AMOUNT_MISMATCH", order };
    }

    if (!isDecimalAtLeast(payment?.actually_paid, payment?.pay_amount)) {
        await updatePendingOrder({
            id: order.id,
            status: "FAILED",
            providerData: {
                ...providerData,
                validation_error: "UNDERPAID",
            },
            rawNotify,
        });
        return { ok: false, code: "UNDERPAID", order };
    }

    const markOrderPaid = isMembershipOrder
        ? markMembershipOrderPaid
        : markCreditOrderPaid;
    return await markOrderPaid({
        outTradeNo,
        providerTransactionId: paymentId,
        paidAt: Date.now(),
        rawNotify,
        totalFen,
    });
};

router.get("/credits/products", async (req, res) => {
    try {
        const provider = normalizeProvider(req.query?.provider, "wechat");
        res.json({
            status: "success",
            data: {
                provider,
                products: buildPublicProducts(provider),
                ...(provider === "nowpayments"
                    ? { checkoutMode: "hosted_invoice" }
                    : {}),
            },
        });
    } catch (error) {
        console.error("GET /payments/credits/products error:", error);
        return jsonError(
            res,
            502,
            "PRODUCTS_UNAVAILABLE",
            "Failed to load payment limits",
        );
    }
});

router.get("/memberships/products", async (req, res) => {
    try {
        const provider = normalizeProvider(req.query?.provider, "wechat");
        const products = buildPublicMembershipProducts(provider);
        res.json({
            status: "success",
            data: {
                provider,
                products,
                limits:
                    provider === "nowpayments" && products.length === 1
                        ? products[0].limits
                        : MEMBER_DOWNLOAD_LIMITS,
                ...(provider === "nowpayments"
                    ? { checkoutMode: "hosted_invoice" }
                    : {}),
            },
        });
    } catch (error) {
        console.error("GET /payments/memberships/products error:", error);
        return jsonError(
            res,
            502,
            "PRODUCTS_UNAVAILABLE",
            "Failed to load membership payment limits",
        );
    }
});

router.post("/nowpayments/ipn", async (req, res) => {
    try {
        if (!isNowPaymentsConfigured()) {
            return jsonError(
                res,
                500,
                "NOWPAYMENTS_NOT_CONFIGURED",
                "NOWPayments is not configured",
            );
        }

        const signature = req.header("x-nowpayments-sig");
        if (
            !verifyNowPaymentsIpnSignature({
                signature,
                payload: req.body || {},
            })
        ) {
            console.warn("NOWPayments IPN signature invalid");
            return jsonError(res, 401, "INVALID_SIGNATURE", "invalid signature");
        }

        const result = await applyNowPaymentsPaymentUpdate({
            payment: req.body || {},
            rawNotify: {
                source: "nowpayments_ipn",
                signature,
                payment: req.body || {},
            },
        });

        if (!result.ok) {
            console.error("NOWPayments IPN rejected", {
                code: result.code,
                orderId: req.body?.order_id || null,
                paymentId: req.body?.payment_id || null,
            });
            const retryable = result.code === "ORDER_NOT_FOUND";
            if (retryable) {
                return jsonError(
                    res,
                    500,
                    result.code,
                    "NOWPayments update rejected",
                );
            }

            // The signature is valid and permanent validation failures will not
            // improve on retry. Acknowledge them to avoid an endless IPN loop.
            return res.status(200).json({
                status: "ignored",
                code: result.code,
            });
        }

        return res.status(200).json({ status: "success" });
    } catch (error) {
        console.error("POST /payments/nowpayments/ipn error:", error);
        return jsonError(res, 500, "SERVER_ERROR", "server error");
    }
});

router.post("/buymeacoffee/webhook", async (req, res) => {
    try {
        if (!isBuyMeACoffeeConfigured()) {
            return jsonError(res, 500, "BUYMEACOFFEE_NOT_CONFIGURED", "Buy Me a Coffee is not configured");
        }
        const signature = req.header("x-signature-sha256");
        if (!verifyBuyMeACoffeeSignature({ rawBody: req.rawBody, signature })) {
            console.warn("Buy Me a Coffee webhook signature invalid");
            return jsonError(res, 401, "INVALID_SIGNATURE", "invalid signature");
        }
        if (req.body?.live_mode !== true) {
            return res.status(200).json({ status: "test_received" });
        }
        if (req.body?.type === "extra_purchase.refunded") {
            await recordBuyMeACoffeeReceipt(req.body, { ok: false, code: "REFUND_REVIEW" });
            console.warn("Buy Me a Coffee purchase refunded; manual credit review required", {
                eventId: req.body?.event_id || null,
                transactionId: req.body?.data?.transaction_id || null,
            });
            return res.status(200).json({ status: "refund_recorded" });
        }

        const parsed = parseBuyMeACoffeePurchaseEvent(req.body || {});
        // Persist verified provider payments even when they cannot yet credit an order.
        // A database failure returns 500 so the provider can retry rather than lose a receipt.
        await recordBuyMeACoffeeReceipt(req.body, parsed);
        if (!parsed.ok) {
            if (parsed.code === "ORDER_CODE_MISSING") {
                console.warn("Buy Me a Coffee purchase awaiting order code", {
                    eventId: req.body?.event_id || null,
                    transactionId: req.body?.data?.transaction_id || null,
                    eventType: req.body?.type || null,
                });
                return res.status(200).json({ status: "awaiting_order_code" });
            }
            console.error("Buy Me a Coffee webhook rejected", {
                code: parsed.code,
                eventId: req.body?.event_id || null,
            });
            return res.status(200).json({ status: "ignored", code: parsed.code });
        }
        const isMembership = parsed.product.kind === "membership";
        const order = await (isMembership ? getMembershipOrderByOutTradeNo : getCreditOrderByOutTradeNo)(parsed.outTradeNo);
        if (!order) {
            return jsonError(res, 500, "ORDER_NOT_FOUND", "payment order not found");
        }
        if (order.provider !== "buymeacoffee" || order.product_key !== parsed.product.key) {
            console.error("Buy Me a Coffee order/product mismatch", {
                orderId: order.id,
                provider: order.provider,
                productKey: order.product_key,
            });
            return res.status(200).json({ status: "ignored", code: "ORDER_PRODUCT_MISMATCH" });
        }
        if (order.status === "PAID" && order.provider_transaction_id !== parsed.transactionId) {
            console.error("Buy Me a Coffee paid order received a different transaction", { orderId: order.id });
            return res.status(200).json({ status: "manual_review", code: "TRANSACTION_MISMATCH" });
        }
        const result = await (isMembership ? markMembershipOrderPaid : markCreditOrderPaid)({
            outTradeNo: parsed.outTradeNo,
            providerTransactionId: parsed.transactionId,
            paidAt: parsed.paidAt,
            totalFen: parsed.amountFen,
            rawNotify: { source: "buymeacoffee_webhook", event: req.body || {} },
        });
        if (!result.ok) {
            const retryable = result.code === "ORDER_NOT_FOUND";
            return retryable
                ? jsonError(res, 500, result.code, "credit order update failed")
                : res.status(200).json({ status: "ignored", code: result.code });
        }
        if (result.code === "PAID") {
            await (isMembership ? updateMembershipOrderProviderData : updateCreditOrderProviderData)(order.id, {
                buymeacoffee_event_id: String(req.body?.event_id || ""),
                buymeacoffee_product_id: parsed.product.productId,
                supporter_email: String(req.body?.data?.supporter_email || ""),
            });
        }
        console.info("Buy Me a Coffee payment processed", {
            orderId: order.id,
            eventType: req.body?.type,
            eventId: req.body?.event_id,
            result: result.code,
        });
        return res.status(200).json({ status: "success" });
    } catch (error) {
        console.error("POST /payments/buymeacoffee/webhook error:", error);
        return jsonError(res, 500, "SERVER_ERROR", "server error");
    }
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

if (!isClerkAuthConfigured) {
    router.post("/credits/wechat/native", (_, res) => {
        return jsonError(
            res,
            501,
            "CLERK_NOT_CONFIGURED",
            "Clerk request auth is not configured on this server",
        );
    });

    router.post("/credits/nowpayments", (_, res) => {
        return jsonError(
            res,
            501,
            "CLERK_NOT_CONFIGURED",
            "Clerk request auth is not configured on this server",
        );
    });

    router.post(["/credits/buymeacoffee", "/memberships/buymeacoffee"], (_, res) => {
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

    router.post("/memberships/nowpayments", (_, res) => {
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

    router.post(["/credits/buymeacoffee", "/memberships/buymeacoffee"], async (req, res) => {
        try {
            const auth = getAuth(req);
            if (!auth.userId) {
                return jsonError(res, 401, "UNAUTHORIZED", "Unauthenticated");
            }
            if (!isBuyMeACoffeeConfigured()) {
                return jsonError(
                    res,
                    501,
                    "BUYMEACOFFEE_NOT_CONFIGURED",
                    "Buy Me a Coffee is not configured on this server",
                );
            }
            const product = getBuyMeACoffeeProductByKey(req.body?.productKey);
            const isMembership = req.path.startsWith("/memberships/");
            if (!product || !isBuyMeACoffeeProductAvailable(product) || product.kind !== (isMembership ? "membership" : "credit")) {
                return jsonError(res, 400, "INVALID_PRODUCT", "Invalid payment product");
            }
            const clerkUser = await clerkClient.users.getUser(auth.userId);
            const user = await upsertUserFromClerk(mapClerkUser(clerkUser));
            if (isMembership) {
                const active = await getActiveMembershipForUser(user.id);
                if (active?.entitlements?.some((key) => !product.entitlements.includes(key))) {
                    return jsonError(res, 409, "MEMBERSHIP_INCOMPATIBLE", "Your current membership includes additional benefits; wait until it expires before purchasing this pass");
                }
                await ensureMembershipCheckoutPlan(product.planKey);
            }
            const outTradeNo = `${isMembership ? "mbr" : "cpt"}_${nanoid(20)}`;
            const attribution = sanitizeAttribution(req.body?.attribution);
            const order = await (isMembership ? createMembershipOrder : createCreditOrder)({
                userId: user.id,
                clerkUserId: user.clerk_user_id,
                provider: "buymeacoffee",
                productKey: product.key,
                points: product.points,
                planKey: product.planKey,
                durationDays: product.durationDays,
                amountFen: product.amountFen,
                currency: product.currency,
                outTradeNo,
                providerData: {
                    ...(attribution ? { attribution } : {}),
                    buymeacoffee_product_id: product.productId,
                    checkout_url: product.checkoutUrl,
                },
            });
            return res.status(201).json({
                status: "success",
                data: {
                    order,
                    buymeacoffee: {
                        checkoutUrl: product.checkoutUrl,
                        paymentCode: outTradeNo,
                        productId: product.productId,
                    },
                },
            });
        } catch (error) {
            console.error("POST /payments/credits/buymeacoffee error:", error);
            return jsonError(res, 500, "SERVER_ERROR", "Failed to create payment order");
        }
    });

    router.post("/credits/nowpayments", async (req, res) => {
        let createdOrder = null;
        try {
            const auth = getAuth(req);
            if (!auth.userId) {
                return jsonError(res, 401, "UNAUTHORIZED", "Unauthenticated");
            }
            if (!isNowPaymentsConfigured()) {
                return jsonError(
                    res,
                    501,
                    "NOWPAYMENTS_NOT_CONFIGURED",
                    "NOWPayments is not configured on this server",
                );
            }

            const product = getNowPaymentsProductByKey(req.body?.productKey);
            if (!product) {
                return jsonError(
                    res,
                    400,
                    "INVALID_PRODUCT",
                    "Invalid credit product",
                );
            }
            const checkoutReturnUrl = parseNowPaymentsReturnUrl(req);
            if (!checkoutReturnUrl) {
                return jsonError(
                    res,
                    400,
                    "INVALID_RETURN_URL",
                    "Invalid checkout return URL",
                );
            }
            const clerkUser = await clerkClient.users.getUser(auth.userId);
            const user = await upsertUserFromClerk(mapClerkUser(clerkUser));
            const outTradeNo = `cpt_${nanoid(20)}`;
            const attribution = sanitizeAttribution(req.body?.attribution);
            createdOrder = await createCreditOrder({
                userId: user.id,
                clerkUserId: user.clerk_user_id,
                provider: "nowpayments",
                productKey: product.key,
                points: product.points,
                amountFen: product.amountFen,
                currency: product.currency,
                outTradeNo,
                providerData: {
                    ...(attribution ? { attribution } : {}),
                    checkout_mode: "hosted_invoice",
                    expected_outcome_currency: getNowPaymentsPayoutCurrency(),
                },
            });

            const returnUrls = buildNowPaymentsReturnUrls({
                returnUrl: checkoutReturnUrl,
                orderId: createdOrder.id,
                kind: "credit",
            });
            const invoice = await createNowInvoice({
                outTradeNo,
                amountFen: product.amountFen,
                currency: product.currency,
                points: product.points,
                ...returnUrls,
            });
            const publicInvoice = toPublicNowInvoice(invoice);
            if (
                !/^\d+$/.test(publicInvoice.invoiceId) ||
                !isTrustedNowPaymentsInvoiceUrl(publicInvoice.invoiceUrl) ||
                String(invoice?.order_id || "") !== outTradeNo ||
                parseDecimalToMinorUnits(invoice?.price_amount) !==
                    product.amountFen ||
                String(invoice?.price_currency || "").toUpperCase() !==
                    product.currency
            ) {
                throw new Error("NOWPayments returned an invalid invoice response");
            }

            const order = await updateCreditOrderProviderData(createdOrder.id, {
                nowpayments_invoice_id: publicInvoice.invoiceId,
                invoice_url: publicInvoice.invoiceUrl,
                created_response: invoice,
            });
            return res.json({
                status: "success",
                data: {
                    order,
                    nowpayments: publicInvoice,
                },
            });
        } catch (error) {
            if (createdOrder?.id) {
                try {
                    await updatePendingCreditOrder({
                        id: createdOrder.id,
                        status: "FAILED",
                        providerData: {
                            create_error:
                                error instanceof NowPaymentsRequestError
                                    ? {
                                          status: error.status,
                                          data: error.data || null,
                                      }
                                    : { message: error?.message || "unknown" },
                        },
                    });
                } catch (updateError) {
                    console.error(
                        "Failed to close NOWPayments credit order:",
                        updateError,
                    );
                }
            }
            console.error("POST /payments/credits/nowpayments error:", {
                name: error?.name,
                message: error?.message,
                status: error?.status,
            });
            const rejectedByNowPayments =
                error instanceof NowPaymentsRequestError &&
                Number(error.status) >= 400 &&
                Number(error.status) < 500;
            return jsonError(
                res,
                rejectedByNowPayments
                    ? 400
                    : error instanceof NowPaymentsRequestError
                      ? 502
                      : 500,
                rejectedByNowPayments
                    ? "NOWPAYMENTS_INVOICE_REJECTED"
                    : "NOWPAYMENTS_CREATE_FAILED",
                rejectedByNowPayments
                    ? "NOWPayments rejected this invoice"
                    : "Failed to create NOWPayments invoice",
            );
        }
    });

    router.post("/memberships/nowpayments", async (req, res) => {
        let createdOrder = null;
        try {
            const auth = getAuth(req);
            if (!auth.userId) {
                return jsonError(res, 401, "UNAUTHORIZED", "Unauthenticated");
            }
            if (!isNowPaymentsConfigured()) {
                return jsonError(
                    res,
                    501,
                    "NOWPAYMENTS_NOT_CONFIGURED",
                    "NOWPayments is not configured on this server",
                );
            }

            const product = getNowPaymentsMembershipProductByKey(
                req.body?.productKey,
            );
            if (!product) {
                return jsonError(
                    res,
                    400,
                    "INVALID_PRODUCT",
                    "Invalid membership product",
                );
            }
            const checkoutReturnUrl = parseNowPaymentsReturnUrl(req);
            if (!checkoutReturnUrl) {
                return jsonError(
                    res,
                    400,
                    "INVALID_RETURN_URL",
                    "Invalid checkout return URL",
                );
            }
            const clerkUser = await clerkClient.users.getUser(auth.userId);
            const user = await upsertUserFromClerk(mapClerkUser(clerkUser));
            await ensureMembershipCheckoutPlan(product.planKey);

            const outTradeNo = `mbr_${nanoid(20)}`;
            const attribution = sanitizeAttribution(req.body?.attribution);
            createdOrder = await createMembershipOrder({
                userId: user.id,
                clerkUserId: user.clerk_user_id,
                provider: "nowpayments",
                productKey: product.key,
                planKey: product.planKey,
                durationDays: product.durationDays,
                amountFen: product.amountFen,
                currency: product.currency,
                outTradeNo,
                providerData: {
                    ...(attribution ? { attribution } : {}),
                    checkout_mode: "hosted_invoice",
                    expected_outcome_currency: getNowPaymentsPayoutCurrency(),
                },
            });

            const returnUrls = buildNowPaymentsReturnUrls({
                returnUrl: checkoutReturnUrl,
                orderId: createdOrder.id,
                kind: "membership",
            });
            const invoice = await createNowInvoice({
                outTradeNo,
                amountFen: product.amountFen,
                currency: product.currency,
                description: getMembershipProductDescription(product.key),
                ...returnUrls,
            });
            const publicInvoice = toPublicNowInvoice(invoice);
            if (
                !/^\d+$/.test(publicInvoice.invoiceId) ||
                !isTrustedNowPaymentsInvoiceUrl(publicInvoice.invoiceUrl) ||
                String(invoice?.order_id || "") !== outTradeNo ||
                parseDecimalToMinorUnits(invoice?.price_amount) !==
                    product.amountFen ||
                String(invoice?.price_currency || "").toUpperCase() !==
                    product.currency
            ) {
                throw new Error("NOWPayments returned an invalid invoice response");
            }

            const order = await updateMembershipOrderProviderData(
                createdOrder.id,
                {
                    nowpayments_invoice_id: publicInvoice.invoiceId,
                    invoice_url: publicInvoice.invoiceUrl,
                    created_response: invoice,
                },
            );
            return res.json({
                status: "success",
                data: {
                    order,
                    nowpayments: publicInvoice,
                },
            });
        } catch (error) {
            if (createdOrder?.id) {
                try {
                    await updatePendingMembershipOrder({
                        id: createdOrder.id,
                        status: "FAILED",
                        providerData: {
                            create_error:
                                error instanceof NowPaymentsRequestError
                                    ? {
                                          status: error.status,
                                          data: error.data || null,
                                      }
                                    : { message: error?.message || "unknown" },
                        },
                    });
                } catch (updateError) {
                    console.error(
                        "Failed to close NOWPayments membership order:",
                        updateError,
                    );
                }
            }
            console.error("POST /payments/memberships/nowpayments error:", {
                name: error?.name,
                message: error?.message,
                status: error?.status,
            });
            const rejectedByNowPayments =
                error instanceof NowPaymentsRequestError &&
                Number(error.status) >= 400 &&
                Number(error.status) < 500;
            return jsonError(
                res,
                rejectedByNowPayments
                    ? 400
                    : error instanceof NowPaymentsRequestError
                      ? 502
                      : 500,
                rejectedByNowPayments
                    ? "NOWPAYMENTS_INVOICE_REJECTED"
                    : "NOWPAYMENTS_CREATE_FAILED",
                rejectedByNowPayments
                    ? "NOWPayments rejected this invoice"
                    : "Failed to create NOWPayments membership invoice",
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
                order.provider === "nowpayments" &&
                order.status !== "PAID" &&
                isNowPaymentsConfigured()
            ) {
                try {
                    const paymentId = String(
                        order?.provider_data?.nowpayments_payment_id || "",
                    ).trim();
                    if (paymentId) {
                        const payment = await getNowPayment(paymentId);
                        const result = await applyNowPaymentsPaymentUpdate({
                            payment,
                            rawNotify: {
                                source: "nowpayments_payment_sync",
                                payment,
                            },
                        });
                        if (result?.order) {
                            resolvedOrder =
                                (await getCreditOrderById(order.id)) || result.order;
                        }
                    }
                } catch (error) {
                    console.error(
                        "NOWPayments sync order status failed:",
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

            if (
                shouldSync &&
                order.provider === "nowpayments" &&
                order.status !== "PAID" &&
                isNowPaymentsConfigured()
            ) {
                try {
                    const paymentId = String(
                        order?.provider_data?.nowpayments_payment_id || "",
                    ).trim();
                    if (paymentId) {
                        const payment = await getNowPayment(paymentId);
                        const result = await applyNowPaymentsPaymentUpdate({
                            payment,
                            rawNotify: {
                                source: "nowpayments_membership_payment_sync",
                                payment,
                            },
                        });
                        if (result?.order) {
                            resolvedOrder =
                                (await getMembershipOrderById(order.id)) ||
                                result.order;
                        }
                    }
                } catch (error) {
                    console.error(
                        "NOWPayments sync membership order status failed:",
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
