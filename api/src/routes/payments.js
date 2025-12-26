import express from "express";
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";
import { nanoid } from "nanoid";

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

const router = express.Router();

const CREDIT_PRODUCTS = [
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
];

const getProductByKey = (key) => CREDIT_PRODUCTS.find((p) => p.key === key);

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

router.get("/credits/products", (_, res) => {
    res.json({
        status: "success",
        data: {
            products: CREDIT_PRODUCTS,
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
            (configMchId && transaction?.mchid && transaction.mchid !== configMchId) ||
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

if (!isClerkAuthConfigured) {
    router.post("/credits/wechat/native", (_, res) => {
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
            const product = getProductByKey(productKey);
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

            const description = `积分充值 ${product.points}`;
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
                        console.error(
                            "WeChat Pay sync merchant/app mismatch",
                            {
                                mchid: transaction?.mchid,
                                appid: transaction?.appid,
                            },
                        );
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
