const PAYPAL_SANDBOX_API_BASE = "https://api-m.sandbox.paypal.com";
const PAYPAL_LIVE_API_BASE = "https://api-m.paypal.com";

const normalizePayPalEnvironment = () => {
    const raw = String(process.env.PAYPAL_ENV || "sandbox")
        .trim()
        .toLowerCase();
    return ["live", "production", "prod"].includes(raw) ? "live" : "sandbox";
};

export const getPayPalEnvironment = () => normalizePayPalEnvironment();
export const getPayPalSdkUrl = () =>
    normalizePayPalEnvironment() === "live"
        ? "https://www.paypal.com/web-sdk/v6/core"
        : "https://www.sandbox.paypal.com/web-sdk/v6/core";

const getPayPalApiBase = () =>
    normalizePayPalEnvironment() === "live"
        ? PAYPAL_LIVE_API_BASE
        : PAYPAL_SANDBOX_API_BASE;

export const getPayPalClientId = () =>
    String(process.env.PAYPAL_CLIENT_ID || "").trim();
const getPayPalClientSecret = () =>
    String(process.env.PAYPAL_CLIENT_SECRET || "").trim();
export const getPayPalWebhookId = () =>
    String(process.env.PAYPAL_WEBHOOK_ID || "").trim();

export const isPayPalCheckoutConfigured = () =>
    !!getPayPalClientId() && !!getPayPalClientSecret();
export const isPayPalWebhookConfigured = () =>
    isPayPalCheckoutConfigured() && !!getPayPalWebhookId();

export class PayPalRequestError extends Error {
    constructor({ status, data, message }) {
        super(message);
        this.name = "PayPalRequestError";
        this.status = status;
        this.data = data;
        this.debugId = typeof data?.debug_id === "string" ? data.debug_id : null;
    }
}

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

const parseResponse = async (response) => {
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
};

const errorMessageFromResponse = (status, data) => {
    if (typeof data?.message === "string" && data.message.trim()) {
        return data.message.trim();
    }
    const detail = Array.isArray(data?.details)
        ? data.details
              .map((item) => item?.description || item?.issue || "")
              .filter(Boolean)
              .join("; ")
        : "";
    return detail || `PayPal request failed (${status})`;
};

const generateAccessToken = async () => {
    if (cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt) {
        return cachedAccessToken;
    }

    const clientId = getPayPalClientId();
    const clientSecret = getPayPalClientSecret();
    if (!clientId || !clientSecret) {
        throw new Error("PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET missing");
    }

    const response = await fetch(`${getPayPalApiBase()}/v1/oauth2/token`, {
        method: "POST",
        headers: {
            Accept: "application/json",
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
    });
    const data = await parseResponse(response);
    if (!response.ok || typeof data?.access_token !== "string") {
        throw new PayPalRequestError({
            status: response.status,
            data,
            message: errorMessageFromResponse(response.status, data),
        });
    }

    const expiresInSeconds = Number(data.expires_in) || 300;
    cachedAccessToken = data.access_token;
    cachedAccessTokenExpiresAt =
        Date.now() + Math.max(30, expiresInSeconds - 60) * 1000;
    return cachedAccessToken;
};

const paypalRequestJson = async ({ method, path, body, requestId }) => {
    const accessToken = await generateAccessToken();
    const bodyString = body === undefined ? undefined : JSON.stringify(body);
    const response = await fetch(`${getPayPalApiBase()}${path}`, {
        method,
        headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
            ...(bodyString ? { "Content-Type": "application/json" } : {}),
            ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
            Prefer: "return=representation",
        },
        ...(bodyString ? { body: bodyString } : {}),
    });
    const data = await parseResponse(response);
    if (!response.ok) {
        throw new PayPalRequestError({
            status: response.status,
            data,
            message: errorMessageFromResponse(response.status, data),
        });
    }
    return data;
};

export const formatPayPalAmount = (amountMinor) => {
    const normalized = Number.parseInt(String(amountMinor), 10);
    if (!Number.isSafeInteger(normalized) || normalized < 0) {
        throw new Error("invalid PayPal minor-unit amount");
    }
    return `${Math.floor(normalized / 100)}.${String(normalized % 100).padStart(2, "0")}`;
};

export const parsePayPalAmount = (value) => {
    const normalized = String(value ?? "").trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return Number.NaN;
    const [whole, fraction = ""] = normalized.split(".");
    const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    return Number.isSafeInteger(minor) ? minor : Number.NaN;
};

