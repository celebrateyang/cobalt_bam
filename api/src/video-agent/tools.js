import {agentError,ownedProject,transaction} from "../db/video-agent.js";
import {getRun,submitCommand} from "./execution.js";
import {UUID} from "./plans.js";

// The model never supplies a tool name or arguments. This catalog is for
// server-compiled actions after the Planner has passed business validation.
export const TOOL_CATALOG=Object.freeze(["get_project_context","inspect_source","start_run","get_run_status"]);
const toolLimit=()=>{
    const value=Number(process.env.VIDEO_AGENT_MAX_TOOL_CALLS || 12);
    if(!Number.isSafeInteger(value) || value<1 || value>12)throw agentError("VIDEO_AGENT_TOOL_CONFIG_INVALID",503,"Invalid tool call limit");
    return value;
};
const projectContext=({projectId,userId,messageId})=>transaction(async client=>{
    const project=await ownedProject(client,{projectId,userId});
    const sources=(await client.query(`SELECT id,status,retention_until FROM video_agent_sources WHERE project_id=$1 ORDER BY created_at DESC LIMIT 10`,[project.id])).rows;
    const started=(await client.query(`SELECT receipt FROM video_agent_commands WHERE project_id=$1 AND user_id=$2 AND idempotency_key=$3 AND type='start_run'`,
        [project.id,userId,`planner_start_${messageId.replaceAll("-","")}`])).rows[0];
    return {revision:project.current_revision,startedRunId:started?.receipt?.runId || null,
        sources:sources.map(source=>({id:source.id,status:source.status,ready:source.status==="ready" && Number(source.retention_until)>Date.now()}))};
});
const inspectSource=({projectId,userId,sourceId})=>transaction(async client=>{
    await ownedProject(client,{projectId,userId});
    if(typeof sourceId!=="string" || !UUID.test(sourceId))throw agentError("VIDEO_AGENT_SOURCE_NOT_FOUND",404,"Source not found");
    const source=(await client.query(`SELECT id,status,retention_until,probe,checksum,generation FROM video_agent_sources WHERE id=$1 AND project_id=$2`,[sourceId,projectId])).rows[0];
    if(!source)throw agentError("VIDEO_AGENT_SOURCE_NOT_FOUND",404,"Source not found");
    return {id:source.id,ready:source.status==="ready" && Number(source.retention_until)>Date.now() && !!source.probe && !!source.checksum && !!source.generation,
        durationMs:source.probe?.durationMs ?? null};
});
const toolReceipt=(tool,status,data)=>({tool,status,...data});

export const executePlanTools=async({projectId,userId,messageId,plan,planId,revision,command=submitCommand,readContext=projectContext,readSource=inspectSource,readRun=getRun})=>{
    if(typeof messageId!=="string" || !UUID.test(messageId) || typeof planId!=="string" || !UUID.test(planId))throw agentError("VIDEO_AGENT_TOOL_INVALID",400,"Invalid tool reference");
    const calls=[],call=async(tool,action)=>{
        if(!TOOL_CATALOG.includes(tool))throw agentError("VIDEO_AGENT_TOOL_DENIED",400,"Unsupported tool");
        if(calls.length>=toolLimit())throw agentError("VIDEO_AGENT_TOOL_LIMIT",409,"Tool call limit reached");
        const result=await action();calls.push(toolReceipt(tool,"completed",result));return result;
    };
    const context=await call("get_project_context",()=>readContext({projectId,userId,messageId}));
    if(!context.startedRunId){
        if(context.revision!==revision)throw agentError("VIDEO_AGENT_REVISION_CONFLICT",409,"Project was changed elsewhere",{revision:context.revision});
        const source=await call("inspect_source",()=>readSource({projectId,userId,sourceId:plan.sourceRef}));
        if(!source.ready || source.id!==plan.sourceRef || source.durationMs<plan.clips.minSeconds*1000)throw agentError("VIDEO_AGENT_SOURCE_NOT_READY",409,"Source is not ready or expired");
    }
    const receipt=await call("start_run",async()=>{
        const accepted=await command({projectId,userId,body:{type:"start_run",expectedRevision:revision,
            idempotencyKey:`planner_start_${messageId.replaceAll("-","")}`,input:{planId}}});
        return {commandId:accepted.commandId,runId:accepted.runId,revision:accepted.revision,admissionStatus:accepted.admissionStatus};
    });
    if(!receipt.runId)throw agentError("VIDEO_AGENT_TOOL_INVALID_RECEIPT",502,"Start tool returned no run");
    const snapshot=await call("get_run_status",async()=>{
        const {run}=await readRun({projectId,userId,runId:receipt.runId});
        return {runId:run.id,status:run.status,admissionStatus:run.admissionStatus};
    });
    return {runId:receipt.runId,runStatus:snapshot.status,admissionStatus:snapshot.admissionStatus,calls:calls.map(({tool,status,commandId,runId})=>({tool,status,...(commandId?{commandId}:{}),...(runId?{runId}:{})}))};
};
