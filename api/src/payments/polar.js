const resolvePolarApiBase = () => {
    const defaultServer =
        String(process.env.NODE_ENV || "")
            .trim()
            .toLowerCase() === "production"
            ? "production"
            : "sandbox";
    const raw = String(process.env.POLAR_SERVER || defaultServer).trim();
    if (!raw) return "https://sandbox-api.polar.sh/v1";

    if (/^https?:\/\//i.test(raw)) {
        const trimmed = raw.replace(/\/+$/, "");
        return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
    }

    const normalized = raw.toLowerCase();
    if (["production", "prod", "live"].includes(normalized)) {
        return "https://api.polar.sh/v1";
    }

    return "https://sandbox-api.polar.sh/v1";
};

const POLAR_API_BASE = resolvePolarApiBase();

const getPolarAccessToken = () => String(process.env.POLAR_ACCESS_TOKEN || "").trim();
export const getPolarWebhookSecret = () =>
    String(process.env.POLAR_WEBHOOK_SECRET || "").trim();

export class PolarRequestError extends Error {
    constructor({ status, data, message }) {
        super(message);
        this.name = "PolarRequestError";
        this.status = status;
        this.data = data;
    }
}

export const isPolarCheckoutConfigured = () => !!getPolarAccessToken();
export const isPolarWebhookConfigured = () =>
    !!getPolarAccessToken() && !!getPolarWebhookSecret();

const polarRequestJson = async ({ method, path, body }) => {
    const accessToken = getPolarAccessToken();
    if (!accessToken) {
        throw new Error("POLAR_ACCESS_TOKEN missing");
    }

    const bodyString = body ? JSON.stringify(body) : undefined;
    const res = await fetch(`${POLAR_API_BASE}${path}`, {
        method,
        headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
            ...(bodyString ? { "Content-Type": "application/json" } : {}),
            "User-Agent": "cobalt/polar",
        },
        ...(bodyString ? { body: bodyString } : {}),
    });

    const text = await res.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = { raw: text };
        }
    }

    if (!res.ok) {
        let message = `Polar request failed (${res.status})`;
        if (typeof data?.detail === "string" && data.detail.trim()) {
            message = data.detail.trim();
        } else if (Array.isArray(data?.detail)) {
            const detailMessages = data.detail
                .map((item) =>
                    typeof item?.msg === "string" ? item.msg.trim() : "",
                )
                .filter(Boolean);
            if (detailMessages.length > 0) {
                message = detailMessages.join("; ");
            }
        } else if (typeof data?.message === "string" && data.message.trim()) {
            message = data.message.trim();
        } else if (typeof data?.error === "string" && data.error.trim()) {
            message = data.error.trim();
        }

        throw new PolarRequestError({
            status: res.status,
            data,
            message,
        });
    }

    return data;
};

export const createPolarCheckoutSession = async ({
    productId,
    successUrl,
    returnUrl,
    metadata,
    externalCustomerId,
    customerEmail,
    customerName,
}) => {
    if (!productId) {
        throw new Error("polar product id missing");
    }

    const body = {
        products: [productId],
        success_url: successUrl,
        return_url: returnUrl,
        ...(metadata ? { metadata } : {}),
        ...(externalCustomerId ? { external_customer_id: externalCustomerId } : {}),
        ...(customerEmail ? { customer_email: customerEmail } : {}),
        ...(customerName ? { customer_name: customerName } : {}),
    };

    return await polarRequestJson({
        method: "POST",
        path: "/checkouts/",
        body,
    });
};

export const getPolarCheckoutSession = async (checkoutId) => {
    if (!checkoutId) {
        throw new Error("polar checkout id missing");
    }

    return await polarRequestJson({
        method: "GET",
        path: `/checkouts/${encodeURIComponent(checkoutId)}`,
    });
};
