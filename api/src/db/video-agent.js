import { randomUUID } from "node:crypto";
import { EXECUTION_SCHEMA } from "../video-agent/execution-schema.js";
let database;
const getDatabase = async () => database || await import("./pg-client.js");
export const agentQuery = async (...args) => (await getDatabase()).query(...args);
const query = agentQuery;
const getClient = async () => (await getDatabase()).getClient();
export const setVideoAgentDatabaseForTests = (adapter) => {
    if (process.env.NODE_ENV !== "test") throw new Error("Test database adapter is only available in tests");
    database = adapter;
    schemaPromise = null;
};

let schemaPromise;
export const ensureVideoAgentSchema = () => {
    if (!schemaPromise) schemaPromise = query(`
        CREATE TABLE IF NOT EXISTS video_agent_projects (
            id UUID PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
            title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
            current_revision INTEGER NOT NULL DEFAULT 0,
            created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, deleted_at BIGINT
        );
        CREATE INDEX IF NOT EXISTS video_agent_projects_user ON video_agent_projects(user_id,created_at,id);
        CREATE TABLE IF NOT EXISTS video_agent_sources (
            id UUID PRIMARY KEY, project_id UUID NOT NULL REFERENCES video_agent_projects(id),
            kind TEXT NOT NULL CHECK(kind IN ('upload','download_import')),
            filename TEXT NOT NULL, mime TEXT NOT NULL, size_bytes BIGINT NOT NULL,
            source_input_encrypted TEXT, object_key TEXT NOT NULL UNIQUE, generation TEXT,
            checksum TEXT, probe JSONB, status TEXT NOT NULL, error_code TEXT,
            retention_until BIGINT NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
            lease_token UUID, lease_until BIGINT, attempts INTEGER NOT NULL DEFAULT 0,
            cleanup_after BIGINT, cleanup_attempts INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS video_agent_sources_project ON video_agent_sources(project_id);
        CREATE INDEX IF NOT EXISTS video_agent_sources_work ON video_agent_sources(status,lease_until);
        CREATE TABLE IF NOT EXISTS video_agent_upload_sessions (
            id UUID PRIMARY KEY, source_id UUID NOT NULL UNIQUE REFERENCES video_agent_sources(id),
            user_id INTEGER NOT NULL REFERENCES users(id), encrypted_storage_session TEXT,
            committed_bytes BIGINT NOT NULL DEFAULT 0, total_bytes BIGINT NOT NULL,
            chunk_size_bytes INTEGER NOT NULL, file_fingerprint TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active', expires_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS video_agent_assets (
            id UUID PRIMARY KEY, project_id UUID NOT NULL REFERENCES video_agent_projects(id),
            source_id UUID NOT NULL REFERENCES video_agent_sources(id), kind TEXT NOT NULL DEFAULT 'source',
            object_key TEXT NOT NULL UNIQUE, generation TEXT, checksum TEXT,
            size_bytes BIGINT NOT NULL, status TEXT NOT NULL DEFAULT 'ready', expires_at BIGINT NOT NULL,
            cleanup_after BIGINT, cleanup_attempts INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS ai_video_import_nonces (
            nonce UUID PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
            expires_at BIGINT NOT NULL, used_at BIGINT NOT NULL
        );
    ` + EXECUTION_SCHEMA).catch((error) => { schemaPromise = null; throw error; });
    return schemaPromise;
};

