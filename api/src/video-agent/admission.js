import { ensureAiVideoSchema } from "../db/ai-video.js";
import { agentError,transaction } from "../db/video-agent.js";
import { requireExecutionMembership,assertExecutionAvailable,reserveExecutionUsage,sharedUsage,monthlyLimit } from "../ai-video/execution-admission.js";

export const executionReady = async()=>{
    const { productionHandlers }=await import("./worker-handlers.js");
    return ["probe","chunk","transcribe","normalize","select_clips","translate_selected","build_subtitles","render","verify","publish_results"].every(stage=>typeof productionHandlers[stage]==="function");
};
export const admissionEnabled = ()=>process.env.VIDEO_AGENT_ADMISSION_ENABLED==="1";
export const prepareAdmission = async()=>{if(admissionEnabled())await ensureAiVideoSchema();};
export const admitRun = async(client,project,run,retryOf,{ready=executionReady}={})=>{
    if(!admissionEnabled())return run;
    if(!await ready())throw agentError("VIDEO_AGENT_PIPELINE_NOT_READY",503,"Video processing is not available yet");
    const now=Date.now();
    const entitlement=await requireExecutionMembership(client,project.user_id,now);
    await assertExecutionAvailable(client,project.user_id,{runId:run.id,now});
    const paid=retryOf?.budget_snapshot?.reservationId ? (await client.query(`SELECT * FROM ai_video_usage_reservations WHERE id=$1 AND user_id=$2 AND status='committed'`,[retryOf.budget_snapshot.reservationId,project.user_id])).rows[0] : null;
    const reservation=paid || await reserveExecutionUsage(client,{userId:project.user_id,runId:run.id,durationSeconds:run.source_snapshot.durationMs/1000,limitSeconds:entitlement.monthlySeconds,now});
    const budget={reservationId:reservation.id,billingRunId:reservation.run_id,reservedSeconds:paid?0:reservation.reserved_seconds,periodKey:reservation.period_key,chargePoint:"before_transcribe",alreadyCommitted:!!paid};
    return (await client.query(`UPDATE video_agent_runs SET admission_status='admitted',entitlement_snapshot=$2,budget_snapshot=$3 WHERE id=$1 RETURNING *`,[run.id,entitlement,budget])).rows[0];
};
export const getExecutionUsage = async({userId})=>{
    await ensureAiVideoSchema();return transaction(async(client)=>({usage:await sharedUsage(client,userId,monthlyLimit())}));
};
