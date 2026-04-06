import express from "express";
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";
import { nanoid } from "nanoid";
import { WebhookVerificationError, validateEvent } from "@polar-sh/sdk/webhooks";

import { upsertUserFromClerk } from "../db/users.js";
import {
    createCreditOrder,
    getCreditOrderById,
    markCreditOrderPaid,
    updateCreditOrderProviderData,
} from "../db/credit-orders.js";

import {
    createWechatNativeTransaction,
    decryptWechatpayEventResource,
    isWechatPayConfigured,
    queryWechatTransactionByOutTradeNo,
    verifyWechatpaySignature,
} from "../payments/wechatpay.js";

import {
    PolarRequestError,
    createPolarCheckoutSession,
    getPolarCheckoutSession,
    getPolarWebhookSecret,
    isPolarCheckoutConfigured,
    isPolarWebhookConfigured,
} from "../payments/polar.js";

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

const POLAR_CREDIT_PRODUCTS = [
    {
        key: "polar_usd_499",
        points: 1100,
        amountFen: 499,
        currency: "USD",
        unitPriceFen: 0.454,
        polarProductIdEnvKey: "POLAR_PRODUCT_ID_USD_499",
        polarProductId: String(process.env.POLAR_PRODUCT_ID_USD_499 || "").trim(),
    },
    {
        key: "polar_usd_999",
        points: 2400,
        amountFen: 999,
        currency: "USD",
        unitPriceFen: 0.416,
        polarProductIdEnvKey: "POLAR_PRODUCT_ID_USD_999",
        polarProductId: String(process.env.POLAR_PRODUCT_ID_USD_999 || "").trim(),
    },
    {
        key: "polar_usd_1999",
        points: 5000,
        amountFen: 1999,
        currency: "USD",
        unitPriceFen: 0.4,
        polarProductIdEnvKey: "POLAR_PRODUCT_ID_USD_1999",
        polarProductId: String(process.env.POLAR_PRODUCT_ID_USD_1999 || "").trim(),
    },
    {
        key: "polar_usd_4999",
        points: 12500,
        amountFen: 4999,
        currency: "USD",
        unitPriceFen: 0.4,
        polarProductIdEnvKey: "POLAR_PRODUCT_ID_USD_4999",
        polarProductId: String(process.env.POLAR_PRODUCT_ID_USD_4999 || "").trim(),
    },
];

const getWechatProductByKey = (key) =>
    WECHAT_CREDIT_PRODUCTS.find((p) => p.key === key);
const getPolarProductByKey = (key) =>
    POLAR_CREDIT_PRODUCTS.find((p) => p.key === key);

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

const jsonError = (res, status, code, message) => {
    return res.status(status).json({
        status: "error",
        error: { code, message },
    });
};

const normalizeProvider = (rawProvider, fallback = "wechat") => {
    const normalized = String(rawProvider || "")
        .trim()
        .toLowerCase();
    if (normalized === "wechat" || normalized === "polar") {
        return normalized;
    }
    return fallback;
};

