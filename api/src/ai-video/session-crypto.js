import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const getKey = () => {
    const configured = process.env.AI_VIDEO_UPLOAD_SESSION_ENCRYPTION_KEY;
    if (!configured) {
        throw new Error("AI_VIDEO_UPLOAD_SESSION_ENCRYPTION_KEY is required");
    }
    if (/^[0-9a-f]{64}$/i.test(configured)) return Buffer.from(configured, "hex");
    const decoded = Buffer.from(configured, "base64");
    if (decoded.length === 32) return decoded;
    throw new Error("AI_VIDEO_UPLOAD_SESSION_ENCRYPTION_KEY must encode exactly 32 bytes");
};

export const encryptUploadSession = (plaintext) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
};

export const decryptUploadSession = (payload) => {
    const [version, iv, tag, ciphertext] = String(payload || "").split(".");
    if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Invalid upload session payload");
    const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
};