export const agentError = (code, status, message, context) => Object.assign(new Error(message), { code, status, context });
export const transaction = async (action) => {
    await ensureVideoAgentSchema();
    const client = await getClient();
    try {
        await client.query("BEGIN");
        const result = await action(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally { client.release(); }
};

export const projectDTO = (row) => ({ id: row.id, title: row.title, status: row.status, revision: row.current_revision, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
    latestRun: row.latest_run_id ? { id: row.latest_run_id, status: row.latest_run_status, requestedCount: row.latest_requested_count,
        producedCount: row.latest_produced_count } : null });
export const sourceDTO = (row) => ({ id: row.id, kind: row.kind, filename: row.filename, mime: row.mime,
    sizeBytes: Number(row.size_bytes), status: row.status, probe: row.probe, errorCode: row.error_code,
    retentionUntil: Number(row.retention_until), assetId: row.asset_id || null });

export const ownedProject = async (client, { projectId, userId, lock = false }) => {
    const result = await client.query(`SELECT * FROM video_agent_projects WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL ${lock ? "FOR UPDATE" : ""}`, [projectId, userId]);
    if (!result.rowCount) throw agentError("VIDEO_AGENT_PROJECT_NOT_FOUND", 404, "Project not found");
    return result.rows[0];
};
export const ownedSource = async (client, { projectId, sourceId, userId }) => {
    await ownedProject(client, { projectId, userId, lock: true });
    const result = await client.query(`SELECT * FROM video_agent_sources WHERE id=$1 AND project_id=$2 FOR UPDATE`, [sourceId, projectId]);
    if (!result.rowCount) throw agentError("VIDEO_AGENT_SOURCE_NOT_FOUND", 404, "Source not found");
    return result.rows[0];
};
export const createProject = ({ userId, title }) => transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(2147482999,$1)", [userId]);
    const count = await client.query(`SELECT count(*)::int AS count FROM video_agent_projects WHERE user_id=$1 AND deleted_at IS NULL`, [userId]);
    if (count.rows[0].count >= 100) throw agentError("VIDEO_AGENT_PROJECT_LIMIT", 409, "Project limit reached");
    const now = Date.now();
    return projectDTO((await client.query(`INSERT INTO video_agent_projects(id,user_id,title,created_at,updated_at) VALUES($1,$2,$3,$4,$4) RETURNING *`, [randomUUID(), userId, title, now])).rows[0]);
});
export const listProjects = async ({ userId, limit, cursor }) => {
    await ensureVideoAgentSchema();
    const result = await query(`SELECT p.*,r.id AS latest_run_id,r.status AS latest_run_status,
        r.requested_count AS latest_requested_count,r.produced_count AS latest_produced_count
        FROM video_agent_projects p LEFT JOIN LATERAL (
            SELECT id,status,requested_count,produced_count FROM video_agent_runs
            WHERE project_id=p.id ORDER BY created_at DESC,id DESC LIMIT 1
        ) r ON TRUE WHERE p.user_id=$1 AND p.deleted_at IS NULL
        AND ($2::bigint IS NULL OR (p.created_at,p.id)<($2,$3::uuid))
        ORDER BY p.created_at DESC,p.id DESC LIMIT $4`, [userId, cursor?.at || null, cursor?.id || null, limit + 1]);
    const rows = result.rows.slice(0, limit);
    return { projects: rows.map(projectDTO), nextCursor: result.rows.length > limit ? `${rows.at(-1).created_at}:${rows.at(-1).id}` : null };
};
export const getProject = (input) => transaction(async (client) => {
    const project = await ownedProject(client, { ...input, lock: true });
    const sources = await client.query(`SELECT s.*,a.id AS asset_id FROM video_agent_sources s LEFT JOIN video_agent_assets a ON a.source_id=s.id AND a.status='ready' AND a.object_key=s.object_key
        WHERE s.project_id=$1 ORDER BY s.created_at,s.id`, [input.projectId]);
    return { project: projectDTO(project), sources: sources.rows.map(sourceDTO) };
});
export const deleteProject = (input) => transaction(async (client) => {
    await ownedProject(client, { ...input, lock: true });
    const { cancelProjectRuns } = await import("../video-agent/execution.js");
    await cancelProjectRuns(client, input.projectId);
    const now = Date.now();
    await client.query(`UPDATE video_agent_projects SET status='deleted',deleted_at=$2,updated_at=$2 WHERE id=$1`, [input.projectId, now]);
    await client.query(`UPDATE video_agent_sources SET status='deleting',source_input_encrypted=NULL,cleanup_after=$2,updated_at=$2 WHERE project_id=$1 AND status<>'deleted'`, [input.projectId, now]);
    await client.query(`UPDATE video_agent_assets SET status='expired' WHERE project_id=$1`, [input.projectId]);
});

export const assertSourceCapacity = async (client, { userId, sizeBytes }) => {
    await client.query("SELECT pg_advisory_xact_lock(2147482999,$1)", [userId]);
    const membership = await client.query(`SELECT 1 FROM subscriptions s JOIN plans p ON p.id=s.plan_id
        JOIN plan_entitlements pe ON pe.plan_id=p.id WHERE s.user_id=$1 AND s.status='active' AND p.is_active=true
        AND pe.entitlement_key='ai_video_studio' AND (s.current_period_end IS NULL OR s.current_period_end>$2) LIMIT 1`, [userId, Date.now()]);
    if (!membership.rowCount) throw agentError("MEMBERSHIP_REQUIRED", 403, "Active AI video membership is required");
    const usage = (await client.query(`SELECT count(*)::int AS count,coalesce(sum(s.size_bytes),0) AS bytes
        FROM video_agent_sources s JOIN video_agent_projects p ON p.id=s.project_id
        WHERE p.user_id=$1 AND p.deleted_at IS NULL AND s.status NOT IN ('deleting','deleted')`, [userId])).rows[0];
    if (usage.count >= 3 || Number(usage.bytes) + sizeBytes > 3 * 1024 ** 3) throw agentError("VIDEO_AGENT_STORAGE_LIMIT", 409, "Source storage limit reached");
};

export const finalizeSource = async (client, source, { generation, sizeBytes, checksum = null, probe }) => {
    const now = Date.now();
    await client.query(`INSERT INTO video_agent_assets(id,project_id,source_id,object_key,generation,checksum,size_bytes,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(object_key) DO UPDATE SET generation=excluded.generation,
        checksum=excluded.checksum,size_bytes=excluded.size_bytes,status='ready',expires_at=excluded.expires_at`,
    [randomUUID(), source.project_id, source.id, source.object_key, generation, checksum, sizeBytes, source.retention_until]);
    await client.query(`UPDATE video_agent_sources SET status='ready',generation=$2,size_bytes=$3,checksum=$4,probe=$5,
        source_input_encrypted=NULL,lease_token=NULL,lease_until=NULL,updated_at=$6 WHERE id=$1`, [source.id, generation, sizeBytes, checksum, probe, now]);
};
