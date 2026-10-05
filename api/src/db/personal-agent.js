import { randomUUID } from "node:crypto";
import { agentError, newToken, tokenHash } from "../personal-agent/policy.js";

let adapter;
let schemaPromise;
const database = async () => adapter || await import("./pg-client.js");
const query = async (...args) => (await database()).query(...args);
export const setPersonalAgentDatabaseForTests = value => {
    if (process.env.NODE_ENV !== "test") throw new Error("Test only");
    adapter = value; schemaPromise = null;
};
export const ensurePersonalAgentSchema = () => {
    if (!schemaPromise) schemaPromise = query(`
        CREATE TABLE IF NOT EXISTS personal_agent_grants (
            id UUID PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
            name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, token_prefix TEXT NOT NULL,
            scopes JSONB NOT NULL, daily_calls INTEGER NOT NULL CHECK(daily_calls BETWEEN 1 AND 100),
            max_points_per_call INTEGER NOT NULL CHECK(max_points_per_call BETWEEN 0 AND 1000),
            allow_membership BOOLEAN NOT NULL DEFAULT FALSE,
            created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, revoked_at BIGINT
        );
        CREATE INDEX IF NOT EXISTS personal_agent_grants_user ON personal_agent_grants(user_id,created_at);
        CREATE TABLE IF NOT EXISTS personal_agent_calls (
            id UUID PRIMARY KEY, grant_id UUID NOT NULL REFERENCES personal_agent_grants(id),
            user_id INTEGER NOT NULL REFERENCES users(id), operation TEXT NOT NULL,
            source_host TEXT, started_at BIGINT NOT NULL, completed_at BIGINT,
            http_status INTEGER, outcome TEXT NOT NULL DEFAULT 'running', error_code TEXT,
            points_charged INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS personal_agent_calls_grant ON personal_agent_calls(grant_id,started_at);
        CREATE INDEX IF NOT EXISTS personal_agent_calls_user ON personal_agent_calls(user_id,started_at);
    `).catch(error => { schemaPromise = null; throw error; });
    return schemaPromise;
};
const transaction = async action => {
    await ensurePersonalAgentSchema();
    const client = await (await database()).getClient();
    try {
        await client.query("BEGIN");
        const result = await action(client);
        await client.query("COMMIT");
        return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
};
export const createGrant = async (userId, input) => transaction(async client => {
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
    const now = Date.now();
    const count = await client.query("SELECT COUNT(*) FROM personal_agent_grants WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>$2", [userId, now]);
    if (Number(count.rows[0].count) >= 10) throw agentError("AGENT_GRANT_LIMIT", 409);
    const token = newToken();
    const result = await client.query(`INSERT INTO personal_agent_grants
        (id,user_id,name,token_hash,token_prefix,scopes,daily_calls,max_points_per_call,allow_membership,created_at,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [randomUUID(), userId, input.name, tokenHash(token), token.slice(0,18), JSON.stringify(input.scopes),
            input.dailyCalls, input.maxPointsPerCall, input.allowMembership, now, now + input.expiresInDays * 86400000]);
    return { id: result.rows[0].id, token };
});
export const listGrants = async userId => {
    await ensurePersonalAgentSchema();
    return (await query(`SELECT id,name,token_prefix,scopes,daily_calls,max_points_per_call,allow_membership,created_at,expires_at,revoked_at
        FROM personal_agent_grants WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, [userId])).rows;
};
export const revokeGrant = async (userId, id) => {
    await ensurePersonalAgentSchema();
    return (await query("UPDATE personal_agent_grants SET revoked_at=COALESCE(revoked_at,$3) WHERE id=$1 AND user_id=$2 RETURNING id", [id,userId,Date.now()])).rowCount > 0;
};
export const findGrant = async token => {
    await ensurePersonalAgentSchema();
    return (await query(`SELECT g.*,u.clerk_user_id,u.points,u.is_disabled FROM personal_agent_grants g
        JOIN users u ON u.id=g.user_id WHERE g.token_hash=$1 AND g.revoked_at IS NULL AND g.expires_at>$2`, [tokenHash(token),Date.now()])).rows[0];
};
export const isGrantActive = async id => (await query(`SELECT g.id FROM personal_agent_grants g JOIN users u ON u.id=g.user_id
    WHERE g.id=$1 AND g.revoked_at IS NULL AND g.expires_at>$2 AND NOT u.is_disabled`, [id,Date.now()])).rowCount > 0;
export const startCall = async (grant, operation, sourceHost) => transaction(async client => {
    // Serialize admission across pods and across this user's credentials.
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [grant.user_id]);
    const now = Date.now();
    const active = await client.query(`SELECT g.id FROM personal_agent_grants g JOIN users u ON u.id=g.user_id
        WHERE g.id=$1 AND g.revoked_at IS NULL AND g.expires_at>$2 AND NOT u.is_disabled`, [grant.id,now]);
    if (!active.rowCount) throw agentError("AGENT_AUTH_REVOKED", 403);
    const daily = await client.query("SELECT COUNT(*) FROM personal_agent_calls WHERE grant_id=$1 AND started_at>=$2", [grant.id, Math.floor(now / 86400000)*86400000]);
    if (Number(daily.rows[0].count) >= grant.daily_calls) throw agentError("AGENT_DAILY_LIMIT",429);
    const recent = await client.query(`SELECT COUNT(*) AS recent, COUNT(*) FILTER (WHERE completed_at IS NULL) AS running
        FROM personal_agent_calls WHERE user_id=$1 AND started_at>$2`, [grant.user_id,now-10*60000]);
    if (Number(recent.rows[0].running) >= 2) throw agentError("AGENT_CONCURRENCY_LIMIT",429);
    const minute = await client.query("SELECT COUNT(*) FROM personal_agent_calls WHERE user_id=$1 AND started_at>$2", [grant.user_id,now-60000]);
    if (Number(minute.rows[0].count) >= 10) throw agentError("AGENT_RATE_LIMIT",429);
    const id = randomUUID();
    await client.query("INSERT INTO personal_agent_calls (id,grant_id,user_id,operation,source_host,started_at) VALUES ($1,$2,$3,$4,$5,$6)", [id,grant.id,grant.user_id,operation,sourceHost || null,now]);
    return id;
});
export const finishCall = async (id, { status, body }) => query(`UPDATE personal_agent_calls SET completed_at=$2,http_status=$3,outcome=$4,error_code=$5,points_charged=$6 WHERE id=$1`,
    [id,Date.now(),status, status<400 && body?.status!=="error" ? "success" : "failed",body?.error?.code || null,
        body?.points?.outcome === "consumed" ? Math.max(0,Number(body.points.before)-Number(body.points.after)) : 0]);
export const listCalls = async userId => {
    await ensurePersonalAgentSchema();
    return (await query(`SELECT c.id,c.grant_id,g.name,c.operation,c.source_host,c.started_at,c.completed_at,c.http_status,c.outcome,c.error_code,c.points_charged
        FROM personal_agent_calls c JOIN personal_agent_grants g ON g.id=c.grant_id WHERE c.user_id=$1 ORDER BY c.started_at DESC LIMIT 100`, [userId])).rows;
};
