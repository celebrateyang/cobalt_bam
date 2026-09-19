<script lang="ts">
    import { onMount,createEventDispatcher } from "svelte";
    import { t } from "$lib/i18n/translations";
    import {getAgentResults,getAgentEditable,getAgentPreview,downloadAgentAsset,type AgentResult,type AgentEditable} from "$lib/api/video-agent";
    import { getAgentCapabilities,getAgentUsage,listAgentRuns,getAgentRun,getAgentEvents,getCurrentAgentPlan,listAgentRevisions,submitAgentCommand,
        type AgentProject,type AgentSource,type AgentCapabilities,type AgentUsage,type AgentRun,type AgentStep,type AgentCommand,type AgentPlanInput } from "$lib/api/video-agent";
    export let project: AgentProject;
    export let sources: AgentSource[]=[];
    const dispatch=createEventDispatcher();
    let capabilities: AgentCapabilities | null=null,usage: AgentUsage | null=null;
    let runs: AgentRun[]=[],selectedRunId="",run: AgentRun | null=null,steps: AgentStep[]=[];
    let results:AgentResult[]=[],previewUrls:Record<string,string>={};
    let editable:AgentEditable|null=null,editableRunId="",selectedClipId="",selectedCueId="";
    let titleDraft="",focusDraft=0.5,startCueId="",endCueId="",cueDraft="";
    let currentEdits:AgentPlanInput["edits"]|undefined;
    let revisions:{revision:number;parentRevision:number|null;createdAt:number}[]=[],restoreTarget=0,nextRevisionCursor:string|null=null,revisionHistoryLoaded=false;
    const chooseClip=(clip:AgentEditable["clips"][number])=>{const patch=currentEdits?.clips[clip.id];selectedClipId=clip.id;selectedCueId="";titleDraft=patch?.title || clip.title;
        focusDraft=patch?.focusX ?? 0.5;startCueId=patch?.startCueId || clip.cues[0]?.id || "";endCueId=patch?.endCueId || clip.cues.at(-1)?.id || "";};
    const chooseCue=(cue:AgentEditable["clips"][number]["cues"][number])=>{selectedCueId=cue.id;cueDraft=currentEdits?.subtitles[cue.id] || cue.translatedText;};
    $: selectedEditableClip=editable?.clips.find(item=>item.id===selectedClipId);
    $: clipEditChanged=!!selectedEditableClip && (titleDraft!==(currentEdits?.clips[selectedClipId]?.title || selectedEditableClip.title)
        || Number(focusDraft)!==(currentEdits?.clips[selectedClipId]?.focusX ?? 0.5)
        || startCueId!==(currentEdits?.clips[selectedClipId]?.startCueId || selectedEditableClip.cues[0]?.id)
        || endCueId!==(currentEdits?.clips[selectedClipId]?.endCueId || selectedEditableClip.cues.at(-1)?.id));
    $: cueEditChanged=!!selectedCueId && cueDraft!==(currentEdits?.subtitles[selectedCueId] || selectedEditableClip?.cues.find(cue=>cue.id===selectedCueId)?.translatedText);
    const clearResults=()=>{Object.values(previewUrls).forEach(url=>{if(url.startsWith("blob:"))URL.revokeObjectURL(url);});previewUrls={};results=[];};
    const preview=async(assetId:string)=>{if(previewUrls[assetId])return;try{const version=epoch,id=selectedRunId,url=await getAgentPreview(project.id,assetId);if(!mounted || version!==epoch || id!==selectedRunId){if(url.startsWith("blob:"))URL.revokeObjectURL(url);return;}if(previewUrls[assetId]?.startsWith("blob:"))URL.revokeObjectURL(previewUrls[assetId]);previewUrls={...previewUrls,[assetId]:url};}catch(error){report(error);}};
    let sourceRef="",targetLanguage="es",subtitleMode: "translated" | "bilingual"="bilingual",requestedCount=3;
    let planId="",latestPlanId="",planRevision=0,revision=project.revision,busy=false,refreshing=false,errorCode="",stale=false,editorConflict=false;
    let mounted=false,epoch=0,cursor="0",controller: AbortController | null=null;
    let pendingCommand: AgentCommand | null=null;
    let planLoaded=false,dirty=false,historyLoaded=false,nextCursor:string | null=null;
    const languages=["de","en","es","fr","ja","ko","ru","th","vi","zh"];
    const activeStates=["queued","planning","awaiting_input","running","cancelling"];
    $: revision=Math.max(revision,project.revision);
    $: readySources=sources.filter(source=>source.status==="ready" && source.retentionUntil>Date.now());
    $: if(!readySources.some(source=>source.id===sourceRef)){sourceRef=readySources[0]?.id || "";planId="";}
    $: activeRun=runs.find(value=>activeStates.includes(value.status));
    $: editMatchesCurrent=!!run && (run.planId===latestPlanId || currentEdits?.baseRunId===run.id);
    $: completedSteps=steps.filter(value=>value.status==="succeeded").length;
    $: if(planId && planRevision!==revision)planId="";
    $: canCreatePlan=planLoaded && !refreshing && !busy && !pendingCommand && !planId && !!sourceRef && !!capabilities?.commandsEnabled && !activeRun;
    const report=(error:unknown)=>{errorCode=(error as {code?:string})?.code || "VIDEO_AGENT_REQUEST_FAILED";};
    const refresh=async()=>{
        if(!mounted || refreshing)return;
        refreshing=true;const version=epoch,id=project.id;
        try{
            const settled=await Promise.allSettled([getAgentCapabilities(),getAgentUsage(),listAgentRuns(id),getCurrentAgentPlan(id),listAgentRevisions(id)]);
            if(!mounted || version!==epoch)return;
            if(settled[0].status==="fulfilled")capabilities=settled[0].value;else{capabilities=null;report(settled[0].reason);}
            if(settled[1].status==="fulfilled")usage=settled[1].value.usage;else report(settled[1].reason);
            if(settled[2].status==="fulfilled"){
                const latest=settled[2].value.runs;
                runs=[...latest,...runs.filter(value=>!latest.some(item=>item.id===value.id) && !activeStates.includes(value.status))];
                if(!historyLoaded)nextCursor=settled[2].value.nextCursor;
                if(!runs.some(value=>value.id===selectedRunId))selectedRunId=runs[0]?.id || "";
            }else throw settled[2].reason;
            if(settled[3].status==="fulfilled"){
                const current=settled[3].value;revision=Math.max(revision,current.revision);latestPlanId=current.plan?.id || "";
                if(current.plan && ((!planLoaded && !dirty) || current.plan.revision>planRevision)){
                    const saved=current.plan;sourceRef=saved.input.sourceRef;targetLanguage=saved.input.targetLanguage;subtitleMode=saved.input.subtitles?.mode || "bilingual";requestedCount=saved.input.clips.requestedCount;
                    planId=saved.id;planRevision=saved.revision;currentEdits=saved.input.edits;
                    const selected=editable?.clips.find(clip=>clip.id===selectedClipId);if(selected && !editorConflict)chooseClip(selected);
                }
                planLoaded=true;
            }else report(settled[3].reason);
            if(settled[4].status==="fulfilled"){
                const latest=settled[4].value.revisions;
                revisions=[...latest,...revisions.filter(item=>!latest.some(value=>value.revision===item.revision))].sort((a,b)=>b.revision-a.revision);
                if(!revisionHistoryLoaded)nextRevisionCursor=settled[4].value.nextCursor;
                if(!revisions.some(item=>item.revision===restoreTarget))restoreTarget=revisions.find(item=>item.revision<revision)?.revision ?? 0;
            }else report(settled[4].reason);
            if(selectedRunId){
                const selected=selectedRunId;
                const snapshot=await getAgentRun(id,selected);
                if(!mounted || version!==epoch || selected!==selectedRunId)return;
                run=snapshot.run;steps=snapshot.steps;cursor=snapshot.eventCursor;
                if(["completed","partially_completed"].includes(run.status)){
                    const published=await getAgentResults(id,selected);if(mounted && version===epoch && selected===selectedRunId)results=published.results;
                    if(editableRunId!==selected){const value=await getAgentEditable(id,selected);if(mounted && version===epoch && selected===selectedRunId){editable=value;editableRunId=selected;chooseClip(value.clips[0]);}}
                }else{clearResults();editable=null;editableRunId="";}
            }else{run=null;steps=[];clearResults();editable=null;editableRunId="";}
            stale=settled.some(value=>value.status==="rejected");
        }catch(error){if(mounted && version===epoch){stale=true;report(error);}}
        finally{refreshing=false;}
    };
    const command=async(value:AgentCommand)=>{
        busy=true;errorCode="";const version=epoch,id=project.id;pendingCommand=value;
        try{
            const receipt=await submitAgentCommand(id,value);
            if(!mounted || version!==epoch)return;
            pendingCommand=null;revision=receipt.revision;editorConflict=false;
            if(receipt.planId){planId=receipt.planId;planRevision=receipt.revision;dirty=false;planLoaded=false;}
            if(receipt.runId){selectedRunId=receipt.runId;planId="";}
            dispatch("changed");await refresh();
        }catch(error){
            if(!mounted || version!==epoch)return;
            report(error);
            const status=(error as {status?:number})?.status;
            // Lost responses retain the exact command key/body for safe replay.
            if(status && (status<500 || ["VIDEO_AGENT_PIPELINE_NOT_READY","VIDEO_AGENT_NOT_ENABLED","VIDEO_AGENT_RUNS_NOT_ENABLED","VIDEO_AGENT_ADMISSION_NOT_ENABLED"].includes(errorCode)))pendingCommand=null;
            if(errorCode==="VIDEO_AGENT_REVISION_CONFLICT"){planId="";editorConflict=true;dispatch("changed");}
        }finally{if(mounted && version===epoch)busy=false;}
    };
    const envelope=()=>({expectedRevision:revision,idempotencyKey:crypto.randomUUID()});
    const createPlan=()=>{
        if(!canCreatePlan || busy || pendingCommand || planId)return;
        return command({type:"create_plan",...envelope(),input:{sourceRef,operation:"highlight_clips",targetLanguage,
            clips:{requestedCount},subtitles:{enabled:true,mode:subtitleMode}}});
    };
    const start=()=>command({type:"start_run",...envelope(),input:{planId}});
    const control=(type:"cancel_run" | "retry_run")=>run && command({type,...envelope(),input:{runId:run.id}});
    const chooseRun=()=>{clearResults();editable=null;editableRunId="";run=null;steps=[];cursor="0";void refresh();};
    const saveClip=()=>run && selectedEditableClip && command({type:"update_clip",...envelope(),input:{runId:run.id,clipId:selectedEditableClip.id,
        patch:{title:titleDraft,focusX:Number(focusDraft),startCueId,endCueId}}});
    const saveCue=()=>run && selectedCueId && command({type:"update_subtitles",...envelope(),input:{runId:run.id,cueId:selectedCueId,text:cueDraft}});
    const restore=()=>command({type:"restore_revision",...envelope(),input:{revision:Number(restoreTarget)}});
    const clearPlan=()=>{planId="";dirty=true;};
    const more=async()=>{
        if(!nextCursor)return;busy=true;const version=epoch;
        try{const page=await listAgentRuns(project.id,nextCursor);if(!mounted || version!==epoch)return;
            runs=[...runs,...page.runs.filter(value=>!runs.some(existing=>existing.id===value.id))];nextCursor=page.nextCursor;historyLoaded=true;
        }catch(error){if(mounted && version===epoch)report(error);}finally{if(mounted && version===epoch)busy=false;}
    };
    const moreVersions=async()=>{
        if(!nextRevisionCursor || busy)return;busy=true;
        try{const page=await listAgentRevisions(project.id,nextRevisionCursor);revisions=[...revisions,...page.revisions.filter(item=>!revisions.some(old=>old.revision===item.revision))];
            nextRevisionCursor=page.nextCursor;revisionHistoryLoaded=true;}
        catch(error){report(error);}finally{busy=false;}
    };
    onMount(()=>{
        mounted=true;void refresh();
        const timer=setInterval(async()=>{
            if(busy || refreshing || !mounted)return;
            controller=new AbortController();const version=epoch;
            try{
                const events=await getAgentEvents(project.id,cursor,controller.signal);
                if(!mounted || version!==epoch)return;
                // Snapshot is authoritative, including when retention requires reset.
                await refresh();
                if(events.resetRequired)dispatch("changed");
            }catch(error){if(mounted && version===epoch){stale=true;report(error);await refresh();}}
        },5000);
        return()=>{mounted=false;epoch++;clearInterval(timer);controller?.abort();clearResults();};
    });
