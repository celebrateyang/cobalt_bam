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
        ALTER TABLE personal_agent_grants ADD COLUMN IF NOT EXISTS purchase_currency TEXT NOT NULL DEFAULT 'CNY';
        ALTER TABLE personal_agent_grants ADD COLUMN IF NOT EXISTS max_purchase_amount INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE personal_agent_grants ADD COLUMN IF NOT EXISTS daily_purchase_amount INTEGER NOT NULL DEFAULT 0;
        CREATE TABLE IF NOT EXISTS personal_agent_checkouts (
            id UUID PRIMARY KEY, grant_id UUID NOT NULL REFERENCES personal_agent_grants(id),
            user_id INTEGER NOT NULL REFERENCES users(id), idempotency_key TEXT NOT NULL,
            kind TEXT NOT NULL, provider TEXT NOT NULL, product_key TEXT NOT NULL,
            product JSONB NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL,
            state TEXT NOT NULL DEFAULT 'AWAITING_CONFIRMATION', created_at BIGINT NOT NULL,
            expires_at BIGINT NOT NULL, order_id INTEGER, error_code TEXT,
            UNIQUE(grant_id,idempotency_key)
        );
        CREATE INDEX IF NOT EXISTS personal_agent_checkouts_grant ON personal_agent_checkouts(grant_id,created_at);
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
        (id,user_id,name,token_hash,token_prefix,scopes,daily_calls,max_points_per_call,allow_membership,created_at,expires_at,purchase_currency,max_purchase_amount,daily_purchase_amount)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [randomUUID(), userId, input.name, tokenHash(token), token.slice(0,18), JSON.stringify(input.scopes),
            input.dailyCalls, input.maxPointsPerCall, input.allowMembership, now, now + input.expiresInDays * 86400000,
            input.purchaseCurrency, input.maxPurchaseAmount, input.dailyPurchaseAmount]);
    return { id: result.rows[0].id, token };
});
export const listGrants = async userId => {
    await ensurePersonalAgentSchema();
    return (await query(`SELECT id,name,token_prefix,scopes,daily_calls,max_points_per_call,allow_membership,created_at,expires_at,revoked_at,purchase_currency,max_purchase_amount,daily_purchase_amount
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

export const createCheckout = async (grant, input, product) => transaction(async client => {
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [grant.user_id]);
    const now = Date.now();
    const current = (await client.query(`SELECT g.* FROM personal_agent_grants g JOIN users u ON u.id=g.user_id
        WHERE g.id=$1 AND g.revoked_at IS NULL AND g.expires_at>$2 AND NOT u.is_disabled`, [grant.id,now])).rows[0];
    if (!current) throw agentError("AGENT_AUTH_REVOKED",403);
    if (!current.scopes.includes("payments:create")) throw agentError("AGENT_SCOPE_DENIED",403);
    const previous = (await client.query("SELECT * FROM personal_agent_checkouts WHERE grant_id=$1 AND idempotency_key=$2", [grant.id,input.idempotencyKey])).rows[0];
    if (previous) {
        if (previous.kind!==input.kind || previous.provider!==input.provider || previous.product_key!==input.productKey)
            throw agentError("AGENT_IDEMPOTENCY_CONFLICT",409);
        return previous;
    }
    if (!Number.isSafeInteger(product.amountFen) || product.amountFen<=0 || product.currency!==current.purchase_currency || product.amountFen>current.max_purchase_amount)
        throw agentError("AGENT_PURCHASE_LIMIT",403);
    const total = (await client.query("SELECT COALESCE(SUM(amount),0) AS total FROM personal_agent_checkouts WHERE grant_id=$1 AND created_at>=$2", [grant.id,Math.floor(now/86400000)*86400000])).rows[0].total;
    if (Number(total)+product.amountFen>current.daily_purchase_amount) throw agentError("AGENT_PURCHASE_DAILY_LIMIT",403);
    return (await client.query(`INSERT INTO personal_agent_checkouts
        (id,grant_id,user_id,idempotency_key,kind,provider,product_key,product,amount,currency,created_at,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [randomUUID(),grant.id,grant.user_id,input.idempotencyKey,input.kind,input.provider,input.productKey,
            JSON.stringify(product),product.amountFen,product.currency,now,Math.min(now+30*60000,Number(current.expires_at))])).rows[0];
});
export const getCheckout = async (id, userId, grantId) => {
    await ensurePersonalAgentSchema();
    return (await query(`SELECT * FROM personal_agent_checkouts WHERE id=$1 AND user_id=$2
        ${grantId ? "AND grant_id=$3" : ""}`, grantId ? [id,userId,grantId] : [id,userId])).rows[0];
};
export const claimCheckout = async (id, userId) => transaction(async client => {
    const checkout = (await client.query("SELECT * FROM personal_agent_checkouts WHERE id=$1 AND user_id=$2 FOR UPDATE", [id,userId])).rows[0];
    if (!checkout) throw agentError("NOT_FOUND",404);
    if (checkout.state!=="AWAITING_CONFIRMATION") return { checkout, claimed:false };
    if (Number(checkout.expires_at)<=Date.now()) throw agentError("AGENT_CHECKOUT_EXPIRED",410);
    const grant = (await client.query(`SELECT g.* FROM personal_agent_grants g JOIN users u ON u.id=g.user_id
        WHERE g.id=$1 AND g.revoked_at IS NULL AND g.expires_at>$2 AND NOT u.is_disabled`, [checkout.grant_id,Date.now()])).rows[0];
    if (!grant) throw agentError("AGENT_AUTH_REVOKED",403);
    if (!grant.scopes.includes("payments:create")) throw agentError("AGENT_SCOPE_DENIED",403);
    if (checkout.currency!==grant.purchase_currency || checkout.amount>grant.max_purchase_amount) throw agentError("AGENT_PURCHASE_LIMIT",403);
    // Persist before provider I/O. A crash/timeout must never create a second order on retry.
    await client.query("UPDATE personal_agent_checkouts SET state='CREATING' WHERE id=$1", [id]);
    return { checkout:{...checkout,state:"CREATING"}, claimed:true };
});
export const finishCheckout = async (id, orderId, errorCode) => query(`UPDATE personal_agent_checkouts
    SET state=$2,order_id=$3,error_code=$4 WHERE id=$1 AND state='CREATING'`,
    [id,orderId ? "PENDING_PAYMENT" : "NEEDS_REVIEW",orderId || null,errorCode || null]);