const buildPublicProducts = (provider) => {
    if (provider === "polar") {
        return POLAR_CREDIT_PRODUCTS.map((product) => ({
            key: product.key,
            points: product.points,
            unitPriceFen: product.unitPriceFen,
            amountFen: product.amountFen,
            currency: product.currency,
            enabled: !!product.polarProductId,
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

const resolveRequestOrigin = (req) => {
    const xForwardedProto = req.header("x-forwarded-proto");
    const xForwardedHost = req.header("x-forwarded-host");
    const proto = (xForwardedProto || req.protocol || "https")
        .split(",")[0]
        .trim();
    const host = (xForwardedHost || req.get("host") || "")
        .split(",")[0]
        .trim();
    if (!host) return null;
    return `${proto}://${host}`;
};

const parseHttpOrigin = (value) => {
    if (typeof value !== "string" || !value.trim()) return null;

    try {
        const url = new URL(value);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
            return null;
        }
        return url.origin;
    } catch {
        return null;
    }
};

const resolveAllowedRedirectOrigins = (req) => {
    const origins = new Set();
    const addOrigin = (value) => {
        const origin = parseHttpOrigin(value);
        if (origin) {
            origins.add(origin);
        }
    };

    addOrigin(resolveRequestOrigin(req));
    addOrigin(req.header("origin"));
    addOrigin(req.header("referer"));

    const fromEnv = String(
        process.env.PAYMENTS_ALLOWED_REDIRECT_ORIGINS ||
            process.env.WEB_ORIGIN ||
            process.env.WEB_URL ||
            "",
    )
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

    for (const candidate of fromEnv) {
        addOrigin(candidate);
    }

    return origins;
};

const normalizeRedirectUrl = (value, allowedOrigins) => {
    if (typeof value !== "string" || !value.trim()) return null;

    try {
        const url = new URL(value);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
            return null;
        }
        if (allowedOrigins?.size > 0 && !allowedOrigins.has(url.origin)) {
            return null;
        }
        return url.toString();
    } catch {
        return null;
    }
};

const appendQueryParams = (rawUrl, params) => {
    const url = new URL(rawUrl);
    for (const [key, value] of Object.entries(params || {})) {
        if (typeof value === "string" && value) {
            url.searchParams.set(key, value);
        }
    }
    return url.toString();
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

const firstFiniteNumber = (...values) => {
    for (const value of values) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return Number.NaN;
};

const isPolarCustomerEmailValidationError = (error) => {
    if (!(error instanceof PolarRequestError)) {
        return false;
    }

    const details = error?.data?.detail;
    if (!Array.isArray(details)) {
        return false;
    }

    return details.some((item) => {
        const locParts = Array.isArray(item?.loc)
            ? item.loc.map((part) => String(part || "").toLowerCase())
            : [];
        const msg = String(item?.msg || "").toLowerCase();
        return locParts.includes("customer_email") || msg.includes("email");
    });
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

        const result = await markCreditOrderPaid({
            outTradeNo,
            providerTransactionId: transactionId,
            paidAt,
            rawNotify: {
                headers: {
                    "Wechatpay-Serial": serial,
                    "Wechatpay-Signature": signature,
                    "Wechatpay-Timestamp": timestamp,
                    "Wechatpay-Nonce": nonce,
                },
                event: req.body,
                transaction,
            },
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

router.post("/polar/webhook", async (req, res) => {
    try {
        if (!isPolarWebhookConfigured()) {
            return res.status(500).json({
                code: "FAIL",
                message: "Polar webhook is not configured",
            });
        }

        const headers = toHeaderRecord(req.headers);
        const rawBody = req.rawBody || JSON.stringify(req.body || {});
        const event = validateEvent(rawBody, headers, getPolarWebhookSecret());

        if (event?.type !== "order.paid") {
            return res.status(200).json({
                code: "SUCCESS",
                message: "ignored",
            });
        }

        const payload = event?.data || {};
        const metadata = payload?.metadata || {};
        const outTradeNo =
            typeof metadata?.out_trade_no === "string"
                ? metadata.out_trade_no.trim()
                : "";

        const totalFen = firstFiniteNumber(
            payload?.amount,
            payload?.total_amount,
            payload?.checkout?.amount,
            payload?.checkout?.total_amount,
        );
        const providerTransactionId =
            typeof payload?.id === "string" ? payload.id : null;
        const parsedPaidAt = payload?.modified_at
            ? Date.parse(payload.modified_at)
            : Number.NaN;
        const paidAt = Number.isFinite(parsedPaidAt) ? parsedPaidAt : Date.now();

        if (!outTradeNo || !Number.isFinite(totalFen)) {
            console.error("Polar webhook missing out_trade_no or amount", {
                outTradeNo,
                amount: payload?.amount,
                total_amount: payload?.total_amount,
            });
            return res.status(200).json({
                code: "SUCCESS",
                message: "ignored",
            });
        }

        const result = await markCreditOrderPaid({
            outTradeNo,
            providerTransactionId,
            paidAt,
            rawNotify: {
                source: "polar_webhook",
                headers,
                event,
            },
            totalFen,
        });

        if (!result.ok && result.code === "ORDER_NOT_FOUND") {
            console.error("Polar webhook order not found", { outTradeNo });
        } else if (!result.ok && result.code === "AMOUNT_MISMATCH") {
            console.error("Polar webhook amount mismatch", {
                outTradeNo,
                totalFen,
            });
        }

        return res.status(200).json({
            code: "SUCCESS",
            message: "OK",
        });
    } catch (error) {
        if (error instanceof WebhookVerificationError) {
            console.error("Polar webhook signature invalid");
            return res.status(403).json({
                code: "FAIL",
                message: "invalid signature",
            });
        }

        console.error("POST /payments/polar/webhook error:", error);
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

    router.post("/credits/polar/checkout", (_, res) => {
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
} else {
    router.use(clerkMiddleware());

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
            const createdOrder = await createCreditOrder({
                userId: user.id,
                clerkUserId: user.clerk_user_id,
                provider: "wechat",
                productKey: product.key,
                points: product.points,
                amountFen: product.amountFen,
                currency: product.currency,
                outTradeNo,
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

    router.post("/credits/polar/checkout", async (req, res) => {
        try {
            const auth = getAuth(req);
            if (!auth.userId) {
                return jsonError(res, 401, "UNAUTHORIZED", "Unauthenticated");
            }

            if (!isPolarCheckoutConfigured()) {
                return jsonError(
                    res,
                    501,
                    "POLAR_NOT_CONFIGURED",
                    "Polar is not configured on this server",
                );
            }

            const productKey = req.body?.productKey;
            const product = getPolarProductByKey(productKey);
            if (!product) {
                return jsonError(
                    res,
                    400,
                    "INVALID_PRODUCT",
                    "Invalid credit product",
                );
            }

            if (!product.polarProductId) {
                return jsonError(
                    res,
                    501,
                    "POLAR_PRODUCT_NOT_CONFIGURED",
                    `${product.polarProductIdEnvKey} is missing`,
                );
            }

            const allowedRedirectOrigins = resolveAllowedRedirectOrigins(req);
            const successUrl = normalizeRedirectUrl(
                req.body?.successUrl,
                allowedRedirectOrigins,
            );
            const returnUrl =
                normalizeRedirectUrl(req.body?.returnUrl, allowedRedirectOrigins) ||
                successUrl;

            if (!successUrl || !returnUrl) {
                return jsonError(
                    res,
                    400,
                    "INVALID_REDIRECT_URL",
                    "Invalid success/return URL",
                );
            }

            const clerkUser = await clerkClient.users.getUser(auth.userId);
            const user = await upsertUserFromClerk(mapClerkUser(clerkUser));

            const outTradeNo = `cpt_${nanoid(20)}`;
            const createdOrder = await createCreditOrder({
                userId: user.id,
                clerkUserId: user.clerk_user_id,
                provider: "polar",
                productKey: product.key,
                points: product.points,
                amountFen: product.amountFen,
                currency: product.currency,
                outTradeNo,
            });

            const checkoutSuccessUrl = appendQueryParams(successUrl, {
                polarOrderId: String(createdOrder.id),
                polarResult: "success",
            });
            const checkoutReturnUrl = appendQueryParams(returnUrl, {
                polarOrderId: String(createdOrder.id),
                polarResult: "return",
            });

            const normalizedCustomerEmail =
                typeof user.primary_email === "string"
                    ? user.primary_email.trim()
                    : "";
            const checkoutPayload = {
                productId: product.polarProductId,
                successUrl: checkoutSuccessUrl,
                returnUrl: checkoutReturnUrl,
                externalCustomerId: user.clerk_user_id,
                customerEmail: normalizedCustomerEmail || undefined,
                customerName: user.full_name || undefined,
                metadata: {
                    out_trade_no: outTradeNo,
                    credit_order_id: String(createdOrder.id),
                    product_key: product.key,
                    clerk_user_id: user.clerk_user_id,
                },
            };

            let checkout;
            try {
                checkout = await createPolarCheckoutSession(checkoutPayload);
            } catch (error) {
                if (isPolarCustomerEmailValidationError(error)) {
                    console.warn(
                        "Polar checkout rejected customer_email, retrying without email",
                        {
                            orderId: createdOrder.id,
                            clerkUserId: user.clerk_user_id,
                        },
                    );
                    checkout = await createPolarCheckoutSession({
                        ...checkoutPayload,
                        customerEmail: undefined,
                    });
                } else {
                    throw error;
                }
            }

            const checkoutUrl =
                typeof checkout?.url === "string" ? checkout.url : null;
            const checkoutId = typeof checkout?.id === "string" ? checkout.id : null;
            if (!checkoutUrl || !checkoutId) {
                return jsonError(
                    res,
                    500,
                    "POLAR_INVALID_RESPONSE",
                    "Polar checkout response missing id or url",
                );
            }

            const order = await updateCreditOrderProviderData(createdOrder.id, {
                checkout_id: checkoutId,
                checkout_url: checkoutUrl,
                product_id: product.polarProductId,
            });

            return res.json({
                status: "success",
                data: {
                    order,
                    polar: {
                        checkoutId,
                        checkoutUrl,
                    },
                },
            });
        } catch (error) {
            console.error("POST /payments/credits/polar/checkout error:", error);
            return jsonError(
                res,
                500,
                "SERVER_ERROR",
                "Failed to create payment",
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
                order.provider === "polar" &&
                order.status !== "PAID" &&
                isPolarCheckoutConfigured()
            ) {
                try {
                    const checkoutId = order?.provider_data?.checkout_id;
                    if (typeof checkoutId === "string" && checkoutId.trim()) {
                        const checkout = await getPolarCheckoutSession(checkoutId);
                        const checkoutStatus = String(checkout?.status || "")
                            .trim()
                            .toLowerCase();
                        const paidStatuses = new Set([
                            "succeeded",
                            "completed",
                            "confirmed",
                        ]);

                        if (paidStatuses.has(checkoutStatus)) {
                            const totalFenRaw = firstFiniteNumber(
                                checkout?.amount,
                                checkout?.total_amount,
                            );
                            const totalFen = Number.isFinite(totalFenRaw)
                                ? totalFenRaw
                                : order.amount_fen;
                            const paidAtRaw = checkout?.modified_at
                                ? Date.parse(checkout.modified_at)
                                : Number.NaN;
                            const paidAt = Number.isFinite(paidAtRaw)
                                ? paidAtRaw
                                : Date.now();

                            const result = await markCreditOrderPaid({
                                outTradeNo: order.out_trade_no,
                                providerTransactionId:
                                    checkout?.order_id || checkoutId,
                                paidAt,
                                rawNotify: {
                                    source: "polar_checkout_sync",
                                    checkout,
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
                        "Polar sync order status failed:",
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
}

export default router;
