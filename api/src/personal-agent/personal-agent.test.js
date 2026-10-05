import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createPersonalAgentRouter } from "../routes/personal-agent.js";
import * as db from "../db/personal-agent.js";
import { agentError, checkChargePermission, grantSchema, tokenHash } from "./policy.js";

process.env.NODE_ENV = "test";

test("charge permission rejects overspend, revoked access and unauthorized membership", async () => {
    const grant = { max_points_per_call: 4, allow_membership: false };
    const active = async () => true;
    await checkChargePermission({ grant, points: 4, isActive: active });
    await assert.rejects(checkChargePermission({ grant, points: 6, isActive: active }), { code: "AGENT_POINT_LIMIT" });
    await assert.rejects(checkChargePermission({ grant, points: 0, membership: true, isActive: active }), { code: "AGENT_MEMBERSHIP_NOT_ALLOWED" });
    await assert.rejects(checkChargePermission({ grant, points: 0, isActive: async () => false }), { code: "AGENT_AUTH_REVOKED" });
    await checkChargePermission({ grant: { ...grant, allow_membership: true }, membership: true, isActive: active });
    assert.equal(grantSchema.safeParse({ name: "agent", scopes: ["admin"] }).success,false);
    assert.equal(grantSchema.safeParse({ name: "agent", scopes: ["media:resolve"], maxPointsPerCall: -1 }).success,false);
});

