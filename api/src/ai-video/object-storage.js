import { createReadStream, createWriteStream, mkdirSync } from "node:fs";
import { mkdir, open, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Storage } from "@google-cloud/storage";
import { request } from "undici";

const DEFAULT_PREFIX = "production/cloudsql-pgsql/data";

export const createOpaqueObjectKey = (prefix = DEFAULT_PREFIX) => {
    const id = randomBytes(16).toString("hex");
    return `${prefix.replace(/\/+$/, "")}/${id.slice(0, 2)}/${id}`;
};

const assertObjectKey = (key, prefix) => {
    const normalizedPrefix = prefix.replace(/\/+$/, "");
    if (typeof key !== "string" || !key.startsWith(`${normalizedPrefix}/`) || key.includes("..")) {
        throw new Error("Object key is outside the AI video prefix");
    }
};

class GcsObjectStorage {
    constructor({ bucketName, prefix }) {
        this.bucketName = bucketName;
        this.prefix = prefix;
        this.storage = new Storage();
        this.bucket = this.storage.bucket(bucketName);
    }

    async startResumableUpload({ objectKey, contentType }) {
        assertObjectKey(objectKey, this.prefix);
        const [sessionUri] = await this.bucket.file(objectKey).createResumableUpload({
            metadata: { contentType },
            origin: undefined,
            preconditionOpts: { ifGenerationMatch: 0 },
        });
        return sessionUri;
    }

    async writeUploadChunk({ sessionUri, body, offset, length, totalBytes }) {
        const end = offset + length - 1;
        const response = await request(sessionUri, {
            method: "PUT",
            headers: {
                "content-length": String(length),
                "content-range": `bytes ${offset}-${end}/${totalBytes}`,
                "content-type": "application/octet-stream",
            },
            body,
            headersTimeout: Number(process.env.AI_VIDEO_UPLOAD_STALL_TIMEOUT_MS || 120000),
            bodyTimeout: Number(process.env.AI_VIDEO_UPLOAD_STALL_TIMEOUT_MS || 120000),
        });
        await response.body.dump();
        if (response.statusCode !== 308 && response.statusCode !== 200 && response.statusCode !== 201) {
            throw new Error(`GCS resumable upload returned HTTP ${response.statusCode}`);
        }
        const range = response.headers.range;
        const committedBytes = typeof range === "string" && /bytes=0-(\d+)/.test(range)
            ? Number(range.match(/bytes=0-(\d+)/)[1]) + 1
            : (response.statusCode === 308 ? offset : totalBytes);
        return { committedBytes, completed: response.statusCode !== 308 };
    }

    async queryUploadOffset({ sessionUri, totalBytes }) {
        const response = await request(sessionUri, {
            method: "PUT",
            headers: { "content-length": "0", "content-range": `bytes */${totalBytes}` },
        });
        await response.body.dump();
        if (response.statusCode === 200 || response.statusCode === 201) return { committedBytes: totalBytes, completed: true };
        if (response.statusCode !== 308) throw new Error(`GCS upload status returned HTTP ${response.statusCode}`);
        const range = response.headers.range;
        return {
            committedBytes: typeof range === "string" && /bytes=0-(\d+)/.test(range) ? Number(range.match(/bytes=0-(\d+)/)[1]) + 1 : 0,
            completed: false,
        };
    }

    async abortResumableUpload({ sessionUri }) {
        const response = await request(sessionUri, { method: "DELETE" });
        await response.body.dump();
        if (![200, 204, 404, 499].includes(response.statusCode)) throw new Error(`GCS upload abort returned HTTP ${response.statusCode}`);
    }

    async headObject(objectKey) {
        assertObjectKey(objectKey, this.prefix);
        const [metadata] = await this.bucket.file(objectKey).getMetadata();
        return {
            generation: String(metadata.generation),
            sizeBytes: Number(metadata.size),
            contentType: metadata.contentType || null,
            checksumSha256: null,
        };
    }

    openReadStream(objectKey) {
        assertObjectKey(objectKey, this.prefix);
        return this.bucket.file(objectKey).createReadStream();
    }

