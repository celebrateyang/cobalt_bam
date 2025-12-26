import crypto from "node:crypto";
import fs from "node:fs/promises";

const WECHATPAY_API_BASE =
    process.env.WECHATPAY_API_BASE || "https://api.mch.weixin.qq.com";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const deriveNotifyUrlFromApiUrl = () => {
    const apiUrl = process.env.API_URL;
    if (!apiUrl) return null;
    try {
        const url = new URL(apiUrl);
        url.pathname = "/payments/wechat/notify";
        url.search = "";
        return url.toString();
    } catch {
        return null;
    }
};

const getWechatPayConfig = () => {
    const notifyUrl =
        process.env.WECHATPAY_NOTIFY_URL || deriveNotifyUrlFromApiUrl();

    return {
        mchId: process.env.WECHATPAY_MCH_ID || "",
        appId: process.env.WECHATPAY_APP_ID || "",
        serialNo: process.env.WECHATPAY_SERIAL_NO || "",
        apiV3Key: process.env.WECHATPAY_API_V3_KEY || "",
        notifyUrl,
        privateKeyPem: process.env.WECHATPAY_PRIVATE_KEY || "",
        privateKeyPath: process.env.WECHATPAY_PRIVATE_KEY_PATH || "",
        acceptLanguage: process.env.WECHATPAY_ACCEPT_LANGUAGE || "zh-CN",
    };
};

export const isWechatPayConfigured = () => {
    const config = getWechatPayConfig();
    return (
        !!config.mchId &&
        !!config.appId &&
        !!config.serialNo &&
        !!config.apiV3Key &&
        (config.privateKeyPem || config.privateKeyPath) &&
        !!config.notifyUrl
    );
};

let cachedMerchantPrivateKeyPem = null;
let cachedMerchantPrivateKeyObject = null;

const getMerchantPrivateKeyPem = async () => {
    if (cachedMerchantPrivateKeyPem) return cachedMerchantPrivateKeyPem;

    const config = getWechatPayConfig();
    if (config.privateKeyPem) {
        cachedMerchantPrivateKeyPem = config.privateKeyPem;
        return cachedMerchantPrivateKeyPem;
    }

    if (config.privateKeyPath) {
        cachedMerchantPrivateKeyPem = await fs.readFile(
            config.privateKeyPath,
            "utf8",
        );
        return cachedMerchantPrivateKeyPem;
    }

    throw new Error("WECHATPAY_PRIVATE_KEY or WECHATPAY_PRIVATE_KEY_PATH missing");
};

const getMerchantPrivateKeyObject = async () => {
    if (cachedMerchantPrivateKeyObject) return cachedMerchantPrivateKeyObject;
    const pem = await getMerchantPrivateKeyPem();
    cachedMerchantPrivateKeyObject = crypto.createPrivateKey(pem);
    return cachedMerchantPrivateKeyObject;
};

const getApiV3Key = () => {
    const { apiV3Key } = getWechatPayConfig();
    if (!apiV3Key) {
        throw new Error("WECHATPAY_API_V3_KEY missing");
    }

    const buf = Buffer.from(apiV3Key, "utf8");
    if (buf.length !== 32) {
        throw new Error(
            "WECHATPAY_API_V3_KEY must be 32 bytes (exactly 32 characters in UTF-8)",
        );
    }
    return buf;
};

const randomNonce = () => crypto.randomBytes(16).toString("hex");

const signMessage = async (message) => {
    const privateKey = await getMerchantPrivateKeyObject();
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(message);
    signer.end();
    return signer.sign(privateKey, "base64");
};

const buildAuthorizationHeader = async ({ method, path, timestamp, nonce, body }) => {
    const config = getWechatPayConfig();

    const payload = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`;
    const signature = await signMessage(payload);

    return `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${config.serialNo}",signature="${signature}"`;
};