test("real PostgreSQL schema, HTTP authorization and MCP client complete isolated media tasks", async t => {
    const pg = new PGlite();
    await pg.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,clerk_user_id TEXT,points INTEGER NOT NULL,is_disabled BOOLEAN NOT NULL DEFAULT FALSE);
        INSERT INTO users(id,clerk_user_id,points) VALUES (1,'user_one',100),(2,'user_two',100),(3,'user_three',100);`);
    // PGlite has one connection: serialize test clients as distinct PG transactions.
    let tail = Promise.resolve();
    db.setPersonalAgentDatabaseForTests({ query: (sql,values) => values ? pg.query(sql,values) : pg.exec(sql),
        getClient: async () => {
            const prior = tail; let release;
            tail = new Promise(resolve => { release = resolve; }); await prior;
            return { query: (...args) => pg.query(...args), release };
        } });
    await db.ensurePersonalAgentSchema();
    const replay = new Map(); let resolutions = 0;
    const resolveMedia = async req => {
        const { grant, isActive } = req.personalAgent;
        assert.equal(req.authType,"personal_agent");
        assert.equal(req.rateLimitKey,`personal_agent_user_${grant.user_id}`);
        assert.equal(req.body.batch,false);
        assert.equal(req.body.localProcessing,"disabled");
        if (replay.has(req.body.queueId)) return { status: 200, body: { ...replay.get(req.body.queueId), points: { outcome: "idempotency_replay" } } };
        await checkChargePermission({ grant, points: 2, isActive });
        const before = (await pg.query("SELECT points FROM users WHERE id=$1",[grant.user_id])).rows[0].points;
        await pg.query("UPDATE users SET points=points-2 WHERE id=$1",[grant.user_id]);
        resolutions++;
        const body = { status: "redirect",service:"tiktok",filename:"sample.mp4",url:"https://media.example/sample.mp4",
            directUrl:"https://media.example/sample.mp4",points:{outcome:"consumed",before,after:before-2,required:2} };
        replay.set(req.body.queueId,body); return { status: 200,body };
    };
    const app = express(); app.use(express.json());
    app.use("/agent",createPersonalAgentRouter({ db, resolveMedia, authenticate: async req => {
        const id = Number(req.header("x-test-owner"));
        if (![1,2,3].includes(id)) throw agentError("UNAUTHORIZED",401);
        return { id };
    } }));
    const server = app.listen(0,"127.0.0.1"); await new Promise(resolve => server.once("listening",resolve));
    t.after(async () => { await new Promise(resolve => server.close(resolve)); await pg.close(); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const request = async (path, { token, owner, body, method = "GET" } = {}) => {
        const response = await fetch(`${origin}/agent${path}`,{method,headers:{"Content-Type":"application/json",
            ...(token ? {Authorization:`Bearer ${token}`} : {}),...(owner ? {"x-test-owner":String(owner)} : {})},body:body ? JSON.stringify(body) : undefined});
        return { status: response.status, body: await response.json() };
    };
    const create = async (owner, options = {}) => {
        const result = await request("/grants",{owner,method:"POST",body:{name:"Test agent",scopes:["balance:read","media:resolve"],maxPointsPerCall:4,dailyCalls:100,...options}});
        assert.equal(result.status,201); return result.body.data;
    };
    const grant = await create(1);
    const input = {url:"https://www.tiktok.com/@demo/video/123",idempotencyKey:"task_123456"};
    await t.test("public services, prices and OpenAPI are discoverable",async () => {
        const result = await request("/v1/capabilities");assert.equal(result.status,200);
        assert.equal(result.body.pricing.pointsPerStartedMinute,2);assert.equal(result.body.payments.automaticRecharge,false);
        assert.ok(result.body.services.includes("tiktok"));
        assert.equal((await request("/openapi.json")).body.paths["/agent/v1/resolve"].post.operationId,"resolve_media");
    });
    await t.test("tokens are shown once and users cannot inspect or revoke another user's grants",async () => {
        const saved = (await pg.query("SELECT token_hash FROM personal_agent_grants WHERE id=$1",[grant.id])).rows[0];
        assert.equal(saved.token_hash,tokenHash(grant.token));
        const list = await request("/grants",{owner:1});
        assert.equal(list.body.data[0].token,undefined);assert.equal(list.body.data[0].token_hash,undefined);
        assert.equal((await request("/grants",{owner:2})).body.data.length,0);
        assert.equal((await request(`/grants/${grant.id}`,{owner:2,method:"DELETE"})).status,404);
        assert.equal((await request("/grants",{token:grant.token})).status,401);
        assert.equal((await request("/v1/balance")).status,401);
        assert.equal((await request("/v1/balance",{token:"fsv_agent_invalid"})).status,401);
    });
    await t.test("REST result preserves Direct Bridge and retry does not debit again",async () => {
        const first = await request("/v1/resolve",{token:grant.token,method:"POST",body:input});
        assert.equal(first.status,200);assert.equal(first.body.status,"redirect");assert.equal(first.body.tunnelUrl,undefined);
        assert.equal(first.body.points.required,2);
        const retry = await request("/v1/resolve",{token:grant.token,method:"POST",body:input});
        assert.equal(retry.body.points.outcome,"idempotency_replay");assert.equal(resolutions,1);
        assert.equal((await request("/v1/balance",{token:grant.token})).body.data.points,98);
        const logs = (await request("/calls",{owner:1})).body.data;
        assert.equal(logs.reduce((sum,row)=>sum+row.points_charged,0),2);
        assert.equal(logs.find(row=>row.operation==="resolve_media").source_host,"www.tiktok.com");
        assert.equal(JSON.stringify(logs).includes("sample.mp4"),false);assert.equal(JSON.stringify(logs).includes(grant.token),false);
        assert.equal((await request("/calls",{owner:2})).body.data.length,0);
    });
    await t.test("strict inputs prevent changing identity, proxy mode or billing settings",async () => {
        const result = await request("/v1/resolve",{token:grant.token,method:"POST",body:{...input,alwaysProxy:true,userId:2}});
        assert.equal(result.status,400);assert.equal(result.body.error.code,"AGENT_INVALID_REQUEST");
        assert.equal((await request("/v1/resolve",{token:grant.token,method:"POST",body:{...input,url:"file:///etc/passwd"}})).status,400);
        assert.equal((await request("/v1/resolve",{token:grant.token,method:"POST",body:{...input,url:"https://secret:password@example.com/video"}})).status,400);
        const empty = await create(1,{maxPointsPerCall:0});
        const denied = await request("/v1/resolve",{token:empty.token,method:"POST",body:input});
        assert.equal(denied.status,403);assert.equal(denied.body.error.code,"AGENT_POINT_LIMIT");assert.equal(denied.body.url,undefined);
        assert.equal(resolutions,1);
    });
    await t.test("scopes, expiry, revocation and account disablement take effect",async () => {
        const readOnly = await create(2,{scopes:["balance:read"]});
        assert.equal((await request("/v1/resolve",{token:readOnly.token,method:"POST",body:input})).body.error.code,"AGENT_SCOPE_DENIED");
        await pg.query("UPDATE personal_agent_grants SET expires_at=1 WHERE id=$1",[readOnly.id]);
        assert.equal((await request("/v1/balance",{token:readOnly.token})).status,401);
        const revoked = await create(2);
        assert.equal((await request(`/grants/${revoked.id}`,{owner:2,method:"DELETE"})).status,200);
        assert.equal((await request("/v1/balance",{token:revoked.token})).status,401);
        const disabled = await create(2);
        await pg.query("UPDATE users SET is_disabled=TRUE WHERE id=2");
        assert.equal((await request("/v1/balance",{token:disabled.token})).status,403);
        await pg.query("UPDATE users SET is_disabled=FALSE WHERE id=2");
    });
    await t.test("DB admission enforces daily, concurrent and cross-credential rate limits",async () => {
        const limited = await create(3,{dailyCalls:1});
        assert.equal((await request("/v1/balance",{token:limited.token})).status,200);
        assert.equal((await request("/v1/balance",{token:limited.token})).body.error.code,"AGENT_DAILY_LIMIT");
        const parallel = await create(3);const record = await db.findGrant(parallel.token);
        const calls = await Promise.all([db.startCall(record,"get_balance"),db.startCall(record,"get_balance")]);
        await assert.rejects(db.startCall(record,"get_balance"),{code:"AGENT_CONCURRENCY_LIMIT"});
        for (const id of calls) await db.finishCall(id,{status:200,body:{status:"success"}});
        for (let index=0;index<7;index++) {const id=await db.startCall(record,"get_balance");await db.finishCall(id,{status:200,body:{status:"success"}});}
        const another = await create(3);
        await assert.rejects(db.startCall(await db.findGrant(another.token),"get_balance"),{code:"AGENT_RATE_LIMIT"});
    });
    await t.test("official MCP client lists and executes tools end to end",async () => {
        // Separate rate window from REST tests, without weakening production limits.
        await pg.query("UPDATE personal_agent_calls SET started_at=started_at-600000 WHERE user_id=1");
        const client = new Client({name:"phase-one-agent",version:"1.0.0"});
        const transport = new StreamableHTTPClientTransport(new URL(`${origin}/agent/mcp`),{requestInit:{headers:{Authorization:`Bearer ${grant.token}`}}});
        try {
            await client.connect(transport);
            const list = await client.listTools();assert.deepEqual(list.tools.map(tool=>tool.name).sort(),["get_balance","get_capabilities","list_payment_products","resolve_media"]);
            const balance = await client.callTool({name:"get_balance",arguments:{}});
            assert.equal(JSON.parse(balance.content[0].text).data.points,98);
            const media = await client.callTool({name:"resolve_media",arguments:{...input,idempotencyKey:"mcp_task_123456"}});
            assert.equal(media.isError,false);assert.equal(JSON.parse(media.content[0].text).directUrl,"https://media.example/sample.mp4");
            const retry = await client.callTool({name:"resolve_media",arguments:{...input,idempotencyKey:"mcp_task_123456"}});
            assert.equal(JSON.parse(retry.content[0].text).points.outcome,"idempotency_replay");
            assert.equal(resolutions,2);
        } finally {await client.close();}
    });
    await t.test("MCP hides unauthorized tools and rejects a credential revoked after connection",async () => {
        const readOnly = await create(2,{scopes:["balance:read"]});
        const client = new Client({name:"read-only-agent",version:"1.0.0"});
        const transport = new StreamableHTTPClientTransport(new URL(`${origin}/agent/mcp`),{requestInit:{headers:{Authorization:`Bearer ${readOnly.token}`}}});
        try {
            await client.connect(transport);
            assert.deepEqual((await client.listTools()).tools.map(tool=>tool.name).sort(),["get_balance","get_capabilities","list_payment_products"]);
            const denied = await client.callTool({name:"resolve_media",arguments:input});
            assert.equal(denied.isError,true);assert.equal(resolutions,2);
            await db.revokeGrant(2,readOnly.id);
            await assert.rejects(client.callTool({name:"get_balance",arguments:{}}));
        } finally {await client.close();}
    });
});