    createWriteStream(objectKey, options = {}) {
        assertObjectKey(objectKey, this.prefix);
        return this.bucket.file(objectKey).createWriteStream({ resumable: true, preconditionOpts: { ifGenerationMatch: 0 }, ...options });
    }

    async createDownloadUrl(objectKey, expiresMs, { responseDisposition, responseType } = {}) {
        assertObjectKey(objectKey, this.prefix);
        const [url] = await this.bucket.file(objectKey).getSignedUrl({
            version: "v4", action: "read", expires: Date.now() + expiresMs,
            ...(responseDisposition ? { responseDisposition } : {}),
            ...(responseType ? { responseType } : {}),
        });
        return url;
    }

    async deleteObject(objectKey, generation) {
        assertObjectKey(objectKey, this.prefix);
        await this.bucket.file(objectKey, { generation }).delete({ ignoreNotFound: true, ifGenerationMatch: generation });
    }
}

class LocalObjectStorage {
    constructor({ root, prefix }) {
        this.root = path.resolve(root);
        this.prefix = prefix;
    }

    resolve(objectKey) {
        assertObjectKey(objectKey, this.prefix);
        const target = path.resolve(this.root, ...objectKey.split("/"));
        if (target !== this.root && !target.startsWith(`${this.root}${path.sep}`)) throw new Error("Unsafe local object path");
        return target;
    }

    async startResumableUpload({ objectKey }) {
        const target = this.resolve(objectKey);
        await mkdir(path.dirname(target), { recursive: true });
        return JSON.stringify({ objectKey });
    }

    async writeUploadChunk({ sessionUri, body, offset, length, totalBytes }) {
        const { objectKey } = JSON.parse(sessionUri);
        const target = this.resolve(objectKey);
        const handle = await open(target, offset === 0 ? "w" : "r+");
        try {
            const sink = createWriteStream(target, { fd: handle.fd, autoClose: false, start: offset });
            await pipeline(body, sink);
        } finally {
            await handle.close();
        }
        const committedBytes = offset + length;
        return { committedBytes, completed: committedBytes === totalBytes };
    }

    async queryUploadOffset({ sessionUri, totalBytes }) {
        const { objectKey } = JSON.parse(sessionUri);
        try {
            const info = await stat(this.resolve(objectKey));
            return { committedBytes: info.size, completed: info.size === totalBytes };
        } catch (error) {
            if (error.code === "ENOENT") return { committedBytes: 0, completed: false };
            throw error;
        }
    }

    async abortResumableUpload({ sessionUri }) {
        const { objectKey } = JSON.parse(sessionUri);
        await unlink(this.resolve(objectKey)).catch((error) => { if (error.code !== "ENOENT") throw error; });
    }

    async headObject(objectKey) {
        const info = await stat(this.resolve(objectKey));
        return { generation: String(Math.trunc(info.mtimeMs)), sizeBytes: info.size, contentType: null, checksumSha256: null };
    }

    openReadStream(objectKey) { return createReadStream(this.resolve(objectKey)); }
    createWriteStream(objectKey) {
        const target = this.resolve(objectKey);
        mkdirSync(path.dirname(target), { recursive: true });
        return createWriteStream(target, { flags: "wx" });
    }
    async createDownloadUrl() { throw new Error("Local download URLs are served by the API"); }
    async deleteObject(objectKey) { await unlink(this.resolve(objectKey)).catch((error) => { if (error.code !== "ENOENT") throw error; }); }
}

let singleton;
export const getAiVideoObjectStorage = () => {
    if (singleton) return singleton;
    const provider = process.env.AI_VIDEO_STORAGE_PROVIDER || (process.env.NODE_ENV === "production" ? "gcs" : "local");
    const prefix = process.env.AI_VIDEO_STORAGE_PREFIX || DEFAULT_PREFIX;
    singleton = provider === "gcs"
        ? new GcsObjectStorage({ bucketName: process.env.AI_VIDEO_GCS_BUCKET || "ebay-mag-terraform-state", prefix })
        : new LocalObjectStorage({ root: process.env.AI_VIDEO_LOCAL_STORAGE_ROOT || ".ai-video-storage", prefix });
    return singleton;
};

export const resetAiVideoObjectStorageForTests = () => { singleton = undefined; };
