import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import express from "express";
import {PGlite} from "@electric-sql/pglite";
import {ensureVideoAgentSchema,setVideoAgentDatabaseForTests} from "../db/video-agent.js";
import {createVideoAgentRouter} from "../routes/video-agent.js";
import {cleanupExecutionHistory} from "./execution.js";

test("conversation messages are owned, idempotent, paginated, bounded and retained for 90 days",async t=>{
    process.env.NODE_ENV="test";process.env.VIDEO_AGENT_ENABLED="1";
    const pg=new PGlite();
    const sql=async(text,params)=>{const result=params?await pg.query(text,params):(await pg.exec(text)).at(-1);return {...result,rowCount:result.affectedRows || result.rows?.length || 0};};
    setVideoAgentDatabaseForTests({query:sql,getClient:async()=>({query:sql,release(){}})});
    await pg.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,is_disabled BOOLEAN DEFAULT false);INSERT INTO users(id) VALUES(1),(2);");await ensureVideoAgentSchema();
    const app=express();app.use(express.json({limit:"20kb"}));app.use(createVideoAgentRouter({authenticate:async req=>req.header("x-user")?{id:Number(req.header("x-user"))}:null}));
    const server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));
    t.after(async()=>{await new Promise(resolve=>server.close(resolve));await pg.close();});
    const base=`http://127.0.0.1:${server.address().port}`,request=async(path,{user=1,method="GET",body}={})=>{const response=await fetch(base+path,{method,headers:{...(user?{"x-user":String(user)}:{}),"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,payload:response.status===204?null:await response.json()};};
    const project=(await request("/projects",{method:"POST",body:{title:"Conversation"}})).payload.data.project,prefix=`/projects/${project.id}/messages`;
    assert.equal((await request(prefix,{user:null})).status,401);assert.equal((await request(prefix,{user:2})).status,404);
    const body={clientMessageId:"message_idempotent_0001",content:"  Make three clips.\r\nKeep subtitles.  "};
    const first=await request(prefix,{method:"POST",body});assert.equal(first.status,201);assert.equal(first.payload.data.message.content,"Make three clips.\nKeep subtitles.");
    const replay=await request(prefix,{method:"POST",body});assert.equal(replay.status,200);assert.equal(replay.payload.data.message.id,first.payload.data.message.id);
    assert.equal((await request(prefix,{method:"POST",body:{...body,content:"Different"}})).payload.error.code,"VIDEO_AGENT_MESSAGE_CONFLICT");
    for(const invalid of [{content:"x",clientMessageId:"short"},{content:"\u0000",clientMessageId:"valid_message_id_0001"},{content:"x",clientMessageId:"valid_message_id_0001",role:"assistant"}])assert.equal((await request(prefix,{method:"POST",body:invalid})).status,400);
    const event=(await pg.query("SELECT safe_payload FROM video_agent_events WHERE project_id=$1",[project.id])).rows[0].safe_payload;assert.equal(event.messageId,first.payload.data.message.id);assert.equal(JSON.stringify(event).includes("Make three"),false);
    await pg.query("UPDATE video_agent_messages SET created_at=0 WHERE id=$1",[first.payload.data.message.id]);await cleanupExecutionHistory();assert.equal((await pg.query("SELECT count(*)::int AS n FROM video_agent_messages WHERE id=$1",[first.payload.data.message.id])).rows[0].n,0);
    for(let i=0;i<5;i++)assert.equal((await request(prefix,{method:"POST",body:{clientMessageId:`page_message_${String(i).padStart(16,"0")}`,content:`Message ${i}`}})).status,201);
    const latest=await request(`${prefix}?limit=2`);assert.deepEqual(latest.payload.data.messages.map(item=>item.content),["Message 3","Message 4"]);assert.ok(latest.payload.data.nextCursor);
    const older=await request(`${prefix}?limit=2&cursor=${encodeURIComponent(latest.payload.data.nextCursor)}`);assert.deepEqual(older.payload.data.messages.map(item=>item.content),["Message 1","Message 2"]);
    for(let i=5;i<20;i++)await request(prefix,{method:"POST",body:{clientMessageId:`rate_message_${String(i).padStart(16,"0")}`,content:`Rate ${i}`}});
    assert.equal((await request(prefix,{method:"POST",body:{clientMessageId:"rate_message_blocked_0001",content:"Too many"}})).payload.error.code,"VIDEO_AGENT_MESSAGE_RATE_LIMIT");
    const activeProject=(await request("/projects",{method:"POST",body:{title:"Active run"}})).payload.data.project;
    const planId=randomUUID(),runId=randomUUID(),now=Date.now();
    await pg.query(`INSERT INTO video_agent_revisions(project_id,revision,settings_snapshot,created_by,created_at)
        VALUES($1,0,'{}',1,$2)`,[activeProject.id,now]);
    await pg.query(`INSERT INTO video_agent_plans(id,project_id,revision,plan,plan_hash,source_snapshot,pipeline_version,created_at)
        VALUES($1,$2,0,'{}','test','{}','test',$3)`,[planId,activeProject.id,now]);
    await pg.query(`INSERT INTO video_agent_runs(id,project_id,base_revision,plan_id,plan,plan_hash,source_snapshot,pipeline_version,status,requested_count,created_at,updated_at)
        VALUES($1,$2,0,$3,'{}','test','{}','test','running',1,$4,$4)`,[runId,activeProject.id,planId,now]);
    const locked=await request(`/projects/${activeProject.id}/messages`,{method:"POST",body:{clientMessageId:"message_while_running_001",content:"Change it."}});
    assert.equal(locked.status,409);assert.equal(locked.payload.error.code,"VIDEO_AGENT_PROJECT_RUN_ACTIVE");
    assert.equal((await request(`/projects/${project.id}`,{method:"DELETE"})).status,204);await cleanupExecutionHistory();assert.equal((await pg.query("SELECT count(*)::int AS n FROM video_agent_messages WHERE project_id=$1",[project.id])).rows[0].n,0);
});
