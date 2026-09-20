import { query } from "./pg-client.js";
import { ensureVideoAgentSchema } from "./video-agent.js";

const clamp = (value, fallback, min, max) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
};
const timestamp = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One set makes sorting and pagination consistent across both products.
// Video Agent assets have no created_at column; generated files use their step update time.
const ASSETS = `WITH storage_assets AS (
    SELECT 'highlight'::text AS product,a.id,a.job_id,NULL::uuid AS project_id,
        NULL::uuid AS run_id,j.id::text AS work_key,j.user_id,a.kind,
        CASE WHEN a.kind='source' THEN 'source' WHEN a.kind='output' THEN 'output'
             WHEN a.kind IN ('srt','vtt','ass') THEN 'subtitle' ELSE 'other' END AS kind_group,
        a.object_key,a.object_generation,a.mime,a.size_bytes,a.checksum_sha256,
        a.revision,a.expires_at,a.cleanup_status,a.cleanup_attempts,a.cleanup_after,
        a.created_at,j.source_filename,j.source_kind,j.source_duration_ms,
        j.source_width,j.source_height,j.status AS job_status,
        j.created_at AS job_created_at,j.completed_at AS job_completed_at,
        NULL::text AS project_title,NULL::text AS asset_status,
        true AS previewable,
        u.clerk_user_id,u.primary_email,u.full_name,u.avatar_url
    FROM ai_video_assets a
    JOIN ai_video_jobs j ON j.id=a.job_id
    JOIN users u ON u.id=j.user_id
    WHERE a.deleted_at IS NULL
    UNION ALL
    SELECT 'video_agent'::text AS product,a.id,NULL::uuid AS job_id,p.id AS project_id,
        a.run_id,p.id::text AS work_key,p.user_id,a.kind,
        CASE WHEN a.kind='source' THEN 'source' WHEN a.kind='rendered_video' THEN 'output'
             WHEN a.kind IN ('subtitle_srt','subtitle_vtt','subtitle_ass') THEN 'subtitle'
             ELSE 'other' END AS kind_group,
        a.object_key,a.generation AS object_generation,
        CASE WHEN a.kind='source' THEN s.mime
             WHEN a.kind='rendered_video' THEN 'video/mp4'
             WHEN a.kind='subtitle_srt' THEN 'application/x-subrip'
             WHEN a.kind='subtitle_vtt' THEN 'text/vtt'
             WHEN a.kind='subtitle_ass' THEN 'text/plain'
             WHEN a.kind IN ('dub_audio','audio_chunk') THEN 'audio/wav'
             WHEN a.kind='tts_audio' THEN 'audio/mpeg'
             ELSE 'application/json' END AS mime,
        a.size_bytes,a.checksum AS checksum_sha256,NULL::integer AS revision,
        a.expires_at,
        CASE WHEN a.status='expired' OR a.expires_at<=$1 OR
                  (a.cleanup_after IS NOT NULL AND a.cleanup_after<=$1)
             THEN CASE WHEN a.cleanup_attempts>0 THEN 'retry' ELSE 'pending' END
             ELSE 'active' END AS cleanup_status,
        a.cleanup_attempts,a.cleanup_after,
        COALESCE(st.updated_at,s.created_at) AS created_at,
        s.filename AS source_filename,s.kind AS source_kind,
        (s.probe->>'durationMs')::bigint AS source_duration_ms,
        (s.probe->>'width')::integer AS source_width,
        (s.probe->>'height')::integer AS source_height,
        COALESCE(r.status,s.status) AS job_status,
        COALESCE(r.created_at,p.created_at) AS job_created_at,
        r.completed_at AS job_completed_at,p.title AS project_title,a.status AS asset_status,
        (a.kind IN ('source','rendered_video','subtitle_srt','subtitle_vtt','subtitle_ass','dub_audio')) AS previewable,
        u.clerk_user_id,u.primary_email,u.full_name,u.avatar_url
    FROM video_agent_assets a
    JOIN video_agent_sources s ON s.id=a.source_id
    JOIN video_agent_projects p ON p.id=a.project_id
    JOIN users u ON u.id=p.user_id
    LEFT JOIN video_agent_runs r ON r.id=a.run_id
    LEFT JOIN video_agent_steps st ON st.id=a.step_id
    WHERE a.status<>'deleted'
)`;

