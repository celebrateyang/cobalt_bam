import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

const VERSION = "m1";
const key = () => {
    const secret = process.env.AI_VIDEO_MEDIA_IMPORT_TOKEN_KEY;
    if (!secret || secret.length < 32) {
        const error = new Error("AI_VIDEO_MEDIA_IMPORT_TOKEN_KEY must contain at least 32 characters");
        error.code = "AI_VIDEO_IMPORT_NOT_CONFIGURED";
        throw error;
    }
    return createHash("sha256").update(secret, "utf8").digest();
};

const encode = (value) => Buffer.from(value).toString("base64url");
const decode = (value) => Buffer.from(value, "base64url");

export const createMediaImportToken = ({ userId, url, service, filename, mime = "video/mp4", now = Date.now(), ttlMs = 15 * 60 * 1000 }) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("Only HTTPS media imports are supported");
    const payload = {
        userId,
        url: parsed.toString(),
        service: String(service || "unknown").slice(0, 80),
        filename: String(filename || "imported-video.mp4").slice(0, 255),
        mime: String(mime || "video/mp4").slice(0, 120),
        nonce: randomUUID(),
        issuedAt: now,
        expiresAt: now + ttlMs,
    };
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key(), iv);
    cipher.setAAD(Buffer.from(VERSION));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
    return `${VERSION}.${encode(iv)}.${encode(ciphertext)}.${encode(cipher.getAuthTag())}`;
};

export const readMediaImportToken = (token, { expectedUserId = null, now = Date.now(), allowExpired = false } = {}) => {
    const [version, ivPart, dataPart, tagPart, extra] = String(token || "").split(".");
    if (version !== VERSION || !ivPart || !dataPart || !tagPart || extra) {
        const error = new Error("Invalid media import token");
        error.code = "AI_VIDEO_IMPORT_TOKEN_INVALID";
        throw error;
    }
    try {
        const decipher = createDecipheriv("aes-256-gcm", key(), decode(ivPart));
        decipher.setAAD(Buffer.from(VERSION));
        decipher.setAuthTag(decode(tagPart));
        const payload = JSON.parse(Buffer.concat([decipher.update(decode(dataPart)), decipher.final()]).toString("utf8"));
        const parsed = new URL(payload.url);
        if (parsed.protocol !== "https:" || !payload.nonce || !Number.isFinite(payload.expiresAt)) throw new Error("invalid payload");
        if (expectedUserId != null && Number(payload.userId) !== Number(expectedUserId)) {
            const error = new Error("Media import token belongs to another user");
            error.code = "AI_VIDEO_IMPORT_TOKEN_USER_MISMATCH";
            throw error;
        }
        if (!allowExpired && payload.expiresAt <= now) {
            const error = new Error("Media import token has expired");
            error.code = "AI_VIDEO_IMPORT_TOKEN_EXPIRED";
            throw error;
        }
        return payload;
    } catch (error) {
        if (error.code?.startsWith("AI_VIDEO_")) throw error;
        const invalid = new Error("Invalid media import token");
        invalid.code = "AI_VIDEO_IMPORT_TOKEN_INVALID";
        throw invalid;
    }
};

const videoFilenamePattern = /\.(?:mp4|mov|webm|mkv|m4v)(?:$|[?#])/i;

export const getMediaImportCandidate = (body) => {
    if (!body || !new Set(["redirect", "tunnel"]).has(body.status)) return null;
    if (!videoFilenamePattern.test(String(body.filename || ""))) return null;
    const url = body.status === "tunnel" ? (body.tunnelUrl || body.url) : (body.directUrl || body.url);
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") return null;
        return {
            url: parsed.toString(),
            service: body.service || "unknown",
            filename: body.filename,
            mime: "video/mp4",
        };
    } catch {
        return null;
    }
};