export const createPayPalOrder = async ({
    outTradeNo,
    amountFen,
    currency,
    points,
    description,
}) =>
    await paypalRequestJson({
        method: "POST",
        path: "/v2/checkout/orders",
        requestId: `create-${outTradeNo}`,
        body: {
            intent: "CAPTURE",
            purchase_units: [
                {
                    reference_id: outTradeNo,
                    custom_id: outTradeNo,
                    invoice_id: outTradeNo,
                    description:
                        description || `FreeSaveVideo ${points} credits`,
                    amount: {
                        currency_code: currency,
                        value: formatPayPalAmount(amountFen),
                    },
                },
            ],
            payment_source: {
                paypal: {
                    experience_context: {
                        brand_name: "FreeSaveVideo",
                        shipping_preference: "NO_SHIPPING",
                        user_action: "PAY_NOW",
                    },
                },
            },
        },
    });

export const createPayPalSubscription = async ({
    planId,
    outTradeNo,
    returnUrl,
    cancelUrl,
}) =>
    await paypalRequestJson({
        method: "POST",
        path: "/v1/billing/subscriptions",
        requestId: `subscription-${outTradeNo}`,
        body: {
            plan_id: planId,
            custom_id: outTradeNo,
            application_context: {
                brand_name: "FreeSaveVideo",
                shipping_preference: "NO_SHIPPING",
                user_action: "SUBSCRIBE_NOW",
                return_url: returnUrl,
                cancel_url: cancelUrl,
            },
        },
    });

export const getPayPalSubscription = async (subscriptionId) =>
    await paypalRequestJson({
        method: "GET",
        path: `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
    });

export const getPayPalPlan = async (planId) =>
    await paypalRequestJson({
        method: "GET",
        path: `/v1/billing/plans/${encodeURIComponent(planId)}`,
    });

export const cancelPayPalSubscription = async ({ subscriptionId, reason }) =>
    await paypalRequestJson({
        method: "POST",
        path: `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
        requestId: `cancel-${subscriptionId}`,
        body: {
            reason: reason || "Cancelled by the subscriber",
        },
    });

export const getPayPalSubscriptionApprovalUrl = (subscription) => {
    const links = Array.isArray(subscription?.links) ? subscription.links : [];
    const approve = links.find(
        (link) => String(link?.rel || "").trim().toLowerCase() === "approve",
    );
    return typeof approve?.href === "string" ? approve.href : null;
};

export const capturePayPalOrder = async ({ paypalOrderId, outTradeNo }) =>
    await paypalRequestJson({
        method: "POST",
        path: `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
        requestId: `capture-${outTradeNo}`,
        body: {},
    });

export const getPayPalOrder = async (paypalOrderId) =>
    await paypalRequestJson({
        method: "GET",
        path: `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
    });

export const getPayPalOrderStatus = (order) =>
    String(order?.status || "")
        .trim()
        .toUpperCase();

export const canCapturePayPalOrder = (order) =>
    getPayPalOrderStatus(order) === "APPROVED";

export const getPayPalPayerActionUrl = (order) => {
    const links = Array.isArray(order?.links) ? order.links : [];
    const payerAction = links.find((link) =>
        ["approve", "payer-action"].includes(
            String(link?.rel || "")
                .trim()
                .toLowerCase(),
        ),
    );
    return typeof payerAction?.href === "string" ? payerAction.href : null;
};

export const getPayPalRequestIssue = (error) => {
    const details = Array.isArray(error?.data?.details)
        ? error.data.details
        : [];
    const issue = String(details[0]?.issue || "")
        .trim()
        .toUpperCase();
    return issue || null;
};

export const verifyPayPalWebhookSignature = async ({ headers, event }) => {
    const webhookId = getPayPalWebhookId();
    if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID missing");

    const data = await paypalRequestJson({
        method: "POST",
        path: "/v1/notifications/verify-webhook-signature",
        body: {
            auth_algo: headers["paypal-auth-algo"],
            cert_url: headers["paypal-cert-url"],
            transmission_id: headers["paypal-transmission-id"],
            transmission_sig: headers["paypal-transmission-sig"],
            transmission_time: headers["paypal-transmission-time"],
            webhook_id: webhookId,
            webhook_event: event,
        },
    });
    return data?.verification_status === "SUCCESS";
};

export const getCompletedPayPalCapture = (order) => {
    const purchaseUnits = Array.isArray(order?.purchase_units)
        ? order.purchase_units
        : [];
    for (const unit of purchaseUnits) {
        const captures = Array.isArray(unit?.payments?.captures)
            ? unit.payments.captures
            : [];
        const capture = captures.find(
            (candidate) => String(candidate?.status || "").toUpperCase() === "COMPLETED",
        );
        if (capture) {
            return {
                capture,
                outTradeNo: String(
                    unit?.custom_id || unit?.invoice_id || unit?.reference_id || "",
                ).trim(),
            };
        }
    }
    return null;
};