const filters = ({search,product,kind,kindGroup,jobStatus,cleanupStatus,userId,createdFrom,createdTo}={}) => {
    const clauses=[],params=[];
    const exact=(column,value)=>{
        const normalized=String(value || '').trim();
        if(normalized){clauses.push(`${column}=$${params.length+2}`);params.push(normalized);}
    };
    exact('a.product',product);exact('a.kind',kind);exact('a.kind_group',kindGroup);
    exact('a.job_status',jobStatus);exact('a.cleanup_status',cleanupStatus);
    const user=Number.parseInt(userId,10);
    if(Number.isInteger(user) && user>0){clauses.push(`a.user_id=$${params.length+2}`);params.push(user);}
    const from=timestamp(createdFrom),to=timestamp(createdTo);
    if(from){clauses.push(`a.created_at>=$${params.length+2}`);params.push(from);}
    if(to){clauses.push(`a.created_at<=$${params.length+2}`);params.push(to);}
    const term=String(search || '').trim();
    if(term){
        const i=params.length+2;
        clauses.push(`(a.primary_email ILIKE $${i} OR a.full_name ILIKE $${i}
            OR a.clerk_user_id ILIKE $${i} OR a.source_filename ILIKE $${i}
            OR a.project_title ILIKE $${i} OR a.object_key ILIKE $${i}
            OR a.id::text ILIKE $${i} OR a.job_id::text ILIKE $${i}
            OR a.project_id::text ILIKE $${i} OR a.run_id::text ILIKE $${i}
            OR a.user_id::text=$${i+1})`);
        params.push(`%${term}%`,term);
    }
    return {where:clauses.length?`WHERE ${clauses.join(' AND ')}`:'',params};
};

const mapAsset=row=>({
    id:row.id,product:row.product,jobId:row.job_id,projectId:row.project_id,
    projectTitle:row.project_title,runId:row.run_id,userId:row.user_id,
    kind:row.kind,kindGroup:row.kind_group,assetStatus:row.asset_status,
    previewable:row.previewable,objectKey:row.object_key,
    objectGeneration:row.object_generation,mime:row.mime,
    sizeBytes:row.size_bytes==null?null:Number(row.size_bytes),
    checksumSha256:row.checksum_sha256,revision:row.revision,
    expiresAt:row.expires_at==null?null:Number(row.expires_at),
    cleanupStatus:row.cleanup_status,cleanupAttempts:row.cleanup_attempts,
    cleanupAfter:row.cleanup_after==null?null:Number(row.cleanup_after),
    createdAt:Number(row.created_at),sourceFilename:row.source_filename,
    sourceKind:row.source_kind,
    sourceDurationMs:row.source_duration_ms==null?null:Number(row.source_duration_ms),
    sourceWidth:row.source_width,sourceHeight:row.source_height,
    jobStatus:row.job_status,jobCreatedAt:Number(row.job_created_at),
    jobCompletedAt:row.job_completed_at==null?null:Number(row.job_completed_at),
    user:{id:row.user_id,clerkUserId:row.clerk_user_id,primaryEmail:row.primary_email,
        fullName:row.full_name,avatarUrl:row.avatar_url},
});

