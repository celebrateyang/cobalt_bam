import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('shared production WeChat handlers create and reconcile credit/member orders with internal identity',async t=>{
    // Explicit fake configuration; every DB call and provider request stays in this test.
    process.env.CLERK_SECRET_KEY='sk_test_fixture';
    process.env.CLERK_PUBLISHABLE_KEY=`pk_test_${Buffer.from('fixture.clerk.accounts.dev$').toString('base64')}`;
    process.env.WECHATPAY_MCH_ID='fixture_merchant';process.env.WECHATPAY_APP_ID='fixture_app';
    process.env.WECHATPAY_SERIAL_NO='fixture_serial';process.env.WECHATPAY_API_V3_KEY='0'.repeat(32);
    process.env.WECHATPAY_NOTIFY_URL='https://example.invalid/payments/wechat/notify';
    process.env.WECHATPAY_PRIVATE_KEY=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
    process.env.WECHATPAY_API_BASE='https://wechat-fixture.invalid';
    const pg=new PGlite();
    await pg.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,clerk_user_id TEXT,points INTEGER,updated_at BIGINT);
        INSERT INTO users VALUES(1,'owner_one',0,0),(2,'owner_two',0,0);
        CREATE TABLE entitlements(key TEXT PRIMARY KEY,description TEXT);
        CREATE TABLE plans(id SERIAL PRIMARY KEY,key TEXT UNIQUE,name TEXT,description TEXT,is_active BOOLEAN,created_at BIGINT,updated_at BIGINT);
        CREATE TABLE plan_entitlements(plan_id INTEGER,entitlement_key TEXT,UNIQUE(plan_id,entitlement_key));
        CREATE TABLE subscriptions(id SERIAL PRIMARY KEY,user_id INTEGER,plan_id INTEGER,provider TEXT,provider_customer_id TEXT,
            provider_subscription_id TEXT,status TEXT,current_period_start BIGINT,current_period_end BIGINT,
            cancel_at_period_end BOOLEAN,created_at BIGINT,updated_at BIGINT);
        CREATE TABLE credit_orders(id SERIAL PRIMARY KEY,user_id INTEGER,clerk_user_id TEXT,provider TEXT,product_key TEXT,
            points INTEGER,amount_fen INTEGER,currency TEXT,out_trade_no TEXT UNIQUE,status TEXT,provider_data JSONB,
            provider_transaction_id TEXT,paid_at BIGINT,raw_notify JSONB,created_at BIGINT,updated_at BIGINT);`);
    const {getPool,closePool}=await import('../db/pg-client.js');
    const pool=getPool();pool.query=(...args)=>pg.query(...args);pool.connect=async()=>({query:(...args)=>pg.query(...args),release(){}});
    const {ensureMembershipOrdersSchema}=await import('../db/membership-orders.js');await ensureMembershipOrdersSchema();
    const originalFetch=globalThis.fetch;const transactions=new Map();let nativeCalls=0;
    globalThis.fetch=async (url,options={})=>{
        const address=new URL(url);assert.equal(address.origin,'https://wechat-fixture.invalid','Unexpected external request');
        if (address.pathname==='/v3/certificates') return Response.json({data:[]});
        if (options.method==='POST') {
            nativeCalls++;const body=JSON.parse(options.body);transactions.set(body.out_trade_no,body.amount);
            return Response.json({code_url:`weixin://wxpay/bizpayurl?pr=fixture_${nativeCalls}`});
        }
        const trade=decodeURIComponent(address.pathname.split('/').at(-1));const amount=transactions.get(trade);assert.ok(amount);
        return Response.json({trade_state:'SUCCESS',mchid:'fixture_merchant',appid:'fixture_app',amount,
            transaction_id:`verified_${trade}`,success_time:new Date().toISOString()});
    };
    t.after(async()=>{globalThis.fetch=originalFetch;await closePool();await pg.close();});
    const {getAgentPaymentProducts,runUserPaymentOperation}=await import('../routes/payments.js');
    const user={id:1,clerk_user_id:'owner_one'};
    const products=await getAgentPaymentProducts({kind:'credits',provider:'wechat'});
    assert.equal(products.find(p=>p.key==='points_50').enabled,true);
    for (const [kind,productKey] of [['credits','points_50'],['memberships','member_3day']]) {
        const created=await runUserPaymentOperation({user,kind,provider:'wechat',productKey,
            checkoutId:'00000000-0000-4000-8000-000000000001',returnUrl:'https://freesavevideo.online/en/account'});
        assert.equal(created.status,200);const order=created.body.data.order;
        assert.equal(order.user_id,1);assert.equal(order.status,'CREATED');
        assert.equal(order.provider_data.agent_checkout_id,'00000000-0000-4000-8000-000000000001');
        assert.match(created.body.data.wechat.codeUrl,/^weixin:\/\/wxpay\//);
        const denied=await runUserPaymentOperation({user:{id:2,clerk_user_id:'owner_two'},kind,orderId:order.id});
        assert.equal(denied.status,404);
        assert.equal((await runUserPaymentOperation({user,kind,orderId:order.id})).body.data.order.status,'PAID');
        assert.equal((await runUserPaymentOperation({user,kind,orderId:order.id})).body.data.order.status,'PAID');
    }
    assert.equal(nativeCalls,2);
    assert.equal((await pg.query('SELECT points FROM users WHERE id=1')).rows[0].points,50);
    assert.equal((await pg.query('SELECT COUNT(*)::int AS n FROM subscriptions WHERE user_id=1')).rows[0].n,1);
    await assert.rejects(runUserPaymentOperation({user:{id:1},kind:'credits',provider:'wechat'}));
});