const wechatRequestJson = async ({ method, path, body }) => {
    const config = getWechatPayConfig();
    if (!isWechatPayConfigured()) {
        throw new Error("WeChat Pay is not configured");
    }

    if (!["zh-CN", "en"].includes(config.acceptLanguage)) {
        throw new Error(
            "WECHATPAY_ACCEPT_LANGUAGE must be 'zh-CN' or 'en' (WeChat Pay only supports these values)",
        );
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomNonce();
    const bodyString = body ? JSON.stringify(body) : "";

    const authorization = await buildAuthorizationHeader({
        method,
        path,
        timestamp,
        nonce,
        body: bodyString,
    });

    const res = await fetch(`${WECHATPAY_API_BASE}${path}`, {
        method,
        headers: {
            Accept: "application/json",
            "Accept-Language": config.acceptLanguage,
            "Content-Type": "application/json",
            Authorization: authorization,
            "User-Agent": "cobalt/wechatpay",
        },
        body: bodyString || undefined,
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
        const code = data?.code || "WECHATPAY_ERROR";
        const message = data?.message || `WeChat Pay request failed (${res.status})`;
        const detail = data?.detail ? `: ${JSON.stringify(data.detail)}` : "";
        throw new Error(`${code}: ${message}${detail}`);
    }

    return data;
};

export const createWechatNativeTransaction = async ({
    outTradeNo,
    description,
    amountFen,
    currency = "CNY",
    attach,
}) => {
    const config = getWechatPayConfig();

    // Best-effort warmup so notify verification doesn't need to fetch certificates
    // during the callback request.
    void refreshPlatformCertificates().catch((error) => {
        console.error("WeChat Pay platform certificate warmup failed:", error);
    });

    const body = {
        appid: config.appId,
        mchid: config.mchId,
        description,
        out_trade_no: outTradeNo,
        notify_url: config.notifyUrl,
        amount: {
            total: amountFen,
            currency,
        },
        ...(attach ? { attach } : {}),
    };

    const data = await wechatRequestJson({
        method: "POST",
        path: "/v3/pay/transactions/native",
        body,
    });

    if (!data?.code_url) {
        throw new Error("WeChat Pay response missing code_url");
    }

    return {
        codeUrl: data.code_url,
    };
};

const decryptAes256Gcm = ({
    ciphertextBase64,
    nonce,
    associatedData,
    apiV3Key,
}) => {
    const cipherBuffer = Buffer.from(ciphertextBase64, "base64");
    const authTag = cipherBuffer.subarray(cipherBuffer.length - 16);
    const data = cipherBuffer.subarray(0, cipherBuffer.length - 16);

    const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        apiV3Key,
        Buffer.from(nonce, "utf8"),
    );

    if (associatedData) {
        decipher.setAAD(Buffer.from(associatedData, "utf8"));
    }
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString("utf8");
};

const platformCerts = new Map();
let lastPlatformCertRefreshAt = 0;
let platformCertRefreshPromise = null;

const refreshPlatformCertificates = async ({ force = false } = {}) => {
    const now = Date.now();
    if (!force && now - lastPlatformCertRefreshAt < 1000 * 60 * 5) {
        return;
    }

    if (platformCertRefreshPromise) {
        return await platformCertRefreshPromise;
    }

    const apiV3Key = getApiV3Key();
    platformCertRefreshPromise = (async () => {
        const maxAttempts = 3;
        let lastError = null;
        let data = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                data = await wechatRequestJson({
                    method: "GET",
                    path: "/v3/certificates",
                });
                break;
            } catch (error) {
                lastError = error;
                if (attempt < maxAttempts) {
                    await sleep(250 * attempt);
                }
            }
        }

        if (!data) {
            throw lastError || new Error("Failed to fetch WeChat Pay certificates");
        }

        const list = Array.isArray(data?.data) ? data.data : [];
        for (const item of list) {
            const serial = item?.serial_no;
            const enc = item?.encrypt_certificate;
            if (!serial || !enc?.ciphertext || !enc?.nonce) continue;

            try {
                const pem = decryptAes256Gcm({
                    ciphertextBase64: enc.ciphertext,
                    nonce: enc.nonce,
                    associatedData: enc.associated_data,
                    apiV3Key,
                });
                platformCerts.set(serial, pem);
            } catch (error) {
                console.error(
                    "Failed to decrypt platform certificate:",
                    serial,
                    error,
                );
            }
        }

        lastPlatformCertRefreshAt = Date.now();
    })()
        .finally(() => {
            platformCertRefreshPromise = null;
        });

    return await platformCertRefreshPromise;
};

export const verifyWechatpaySignature = async ({
    serial,
    signature,
    timestamp,
    nonce,
    body,
}) => {
    if (!serial || !signature || !timestamp || !nonce) return false;

    if (!platformCerts.has(serial)) {
        try {
            await refreshPlatformCertificates({ force: true });
        } catch (error) {
            console.error("Failed to refresh WeChat Pay platform certificates:", error);
            return null;
        }
    }

    const certPem = platformCerts.get(serial);
    if (!certPem) return false;

    const message = `${timestamp}\n${nonce}\n${body}\n`;
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(message);
    verifier.end();

    try {
        return verifier.verify(certPem, signature, "base64");
    } catch (error) {
        console.error("verifyWechatpaySignature failed:", error);
        return false;
    }
};

export const decryptWechatpayEventResource = (eventBody) => {
    const apiV3Key = getApiV3Key();
    const resource = eventBody?.resource;
    if (!resource?.ciphertext || !resource?.nonce) {
        throw new Error("WeChat Pay event missing resource ciphertext/nonce");
    }

    const plaintext = decryptAes256Gcm({
        ciphertextBase64: resource.ciphertext,
        nonce: resource.nonce,
        associatedData: resource.associated_data,
        apiV3Key,
    });

    return JSON.parse(plaintext);
};

export const queryWechatTransactionByOutTradeNo = async (outTradeNo) => {
    const config = getWechatPayConfig();
    const encoded = encodeURIComponent(outTradeNo);
    const mchId = encodeURIComponent(config.mchId);

    return await wechatRequestJson({
        method: "GET",
        path: `/v3/pay/transactions/out-trade-no/${encoded}?mchid=${mchId}`,
    });
};