export const listAdminStorageAssets=async({page=1,limit=20,sort='created_at',order='desc',...input}={},
    {dbQuery=query,ensureSchema=ensureVideoAgentSchema}={})=>{
    await ensureSchema();
    const safePage=clamp(page,1,1,1000000),safeLimit=clamp(limit,20,1,100);
    const sortable=new Set(['created_at','size_bytes','expires_at','kind','job_status','cleanup_status']);
    const column=sortable.has(sort)?sort:'created_at',direction=String(order).toLowerCase()==='asc'?'ASC':'DESC';
    const {where,params}=filters(input),now=Date.now();
    const count=await dbQuery(`${ASSETS} SELECT COUNT(*) AS total FROM storage_assets a ${where}`,[now,...params]);
    const total=Number(count.rows[0]?.total || 0);
    const rows=await dbQuery(`${ASSETS} SELECT a.* FROM storage_assets a ${where}
        ORDER BY a.${column} ${direction} NULLS LAST,a.product,a.id
        LIMIT $${params.length+2} OFFSET $${params.length+3}`,
    [now,...params,safeLimit,(safePage-1)*safeLimit]);
    return {assets:rows.rows.map(mapAsset),pagination:{page:safePage,limit:safeLimit,total,pages:Math.ceil(total/safeLimit)}};
};

export const getAdminStorageSummary=async({dbQuery=query,ensureSchema=ensureVideoAgentSchema}={})=>{
    await ensureSchema();
    const result=await dbQuery(`${ASSETS} SELECT
        COUNT(*)::int AS object_count,
        COUNT(DISTINCT a.product || ':' || a.work_key)::int AS job_count,
        COUNT(DISTINCT a.user_id)::int AS user_count,
        COALESCE(SUM(a.size_bytes),0) AS total_size_bytes,
        COALESCE(SUM(a.size_bytes) FILTER (WHERE a.kind_group='source'),0) AS source_size_bytes,
        COALESCE(SUM(a.size_bytes) FILTER (WHERE a.kind_group='output'),0) AS output_size_bytes,
        COALESCE(SUM(a.size_bytes) FILTER (WHERE a.kind_group='subtitle'),0) AS subtitle_size_bytes,
        COALESCE(SUM(a.size_bytes) FILTER (WHERE a.kind_group='other'),0) AS intermediate_size_bytes,
        COUNT(*) FILTER (WHERE a.product='highlight')::int AS highlight_count,
        COUNT(*) FILTER (WHERE a.product='video_agent')::int AS agent_count,
        COALESCE(SUM(a.size_bytes) FILTER (WHERE a.cleanup_status IN ('pending','retry')
            OR (a.cleanup_after IS NOT NULL AND a.cleanup_after<=$1)),0) AS pending_cleanup_size_bytes,
        COUNT(*) FILTER (WHERE a.cleanup_status IN ('pending','retry')
            OR (a.cleanup_after IS NOT NULL AND a.cleanup_after<=$1))::int AS pending_cleanup_count
        FROM storage_assets a`,[Date.now()]);
    const row=result.rows[0] || {};
    return {objectCount:Number(row.object_count || 0),jobCount:Number(row.job_count || 0),
        userCount:Number(row.user_count || 0),totalSizeBytes:Number(row.total_size_bytes || 0),
        sourceSizeBytes:Number(row.source_size_bytes || 0),outputSizeBytes:Number(row.output_size_bytes || 0),
        subtitleSizeBytes:Number(row.subtitle_size_bytes || 0),intermediateSizeBytes:Number(row.intermediate_size_bytes || 0),
        highlightCount:Number(row.highlight_count || 0),agentCount:Number(row.agent_count || 0),
        pendingCleanupSizeBytes:Number(row.pending_cleanup_size_bytes || 0),
        pendingCleanupCount:Number(row.pending_cleanup_count || 0)};
};

export const getAdminStorageAsset=async(assetId,{product='highlight',dbQuery=query,
    ensureSchema=ensureVideoAgentSchema}={})=>{
    if(!['highlight','video_agent'].includes(product) || !UUID.test(assetId || ''))return null;
    await ensureSchema();
    const result=await dbQuery(`${ASSETS} SELECT a.* FROM storage_assets a WHERE a.id=$2 AND a.product=$3`,
        [Date.now(),assetId,product]);
    return result.rowCount?mapAsset(result.rows[0]):null;
};

export const canPreviewStorageAsset=(asset,now=Date.now())=>!!asset &&
    (asset.product==='highlight' || (asset.product==='video_agent' && asset.assetStatus==='ready'
        && asset.previewable && asset.expiresAt>now));
