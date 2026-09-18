<script lang="ts">
    import { onMount,createEventDispatcher } from "svelte";
    import { t } from "$lib/i18n/translations";
    import { getAgentCapabilities,getAgentUsage,listAgentRuns,getAgentRun,getAgentEvents,getCurrentAgentPlan,submitAgentCommand,
        type AgentProject,type AgentSource,type AgentCapabilities,type AgentUsage,type AgentRun,type AgentStep,type AgentCommand } from "$lib/api/video-agent";
    export let project: AgentProject;
    export let sources: AgentSource[]=[];
    const dispatch=createEventDispatcher();
    let capabilities: AgentCapabilities | null=null,usage: AgentUsage | null=null;
    let runs: AgentRun[]=[],selectedRunId="",run: AgentRun | null=null,steps: AgentStep[]=[];
    let sourceRef="",targetLanguage="es",subtitleMode: "translated" | "bilingual"="bilingual",requestedCount=3;
    let planId="",planRevision=0,revision=project.revision,busy=false,refreshing=false,errorCode="",stale=false;
    let mounted=false,epoch=0,cursor="0",controller: AbortController | null=null;
    let pendingCommand: AgentCommand | null=null;
    let planLoaded=false,dirty=false,historyLoaded=false,nextCursor:string | null=null;
    const languages=["de","en","es","fr","ja","ko","ru","th","vi","zh"];
    const activeStates=["queued","planning","awaiting_input","running","cancelling"];
    $: revision=Math.max(revision,project.revision);
    $: readySources=sources.filter(source=>source.status==="ready" && source.retentionUntil>Date.now());
    $: if(!readySources.some(source=>source.id===sourceRef)){sourceRef=readySources[0]?.id || "";planId="";}
    $: activeRun=runs.find(value=>activeStates.includes(value.status));
    $: completedSteps=steps.filter(value=>value.status==="succeeded").length;
    $: if(planId && planRevision!==revision)planId="";
    $: canCreatePlan=planLoaded && !refreshing && !busy && !pendingCommand && !planId && !!sourceRef && !!capabilities?.commandsEnabled && !activeRun;
    const report=(error:unknown)=>{errorCode=(error as {code?:string})?.code || "VIDEO_AGENT_REQUEST_FAILED";};
    const refresh=async()=>{
        if(!mounted || refreshing)return;
        refreshing=true;const version=epoch,id=project.id;
        try{
            const results=await Promise.allSettled([getAgentCapabilities(),getAgentUsage(),listAgentRuns(id),getCurrentAgentPlan(id)]);
            if(!mounted || version!==epoch)return;
            if(results[0].status==="fulfilled")capabilities=results[0].value;else{capabilities=null;report(results[0].reason);}
            if(results[1].status==="fulfilled")usage=results[1].value.usage;else report(results[1].reason);
            if(results[2].status==="fulfilled"){
                const latest=results[2].value.runs;
                runs=[...latest,...runs.filter(value=>!latest.some(item=>item.id===value.id) && !activeStates.includes(value.status))];
                if(!historyLoaded)nextCursor=results[2].value.nextCursor;
                if(!runs.some(value=>value.id===selectedRunId))selectedRunId=runs[0]?.id || "";
            }else throw results[2].reason;
            if(results[3].status==="fulfilled"){
                const current=results[3].value;revision=Math.max(revision,current.revision);
                if(!planLoaded && !dirty && current.plan){
                    const saved=current.plan;sourceRef=saved.input.sourceRef;targetLanguage=saved.input.targetLanguage;subtitleMode=saved.input.subtitles?.mode || "bilingual";requestedCount=saved.input.clips.requestedCount;
                    planId=saved.id;planRevision=saved.revision;
                }
                planLoaded=true;
            }else report(results[3].reason);
            if(selectedRunId){
                const selected=selectedRunId;
                const snapshot=await getAgentRun(id,selected);
                if(!mounted || version!==epoch || selected!==selectedRunId)return;
                run=snapshot.run;steps=snapshot.steps;cursor=snapshot.eventCursor;
            }else{run=null;steps=[];}
            stale=results.some(value=>value.status==="rejected");
        }catch(error){if(mounted && version===epoch){stale=true;report(error);}}
        finally{refreshing=false;}
    };
    const command=async(value:AgentCommand)=>{
        busy=true;errorCode="";const version=epoch,id=project.id;pendingCommand=value;
        try{
            const receipt=await submitAgentCommand(id,value);
            if(!mounted || version!==epoch)return;
            pendingCommand=null;revision=receipt.revision;
            if(receipt.planId){planId=receipt.planId;planRevision=receipt.revision;dirty=false;}
            if(receipt.runId){selectedRunId=receipt.runId;planId="";}
            dispatch("changed");await refresh();
        }catch(error){
            if(!mounted || version!==epoch)return;
            report(error);
            const status=(error as {status?:number})?.status;
            // Lost responses retain the exact command key/body for safe replay.
            if(status && (status<500 || ["VIDEO_AGENT_PIPELINE_NOT_READY","VIDEO_AGENT_NOT_ENABLED","VIDEO_AGENT_RUNS_NOT_ENABLED","VIDEO_AGENT_ADMISSION_NOT_ENABLED"].includes(errorCode)))pendingCommand=null;
            if(errorCode==="VIDEO_AGENT_REVISION_CONFLICT"){planId="";dispatch("changed");}
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
    const chooseRun=()=>{run=null;steps=[];cursor="0";void refresh();};
    const clearPlan=()=>{planId="";dirty=true;};
    const more=async()=>{
        if(!nextCursor)return;busy=true;const version=epoch;
        try{const page=await listAgentRuns(project.id,nextCursor);if(!mounted || version!==epoch)return;
            runs=[...runs,...page.runs.filter(value=>!runs.some(existing=>existing.id===value.id))];nextCursor=page.nextCursor;historyLoaded=true;
        }catch(error){if(mounted && version===epoch)report(error);}finally{if(mounted && version===epoch)busy=false;}
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
        return()=>{mounted=false;epoch++;clearInterval(timer);controller?.abort();};
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
        {#if run.errorCode}<p class="error">{run.errorCode}</p>{/if}
        <ol>{#each steps as step (step.id)}<li>{$t(`video-agent.stage_${step.stage}`)}: {$t(`video-agent.step_${step.status}`)} ({step.attempt}) {step.errorCode || ""}</li>{/each}</ol>
        <div class="actions">
            {#if activeStates.includes(run.status)}<button on:click={()=>control("cancel_run")} disabled={busy || !!pendingCommand || run.status==="cancelling"}>{$t("video-agent.cancel_run")}</button>{/if}
            {#if ["failed","partially_completed"].includes(run.status)}<button on:click={()=>control("retry_run")} disabled={busy || !!pendingCommand || !capabilities?.executionEnabled || !!activeRun}>{$t("video-agent.retry_run")}</button>{/if}
        </div>
    {:else}<p class="muted">{$t("video-agent.runs_empty")}</p>{/if}
</div>

<style>
    .execution { display:grid;gap:12px;font-size:12px; }
    form { display:grid;gap:9px;border-top:1px solid rgba(128,128,128,.2);padding-top:16px; }
    h3,p { margin:0;line-height:1.6; } h3 { font-size:14px; }
    select,input,button { padding:10px;border:1px solid rgba(128,128,128,.25);border-radius:9px;background:var(--background);color:var(--text);font:inherit;min-width:0; }
    button { cursor:pointer; } button:disabled { opacity:.5;cursor:not-allowed; }
    .plan-success { display:flex;align-items:center;gap:12px;padding:16px;border:2px solid #81b426;border-radius:12px;background:rgba(129,180,38,.12); }
    .plan-success strong { font-size:15px; } .plan-success p { margin-top:4px; }
    .success-icon { display:grid;place-items:center;flex-shrink:0;width:30px;height:30px;border-radius:50%;background:#507b1c;color:white;font-size:20px; }
    button.saved:disabled { opacity:1;border-color:#81b426;background:rgba(129,180,38,.12);cursor:default; }
    .primary { background:var(--accent);color:white; } .muted { opacity:.7; } .error { color:#c0392b;overflow-wrap:anywhere; }
    ol { margin:0;padding-left:20px; } li { margin:8px 0;overflow-wrap:anywhere; } .actions { display:flex;gap:8px; }
</style>
