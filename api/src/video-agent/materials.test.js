import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import ffmpegPath from "ffmpeg-static";
import { createVideoAgentRouter } from "../routes/video-agent.js";
import { setVideoAgentDatabaseForTests, ensureVideoAgentSchema } from "../db/video-agent.js";
import { CHUNK_BYTES, readVerifiedChunk } from "./materials.js";
import { getAiVideoObjectStorage, resetAiVideoObjectStorageForTests } from "../ai-video/object-storage.js";
import { createMediaImportToken } from "../ai-video/media-import-token.js";
import { claimSource, ingestSource, validateProbe } from "./ingestion.js";
import { cleanupVideoAgent } from "./cleanup.js";
import { resolveImportUrl } from "./import-download.js";
import { runProcess } from "../ai-video/media.js";

const digest = (buffer) => createHash("sha256").update(buffer).digest("base64");
test("chunk digest and declared length are checked before storage writes", async () => {
    const bytes = Buffer.from("video chunk");
    assert.deepEqual(await readVerifiedChunk({ body: Readable.from(bytes), length: bytes.length, digest: digest(bytes) }), bytes);
    await assert.rejects(readVerifiedChunk({ body: Readable.from(bytes), length: bytes.length, digest: digest(Buffer.from("wrong")) }), { code: "VIDEO_AGENT_DIGEST_MISMATCH" });
    await assert.rejects(readVerifiedChunk({ body: Readable.from(bytes), length: bytes.length - 1, digest: digest(bytes) }), { code: "VIDEO_AGENT_INVALID_REQUEST" });
    await assert.rejects(readVerifiedChunk({ body: Readable.from(bytes), length: bytes.length + 1, digest: digest(bytes) }), { code: "VIDEO_AGENT_INVALID_REQUEST" });
    await assert.rejects(readVerifiedChunk({ body: Readable.from(bytes), length: CHUNK_BYTES + 1, digest: digest(bytes) }), { code: "VIDEO_AGENT_INVALID_REQUEST" });
});
test("imports reject private, mixed, reserved, credential and non-HTTPS destinations", async () => {
    const publicDns = async () => [{ address: "8.8.8.8", family: 4 }];
    assert.equal((await resolveImportUrl("https://media.example/video", publicDns)).url.hostname, "media.example");
    for (const url of ["http://media.example/x", "https://localhost/x", "https://127.0.0.1/x", "https://user:secret@media.example/x", "https://media.example:9443/x"]) {
        await assert.rejects(resolveImportUrl(url, publicDns), { code: "VIDEO_AGENT_IMPORT_URL_BLOCKED" });
    }
    for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::ffff:7f00:1", "::1", "100.64.0.1", "192.0.2.1"]) {
        await assert.rejects(resolveImportUrl("https://media.example/x", async () => [{ address, family: 4 }]), { code: "VIDEO_AGENT_IMPORT_URL_BLOCKED" });
    }
    await assert.rejects(resolveImportUrl("https://media.example/x", async () => [...await publicDns(), { address: "10.0.0.1", family: 4 }]), { code: "VIDEO_AGENT_IMPORT_URL_BLOCKED" });
    assert.throws(() => validateProbe({ durationSeconds: 3601, width: 1080, height: 1920 }), { code: "VIDEO_AGENT_INVALID_MEDIA" });
});

