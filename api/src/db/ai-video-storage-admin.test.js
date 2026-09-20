import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { canPreviewStorageAsset, getAdminStorageAsset, getAdminStorageSummary,
    listAdminStorageAssets } from "./ai-video-storage-admin.js";

test("admin storage combines both products with global totals, filters and preview eligibility", async () => {
    const db = new PGlite(),now=Date.now();
    try {
        await db.exec(`
            CREATE TABLE users(id integer PRIMARY KEY,clerk_user_id text,primary_email text,full_name text,avatar_url text);
            CREATE TABLE ai_video_jobs(id uuid PRIMARY KEY,user_id integer,status text,source_filename text,
                source_kind text,source_duration_ms bigint,source_width integer,source_height integer,
                created_at bigint,completed_at bigint);
            CREATE TABLE ai_video_assets(id uuid PRIMARY KEY,job_id uuid,kind text,object_key text,
                object_generation text,mime text,size_bytes bigint,checksum_sha256 text,revision integer,
                expires_at bigint,cleanup_status text,cleanup_attempts integer,cleanup_after bigint,
                deleted_at bigint,created_at bigint);
            CREATE TABLE video_agent_projects(id uuid PRIMARY KEY,user_id integer,title text,created_at bigint,deleted_at bigint);
            CREATE TABLE video_agent_sources(id uuid PRIMARY KEY,project_id uuid,filename text,kind text,mime text,
                probe jsonb,status text,created_at bigint);
            CREATE TABLE video_agent_runs(id uuid PRIMARY KEY,status text,created_at bigint,completed_at bigint);
            CREATE TABLE video_agent_steps(id uuid PRIMARY KEY,updated_at bigint);
            CREATE TABLE video_agent_assets(id uuid PRIMARY KEY,project_id uuid,source_id uuid,run_id uuid,
                step_id uuid,kind text,object_key text,generation text,checksum text,size_bytes bigint,
                status text,expires_at bigint,cleanup_after bigint,cleanup_attempts integer);
        `);
        const job=randomUUID(),project=randomUUID(),source=randomUUID(),run=randomUUID(),step=randomUUID();
        const highlightAsset=randomUUID(),agentSource=randomUUID(),video=randomUUID(),subtitle=randomUUID(),checkpoint=randomUUID();
        await db.query("INSERT INTO users VALUES(1,'clerk-one','one@example.com','One',NULL),(2,'clerk-two','two@example.com','Two',NULL)");
        await db.query("INSERT INTO ai_video_jobs VALUES($1,1,'completed','highlight.mp4','upload',120000,720,1280,$2,$3)",
            [job,now-10000,now-9000]);
        await db.query("INSERT INTO ai_video_assets VALUES($1,$2,'source','highlight/source','1','video/mp4',100,NULL,0,$3,'active',0,NULL,NULL,$4)",
            [highlightAsset,job,now+86400000,now-8000]);
        await db.query("INSERT INTO video_agent_projects VALUES($1,2,'second',$2,NULL)",[project,now-6000]);
        await db.query("INSERT INTO video_agent_sources VALUES($1,$2,'agent.mp4','upload','video/mp4',$3,'ready',$4)",
            [source,project,{durationMs:132000,width:1280,height:720},now-5000]);
        await db.query("INSERT INTO video_agent_runs VALUES($1,'partially_completed',$2,$3)",[run,now-4000,now-1000]);
        await db.query("INSERT INTO video_agent_steps VALUES($1,$2)",[step,now-2000]);
        const addAgent=(id,kind,size,status,expires,stepId=null)=>db.query(
            "INSERT INTO video_agent_assets VALUES($1,$2,$3,$4,$5,$6,$7,'1',NULL,$8,$9,$10,NULL,0)",
            [id,project,source,stepId?run:null,stepId,kind,`agent/${id}`,size,status,expires]);
        await addAgent(agentSource,'source',200,'ready',now+86400000);
        await addAgent(video,'rendered_video',300,'ready',now+86400000,step);
        await addAgent(subtitle,'subtitle_vtt',10,'ready',now+86400000,step);
        await addAgent(checkpoint,'checkpoint',5,'expired',now-1,step);
        const options={dbQuery:db.query.bind(db),ensureSchema:async()=>{}};
        const summary=await getAdminStorageSummary(options);
        assert.deepEqual([summary.objectCount,summary.highlightCount,summary.agentCount,summary.jobCount,summary.userCount],
            [5,1,4,2,2]);
        assert.deepEqual([summary.totalSizeBytes,summary.sourceSizeBytes,summary.outputSizeBytes,
            summary.subtitleSizeBytes,summary.intermediateSizeBytes,summary.pendingCleanupSizeBytes],
            [615,300,300,10,5,5]);
        const first=await listAdminStorageAssets({limit:2},{...options});
        const second=await listAdminStorageAssets({page:2,limit:2},{...options});
        assert.equal(first.pagination.total,5);
        assert.equal(first.pagination.pages,3);
        assert.equal(new Set([...first.assets,...second.assets].map(asset=>`${asset.product}:${asset.id}`)).size,4);
        const filtered=await listAdminStorageAssets({product:'video_agent',kindGroup:'output',search:'second'},options);
        assert.equal(filtered.pagination.total,1);
        assert.equal(filtered.assets[0].id,video);
        assert.equal(filtered.assets[0].projectTitle,'second');
        assert.equal(filtered.assets[0].jobStatus,'partially_completed');
        const legacy=await listAdminStorageAssets({product:'highlight',kindGroup:'source'},options);
        assert.deepEqual(legacy.assets.map(asset=>asset.id),[highlightAsset]);
        const pending=await listAdminStorageAssets({cleanupStatus:'pending'},options);
        assert.deepEqual(pending.assets.map(asset=>asset.id),[checkpoint]);
        const found=await getAdminStorageAsset(video,{...options,product:'video_agent'});
        assert.equal(found.mime,'video/mp4');
        assert.equal(canPreviewStorageAsset(found,now),true);
        assert.equal(await getAdminStorageAsset(video,{...options,product:'highlight'}),null);
        assert.equal(await getAdminStorageAsset(video,{...options,product:'unknown'}),null);
        assert.equal(await getAdminStorageAsset('invalid',{...options,product:'video_agent'}),null);
        assert.equal(canPreviewStorageAsset(await getAdminStorageAsset(checkpoint,{...options,product:'video_agent'}),now),false);
        assert.equal(canPreviewStorageAsset(await getAdminStorageAsset(highlightAsset,options),now),true);
    } finally {
        await db.close();
    }
});