</script>

<div class="execution">
    <h3>{$t("video-agent.shared_quota")}</h3>
    {#if usage}
        <p class="muted">{$t("video-agent.quota_remaining")}: {Math.floor(usage.remainingSeconds/60)} min / {Math.floor(usage.limitSeconds/60)} min</p>
        <p class="muted">{$t("video-agent.quota_reserved")}: {Math.ceil(usage.reservedSeconds/60)} min</p>
        <p class="muted">{$t("video-agent.quota_reset")}: {new Date(usage.resetsAt).toISOString().slice(0,10)} UTC</p>
    {/if}
    {#if errorCode}<p class="error" role="alert">{$t("video-agent.request_failed")} ({errorCode})</p>{/if}
    {#if stale}<p role="status">{$t("video-agent.progress_stale")}</p>{/if}
    {#if pendingCommand}<button disabled={busy} on:click={()=>pendingCommand && command(pendingCommand)}>{$t("video-agent.replay_command")}</button>{/if}
    <form on:submit|preventDefault={createPlan}>
        <h3>{$t("video-agent.plan")}</h3>
        <p class="muted">{$t("video-agent.plan_controls_hint")}</p>
        <label for="plan-source">{$t("video-agent.plan_source")}</label>
        <select id="plan-source" bind:value={sourceRef} on:change={clearPlan} disabled={busy || !!pendingCommand}>
            {#each readySources as source}<option value={source.id}>{source.filename}</option>{/each}
        </select>
        <label for="plan-language">{$t("video-agent.plan_language")}</label>
        <select id="plan-language" bind:value={targetLanguage} on:change={clearPlan} disabled={busy || !!pendingCommand}>
            {#each languages as language}<option value={language}>{language.toUpperCase()}</option>{/each}
        </select>
        <label for="plan-count">{$t("video-agent.plan_count")}</label>
        <input id="plan-count" type="number" min="1" max="5" step="1" bind:value={requestedCount} on:input={clearPlan} disabled={busy || !!pendingCommand} />
        <label for="plan-subtitles">{$t("video-agent.plan_subtitles")}</label>
        <select id="plan-subtitles" bind:value={subtitleMode} on:change={clearPlan} disabled={busy || !!pendingCommand}>
            <option value="bilingual">{$t("video-agent.subtitle_bilingual")}</option><option value="translated">{$t("video-agent.subtitle_translated")}</option>
        </select>
        <button class:saved={!!planId} disabled={!canCreatePlan}>{$t(planId ? "video-agent.plan_saved" : busy ? "video-agent.loading" : "video-agent.create_plan")}</button>
    </form>
    {#if planId}
        <div class="plan-success" role="status" aria-live="polite" aria-atomic="true">
            <span class="success-icon" aria-hidden="true">&#10003;</span>
            <div><strong>{$t("video-agent.plan_saved")}</strong><p>{$t("video-agent.plan_ready")}</p></div>
        </div>
    {/if}
    <button class="primary" on:click={start} disabled={busy || !!pendingCommand || !planId || !capabilities?.executionEnabled || !!activeRun}>{$t("video-agent.start")}</button>
    {#if !capabilities?.executionEnabled}<p class="muted">{$t("video-agent.pipeline_pending")}</p>{/if}
    <p class="muted">{$t("video-agent.charge_policy")}</p>
    <h3>{$t("video-agent.run_history")}</h3>
    {#if runs.length}
        <label for="selected-run">{$t("video-agent.select_run")}</label>
        <select id="selected-run" bind:value={selectedRunId} on:change={chooseRun} disabled={busy}>
            {#each runs as value}<option value={value.id}>{new Date(value.createdAt).toLocaleString()} / {$t(`video-agent.run_${value.status}`)}</option>{/each}
        </select>
        {#if nextCursor}<button on:click={more} disabled={busy || refreshing}>{$t("video-agent.load_more")}</button>{/if}
    {/if}
    {#if run}
        <p role="status">{$t(`video-agent.run_${run.status}`)} / {$t("video-agent.steps_finished")}: {completedSteps}/{steps.length}</p>
        <p>{$t("video-agent.outputs_verified")}: {run.producedCount}/{run.requestedCount}</p>
        {#each results as result (result.id)}
            <article>
                <h3>{result.title || result.id}</h3>
                {#if previewUrls[result.video.id]}<video controls preload="metadata" src={previewUrls[result.video.id]}><track kind="captions" label="VTT" src={previewUrls[result.subtitles.vtt?.id] || undefined} /></video>{:else}<button on:click={()=>Promise.all([preview(result.video.id),...(result.subtitles.vtt?[preview(result.subtitles.vtt.id)]:[])])}>&#9654; MP4</button>{/if}
                <div class="actions"><button on:click={()=>downloadAgentAsset(project.id,result.video.id,`${result.id}.mp4`).catch(report)}>MP4</button>
                {#each Object.entries(result.subtitles) as [format,asset]}<button on:click={()=>downloadAgentAsset(project.id,asset.id,`${result.id}.${format}`).catch(report)}>{format.toUpperCase()}</button>{/each}</div>
            </article>
        {/each}
        {#if editable && editable.clips.length}
            <section class="editor" aria-label={$t("video-agent.edit_result")}>
                <h3>{$t("video-agent.edit_result")}</h3>
                {#if !editMatchesCurrent}<p class="muted">{$t("video-agent.edit_restore_first")}</p>{/if}
                <label for="edit-clip">{$t("video-agent.edit_clip")}</label>
                <select id="edit-clip" bind:value={selectedClipId} on:change={()=>{const clip=editable?.clips.find(item=>item.id===selectedClipId);if(clip)chooseClip(clip);}} disabled={busy}>
                    {#each editable.clips as clip}<option value={clip.id}>{clip.title || clip.id}</option>{/each}
                </select>
                {#if selectedEditableClip}
                    <label for="edit-title">{$t("video-agent.edit_title")}</label>
                    <input id="edit-title" bind:value={titleDraft} maxlength="120" disabled={busy} />
                    <label for="edit-focus">{$t("video-agent.edit_focus")}: {Math.round(Number(focusDraft)*100)}%</label>
                    <input id="edit-focus" type="range" min="0" max="1" step="0.01" bind:value={focusDraft} disabled={busy} />
                    <label for="edit-start">{$t("video-agent.edit_start")}</label>
                    <select id="edit-start" bind:value={startCueId} disabled={busy}>{#each selectedEditableClip.cues as cue}<option value={cue.id}>{(cue.startMs/1000).toFixed(1)}s — {cue.sourceText}</option>{/each}</select>
                    <label for="edit-end">{$t("video-agent.edit_end")}</label>
                    <select id="edit-end" bind:value={endCueId} disabled={busy}>{#each selectedEditableClip.cues as cue}<option value={cue.id}>{(cue.endMs/1000).toFixed(1)}s — {cue.sourceText}</option>{/each}</select>
                    <button on:click={saveClip} disabled={busy || !!pendingCommand || !capabilities?.commandsEnabled || !editMatchesCurrent || !clipEditChanged}>{$t("video-agent.save_edit")}</button>
                    <label for="edit-cue">{$t("video-agent.edit_subtitle")}</label>
                    <select id="edit-cue" bind:value={selectedCueId} on:change={()=>{const cue=selectedEditableClip?.cues.find(item=>item.id===selectedCueId);if(cue)chooseCue(cue);}} disabled={busy}>
                        <option value="">{$t("video-agent.select_cue")}</option>
                        {#each selectedEditableClip.cues as cue}<option value={cue.id}>{(cue.startMs/1000).toFixed(1)}s — {cue.sourceText}</option>{/each}
                    </select>
                    {#if selectedCueId}<textarea bind:value={cueDraft} maxlength="2048" rows="3" disabled={busy}></textarea>
                        <button on:click={saveCue} disabled={busy || !!pendingCommand || !cueDraft.trim() || !capabilities?.commandsEnabled || !editMatchesCurrent || !cueEditChanged}>{$t("video-agent.save_edit")}</button>{/if}
                    <p class="muted">{$t("video-agent.edit_version_hint")}</p>
                {/if}
            </section>
        {/if}
        {#if run.errorCode}<p class="error">{run.errorCode}</p>{/if}
        <ol>{#each steps as step (step.id)}<li>{$t(`video-agent.stage_${step.stage}`)}: {$t(`video-agent.step_${step.status}`)} ({step.attempt}) {step.errorCode || ""}</li>{/each}</ol>
        <div class="actions">
            {#if activeStates.includes(run.status)}<button on:click={()=>control("cancel_run")} disabled={busy || !!pendingCommand || run.status==="cancelling"}>{$t("video-agent.cancel_run")}</button>{/if}
            {#if ["failed","partially_completed"].includes(run.status)}<button on:click={()=>control("retry_run")} disabled={busy || !!pendingCommand || !capabilities?.executionEnabled || !!activeRun}>{$t("video-agent.retry_run")}</button>{/if}
        </div>
    {:else}<p class="muted">{$t("video-agent.runs_empty")}</p>{/if}
    {#if revisions.length>1}
        <section class="versions" aria-label={$t("video-agent.versions")}>
            <h3>{$t("video-agent.versions")}</h3>
            <label for="restore-revision">{$t("video-agent.restore_version")}</label>
            <select id="restore-revision" bind:value={restoreTarget} disabled={busy}>
                {#each revisions.filter(item=>item.revision<revision) as item}<option value={item.revision}>#{item.revision} · {new Date(item.createdAt).toLocaleString()}</option>{/each}
            </select>
            <button on:click={restore} disabled={busy || !!pendingCommand || !capabilities?.commandsEnabled}>{$t("video-agent.restore_version")}</button>
            {#if nextRevisionCursor}<button on:click={moreVersions} disabled={busy}>{$t("video-agent.load_more")}</button>{/if}
        </section>
    {/if}
</div>

<style>
    .execution { display:grid;gap:12px;font-size:12px; }
    video {width:100%;max-height:480px;background:black;} article {display:grid;gap:12px;}
    form { display:grid;gap:9px;border-top:1px solid rgba(128,128,128,.2);padding-top:16px; }
    h3,p { margin:0;line-height:1.6; } h3 { font-size:14px; }
    select,input,button { padding:10px;border:1px solid rgba(128,128,128,.25);border-radius:9px;background:var(--background);color:var(--text);font:inherit;min-width:0; }
    button { cursor:pointer; } button:disabled { opacity:.5;cursor:not-allowed; }
    .plan-success { display:flex;align-items:center;gap:12px;padding:16px;border:2px solid #81b426;border-radius:12px;background:rgba(129,180,38,.12); }
    .plan-success strong { font-size:15px; } .plan-success p { margin-top:4px; }
    .success-icon { display:grid;place-items:center;flex-shrink:0;width:30px;height:30px;border-radius:50%;background:#507b1c;color:white;font-size:20px; }
    button.saved:disabled { opacity:1;border-color:#81b426;background:rgba(129,180,38,.12);cursor:default; }
    .primary { background:var(--accent);color:white; } .muted { opacity:.7; } .error { color:#c0392b;overflow-wrap:anywhere; }
    ol { margin:0;padding-left:20px; } li { margin:8px 0;overflow-wrap:anywhere; } .actions { display:flex;flex-wrap:wrap;gap:8px; }
    .editor,.versions { display:grid;gap:8px;padding:14px;border:1px solid rgba(128,128,128,.25);border-radius:12px; }
    textarea { width:100%;box-sizing:border-box;padding:10px;border:1px solid rgba(128,128,128,.25);border-radius:9px;background:var(--background);color:var(--text);font:inherit; }
</style>
