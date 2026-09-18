import { randomUUID } from "node:crypto";

// Preserve historical job IDs, periods and charges: extend the existing ledger in place.
export const SHARED_USAGE_SCHEMA = `
ALTER TABLE ai_video_usage_reservations ALTER COLUMN job_id DROP NOT NULL;
ALTER TABLE ai_video_usage_reservations ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES video_agent_runs(id);
CREATE UNIQUE INDEX IF NOT EXISTS ai_video_usage_run ON ai_video_usage_reservations(run_id);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ai_video_usage_one_owner' AND conrelid='ai_video_usage_reservations'::regclass) THEN
  ALTER TABLE ai_video_usage_reservations ADD CONSTRAINT ai_video_usage_one_owner CHECK(num_nonnulls(job_id,run_id)=1);
 END IF;
END $$;
`;
export const lockExecutionUser = (client,userId) => client.query("SELECT pg_advisory_xact_lock($1)",[userId]);
const problem=(code,status,message,context)=>Object.assign(new Error(message),{code,status,context});
export const monthlyLimit = () => {
    const limit=Number(process.env.AI_VIDEO_MONTHLY_SECONDS || 7200);
    if(!Number.isSafeInteger(limit) || limit<=0)throw problem("AI_VIDEO_CONFIG_INVALID",503,"Invalid quota configuration");
    return limit;
};
export const requireExecutionMembership = async(client,userId,now=Date.now())=>{
    const membership=await client.query(`SELECT s.plan_id FROM subscriptions s JOIN plans p ON p.id=s.plan_id JOIN plan_entitlements pe ON pe.plan_id=p.id
        JOIN users u ON u.id=s.user_id WHERE s.user_id=$1 AND s.status='active' AND p.is_active=true AND pe.entitlement_key='ai_video_studio'
        AND (s.current_period_end IS NULL OR s.current_period_end>$2) AND COALESCE(u.is_disabled,false)=false LIMIT 1`,[userId,now]);
    if(!membership.rowCount)throw problem("MEMBERSHIP_REQUIRED",403,"Active AI video membership is required");
    return {entitlement:"ai_video_studio",planId:membership.rows[0].plan_id,checkedAt:now,monthlySeconds:monthlyLimit()};
};
export const assertExecutionAvailable = async(client,userId,{jobId=null,runId=null,now=Date.now()}={})=>{
    const active=await client.query(`SELECT id FROM ai_video_jobs WHERE user_id=$1 AND ($2::uuid IS NULL OR id<>$2) AND
        ((deleted_at IS NULL AND status IN ('uploading','queued_ingest','ingesting','probing','transcribing','translating','analyzing','queued_render','rendering','cancel_requested'))
         OR lease_expires_at>$4)
        UNION ALL SELECT r.id FROM video_agent_runs r JOIN video_agent_projects p ON p.id=r.project_id WHERE p.user_id=$1 AND ($3::uuid IS NULL OR r.id<>$3)
         AND (r.status IN ('queued','planning','awaiting_input','running','cancelling') OR EXISTS(SELECT 1 FROM video_agent_steps s WHERE s.run_id=r.id AND s.status='running' AND s.lease_expires_at>$4)) LIMIT 1`,[userId,jobId,runId,now]);
    if(active.rowCount)throw problem("AI_VIDEO_CONCURRENCY_LIMIT",409,"Only one video execution may be active across both tools");
};
export const sharedUsage = async(client,userId,limitSeconds=monthlyLimit(),now=Date.now())=>{
    if(!Number.isSafeInteger(limitSeconds) || limitSeconds<=0)throw problem("AI_VIDEO_CONFIG_INVALID",503,"Invalid quota configuration");
    const d=new Date(now),periodKey=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;
    const r=await client.query(`SELECT COALESCE(SUM(consumed_seconds) FILTER(WHERE status='committed'),0)::int AS used,
        COALESCE(SUM(reserved_seconds) FILTER(WHERE status='reserved'),0)::int AS reserved FROM ai_video_usage_reservations WHERE user_id=$1 AND period_key=$2`,[userId,periodKey]);
    const usedSeconds=r.rows[0].used,reservedSeconds=r.rows[0].reserved;
    return {limitSeconds,usedSeconds,reservedSeconds,remainingSeconds:Math.max(0,limitSeconds-usedSeconds-reservedSeconds),periodKey,resetsAt:Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)};
};
export const reserveExecutionUsage = async(client,{userId,jobId=null,runId=null,durationSeconds,limitSeconds=monthlyLimit(),now=Date.now()})=>{
    if(!Number.isFinite(durationSeconds) || durationSeconds<=0 || durationSeconds>3600)throw problem("AI_VIDEO_INVALID_DURATION",400,"Invalid video duration");
    const seconds=Math.ceil(durationSeconds/60)*60;
    const existing=(await client.query(`SELECT * FROM ai_video_usage_reservations WHERE ($1::uuid IS NOT NULL AND job_id=$1) OR ($2::uuid IS NOT NULL AND run_id=$2) FOR UPDATE`,[jobId,runId])).rows[0];
    if(existing && existing.status!=="released")return existing;
    const usage=await sharedUsage(client,userId,limitSeconds,now);
    if(seconds>usage.remainingSeconds)throw problem("AI_VIDEO_QUOTA_EXCEEDED",409,"Monthly AI video quota is exhausted",{usage});
    if(existing)return (await client.query(`UPDATE ai_video_usage_reservations SET status='reserved',period_key=$2,reserved_seconds=$3,consumed_seconds=0,updated_at=$4 WHERE id=$1 RETURNING *`,[existing.id,usage.periodKey,seconds,now])).rows[0];
    return (await client.query(`INSERT INTO ai_video_usage_reservations(id,user_id,job_id,run_id,period_key,reserved_seconds,status,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,'reserved',$7,$7) RETURNING *`,[randomUUID(),userId,jobId,runId,usage.periodKey,seconds,now])).rows[0];
};
export const releaseRunUsage = (client,runId,now=Date.now())=>client.query(`UPDATE ai_video_usage_reservations SET status='released',updated_at=$2 WHERE run_id=$1 AND status='reserved'`,[runId,now]);
export const executionCapacity = async(client,now)=>{
    await client.query("SELECT pg_advisory_xact_lock(2147483001)");
    now ??= Date.now();
    const limit=Number(process.env.AI_VIDEO_EXECUTION_GLOBAL_CONCURRENCY || 1);
    if(!Number.isSafeInteger(limit) || limit<1)throw problem("AI_VIDEO_CONFIG_INVALID",503,"Invalid execution capacity");
    const r=await client.query(`SELECT (SELECT count(*) FROM ai_video_jobs WHERE lease_expires_at>$1 AND lease_owner IS NOT NULL)+
        (SELECT count(*) FROM video_agent_steps WHERE status='running' AND lease_expires_at>$1) AS used`,[now]);
    return Number(r.rows[0].used)<limit;
};
