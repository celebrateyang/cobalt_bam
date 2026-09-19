import {transaction,ownedProject,agentError} from "../db/video-agent.js";
export const getPublishedResults=input=>transaction(async client=>{
    await ownedProject(client,input);
    const run=(await client.query("SELECT * FROM video_agent_runs WHERE id=$1 AND project_id=$2",[input.runId,input.projectId])).rows[0];
    if(!run)throw agentError("VIDEO_AGENT_RUN_NOT_FOUND",404,"Run not found");
    if(!["completed","partially_completed"].includes(run.status))return {results:[],producedCount:0};
    const publish=(await client.query("SELECT checkpoint FROM video_agent_steps WHERE run_id=$1 AND stage='publish_results' AND status='succeeded'",[run.id])).rows[0];
    const results=publish?.checkpoint?.results || [],ids=results.flatMap(clip=>[clip.video.id,...Object.values(clip.subtitles).map(asset=>asset.id)]);
    const ready=ids.length?(await client.query("SELECT id FROM video_agent_assets WHERE id=ANY($1::uuid[]) AND project_id=$2 AND status='ready' AND expires_at>$3",[ids,input.projectId,Date.now()])).rows:[];
    const available=new Set(ready.map(asset=>asset.id));
    return {results:results.filter(clip=>available.has(clip.video.id)).map(clip=>({...clip,subtitles:Object.fromEntries(Object.entries(clip.subtitles).filter(([,asset])=>available.has(asset.id)))})),producedCount:run.produced_count,requiresReview:publish?.checkpoint?.requiresReview || false};
});
