import {randomUUID} from "node:crypto";
import {agentError,transaction,ownedProject} from "../db/video-agent.js";

const MESSAGE_ID=/^[A-Za-z0-9_-]{16,128}$/;
const normalizeContent=value=>String(value).replace(/\r\n?/g,"\n").trim();
export const messageDTO=row=>({id:row.id,clientMessageId:row.client_message_id,role:row.role,content:row.content,status:row.status,createdAt:Number(row.created_at),
    outcome:row.planner_output && ["completed","awaiting_source"].includes(row.status)?{status:row.planner_output.status,planId:row.planner_output.planId || null,
        pendingSourceId:row.planner_output.pendingSourceId || null,
        execution:row.planner_output.execution?{status:row.planner_output.execution.status,runId:row.planner_output.execution.runId || null,
            errorCode:row.planner_output.execution.errorCode || null}:null}:null});

export const saveUserMessage=input=>transaction(async client=>{
    if(process.env.VIDEO_AGENT_ENABLED!=="1")throw agentError("VIDEO_AGENT_NOT_ENABLED",503,"New messages are not enabled");
    const content=normalizeContent(input.content);
    if(typeof input.content!=="string" || !content || content.length>4000 || Buffer.byteLength(content)>16384 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(content) || !MESSAGE_ID.test(input.clientMessageId || ""))throw agentError("VIDEO_AGENT_MESSAGE_INVALID",400,"Invalid conversation message");
    const project=await ownedProject(client,{...input,lock:true});
    const existing=(await client.query("SELECT * FROM video_agent_messages WHERE project_id=$1 AND user_id=$2 AND client_message_id=$3",[project.id,input.userId,input.clientMessageId])).rows[0];
    if(existing){if(existing.content!==content || existing.role!=="user")throw agentError("VIDEO_AGENT_MESSAGE_CONFLICT",409,"Message id has different content");return {message:messageDTO(existing),created:false};}
    const active=await client.query(`SELECT 1 FROM video_agent_runs WHERE project_id=$1
        AND status IN ('queued','planning','awaiting_input','running','cancelling') LIMIT 1`,[project.id]);
    if(active.rowCount)throw agentError("VIDEO_AGENT_PROJECT_RUN_ACTIVE",409,"Requirements cannot be changed while the task is running");
    const now=Date.now();
    await client.query("SELECT pg_advisory_xact_lock(2147482998,$1)",[input.userId]);
    const recent=(await client.query("SELECT count(*)::int AS count,min(created_at) AS oldest FROM video_agent_messages WHERE user_id=$1 AND role='user' AND created_at>=$2",[input.userId,now-60000])).rows[0];
    if(recent.count>=20)throw agentError("VIDEO_AGENT_MESSAGE_RATE_LIMIT",429,"Too many conversation messages",{retryAfterMs:Math.max(1000,Number(recent.oldest)+60000-now)});
    const total=(await client.query("SELECT count(*)::int AS count FROM video_agent_messages WHERE project_id=$1",[project.id])).rows[0].count;
    if(total>=2000)throw agentError("VIDEO_AGENT_MESSAGE_LIMIT",409,"Conversation message limit reached");
    const row=(await client.query(`INSERT INTO video_agent_messages(id,project_id,user_id,client_message_id,role,content,created_at)
        VALUES($1,$2,$3,$4,'user',$5,$6) RETURNING *`,[randomUUID(),project.id,input.userId,input.clientMessageId,content,now])).rows[0];
    const event=(await client.query(`INSERT INTO video_agent_events(project_id,type,safe_payload,created_at)
        VALUES($1,'conversation.message.created',$2,$3) RETURNING id`,[project.id,{messageId:row.id,role:"user"},now])).rows[0];
    await client.query("UPDATE video_agent_projects SET last_event_id=$2,updated_at=$3 WHERE id=$1",[project.id,event.id,now]);
    return {message:messageDTO(row),created:true};
});

export const listMessages=input=>transaction(async client=>{
    await ownedProject(client,{...input,lock:false});
    const rows=(await client.query(`SELECT * FROM video_agent_messages WHERE project_id=$1
        AND ($2::bigint IS NULL OR (created_at,id)<($2,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4`,
    [input.projectId,input.cursor?.at ?? null,input.cursor?.id ?? null,input.limit+1])).rows;
    const page=rows.slice(0,input.limit),oldest=page.at(-1);
    return {messages:page.reverse().map(messageDTO),nextCursor:rows.length>input.limit?`${oldest.created_at}:${oldest.id}`:null};
});
