import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createPersonalAgentRouter } from '../routes/personal-agent.js';
import * as db from '../db/personal-agent.js';
import { grantSchema, agentError } from './policy.js';
import { markCreditOrderPaid } from '../db/credit-orders.js';

process.env.NODE_ENV='test';
test('checkout authorization, durable deduplication, human confirmation and fulfillment',async t => {
    const pg=new PGlite();
    await pg.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,clerk_user_id TEXT,points INTEGER NOT NULL,is_disabled BOOLEAN NOT NULL DEFAULT FALSE,updated_at BIGINT);
        INSERT INTO users VALUES(1,'owner_one',0,FALSE,0),(2,'owner_two',0,FALSE,0);
        CREATE TABLE credit_orders(id SERIAL PRIMARY KEY,user_id INTEGER,clerk_user_id TEXT,provider TEXT,product_key TEXT,
            points INTEGER,amount_fen INTEGER,currency TEXT,out_trade_no TEXT UNIQUE,status TEXT,provider_data JSONB,
            provider_transaction_id TEXT,paid_at BIGINT,raw_notify JSONB,updated_at BIGINT);`);
    let tail=Promise.resolve();
    const getClient=async () => {const prior=tail;let release;tail=new Promise(resolve => release=resolve);await prior;
        return {query:(...args)=>pg.query(...args),release};};
    db.setPersonalAgentDatabaseForTests({query:(sql,values)=>values ? pg.query(sql,values) : pg.exec(sql),getClient});
    await db.ensurePersonalAgentSchema();
    let price=100, creates=0, uncertain=false;
    const products=async ({kind,provider}) => [{key:kind==='credits' ? 'points_50' : 'month',amountFen:price,
        currency:provider==='wechat' ? 'CNY' : 'USD',enabled:true,billingType:'one_time',
        ...(kind==='credits' ? {points:50} : {durationDays:30,planKey:'month'})}];
    const payments={products,create:async ({user,kind,productKey,returnUrl}) => {
        creates++; assert.match(returnUrl,/^https:\/\/freesavevideo.online\/en\/account\/agent-checkout\//);
        if (uncertain) throw new Error('Provider response lost');
        const order=(await pg.query(`INSERT INTO credit_orders(user_id,clerk_user_id,provider,product_key,points,amount_fen,currency,out_trade_no,status,provider_data)
            VALUES($1,$2,'wechat',$3,$4,$5,'CNY',$6,'CREATED',$7) RETURNING *`,
            [user.id,user.clerk_user_id,productKey,kind==='credits' ? 50 : 0,price,`order_${creates}`,
                {code_url:'weixin://wxpay/test',private_secret:'must_not_leak'}])).rows[0];
        return {status:200,body:{status:'success',data:{order}}};
    },status:async ({user,orderId}) => {
        const order=(await pg.query('SELECT * FROM credit_orders WHERE id=$1 AND user_id=$2',[orderId,user.id])).rows[0];
        return {status:order ? 200 : 404,body:{status:'success',data:{order}}};
    }};
    const app=express();app.use(express.json());
    app.use('/agent',createPersonalAgentRouter({db,payments,authenticate:async req => {
        const id=Number(req.header('x-owner'));if (![1,2].includes(id)) throw agentError('UNAUTHORIZED',401);
        return {id,clerk_user_id:id===1 ? 'owner_one' : 'owner_two'};
    },resolveMedia:async req => {
        const user=req.personalAgent.grant;await pg.query('UPDATE users SET points=points-2 WHERE id=$1',[user.user_id]);
        return {status:200,body:{status:'redirect',points:{outcome:'consumed',before:user.points,after:user.points-2}}};
    }}));
    const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    t.after(async()=>{await new Promise(resolve=>server.close(resolve));await pg.close();});
    const origin=`http://127.0.0.1:${server.address().port}`;
    const request=async(path,{token,owner,body,method='GET'}={})=>{
        const response=await fetch(`${origin}/agent${path}`,{method,headers:{'Content-Type':'application/json',
            ...(token ? {Authorization:`Bearer ${token}`} : {}),...(owner ? {'x-owner':String(owner)} : {})},
            ...(body ? {body:JSON.stringify(body)} : {})});return {status:response.status,body:await response.json()};
    };
    const freshWindow=()=>pg.query('UPDATE personal_agent_calls SET started_at=started_at-600000');
    const grant=async(options={})=>db.createGrant(1,grantSchema.parse({name:'checkout',dailyCalls:100,maxPointsPerCall:4,
        scopes:['balance:read','media:resolve','payments:create','payments:read'],maxPurchaseAmount:100,dailyPurchaseAmount:300,...options}));
    const main=await grant();
    const input={kind:'credits',provider:'wechat',productKey:'points_50',idempotencyKey:'purchase_123456'};
    let checkoutId;
    await t.test('catalog is public; old credentials and zero budgets cannot order',async()=>{
        assert.equal((await request('/v1/products?kind=credits')).body.data.products[0].amountFen,100);
        assert.equal((await request('/v1/products?kind=credits&provider=unknown')).status,400);
        const old=await grant({scopes:['balance:read']});
        assert.equal((await request('/v1/checkouts',{token:old.token,method:'POST',body:input})).body.error.code,'AGENT_SCOPE_DENIED');
        const zero=await grant({maxPurchaseAmount:0});
        assert.equal((await request('/v1/checkouts',{token:zero.token,method:'POST',body:input})).body.error.code,'AGENT_PURCHASE_LIMIT');
        assert.equal(creates,0);
    });
    await t.test('unpaid creation replays durably, rejects changed input and forged price',async()=>{
        const first=await request('/v1/checkouts',{token:main.token,method:'POST',body:input});
        assert.equal(first.status,200);checkoutId=first.body.data.checkoutId;
        assert.equal(first.body.data.status,'AWAITING_CONFIRMATION');assert.equal(first.body.data.readyToContinue,false);
        assert.equal((await request('/v1/checkouts',{token:main.token,method:'POST',body:input})).body.data.checkoutId,checkoutId);
        assert.equal((await request('/v1/checkouts',{token:main.token,method:'POST',body:{...input,kind:'memberships',productKey:'month'}})).body.error.code,'AGENT_IDEMPOTENCY_CONFLICT');
        assert.equal((await request('/v1/checkouts',{token:main.token,method:'POST',body:{...input,amountFen:1}})).status,400);
        assert.equal(creates,0);
    });
    await freshWindow();
    await t.test('ownership and currency budgets deny cross-account and cross-grant access',async()=>{
        const another=await grant();
        assert.equal((await request(`/v1/checkouts/${checkoutId}`,{token:another.token})).status,404);
        assert.equal((await request(`/checkouts/${checkoutId}`,{owner:2})).status,404);
        assert.equal((await request(`/checkouts/${checkoutId}/confirm`,{token:main.token,method:'POST',body:{confirmed:true}})).status,401);
        assert.equal((await request('/v1/checkouts',{token:main.token,method:'POST',body:{...input,provider:'nowpayments',idempotencyKey:'usd_order_123'}})).body.error.code,'AGENT_PURCHASE_LIMIT');
        assert.equal(creates,0);
    });
    await t.test('product changes and missing confirmation cannot reach payment provider',async()=>{
        assert.equal((await request(`/checkouts/${checkoutId}/confirm`,{owner:1,method:'POST',body:{}})).status,400);
        price=200;
        assert.equal((await request(`/checkouts/${checkoutId}/confirm`,{owner:1,method:'POST',body:{confirmed:true}})).status,409);
        price=100;assert.equal(creates,0);
    });
    await t.test('simultaneous human confirmations create exactly one provider order',async()=>{
        const results=await Promise.all([1,2].map(()=>request(`/checkouts/${checkoutId}/confirm`,{owner:1,method:'POST',body:{confirmed:true}})));
        assert.ok(results.every(r=>r.status===200));assert.equal(creates,1);
        const view=(await request(`/checkouts/${checkoutId}`,{owner:1})).body.data;
        assert.equal(view.status,'CREATED');assert.equal(view.payment.codeUrl,'weixin://wxpay/test');
        await request(`/checkouts/${checkoutId}/confirm`,{owner:1,method:'POST',body:{confirmed:true}});assert.equal(creates,1);
        const agentView=(await request(`/v1/checkouts/${checkoutId}`,{token:main.token})).body.data;
        assert.equal(agentView.payment,undefined);assert.equal(JSON.stringify(agentView).includes('must_not_leak'),false);
    });
    await freshWindow();
    await t.test('verified fulfillment credits once; agent sees PAID and resumes a media task',async()=>{
        const checkout=await db.getCheckout(checkoutId,1);
        const order=(await pg.query('SELECT * FROM credit_orders WHERE id=$1',[checkout.order_id])).rows[0];
        const fulfillment={outTradeNo:order.out_trade_no,providerTransactionId:'verified_transaction',totalFen:100,clientFactory:getClient};
        assert.equal((await markCreditOrderPaid(fulfillment)).code,'PAID');
        assert.equal((await markCreditOrderPaid(fulfillment)).code,'ALREADY_PAID');
        const view=(await request(`/v1/checkouts/${checkoutId}`,{token:main.token})).body.data;
        assert.equal(view.readyToContinue,true);assert.equal(view.status,'PAID');
        assert.equal((await request('/v1/balance',{token:main.token})).body.data.points,50);
        assert.equal((await request('/v1/resolve',{token:main.token,method:'POST',body:{url:'https://example.com/video',idempotencyKey:'resume_task_123'}})).status,200);
        assert.equal((await pg.query('SELECT points FROM users WHERE id=1')).rows[0].points,48);
    });
    await freshWindow();
    await t.test('membership orders use the same workflow; daily budget is atomic across concurrent creates',async()=>{
        const record=await db.findGrant(main.token);
        const memberInput={kind:'memberships',provider:'wechat',productKey:'month',idempotencyKey:'member_order_123'};
        const memberProduct=(await products(memberInput))[0];
        const [one,two]=await Promise.all([db.createCheckout(record,memberInput,memberProduct),db.createCheckout(record,memberInput,memberProduct)]);
        assert.equal(one.id,two.id);
        await db.createCheckout(record,{...memberInput,idempotencyKey:'member_order_456'},memberProduct);
        await assert.rejects(db.createCheckout(record,{...memberInput,idempotencyKey:'member_order_789'},memberProduct),{code:'AGENT_PURCHASE_DAILY_LIMIT'});
        assert.equal((await request(`/checkouts/${one.id}/confirm`,{owner:1,method:'POST',body:{confirmed:true}})).status,200);
        const row=await db.getCheckout(one.id,1);await pg.query("UPDATE credit_orders SET status='PAID' WHERE id=$1",[row.order_id]);
        assert.equal((await request(`/v1/checkouts/${one.id}`,{token:main.token})).body.data.readyToContinue,true);
        assert.equal((await db.findGrant(main.token)).allow_membership,false);
    });
    await t.test('uncertain provider results fail closed; revocation and expiry block confirmation',async()=>{
        const other=await grant();const record=await db.findGrant(other.token);
        const product=(await products(input))[0];
        const lost=await db.createCheckout(record,{...input,idempotencyKey:'lost_response_123'},product);
        uncertain=true;
        assert.equal((await request(`/checkouts/${lost.id}/confirm`,{owner:1,method:'POST',body:{confirmed:true}})).status,502);
        const count=creates;
        assert.equal((await request(`/checkouts/${lost.id}/confirm`,{owner:1,method:'POST',body:{confirmed:true}})).body.data.status,'NEEDS_REVIEW');assert.equal(creates,count);
        uncertain=false;
        const revoked=await db.createCheckout(record,{...input,idempotencyKey:'revoked_order_123'},product);
        await db.revokeGrant(1,other.id);
        assert.equal((await request(`/checkouts/${revoked.id}/confirm`,{owner:1,method:'POST',body:{confirmed:true}})).status,403);
        const expireGrant=await grant();const expired=await db.createCheckout(await db.findGrant(expireGrant.token),input,product);
        await pg.query('UPDATE personal_agent_checkouts SET expires_at=1 WHERE id=$1',[expired.id]);
        assert.equal((await request(`/checkouts/${expired.id}/confirm`,{owner:1,method:'POST',body:{confirmed:true}})).status,410);
        assert.equal(creates,count);
    });
    await freshWindow();
    await t.test('official MCP client creates and queries checkout with explicit permission',async()=>{
        const mcpGrant=await grant();const client=new Client({name:'checkout-agent',version:'1.0.0'});
        try {
            await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/agent/mcp`),{requestInit:{headers:{Authorization:`Bearer ${mcpGrant.token}`}}}));
            const tools=(await client.listTools()).tools.map(tool=>tool.name);assert.ok(tools.includes('create_checkout'));assert.ok(tools.includes('get_checkout'));
            const created=JSON.parse((await client.callTool({name:'create_checkout',arguments:input})).content[0].text);
            assert.equal(created.data.status,'AWAITING_CONFIRMATION');
            const status=JSON.parse((await client.callTool({name:'get_checkout',arguments:{checkoutId:created.data.checkoutId}})).content[0].text);
            assert.equal(status.data.readyToContinue,false);
        } finally {await client.close();}
    });
});
