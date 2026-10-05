import assert from 'node:assert/strict';
import { createInterface } from 'node:readline';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// Credential is supplied on stdin, retained in memory and never printed or saved.
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const lines = createInterface({input:process.stdin,terminal:false});
console.log('Waiting for test credential on stdin (not echoed).');
const token = await new Promise(resolve => lines.once('line',line => {lines.close(); resolve(line.trim());}));
if (process.stdin.isTTY) process.stdin.setRawMode(false);
if (!/^fsv_agent_[a-zA-Z0-9_-]{43}$/.test(token)) throw new Error('Invalid test credential format');
const origin = 'https://api.freesavevideo.online';
const headers = {Authorization:`Bearer ${token}`};
const request = async (path, options = {}) => {
    const response = await fetch(`${origin}${path}`,{...options,headers:{...headers,'Content-Type':'application/json'},signal:AbortSignal.timeout(30000)});
    return {status:response.status,body:await response.json()};
};
const passed = (name, evidence) => console.log(JSON.stringify({check:name,status:'PASS',...evidence}));
try {
    const mode = process.argv[2] || '--read-only';
    if (mode === '--revoked') {
        const rejected = await request('/agent/v1/balance');
        assert.equal(rejected.status,401);
        assert.equal(rejected.body.error.code,'AGENT_UNAUTHORIZED');
        passed('Revoked credential cannot access REST',{httpStatus:401});
        const response = await fetch(`${origin}/agent/mcp`,{method:'POST',headers:{...headers,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},
            body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'revoked-credential-test',version:'1.0.0'}}}),signal:AbortSignal.timeout(30000)});
        assert.equal(response.status,401);
        passed('Revoked credential cannot access MCP',{httpStatus:401});
    } else if (['--download-membership-once','--download-points-once'].includes(mode)) {
        // Run only with explicit approval for one download and its points ceiling.
        const pointFunded = mode === '--download-points-once';
        const approvedPoints = process.argv.includes('--max-points=20') ? 20 : 4;
        const source = 'https://www.tiktok.com/@fatfatmillycat/video/7195741644585454894';
        const before = await request('/agent/v1/balance');
        assert.equal(before.status,200);
        assert.equal(before.body.data.maxPointsPerCall,pointFunded ? approvedPoints : 0);
        if (!pointFunded) assert.equal(before.body.data.allowMembership,true);
        const body = JSON.stringify({url:source,idempotencyKey:pointFunded ? 'acceptance_20261005_tiktok_points_once' : 'acceptance_20261005_tiktok_once',videoQuality:'720'});
        const result = await request('/agent/v1/resolve',{method:'POST',body});
        assert.equal(result.status,200,`Resolution failed: ${result.body.error?.code || result.status}`);
        assert.equal(result.body.status,'redirect');
        assert.equal(result.body.service,'tiktok');
        assert.equal(result.body.tunnelUrl,undefined);
        assert.ok([pointFunded ? 'consumed' : 'member','idempotency_replay'].includes(result.body.points?.outcome));
        passed('Real TikTok Direct Bridge resolution',{outcome:result.body.points.outcome});
        const resolvedBalance = await request('/agent/v1/balance');
        assert.equal(resolvedBalance.status,200);
        const spent = before.body.data.points - resolvedBalance.body.data.points;
        assert.ok(pointFunded ? spent >= 0 && spent <= approvedPoints : spent === 0,'Spending exceeded approved allowance');
        const retry = await request('/agent/v1/resolve',{method:'POST',body});
        assert.equal(retry.status,200);assert.equal(retry.body.points?.outcome,'idempotency_replay');
        const after = await request('/agent/v1/balance');
        assert.equal(after.status,200);assert.equal(after.body.data.points,resolvedBalance.body.data.points);
        passed('Same task replay; no duplicate debit or extra extraction',{outcome:'idempotency_replay',pointsUnchangedOnRetry:true,totalPointsSpent:spent});
        const media = new URL(result.body.directUrl || result.body.url);
        assert.equal(media.protocol,'https:');
        const response = await fetch(media,{signal:AbortSignal.timeout(60000)});
        assert.equal(response.status,200,'Media CDN download failed');
        assert.ok(Number(response.headers.get('content-length') || 0) <= 50*1024*1024,'Media exceeds test size ceiling');
        const reader = response.body.getReader();
        const chunks=[];let bytes=0;
        while (true) {
            const chunk = await reader.read();if (chunk.done) break;
            bytes += chunk.value.length;
            if (bytes>50*1024*1024) {await reader.cancel();throw new Error('Media exceeds test size ceiling');}
            chunks.push(Buffer.from(chunk.value));
        }
        const buffer=Buffer.concat(chunks);assert.ok(bytes>1000);assert.equal(buffer.subarray(4,8).toString('ascii'),'ftyp');
        const directory=join(tmpdir(),'fsv-agent-acceptance');await mkdir(directory,{recursive:true});
        const file=join(directory,'tiktok-20261005.mp4');await writeFile(file,buffer);
        passed('Real MP4 downloaded and saved',{file,bytes,sha256:createHash('sha256').update(buffer).digest('hex')});
    } else {
    assert.equal(mode,'--read-only','Unknown verification mode');
    const balance = await request('/agent/v1/balance');
    assert.equal(balance.status,200);
    assert.equal(typeof balance.body.data.points,'number');
    passed('REST balance and DB-backed authorization', {maxPointsPerCall:balance.body.data.maxPointsPerCall,allowMembership:balance.body.data.allowMembership});
    for (const path of ['/agent/grants','/agent/calls']) {
        const denied = await request(path);
        assert.equal(denied.status,401);
        passed('Agent cannot manage user credentials or inspect account audit',{path,httpStatus:denied.status});
    }
    const invalid = await request('/agent/v1/resolve',{method:'POST',body:JSON.stringify({
        url:'https://www.tiktok.com/@example/video/123',idempotencyKey:'acceptance_invalid_options',alwaysProxy:true,userId:0,
    })});
    assert.equal(invalid.status,400);assert.equal(invalid.body.error.code,'AGENT_INVALID_REQUEST');
    passed('Strict input rejects proxy/identity injection before extraction',{httpStatus:invalid.status,errorCode:invalid.body.error.code});

    const client = new Client({name:'fsv-production-acceptance',version:'1.0.0'});
    const transport = new StreamableHTTPClientTransport(new URL(`${origin}/agent/mcp`),{requestInit:{headers}});
    try {
        await client.connect(transport);
        const tools = (await client.listTools()).tools.map(tool=>tool.name);
        assert.ok(tools.includes('get_capabilities'));assert.ok(tools.includes('get_balance'));
        passed('Official MCP client initialize and tool discovery',{tools});
        const capabilities = await client.callTool({name:'get_capabilities',arguments:{}});
        assert.equal(JSON.parse(capabilities.content[0].text).payments.automaticRecharge,false);
        passed('MCP capabilities',{automaticRecharge:false});
        const mcpBalance = await client.callTool({name:'get_balance',arguments:{}});
        const data = JSON.parse(mcpBalance.content[0].text).data;
        assert.equal(data.points,balance.body.data.points);
        passed('MCP balance: unchanged points',{unchanged:true});
    } finally { await client.close(); }
    console.log('Read-only production acceptance passed. No valid resolution or payment was requested.');
    }
} catch (error) {
    // Do not dump response objects, signed media URLs or request headers.
    console.error(JSON.stringify({status:'FAIL',name:error.name,code:error.code || null,message:String(error.message).replaceAll(token,'[redacted]')}));
    process.exitCode = 1;
}