test("real SQL + HTTP + local storage: ownership, resume, ingestion, import and cleanup", { timeout: 120000 }, async (t) => {
    process.env.NODE_ENV = "test";
    process.env.VIDEO_AGENT_ENABLED = "1";
    process.env.AI_VIDEO_UPLOAD_SESSION_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    process.env.AI_VIDEO_MEDIA_IMPORT_TOKEN_KEY = randomBytes(32).toString("hex");
    const root = await mkdtemp(path.join(os.tmpdir(), "fsv-agent-test-"));
    process.env.AI_VIDEO_STORAGE_PROVIDER = "local";
    process.env.AI_VIDEO_LOCAL_STORAGE_ROOT = path.join(root, "storage");
    resetAiVideoObjectStorageForTests();
    const storage = getAiVideoObjectStorage();
    const pg = new PGlite();
    const sql = async (text, params) => {
        const result = params ? await pg.query(text, params) : (await pg.exec(text)).at(-1);
        return { ...result, rowCount: result.affectedRows || result.rows?.length || 0 };
    };
    setVideoAgentDatabaseForTests({ query: sql, getClient: async () => ({ query: sql, release() {} }) });
    const app = express();
    app.use(express.json());
    app.use("/user/video-agent", createVideoAgentRouter({ authenticate: async (req) => req.header("x-test-user") ? { id: Number(req.header("x-test-user")), is_disabled: req.header("x-test-disabled") === "1" } : null }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(async () => { await new Promise((resolve) => server.close(resolve)); await pg.close(); resetAiVideoObjectStorageForTests(); await rm(root, { recursive: true, force: true }); });
    const base = `http://127.0.0.1:${server.address().port}/user/video-agent`;
    const request = async (route, { user = 1, method = "GET", body, headers = {} } = {}) => {
        const response = await fetch(base + route, { method, headers: { ...(user ? { "x-test-user": String(user) } : {}),
            "Content-Type": Buffer.isBuffer(body) ? "application/octet-stream" : "application/json", ...headers },
            body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) });
        const payload = response.status === 204 ? null : await response.json();
        return { status: response.status, data: payload?.data, error: payload?.error };
    };
    await pg.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1),(2),(3);
        CREATE TABLE plans(id INTEGER PRIMARY KEY,is_active BOOLEAN); INSERT INTO plans VALUES(1,true);
        CREATE TABLE plan_entitlements(plan_id INTEGER,entitlement_key TEXT); INSERT INTO plan_entitlements VALUES(1,'ai_video_studio');
        CREATE TABLE subscriptions(user_id INTEGER,plan_id INTEGER,status TEXT,current_period_end BIGINT);
        INSERT INTO subscriptions VALUES(1,1,'active',NULL),(2,1,'active',NULL);`);
    await ensureVideoAgentSchema();
    assert.equal((await request("/projects", { user: null })).status, 401);
    assert.equal((await request("/projects", { headers: { "x-test-disabled": "1" } })).status, 403);
    assert.equal((await request("/projects/not-a-uuid")).status, 400);
    const project = (await request("/projects", { method: "POST", body: { title: "Spanish clips" } })).data.project;
    const prefix = `/projects/${project.id}`;
    assert.equal((await request(prefix, { user: 2 })).status, 404);
    assert.equal((await request(prefix, { user: 2, method: "DELETE" })).status, 404);
    const nonmember = (await request("/projects", { user: 3, method: "POST", body: { title: "Free project" } })).data.project;
    const fixture = path.join(root, "fixture.mp4");
    await runProcess(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=green:s=320x180:d=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-c:a", "aac", "-shortest", fixture]);
    const bytes = await readFile(fixture);
    const input = { kind: "upload", filename: "fixture.mp4", contentType: "video/mp4", sizeBytes: bytes.length, fileFingerprint: "fixture-fingerprint-123" };
    assert.equal((await request(`/projects/${nonmember.id}/sources`, { user: 3, method: "POST", body: input })).error.code, "MEMBERSHIP_REQUIRED");
    assert.equal((await request(`${prefix}/sources`, { user: 2, method: "POST", body: input })).status, 404);
    const source = (await request(`${prefix}/sources`, { method: "POST", body: input })).data.source;
    const upload = `${prefix}/sources/${source.id}/upload`;
    assert.equal((await request(upload, { user: 2 })).status, 404);
    assert.equal((await request(upload, { method: "PUT", body: bytes, headers: { "Upload-Offset": "0", Digest: `sha-256=${digest(Buffer.from("bad"))}` } })).status, 422);
    assert.equal((await request(upload)).data.committedBytes, 0);
    const session = (await pg.query(`SELECT * FROM video_agent_upload_sessions WHERE source_id=$1`, [source.id])).rows[0];
    const { decryptUploadSession } = await import("../ai-video/session-crypto.js");
    // Simulate a storage commit followed by loss of the API response/DB update.
    await storage.writeUploadChunk({ sessionUri: decryptUploadSession(session.encrypted_storage_session), body: Readable.from(bytes.subarray(0,100)), offset: 0, length: 100, totalBytes: bytes.length });
    assert.equal((await request(upload)).data.committedBytes, 100);
    const stale = await request(upload, { method: "PUT", body: bytes, headers: { "Upload-Offset": "0", Digest: `sha-256=${digest(bytes)}` } });
    assert.equal(stale.status, 409); assert.equal(stale.error.context.committedBytes, 100);
    const remainder = bytes.subarray(100);
    assert.equal((await request(upload, { method: "PUT", body: remainder, headers: { "Upload-Offset": "100", Digest: `sha-256=${digest(remainder)}` } })).data.committedBytes, bytes.length);
    assert.equal((await request(`${upload}-complete`, { method: "POST", body: {} })).status, 202);
    assert.equal((await request(`${upload}-complete`, { method: "POST", body: {} })).status, 202);
    assert.equal((await request(upload, { method: "PUT", body: bytes, headers: { "Upload-Offset": "0", Digest: `sha-256=${digest(bytes)}` } })).status, 409);
    await ingestSource(await claimSource(), { storage });
    const detail = (await request(prefix)).data;
    assert.equal(detail.sources[0].status, "ready"); assert.equal(detail.sources[0].probe.width, 320);
    const serialized = JSON.stringify(detail);
    assert.ok(!serialized.includes("object_key") && !serialized.includes("encrypted") && !serialized.includes("fingerprint"));
    const assetPath = `${prefix}/assets/${detail.sources[0].assetId}/download`;
    assert.equal((await request(assetPath, { user: 2 })).status, 404);
    const download = await fetch(base+assetPath, { headers: { "x-test-user": "1" } });
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
    const token = createMediaImportToken({ userId: 1, url: "https://media.example/video", filename: "import.mp4", mime: "video/mp4", service: "tiktok" });
    const imported = await request(`${prefix}/sources`, { method: "POST", body: { kind: "download_import", mediaImportToken: token } });
    assert.equal(imported.status, 202);
    assert.equal((await request(`${prefix}/sources`, { method: "POST", body: { kind: "download_import", mediaImportToken: token } })).error.code, "AI_VIDEO_IMPORT_TOKEN_USED");
    assert.equal((await pg.query(`SELECT count(*)::int AS n FROM ai_video_import_nonces`)).rows[0].n, 1);
    await ingestSource(await claimSource(), { storage, download: async ({ targetPath }) => { await copyFile(fixture,targetPath); } });
    assert.equal((await request(prefix)).data.sources[1].status, "ready");
    const third = (await request(`${prefix}/sources`, { method: "POST", body: input })).data.source;
    assert.equal((await request(`${prefix}/sources`, { method: "POST", body: input })).error.code, "VIDEO_AGENT_STORAGE_LIMIT");
    await pg.query(`UPDATE video_agent_upload_sessions SET expires_at=0 WHERE source_id=$1`, [third.id]);
    assert.equal((await request(`${prefix}/sources/${third.id}/upload`)).status, 410);
    await cleanupVideoAgent({ storage });
    assert.equal((await pg.query(`SELECT status FROM video_agent_sources WHERE id=$1`, [third.id])).rows[0].status, "deleted");
    const otherOwner = (await request("/projects", { user: 2, method: "POST", body: { title: "Other owner" } })).data.project;
    assert.equal((await request(`/projects/${otherOwner.id}/sources`, { user: 2, method: "POST", body: { kind: "download_import", mediaImportToken: token } })).error.code, "AI_VIDEO_IMPORT_TOKEN_USER_MISMATCH");
    // A video extension or MIME is insufficient: invalid bytes must fail real ffprobe checks.
    const badBytes = Buffer.from("not a video");
    const invalidSource = (await request(`${prefix}/sources`, { method: "POST", body: { ...input, sizeBytes: badBytes.length } })).data.source;
    const invalidUpload = `${prefix}/sources/${invalidSource.id}/upload`;
    await request(invalidUpload, { method: "PUT", body: badBytes, headers: { "Upload-Offset": "0", Digest: `sha-256=${digest(badBytes)}` } });
    await request(`${invalidUpload}-complete`, { method: "POST", body: {} });
    await ingestSource(await claimSource(), { storage });
    const failed = (await pg.query(`SELECT * FROM video_agent_sources WHERE id=$1`, [invalidSource.id])).rows[0];
    assert.equal(failed.status, "failed"); assert.ok(Number(failed.cleanup_after)>Date.now());
    assert.equal((await request(`${prefix}/sources`, { method: "POST", body: input })).error.code, "VIDEO_AGENT_STORAGE_LIMIT");
    await pg.query(`UPDATE video_agent_sources SET cleanup_after=0 WHERE id=$1`, [invalidSource.id]);
    await cleanupVideoAgent({ storage });
    // A DB failure after storage session creation must leave a discoverable cleanup record.
    let failSessionInsert = true;
    const interruptedSql = async (text, params) => {
        if (failSessionInsert && text.includes("INSERT INTO video_agent_upload_sessions")) {
            failSessionInsert = false;
            throw Object.assign(new Error("Simulated DB disconnect"), { code: "DB_SIMULATED" });
        }
        return sql(text,params);
    };
    setVideoAgentDatabaseForTests({ query: interruptedSql, getClient: async () => ({ query: interruptedSql, release() {} }) });
    assert.equal((await request(`${prefix}/sources`, { method: "POST", body: input })).status, 500);
    setVideoAgentDatabaseForTests({ query: sql, getClient: async () => ({ query: sql, release() {} }) });
    assert.equal((await pg.query(`SELECT count(*)::int AS n FROM video_agent_sources WHERE error_code='VIDEO_AGENT_UPLOAD_INIT_FAILED' AND status='failed'`)).rows[0].n, 1);
    await cleanupVideoAgent({ storage });
    // Reclaim an expired ingest lease. A late former worker must not publish or fail the new attempt.
    const recoveryToken = createMediaImportToken({ userId: 1, url: "https://media.example/recovery", filename: "recovery.mp4", mime: "video/mp4", service: "tiktok" });
    await request(`${prefix}/sources`, { method: "POST", body: { kind: "download_import", mediaImportToken: recoveryToken } });
    const late = await claimSource();
    await pg.query(`UPDATE video_agent_sources SET lease_until=0 WHERE id=$1`, [late.id]);
    const successor = await claimSource(); assert.equal(successor.id, late.id); assert.notEqual(successor.lease_token, late.lease_token);
    const fixtureDownload = async ({ targetPath }) => { await copyFile(fixture,targetPath); };
    await ingestSource(late, { storage, download: fixtureDownload });
    assert.equal((await pg.query(`SELECT status FROM video_agent_sources WHERE id=$1`, [late.id])).rows[0].status, "ingesting");
    await ingestSource(successor, { storage, download: fixtureDownload });
    assert.equal((await pg.query(`SELECT status FROM video_agent_sources WHERE id=$1`, [late.id])).rows[0].status, "ready");
    const sameTime = (await request("/projects", { method: "POST", body: { title: "Second project" } })).data.project;
    await pg.query(`UPDATE video_agent_projects SET created_at=1000 WHERE id=ANY($1::uuid[])`, [[project.id,sameTime.id]]);
    const list = await request("/projects?limit=1"); assert.equal(list.data.projects.length, 1); assert.ok(list.data.nextCursor);
    const next = await request(`/projects?limit=1&cursor=${encodeURIComponent(list.data.nextCursor)}`);
    assert.equal(next.data.projects.length,1); assert.notEqual(next.data.projects[0].id,list.data.projects[0].id);
    assert.equal((await request("/projects?cursor=bad")).status, 400);
    assert.equal((await request(prefix, { method: "DELETE" })).status, 204);
    assert.equal((await request(prefix)).status, 404); assert.equal((await request(assetPath)).status, 404);
    await cleanupVideoAgent({ storage: { ...storage, headObject: storage.headObject.bind(storage), deleteObject: async () => { throw new Error("storage offline"); } } });
    const retry = (await pg.query(`SELECT cleanup_attempts FROM video_agent_sources WHERE id=$1`, [source.id])).rows[0];
    assert.equal(retry.cleanup_attempts, 1);
    await pg.exec(`UPDATE video_agent_sources SET cleanup_after=0 WHERE status='deleting'; UPDATE video_agent_assets SET expires_at=0,cleanup_after=0 WHERE status='expired';`);
    await cleanupVideoAgent({ storage });
    assert.equal((await pg.query(`SELECT count(*)::int AS n FROM video_agent_sources WHERE project_id=$1 AND status<>'deleted'`, [project.id])).rows[0].n, 0);
    assert.equal((await pg.query(`SELECT count(*)::int AS n FROM video_agent_assets WHERE project_id=$1 AND status<>'deleted'`, [project.id])).rows[0].n, 0);
    process.env.VIDEO_AGENT_ENABLED = "0";
    assert.equal((await request("/projects")).status, 503);
});
