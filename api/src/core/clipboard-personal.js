import crypto from "node:crypto";
import { nanoid } from "nanoid";

import { env } from "../config.js";

const WS_TICKET_TTL_SECONDS = 120;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;

const getSigningSecret = () =>
    process.env.JWT_SECRET || env.jwtSecret || process.env.CLERK_SECRET_KEY || "clipboard-personal-dev-secret";

const toBase64Url = (value) => Buffer.from(value, "utf8").toString("base64url");
const fromBase64Url = (value) => Buffer.from(value, "base64url").toString("utf8");

const sign = (data) => crypto
    .createHmac("sha256", getSigningSecret())
    .update(data)
    .digest("base64url");

export const generateClipboardPersonalCode = () => {
    let output = "";
    for (let i = 0; i < CODE_LENGTH; i += 1) {
        output += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return output;
};

export const buildClipboardPersonalSessionId = (clerkUserId, codeVersion) => {
    const digest = crypto
        .createHash("sha256")
        .update(`${clerkUserId}:${codeVersion}:clipboard-personal`)
        .digest("base64url")
        .slice(0, 16);

    return `ps_${digest}`;
};

export const createClipboardPersonalWsTicket = ({
    clerkUserId,
    sessionId,
    deviceId,
    codeVersion,
    action,
}) => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const payload = {
        typ: "clipboard_personal_ws",
        sub: clerkUserId,
        sid: sessionId,
        did: deviceId,
        ver: codeVersion,
        act: action,
        iat: nowSeconds,
        exp: nowSeconds + WS_TICKET_TTL_SECONDS,
        jti: nanoid(12),
    };

    const header = {
        alg: "HS256",
        typ: "JWT",
    };

    const encodedHeader = toBase64Url(JSON.stringify(header));
    const encodedPayload = toBase64Url(JSON.stringify(payload));
    const signature = sign(`${encodedHeader}.${encodedPayload}`);

    return {
        token: `${encodedHeader}.${encodedPayload}.${signature}`,
        expiresAt: payload.exp * 1000,
    };
};

export const verifyClipboardPersonalWsTicket = (token) => {
    if (typeof token !== "string") {
        return { ok: false, reason: "invalid_token" };
    }

    const parts = token.split(".");
    if (parts.length !== 3) {
        return { ok: false, reason: "invalid_token" };
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    const expected = sign(`${encodedHeader}.${encodedPayload}`);

    if (signature !== expected) {
        return { ok: false, reason: "invalid_signature" };
    }

    try {
        const payload = JSON.parse(fromBase64Url(encodedPayload));
        const nowSeconds = Math.floor(Date.now() / 1000);

        if (payload?.typ !== "clipboard_personal_ws") {
            return { ok: false, reason: "invalid_type" };
        }

        if (!payload?.exp || nowSeconds > payload.exp) {
            return { ok: false, reason: "expired" };
        }

        if (
            typeof payload?.sub !== "string" ||
            typeof payload?.sid !== "string" ||
            typeof payload?.did !== "string" ||
            typeof payload?.act !== "string"
        ) {
            return { ok: false, reason: "invalid_payload" };
        }

        return {
            ok: true,
            payload: {
                clerkUserId: payload.sub,
                sessionId: payload.sid,
                deviceId: payload.did,
                codeVersion: Number(payload.ver || 1),
                action: payload.act,
            },
        };
    } catch {
        return { ok: false, reason: "invalid_payload" };
    }
};
