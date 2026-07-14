import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import { decryptUploadSession, encryptUploadSession } from "./session-crypto.js";
import { createOpaqueObjectKey, getAiVideoObjectStorage, resetAiVideoObjectStorageForTests } from "./object-storage.js";

test("upload session encryption is authenticated and reversible", () => {
    process.env.AI_VIDEO_UPLOAD_SESSION_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const encrypted = encryptUploadSession("https://storage.example/upload-secret");
    assert.notEqual(encrypted, "https://storage.example/upload-secret");
    assert.equal(decryptUploadSession(encrypted), "https://storage.example/upload-secret");
    const parts = encrypted.split(".");
    parts[3] = `${parts[3][0] === "a" ? "b" : "a"}${parts[3].slice(1)}`;
    const tampered = parts.join(".");
    assert.throws(() => decryptUploadSession(tampered));
    process.env.AI_VIDEO_UPLOAD_SESSION_ENCRYPTION_KEY = "too-short";
    assert.throws(() => encryptUploadSession("secret"), /exactly 32 bytes/);
});

test("local storage implements sequential resumable chunks", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fsv-ai-video-"));
    process.env.AI_VIDEO_STORAGE_PROVIDER = "local";
    process.env.AI_VIDEO_LOCAL_STORAGE_ROOT = root;
    process.env.AI_VIDEO_STORAGE_PREFIX = "production/cloudsql-pgsql/data";
    resetAiVideoObjectStorageForTests();
    const storage = getAiVideoObjectStorage();
    const objectKey = createOpaqueObjectKey(process.env.AI_VIDEO_STORAGE_PREFIX);
    const sessionUri = await storage.startResumableUpload({ objectKey, contentType: "video/mp4" });
    try {
        let result = await storage.writeUploadChunk({ sessionUri, body: Readable.from(Buffer.from("hello ")), offset: 0, length: 6, totalBytes: 11 });
        assert.deepEqual(result, { committedBytes: 6, completed: false });
        assert.deepEqual(await storage.queryUploadOffset({ sessionUri, totalBytes: 11 }), { committedBytes: 6, completed: false });
        result = await storage.writeUploadChunk({ sessionUri, body: Readable.from(Buffer.from("world")), offset: 6, length: 5, totalBytes: 11 });
        assert.deepEqual(result, { committedBytes: 11, completed: true });
        const info = await storage.headObject(objectKey);
        assert.equal(info.sizeBytes, 11);
        assert.equal((await readFile(path.join(root, ...objectKey.split("/")))).toString("utf8"), "hello world");
        assert.equal(createHash("sha256").update("hello world").digest("hex").length, 64);
        await storage.deleteObject(objectKey, info.generation);
    } finally {
        resetAiVideoObjectStorageForTests();
        await rm(root, { recursive: true, force: true });
    }
});

test("opaque keys stay inside the fixed prefix and reveal no user metadata", () => {
    const key = createOpaqueObjectKey("production/cloudsql-pgsql/data");
    assert.match(key, /^production\/cloudsql-pgsql\/data\/[0-9a-f]{2}\/[0-9a-f]{32}$/);
});
