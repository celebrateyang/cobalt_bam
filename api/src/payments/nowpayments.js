import crypto from "node:crypto";

const DEFAULT_API_BASE = "https://api.nowpayments.io";
const DEFAULT_PAY_CURRENCIES = ["usdttrc20"];
const MIN_AMOUNT_CACHE_MS = 5 * 60 * 1000;
const minimumAmountCache = new Map();

const normalizeCurrency = (value) =>
    String(value || "")
        .trim()
        .toLowerCase();

const deriveIpnCallbackUrl = () => {
    const apiUrl = String(process.env.API_URL || "").trim();
    if (!apiUrl) return "";
    try {
        const url = new URL(apiUrl);
        url.pathname = "/payment/nowpayments/ipn";
        url.search = "";
        url.hash = "";
        return url.toString();
    } catch {
        return "";
    }
};

export const getNowPaymentsConfig = () => {
    const configuredCurrencies = String(
        process.env.NOWPAYMENTS_PAY_CURRENCIES || "",
    )
        .split(",")
        .map(normalizeCurrency)
        .filter((currency) => /^[a-z0-9_-]{2,40}$/.test(currency));

    return {
        apiBase: String(
            process.env.NOWPAYMENTS_API_BASE || DEFAULT_API_BASE,
        ).replace(/\/$/, ""),
        apiKey: String(process.env.NOWPAYMENTS_API_KEY || "").trim(),
        ipnSecret: String(process.env.NOWPAYMENTS_IPN_SECRET || "").trim(),
        ipnCallbackUrl:
            String(process.env.NOWPAYMENTS_IPN_CALLBACK_URL || "").trim() ||
            deriveIpnCallbackUrl(),
        payCurrencies:
            configuredCurrencies.length > 0
                ? [...new Set(configuredCurrencies)]
                : DEFAULT_PAY_CURRENCIES,
    };
};

export const isNowPaymentsConfigured = () => {
    const config = getNowPaymentsConfig();
    return Boolean(config.apiKey && config.ipnSecret && config.ipnCallbackUrl);
};

export const getNowPaymentsPayCurrencies = () =>
    getNowPaymentsConfig().payCurrencies;

export const resolveNowPaymentsPayCurrency = (value) => {
    const allowed = getNowPaymentsPayCurrencies();
    const normalized = normalizeCurrency(value);
    if (!normalized) return allowed[0] || null;
    return allowed.includes(normalized) ? normalized : null;
};

export class NowPaymentsRequestError extends Error {
    constructor({ status, data, message }) {
        super(message);
        this.name = "NowPaymentsRequestError";
        this.status = status;
        this.data = data;
    }
}

const parseResponse = async (response) => {
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
};

const getErrorMessage = (status, data) => {
    for (const candidate of [data?.message, data?.error, data?.msg]) {
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
        }
    }
    return `NOWPayments request failed (${status})`;
};

const nowPaymentsRequestJson = async ({ method, path, body }) => {
    const config = getNowPaymentsConfig();
    if (!config.apiKey) {
        throw new Error("NOWPAYMENTS_API_KEY missing");
    }

    const bodyString = body === undefined ? undefined : JSON.stringify(body);
    const response = await fetch(`${config.apiBase}${path}`, {
        method,
        headers: {
            Accept: "application/json",
            "x-api-key": config.apiKey,
            ...(bodyString ? { "Content-Type": "application/json" } : {}),
        },
        ...(bodyString ? { body: bodyString } : {}),
        signal: AbortSignal.timeout(10_000),
    });
    const data = await parseResponse(response);
    if (!response.ok) {
        throw new NowPaymentsRequestError({
            status: response.status,
            data,
            message: getErrorMessage(response.status, data),
        });
    }
    return data;
};

export const minorUnitsToDecimal = (amountMinor) => {
    const normalized = Number.parseInt(String(amountMinor), 10);
    if (!Number.isSafeInteger(normalized) || normalized <= 0) {
        throw new Error("invalid NOWPayments minor-unit amount");
    }
    return `${Math.floor(normalized / 100)}.${String(normalized % 100).padStart(2, "0")}`;
};

export const parseDecimalToMinorUnits = (value) => {
    const normalized = String(value ?? "").trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return Number.NaN;
    const [whole, fraction = ""] = normalized.split(".");
    const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    return Number.isSafeInteger(minor) ? minor : Number.NaN;
};

export const parseDecimalToCeilMinorUnits = (value) => {
    const normalized = String(value ?? "").trim();
    if (!/^\d+(?:\.\d+)?$/.test(normalized)) return Number.NaN;
    const [whole, fraction = ""] = normalized.split(".");
    const firstTwo = fraction.slice(0, 2).padEnd(2, "0");
    const roundUp = /[1-9]/.test(fraction.slice(2)) ? 1 : 0;
    const minor = Number(whole) * 100 + Number(firstTwo) + roundUp;
    return Number.isSafeInteger(minor) ? minor : Number.NaN;
};

