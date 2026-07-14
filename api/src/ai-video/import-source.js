import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { request } from "undici";

import { completeAiVideoImport, getAiVideoWorkerImport, prepareAiVideoImport } from "../db/ai-video.js";
import { createOpaqueObjectKey, getAiVideoObjectStorage } from "./object-storage.js";
import { readMediaImportToken } from "./media-import-token.js";

const isPrivateV4 = (address) => {
    const parts = address.split(".").map(Number);
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 0
        || (parts[0] === 169 && parts[1] === 254)
        || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
        || (parts[0] === 192 && parts[1] === 168)
        || (parts[0] >= 224);
};

const isPrivateAddress = (address) => {
    const lower = String(address).toLowerCase();
    if (isIP(lower) === 4) return isPrivateV4(lower);
    if (isIP(lower) === 6) {
        if (lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || /^fe[89ab]/.test(lower)) return true;
        const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
        return mapped ? isPrivateV4(mapped) : false;
    }
    return true;
};

const assertPublicHttpsUrl = async (value) => {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw Object.assign(new Error("Import URL is not allowed"), { code: "AI_VIDEO_IMPORT_URL_BLOCKED" });
    const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost")) throw Object.assign(new Error("Import URL is not allowed"), { code: "AI_VIDEO_IMPORT_URL_BLOCKED" });
    const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
        throw Object.assign(new Error("Import URL resolved to a private address"), { code: "AI_VIDEO_IMPORT_URL_BLOCKED" });
    }
    return parsed;
};

const downloadImport = async ({ url, targetPath, maxBytes }) => {
    let current = url;
    for (let redirects = 0; redirects <= 5; redirects += 1) {
        const parsed = await assertPublicHttpsUrl(current);
        const response = await request(parsed, {
            method: "GET",
            maxRedirections: 0,
            headersTimeout: 30_000,
            bodyTimeout: 120_000,
            headers: { "user-agent": "FreeSaveVideo-AI-Import/1.0" },
        });
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
            const location = response.headers.location;
            await response.body.dump();
            if (!location) throw Object.assign(new Error("Import redirect had no location"), { code: "AI_VIDEO_IMPORT_FETCH_FAILED" });
            current = new URL(location, parsed).toString();
            continue;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
            await response.body.dump();
            throw Object.assign(new Error(`Import returned HTTP ${response.statusCode}`), { code: "AI_VIDEO_IMPORT_FETCH_FAILED", status: response.statusCode });
        }
        const declared = Number(response.headers["content-length"] || 0);
        if (declared > maxBytes) {
            await response.body.dump();
            throw Object.assign(new Error("Imported video exceeds the 1 GiB limit"), { code: "AI_VIDEO_FILE_TOO_LARGE" });
        }
        let bytes = 0;
        const limiter = new Transform({
            transform(chunk, _, callback) {
                bytes += chunk.length;
                if (bytes > maxBytes) return callback(Object.assign(new Error("Imported video exceeds the 1 GiB limit"), { code: "AI_VIDEO_FILE_TOO_LARGE" }));
                callback(null, chunk);
            },
        });
        await pipeline(response.body, limiter, createWriteStream(targetPath, { flags: "wx" }));
        return { bytes, mime: String(response.headers["content-type"] || "video/mp4").split(";")[0] };
    }
    throw Object.assign(new Error("Too many import redirects"), { code: "AI_VIDEO_IMPORT_FETCH_FAILED" });
};

export const ingestAiVideoImport = async ({ job, workerId, targetPath }) => {
    const token = await getAiVideoWorkerImport({ jobId: job.id, workerId });
    if (!token) throw Object.assign(new Error("Import source token is missing"), { code: "AI_VIDEO_SOURCE_MISSING" });
    const payload = readMediaImportToken(token, { expectedUserId: job.userId, allowExpired: true });
    const maxBytes = Number(process.env.AI_VIDEO_MAX_FILE_BYTES || 1024 * 1024 * 1024);
    const downloaded = await downloadImport({ url: payload.url, targetPath, maxBytes });
    const storage = getAiVideoObjectStorage();
    const local = await stat(targetPath);
    const prepared = await prepareAiVideoImport({
        jobId: job.id, workerId,
        objectKey: createOpaqueObjectKey(process.env.AI_VIDEO_STORAGE_PREFIX),
        mime: downloaded.mime, sizeBytes: local.size,
    });
    if (!prepared) throw Object.assign(new Error("Import asset reservation failed"), { code: "AI_VIDEO_STORAGE_ERROR" });
    const objectKey = prepared.object_key;
    let object = null;
    try {
        const candidate = await storage.headObject(objectKey);
        if (candidate.sizeBytes === local.size) object = candidate;
        else await storage.deleteObject(objectKey, candidate.generation);
    } catch (error) {
        if (!new Set(["ENOENT", 404]).has(error.code) && error.statusCode !== 404) throw error;
    }
    if (!object) {
        await pipeline(createReadStream(targetPath), storage.createWriteStream(objectKey, { metadata: { contentType: downloaded.mime } }));
        object = await storage.headObject(objectKey);
    }
    if (object.sizeBytes !== local.size) throw Object.assign(new Error("Imported object size mismatch"), { code: "AI_VIDEO_STORAGE_ERROR" });
    await completeAiVideoImport({
        jobId: job.id,
        workerId,
        assetId: prepared.id,
        objectKey,
        generation: object.generation,
        sizeBytes: object.sizeBytes,
        mime: downloaded.mime,
    });
    return { objectKey, localPath: targetPath };
};