const normalizeUnsignedDecimal = (value) => {
    const raw = String(value ?? "").trim();
    if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
    const [wholeRaw, fractionRaw = ""] = raw.split(".");
    const whole = wholeRaw.replace(/^0+(?=\d)/, "");
    const fraction = fractionRaw.replace(/0+$/, "");
    return { whole, fraction };
};

export const isDecimalAtLeast = (actual, expected) => {
    const left = normalizeUnsignedDecimal(actual);
    const right = normalizeUnsignedDecimal(expected);
    if (!left || !right) return false;
    if (left.whole.length !== right.whole.length) {
        return left.whole.length > right.whole.length;
    }
    if (left.whole !== right.whole) return left.whole > right.whole;

    const precision = Math.max(left.fraction.length, right.fraction.length);
    return (
        left.fraction.padEnd(precision, "0") >=
        right.fraction.padEnd(precision, "0")
    );
};

export const createNowPayment = async ({
    outTradeNo,
    amountFen,
    currency = "USD",
    payCurrency,
    points,
    description,
}) => {
    const config = getNowPaymentsConfig();
    const resolvedPayCurrency = resolveNowPaymentsPayCurrency(payCurrency);
    if (!resolvedPayCurrency) {
        throw new Error("unsupported NOWPayments pay currency");
    }

    return await nowPaymentsRequestJson({
        method: "POST",
        path: "/v1/payment",
        body: {
            price_amount: minorUnitsToDecimal(amountFen),
            price_currency: String(currency).toLowerCase(),
            pay_currency: resolvedPayCurrency,
            ipn_callback_url: config.ipnCallbackUrl,
            order_id: outTradeNo,
            order_description:
                description || `FreeSaveVideo ${points} credits`,
        },
    });
};

export const getNowPayment = async (paymentId) => {
    const normalized = String(paymentId || "").trim();
    if (!/^\d+$/.test(normalized)) {
        throw new Error("invalid NOWPayments payment id");
    }
    return await nowPaymentsRequestJson({
        method: "GET",
        path: `/v1/payment/${encodeURIComponent(normalized)}`,
    });
};

export const getNowPaymentsMinimumAmount = async ({
    currencyFrom = "usd",
    currencyTo,
}) => {
    const from = normalizeCurrency(currencyFrom);
    const to = resolveNowPaymentsPayCurrency(currencyTo);
    if (!from || !to) throw new Error("unsupported NOWPayments currency");

    const cacheKey = `${from}:${to}`;
    const cached = minimumAmountCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const query = new URLSearchParams({
        currency_from: from,
        currency_to: to,
        fiat_equivalent: from,
    });
    const data = await nowPaymentsRequestJson({
        method: "GET",
        path: `/v1/min-amount?${query.toString()}`,
    });
    const minimumFen = parseDecimalToCeilMinorUnits(data?.fiat_equivalent);
    if (!Number.isSafeInteger(minimumFen) || minimumFen <= 0) {
        throw new Error("NOWPayments returned an invalid minimum amount");
    }

    const value = {
        minimumFen,
        minimumAmount: String(data.fiat_equivalent),
        currencyFrom: from,
        currencyTo: to,
    };
    minimumAmountCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + MIN_AMOUNT_CACHE_MS,
    });
    return value;
};

export const sortNowPaymentsPayload = (value) => {
    if (Array.isArray(value)) {
        return value.map(sortNowPaymentsPayload);
    }
    if (!value || typeof value !== "object") return value;

    return Object.keys(value)
        .sort()
        .reduce((result, key) => {
            result[key] = sortNowPaymentsPayload(value[key]);
            return result;
        }, {});
};

export const createNowPaymentsSignature = (payload, secret) => {
    const resolvedSecret = String(
        secret ?? getNowPaymentsConfig().ipnSecret,
    ).trim();
    if (!resolvedSecret) throw new Error("NOWPAYMENTS_IPN_SECRET missing");

    return crypto
        .createHmac("sha512", resolvedSecret)
        .update(JSON.stringify(sortNowPaymentsPayload(payload)))
        .digest("hex");
};

export const verifyNowPaymentsIpnSignature = ({ signature, payload }) => {
    const received = String(signature || "")
        .trim()
        .toLowerCase();
    if (!/^[a-f0-9]{128}$/.test(received)) return false;

    const expected = createNowPaymentsSignature(payload);
    return crypto.timingSafeEqual(
        Buffer.from(received, "hex"),
        Buffer.from(expected, "hex"),
    );
};

export const getNowPaymentsStatus = (payment) =>
    String(payment?.payment_status || "")
        .trim()
        .toLowerCase();

export const toPublicNowPayment = (payment) => ({
    paymentId: String(payment?.payment_id || ""),
    status: getNowPaymentsStatus(payment),
    payAddress: String(payment?.pay_address || ""),
    payAmount: String(payment?.pay_amount ?? ""),
    payCurrency: normalizeCurrency(payment?.pay_currency),
    priceAmount: String(payment?.price_amount ?? ""),
    priceCurrency: normalizeCurrency(payment?.price_currency),
    expirationEstimateDate:
        typeof payment?.expiration_estimate_date === "string"
            ? payment.expiration_estimate_date
            : null,
});
