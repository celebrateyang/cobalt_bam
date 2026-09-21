<script lang="ts">
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { clerkUser, clerkLoaded, signIn } from "$lib/state/clerk";
    import { createAgentProject, deleteAgentProject, downloadAgentAsset, getAgentProject, getAgentCapabilities, importAgentSource, listAgentMessages,listAgentProjects,planAgentMessage,saveAgentMessage,uploadAgentSource,
        type AgentMessage,type AgentProject, type AgentSource } from "$lib/api/video-agent";
    import { getPendingAiVideoImport, type PendingAiVideoImport } from "$lib/api/ai-video";
    import { t } from "$lib/i18n/translations";
    import IconSparkles from "@tabler/icons-svelte/IconSparkles.svelte";
    import IconUpload from "@tabler/icons-svelte/IconUpload.svelte";
    import IconMessageCircle from "@tabler/icons-svelte/IconMessageCircle.svelte";
    import AgentExecutionPanel from "./AgentExecutionPanel.svelte";

    let request = "";
    export let projectId = "";
    let title = "";
    let projects: AgentProject[] = [];
    let sources: AgentSource[] = [];
    let selectedProject: AgentProject | null = null;
    let pendingImport: PendingAiVideoImport | null = null;
    let nextCursor: string | null = null;
    let busy = false;
    let progress: number | null = null;
    let errorKey = "";
    let errorCode = "";
    let loading = false;
    let executionEnabled = false;
    let messages:AgentMessage[]=[];
    let messageCursor:string|null=null;
    let messageBusy=false;
    let planningMessageId="";
    let mounted = false;
    let loadKey = "";
    let epoch = 0;
    let uploadController: AbortController | null = null;
    let resumeSourceId: string | undefined;
    let fileInput: HTMLInputElement;
    let requestInput: HTMLTextAreaElement;
    let activePanel: "conversation" | "results" = "conversation";
    const exampleKeys = ["clips_example", "translation_example", "dubbing_example"];
    const journeyKeys = ["step_choose_video", "request_label", "plan", "run_running", "results"];
    let executionState:{hasPlan:boolean;runStatus:string|null;resultCount:number}={hasPlan:false,runStatus:null,resultCount:0};
    $: readySourceCount=sources.filter(source=>source.status==="ready" && source.retentionUntil>Date.now()).length;
    $: waitingForSource=messages.some(message=>message.role==="user" && message.status==="awaiting_source");
    $: sourceError=["file_too_large","resume_original","storage_limit","upload_expired"].includes(errorKey);
    $: currentStep=executionState.runStatus && ["completed","partially_completed"].includes(executionState.runStatus) ? 5
        : executionState.runStatus ? 4 : executionState.hasPlan ? 3 : readySourceCount || messages.length ? 2 : 1;
    $: highlightLink = `/${$page.params.lang || "en"}/ai-video`;
    $: agentLink = `${highlightLink}/video-agent`;
    $: downloaderLink = `/${$page.params.lang || "en"}/`;
    const draftKey=(id:string)=>`fsv_video_agent_draft_${id}`;
    const flashKey=(id:string)=>`fsv_video_agent_flash_${id}`;
    const rememberDraft=(id:string)=>{if(request.trim())sessionStorage.setItem(draftKey(id),request);};
    const takeDraft=(id:string)=>{const value=sessionStorage.getItem(draftKey(id)) || "";sessionStorage.removeItem(draftKey(id));return value;};
    const projectTitleFromFilename=(filename:string)=>filename.replace(/\.[^./\\]+$/,"").replace(/[\x00-\x1f]/g," ").trim().slice(0,120) || $t("video-agent.new_video");
    $: if (mounted && $clerkLoaded && `${$clerkUser?.id || ""}:${projectId}` !== loadKey) {
        loadKey = `${$clerkUser?.id || ""}:${projectId}`;
        uploadController?.abort();
        request = projectId && $clerkUser ? takeDraft(projectId) : "";
        activePanel = "conversation";
        executionState={hasPlan:false,runStatus:null,resultCount:0};
        void refresh();
    }
    const reportError = (error: unknown) => {
        errorCode = (error as { code?: string })?.code || "VIDEO_AGENT_REQUEST_FAILED";
        errorKey = errorCode === "SIGN_IN_REQUIRED" || errorCode === "UNAUTHORIZED" ? "sign_in" : errorCode === "MEMBERSHIP_REQUIRED" ? "membership_required"
            : errorCode === "VIDEO_AGENT_FINGERPRINT_MISMATCH" ? "resume_original" : errorCode === "VIDEO_AGENT_STORAGE_LIMIT" ? "storage_limit"
            : errorCode === "VIDEO_AGENT_UPLOAD_EXPIRED" ? "upload_expired" : errorCode === "VIDEO_AGENT_PROJECT_NOT_FOUND" ? "project_missing" : "request_failed";
    };
    const refresh = async () => {
        const version = ++epoch;
        projects = []; sources = []; messages=[];messageCursor=null;selectedProject = null; errorKey = ""; errorCode = ""; nextCursor = null; executionEnabled = false;
        if (!$clerkUser) { loading = false; return; }
        loading = true;
        try {
            const [listResult, detailResult, capabilitiesResult,messageResult] = await Promise.allSettled([listAgentProjects(), projectId ? getAgentProject(projectId) : Promise.resolve(null), getAgentCapabilities(),projectId?listAgentMessages(projectId):Promise.resolve(null)]);
            if (version !== epoch) return;
            if(capabilitiesResult.status === "fulfilled")executionEnabled = capabilitiesResult.value.executionEnabled;
            if (listResult.status === "fulfilled") { projects = listResult.value.projects; nextCursor = listResult.value.nextCursor; }
            else reportError(listResult.reason);
            if (detailResult.status === "fulfilled") { selectedProject = detailResult.value?.project || null; sources = detailResult.value?.sources || []; }
            else reportError(detailResult.reason);
            if(messageResult.status==="fulfilled" && messageResult.value){messages=messageResult.value.messages;messageCursor=messageResult.value.nextCursor;}
            else if(messageResult.status==="rejected")reportError(messageResult.reason);
        } catch (error) { if (version === epoch) reportError(error); }
        finally { if (version === epoch) {
            if(projectId && !errorKey){const flash=sessionStorage.getItem(flashKey(projectId));if(flash){sessionStorage.removeItem(flashKey(projectId));
                const [key,code]=flash.split(":");errorKey=key;errorCode=code || "";}}
            loading = false;
        } }
    };
    const refreshSources = async () => {
        const id = projectId;
        const version = epoch;
        if (!id || !$clerkUser) return;
        const detail = await getAgentProject(id);
        if (version === epoch && id === projectId) { selectedProject = detail.project; sources = detail.sources; }
    };
    const refreshPendingMessages = async (force=false) => {
        const id = projectId, version = epoch;
        if (!id || !$clerkUser || (!force && !messages.some(message => ["awaiting_source", "processing"].includes(message.status)))) return;
        try {
            const page = await listAgentMessages(id);
            if (version !== epoch || id !== projectId) return;
            const merged = new Map(messages.map(message => [message.id, message]));
            for (const message of page.messages) merged.set(message.id, message);
            messages = [...merged.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
            if (page.messages.some(message => message.outcome?.execution?.status === "started")) activePanel = "results";
        } catch { /* Keep the last durable state until the next poll. */ }
    };
    const olderMessages=async()=>{if(!projectId || !messageCursor || messageBusy)return;messageBusy=true;try{const page=await listAgentMessages(projectId,messageCursor);messages=[...page.messages,...messages];messageCursor=page.nextCursor;}catch(error){reportError(error);}finally{messageBusy=false;}};
    const runPlanner=async(project:AgentProject,message:AgentMessage)=>{planningMessageId=message.id;messages=messages.map(item=>item.id===message.id?{...item,status:"processing"}:item);
        try{const result=await planAgentMessage(project.id,message.id);if(project.id!==selectedProject?.id)return;
            messages=messages.map(item=>item.id===result.message.id?result.message:item);if(result.assistantMessage && !messages.some(item=>item.id===result.assistantMessage?.id))messages=[...messages,result.assistantMessage];
            if(result.outcome.revision!==undefined){selectedProject={...project,revision:result.outcome.revision};projects=projects.map(item=>item.id===project.id?selectedProject as AgentProject:item);}
            if(result.outcome.pendingSourceId)void refreshSources().catch(reportError);
            if(result.outcome.execution?.status==="started")activePanel="results";
        }catch(error){if(project.id===selectedProject?.id){messages=messages.map(item=>item.id===message.id?{...item,status:"failed"}:item);reportError(error);}}
        finally{if(planningMessageId===message.id)planningMessageId="";}};
    const retryPlanner=async(message:AgentMessage)=>{if(!selectedProject || messageBusy || planningMessageId)return;messageBusy=true;errorKey="";try{await runPlanner(selectedProject,message);}finally{messageBusy=false;}};
    const sendMessage=async()=>{const content=request.trim();if(!selectedProject || !content || messageBusy || planningMessageId)return;messageBusy=true;errorKey="";const project=selectedProject;
        try{const result=await saveAgentMessage(project.id,content,crypto.randomUUID());if(!messages.some(item=>item.id===result.message.id))messages=[...messages,result.message];request="";await runPlanner(project,result.message);}catch(error){reportError(error);}finally{messageBusy=false;}};
    const create = async () => {
        busy = true; errorKey = "";
        try { const result = await createAgentProject(title); title = ""; rememberDraft(result.project.id); await goto(`${agentLink}/projects/${result.project.id}`); }
        catch (error) { reportError(error); } finally { busy = false; }
    };
    const startWithLink=async()=>{
        busy=true;errorKey="";
        try{const result=await createAgentProject($t("video-agent.new_video"));rememberDraft(result.project.id);await goto(`${agentLink}/projects/${result.project.id}`);}
        catch(error){reportError(error);}finally{busy=false;}
    };
    const remove = async () => {
        if (!selectedProject) return;
        busy = true; errorKey = "";
        try { await deleteAgentProject(selectedProject.id); await goto(agentLink); }
        catch (error) { reportError(error); } finally { busy = false; }
    };
    const more = async () => {
        if (!nextCursor) return;
        busy = true;
        try { const list = await listAgentProjects(nextCursor); projects = [...projects, ...list.projects]; nextCursor = list.nextCursor; }
        catch (error) { reportError(error); } finally { busy = false; }
    };
    const chooseFile = (sourceId?: string) => { resumeSourceId = sourceId; fileInput.value = ""; fileInput.click(); };
    const upload = async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        if (file.size > 1024 ** 3) { errorKey = "file_too_large"; errorCode = ""; return; }
        const controller = new AbortController(); uploadController = controller;
        busy = true; progress = 0; errorKey = "";
        let destination=selectedProject?.id || "";
        try {
            if(!destination){const created=await createAgentProject(projectTitleFromFilename(file.name));selectedProject=created.project;destination=created.project.id;}
            await uploadAgentSource({ projectId:destination, file, sourceId: resumeSourceId, onProgress: (value) => { progress = value; }, signal: controller.signal });
        }
        catch (error) { if (!controller.signal.aborted) reportError(error); }
        finally {
            uploadController = null; busy = false; progress = null;
            if(!projectId && destination){rememberDraft(destination);if(errorKey)sessionStorage.setItem(flashKey(destination),`${errorKey}:${errorCode}`);
                await goto(`${agentLink}/projects/${destination}`);}
            else await Promise.all([refreshSources(),refreshPendingMessages(true)]).catch(reportError);
        }
    };
    const importSource = async () => {
        pendingImport = getPendingAiVideoImport();
        if (!pendingImport) return;
        busy = true; errorKey = "";
        let destination=selectedProject?.id || "";
        try {
            if(!destination){const created=await createAgentProject(projectTitleFromFilename(pendingImport.filename));selectedProject=created.project;destination=created.project.id;}
            await importAgentSource(destination, pendingImport.token);
            sessionStorage.removeItem("fsv_ai_video_import_v1"); pendingImport = null;
            if(projectId)await Promise.all([refreshSources(),refreshPendingMessages(true)]);
        } catch (error) { reportError(error); } finally { busy = false;
            if(!projectId && destination){rememberDraft(destination);if(errorKey)sessionStorage.setItem(flashKey(destination),`${errorKey}:${errorCode}`);
                await goto(`${agentLink}/projects/${destination}`);}
        }
    };
    const download = async (source: AgentSource) => {
        if (!source.assetId) return;
        busy = true;
        try { await downloadAgentAsset(projectId, source.assetId, source.filename); }
        catch (error) { reportError(error); } finally { busy = false; }
    };
    onMount(() => {
        mounted = true; pendingImport = getPendingAiVideoImport();
        const timer = setInterval(() => {
            pendingImport = getPendingAiVideoImport();
            if (!busy && sources.some((source) => ["queued_ingest", "ingesting"].includes(source.status))) void refreshSources().catch(reportError);
            void refreshPendingMessages();
        }, 5000);
        return () => { mounted = false; epoch++; clearInterval(timer); uploadController?.abort(); };
    });

    const chooseExample = (key: string) => {
        request = $t(`video-agent.${key}`);
        activePanel = "conversation";
        requestInput?.focus();
    };
    const adjustRequest = () => {
        activePanel="conversation";
        requestInput?.focus();
        requestInput?.scrollIntoView({behavior:"smooth",block:"center"});
    };
</script>

<main class="agent">
    <header class="hero">
        <div>
            {#if !executionEnabled}<p class="eyebrow">{$t("video-agent.preview")}</p>{/if}
            <h1>Video Agent</h1>
            <p class="description">{$t("video-agent.description")}</p>
        </div>
        <div class="hero-icon" aria-hidden="true"><IconSparkles size={38} /></div>
    </header>

    {#if !executionEnabled}<div class="preview-note" role="note"><IconSparkles size={19} aria-hidden="true" /><p>{$t("video-agent.preview_note")}</p><a href={highlightLink}>{$t("video-agent.open_highlight")}</a></div>{/if}

    {#if $clerkLoaded && !$clerkUser}
        <button class="secondary account-action" on:click={() => signIn()}>{$t("video-agent.sign_in")}</button>
    {/if}
    {#if errorKey}<p class="error" role="alert">{$t(`video-agent.${errorKey}`)} {errorCode ? `(${errorCode})` : ""}</p>{/if}
    {#if loading}<p class="muted" role="status">{$t("video-agent.loading")}</p>{/if}
    <input class="file-input" type="file" accept=".mp4,.mov,.webm,.mkv,.m4v" bind:this={fileInput} on:change={upload} aria-label={$t("video-agent.upload")} />

    {#if !projectId}
        <section class="onboarding" aria-labelledby="agent-start-title">
            <div class="onboarding-heading"><div><p class="eyebrow">01 — 02</p><h2 id="agent-start-title">{$t("video-agent.start_title")}</h2>
                    <p class="muted">{$t("video-agent.start_intro")}</p></div></div>
            <div class="onboarding-grid">
                <section class="card start-card" aria-labelledby="choose-video-title">
                    <span class="step-number">01</span><h3 id="choose-video-title">{$t("video-agent.step_choose_video")}</h3>
                    <button class="primary" disabled={busy || !$clerkUser} on:click={()=>chooseFile()}><IconUpload size={18} aria-hidden="true" />{$t("video-agent.upload")}</button>
                    {#if pendingImport}<button class="secondary" disabled={busy || !$clerkUser} on:click={importSource}>{$t("video-agent.import_download")}: {pendingImport.filename}</button>{/if}
                    {#if progress !== null}<div role="status">{$t("video-agent.upload_progress")}: {progress}%</div><progress value={progress} max="100">{progress}%</progress><button class="secondary" on:click={()=>uploadController?.abort()}>{$t("video-agent.pause_upload")}</button>{/if}
                    <p class="download-hint">{$t("video-agent.no_video_hint")} <a href={downloaderLink} target="_blank" rel="noopener noreferrer">{$t("video-agent.open_downloader")}</a></p>
                    <p class="muted">{$t("video-agent.source_retention")}</p>
                </section>
                <section class="card start-card" aria-labelledby="describe-goal-title">
                    <span class="step-number">02</span><h3 id="describe-goal-title">{$t("video-agent.request_label")}</h3>
                    <p class="muted">{$t("video-agent.next_request")}</p>
                    <div class="examples">{#each exampleKeys as key}<button class="example" on:click={()=>chooseExample(key)}>{$t(`video-agent.${key}`)}</button>{/each}</div>
                    <label for="agent-request">{$t("video-agent.request_label")}</label>
                    <textarea id="agent-request" bind:this={requestInput} bind:value={request} maxlength={4000} rows={4} placeholder={$t("video-agent.request_placeholder")}></textarea>
                    <p class="muted">{$t("video-agent.source_first_hint")}</p>
                    <button class="secondary link-start" disabled={busy || !$clerkUser} on:click={startWithLink}>{$t("video-agent.start_with_link")}</button>
                    <details class="manual-start"><summary>{$t("video-agent.create_project")}</summary>
                        <form on:submit|preventDefault={create}><label for="project-title">{$t("video-agent.project_title")}</label><input id="project-title" bind:value={title} maxlength={120} required /><button class="secondary" disabled={busy || !$clerkUser}>{$t("video-agent.create_project")}</button></form>
                    </details>
                </section>
            </div>
        </section>
        <section class="saved-projects" aria-labelledby="saved-projects-title">
            <div class="saved-heading"><div><h2 id="saved-projects-title">{$t("video-agent.my_projects")}</h2><p class="muted">{$t("video-agent.my_projects_hint")}</p></div></div>
            {#if projects.length}<div class="project-grid">{#each projects as project (project.id)}
                <a class="card project-card" href={`${agentLink}/projects/${project.id}`}>
                    <strong>{project.title}</strong>
                    <span class="muted">{new Date(project.updatedAt).toLocaleDateString()}</span>
                    {#if project.latestRun}<span class="project-status">{$t(`video-agent.run_${project.latestRun.status}`)} · {$t("video-agent.videos_created")}: {project.latestRun.producedCount}/{project.latestRun.requestedCount}</span>{/if}
                    <span class="project-action">{$t("video-agent.continue_project")} →</span>
                </a>{/each}</div>
                {#if nextCursor}<button class="secondary load-projects" disabled={busy} on:click={more}>{$t("video-agent.load_more")}</button>{/if}
            {:else if !loading}<p class="muted empty-projects">{$t("video-agent.projects_empty")}</p>{/if}
        </section>
    {:else}
    <div class="project-context card">
        <a href={agentLink}>{$t("video-agent.my_projects")}</a><span aria-hidden="true">/</span><strong>{selectedProject?.title || $t("video-agent.loading")}</strong>
        <details class="project-manage"><summary>{$t("video-agent.project_manage")}</summary>
            <button type="button" class="secondary delete" disabled={busy || !selectedProject} on:click={remove}>{$t("video-agent.delete_project")}</button>
        </details>
    </div>
    <ol class="journey" aria-label={$t("video-agent.start_title")}>
        {#each journeyKeys as key,index}<li class:current={currentStep===index+1} class:done={currentStep>index+1} aria-current={currentStep===index+1?"step":undefined}>
            <span>{index+1}</span>{$t(`video-agent.${key}`)}</li>{/each}
    </ol>
    <div class="workspace">

        <div class="panel-switch" role="group" aria-label="Video Agent">
            <button class:active={activePanel === "conversation"} aria-pressed={activePanel === "conversation"} aria-controls="agent-conversation" on:click={() => activePanel = "conversation"}>{$t("video-agent.conversation")}</button>
            <button class:active={activePanel === "results"} aria-pressed={activePanel === "results"} aria-controls="agent-results" on:click={() => activePanel = "results"}>{$t("video-agent.results")}</button>
        </div>

        <section id="agent-conversation" class="card conversation" class:mobile-hidden={activePanel !== "conversation"} aria-labelledby="agent-conversation-title">
            <div class="panel-heading"><h2 id="agent-conversation-title"><IconMessageCircle size={20} aria-hidden="true" />{$t("video-agent.conversation")}</h2></div>
            {#if messageCursor}<button class="secondary older" disabled={messageBusy} on:click={olderMessages}>{$t("video-agent.load_older")}</button>{/if}
            {#if messages.length}<div class="message-list" aria-live="polite">{#each messages as message (message.id)}<article class="message" class:assistant={message.role==="assistant"}><p>{message.content}</p><small>{new Date(message.createdAt).toLocaleString()} · {$t(message.status==="processing"?"video-agent.loading":message.status==="failed"?"video-agent.request_failed":"video-agent.message_saved")}</small>{#if message.role==="assistant" && message.outcome?.execution?.status==="started"}<small role="status">{$t("video-agent.run_queued")} · {message.outcome.execution.runId}</small>{/if}{#if message.role==="assistant" && message.outcome?.execution?.status==="blocked"}<small class="error" role="alert">{$t("video-agent.request_failed")} ({message.outcome.execution.errorCode})</small>{/if}{#if message.role==="user" && message.status==="failed"}<button class="message-retry" disabled={messageBusy || !!planningMessageId} on:click={()=>retryPlanner(message)}>{$t("video-agent.replay_command")}</button>{/if}</article>{/each}</div>{/if}
            {#if messages.some(message => message.status === "awaiting_source")}<p class="muted" role="status">{$t("video-agent.status_queued_ingest")}</p>{/if}
            <div class="composer">
                <div class="flow-section"><span class="step-number">01</span><h3>{$t("video-agent.step_choose_video")}</h3></div>
                {#if !readySourceCount}<p class="download-hint">{$t("video-agent.no_video_hint")} <a href={downloaderLink} target="_blank" rel="noopener noreferrer">{$t("video-agent.open_downloader")}</a></p>{/if}
                <div class="source-actions">
                    <button type="button" class="secondary" disabled={busy || !selectedProject} on:click={() => chooseFile()}><IconUpload size={17} aria-hidden="true" />{$t("video-agent.upload")}</button>
                    {#if pendingImport}<button type="button" class="secondary" disabled={busy || !selectedProject} on:click={importSource}>{$t("video-agent.import_download")}: {pendingImport.filename}</button>{/if}
                </div>
                {#if sourceError}<p class="error" role="alert">{$t(`video-agent.${errorKey}`)} {errorCode ? `(${errorCode})` : ""}
                    {#if errorKey==="storage_limit"} <a href={agentLink}>{$t("video-agent.my_projects")}</a>{/if}</p>{/if}
                {#if progress !== null}
                    <div role="status">{$t("video-agent.upload_progress")}: {progress}%</div>
                    <progress value={progress} max="100">{progress}%</progress>
                    <button type="button" class="secondary" on:click={() => uploadController?.abort()}>{$t("video-agent.pause_upload")}</button>
                {/if}
                <details class="source-details" open={!readySourceCount || sources.some(source=>["failed","uploading"].includes(source.status))}><summary>{$t("video-agent.plan_source")} ({sources.length})</summary>
                    <p class="muted">{$t("video-agent.source_retention")}</p>
                    <p class="muted">{$t("video-agent.import_hint")} <a href={downloaderLink} target="_blank" rel="noopener noreferrer">{$t("video-agent.open_downloader")}</a></p>
                    <div class="sources">
                        {#each sources as source (source.id)}
                            <div class="source">
                                <strong>{source.filename}</strong>
                                <p class="muted">{$t(`video-agent.status_${source.status}`)} · {(source.sizeBytes / 1024 ** 2).toFixed(1)} MiB</p>
                                {#if source.probe}<p class="muted">{Math.round(source.probe.durationSeconds)} s · {source.probe.width} × {source.probe.height}</p>{/if}
                                {#if source.errorCode}<p class="error">{source.errorCode}</p>{/if}
                                {#if source.status === "uploading"}<button type="button" class="secondary" disabled={busy} on:click={() => chooseFile(source.id)}>{$t("video-agent.resume_upload")}</button>{/if}
                                {#if source.status === "ready" && source.assetId}<button type="button" class="secondary" disabled={busy} on:click={() => download(source)}>{$t("video-agent.download_source")}</button>{/if}
                            </div>
                        {/each}
                    </div>
                </details>

                <div class="flow-section request-step"><span class="step-number">02</span><h3>{$t("video-agent.request_label")}</h3></div>
                <details class="example-details" open={!messages.length}><summary>{$t("video-agent.examples")}</summary>
                    <div class="examples">{#each exampleKeys as key}<button class="example" on:click={() => chooseExample(key)}>{$t(`video-agent.${key}`)}</button>{/each}</div>
                </details>
                <label for="agent-request">{$t("video-agent.request_label")}</label>
                <textarea id="agent-request" bind:this={requestInput} bind:value={request} maxlength={4000} rows={4} placeholder={$t("video-agent.request_placeholder")} disabled={waitingForSource}></textarea>
                <div class="composer-actions">
                    <button type="button" class="primary" disabled={!selectedProject || !request.trim() || messageBusy || !!planningMessageId || waitingForSource} on:click={sendMessage}>{$t(messageBusy || planningMessageId || waitingForSource?"video-agent.loading":"video-agent.send_message")}</button>
                </div>

            </div>
        </section>

        <section id="agent-results" class="card result-panel" class:mobile-hidden={activePanel !== "results"} aria-labelledby="agent-results-title">
            <div class="panel-heading"><h2 id="agent-results-title">{$t("video-agent.results")}</h2></div>
            {#if selectedProject}
                {#key selectedProject.id}<AgentExecutionPanel project={selectedProject} {sources} on:changed={()=>refreshSources().catch(reportError)} on:adjust={adjustRequest} on:state={(event)=>executionState=event.detail} />{/key}
            {:else}
            <div class="empty-results">
                <div class="empty-icon" aria-hidden="true"><IconSparkles size={32} /></div>
                <h3>{$t("video-agent.step_choose_video")}</h3>
                <p class="muted">{$t("video-agent.start_intro")}</p>
            </div>
            {/if}
        </section>
    </div>
    {/if}
</main>

<style>
    .agent { width: min(1440px, calc(100% - 48px)); margin: 0 auto; padding: 42px 0 80px; color: var(--text); }
    .hero { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
    .eyebrow { margin: 0; color: var(--accent); font-size: 11px; font-weight: 800; letter-spacing: .12em; }
    h1 { margin: 8px 0 12px; font-size: clamp(32px, 4vw, 52px); letter-spacing: -.04em; }
    h2 { margin: 0; font-size: 17px; display: flex; align-items: center; gap: 9px; }
    h3 { margin: 0 0 10px; font-size: 17px; }
    p { line-height: 1.65; }
    .description { margin: 0; max-width: 720px; opacity: .72; font-size: 14px; }
    .hero-icon { display: grid; place-items: center; width: 86px; height: 86px; border-radius: 26px; background: var(--accent); color: white; flex-shrink: 0; }
    .preview-note { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 15px 18px; margin-bottom: 20px; border-radius: 14px; background: rgba(var(--accent-rgb), .08); border: 1px solid rgba(var(--accent-rgb), .2); font-size: 12px; }
    .preview-note > :global(svg) { color: var(--accent); flex-shrink: 0; }
    .preview-note p { flex: 1; min-width: 180px; margin: 0; }
    .preview-note a { color: var(--text); text-underline-offset: 4px; }
    .workspace { display: grid; grid-template-columns: minmax(300px, 390px) minmax(0, 1fr); gap: 16px; align-items: start; }
    .card { min-width: 0; padding: 22px; border: 1px solid rgba(128,128,128,.18); border-radius: 20px; background: var(--button); box-shadow: 0 14px 40px rgba(25,35,18,.05); }
    .panel-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .muted { opacity: .68; font-size: 12px; margin: 0; }
     .onboarding-heading, .saved-heading { margin-bottom: 16px; }
     .onboarding-heading h2, .saved-heading h2 { margin: 6px 0; font-size: 24px; }
     .onboarding-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
     .start-card { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
     .start-card h3, .flow-section h3 { margin: 0; }
     .start-card > .primary, .start-card > .secondary { padding: 11px 15px; }
     .start-card .examples { width: 100%; }
     .start-card label, .start-card textarea { width: 100%; margin-bottom: 0; }
     .step-number { display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; background: rgba(var(--accent-rgb), .13); color: var(--accent); font-size: 12px; font-weight: 800; flex: none; }
     .download-hint { margin: 0; font-size: 13px; }
     .download-hint a, .project-context a { color: var(--accent); text-underline-offset: 3px; }
     .manual-start { width: 100%; border-top: 1px solid rgba(128,128,128,.16); padding-top: 12px; font-size: 12px; }
     .manual-start summary { cursor: pointer; }
     .manual-start form { margin-top: 12px; }
     .manual-start button { padding: 9px 12px; }
     .saved-projects { margin-top: 32px; }
     .project-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
     .project-card { display: flex; flex-direction: column; gap: 9px; min-height: 126px; color: var(--text); text-decoration: none; }
     .project-card:hover, .project-card:focus-visible { border-color: var(--accent); }
     .project-card strong { overflow-wrap: anywhere; }
     .project-status { font-size: 12px; }
     .project-action { margin-top: auto; color: var(--accent); font-size: 12px; font-weight: 700; }
     .load-projects { margin-top: 14px; padding: 9px 12px; }
     .empty-projects { padding: 16px 0; }
     .project-context { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 12px 18px; margin-bottom: 14px; font-size: 12px; }
     .project-context strong { overflow-wrap: anywhere; }
     .project-context .project-manage { margin-left: auto; }
     .journey { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin: 0 0 16px; padding: 0; list-style: none; }
     .journey li { display: flex; align-items: center; gap: 8px; padding: 9px; border: 1px solid rgba(128,128,128,.18); border-radius: 11px; font-size: 11px; opacity: .6; }
     .journey li span { font-weight: 800; }
     .journey li.current { border-color: var(--accent); background: rgba(var(--accent-rgb), .1); opacity: 1; }
     .journey li.done { opacity: 1; }
    .project-manage { position:relative; }
    .project-manage summary,.source-details summary,.example-details summary { cursor:pointer;font-size:12px;font-weight:650; }
    .project-manage[open] { flex-basis:100%; }
     .project-manage .delete { margin:10px 0 0; }
     .flow-section { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
     .flow-section h3 { font-size: 14px; }
     .request-step { margin-top: 24px; }
    .conversation { display:flex;flex-direction:column; }
    .conversation > .panel-heading { order:0; }
    .composer { order:1;border-top:0;padding-top:0; }
    .older { order:2; }
     .message-list { order:3; }
     .older {margin-bottom:12px}.message-list{display:grid;gap:10px;max-height:420px;overflow:auto;margin-bottom:20px}.message{margin-left:28px;padding:12px;border-radius:12px;background:rgba(var(--accent-rgb),.12);overflow-wrap:anywhere}.message.assistant{margin-left:0;margin-right:28px;background:rgba(128,128,128,.08)}.message p{margin:0;white-space:pre-wrap}.message small{display:block;margin-top:7px;opacity:.6;font-size:10px}
    .message-retry { margin-top: 9px; padding: 6px 9px; background: transparent; font-size: 10px; }
    .examples { display: grid; gap: 8px; margin-top:12px; }
    button { display: inline-flex; justify-content: center; align-items: center; gap: 7px; font: inherit; cursor: pointer; border: 1px solid rgba(128,128,128,.22); border-radius: 10px; color: inherit; }
    .example { padding: 10px 12px; text-align: left; justify-content: flex-start; background: rgba(128,128,128,.04); line-height: 1.5; font-size: 11px; }
    .example:hover { background: rgba(var(--accent-rgb), .08); border-color: var(--accent); }
    label { display: block; font-size: 12px; font-weight: 650; margin-bottom: 8px; }
    input, textarea { width: 100%; box-sizing: border-box; border: 1px solid rgba(128,128,128,.25); border-radius: 11px; padding: 12px; font: inherit; font-size: 12px; line-height: 1.6; background: var(--background); color: var(--text); margin-bottom: 16px; }
    textarea { resize: vertical; min-height: 110px; }
    input:focus-visible, textarea:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    .composer-actions { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; }
    .primary { background: var(--accent); color: white; border-color: transparent; }
    .secondary { background: transparent; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .result-panel { display: flex; flex-direction: column; }
    .empty-results { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; text-align: center; min-height: 300px; padding: 28px 8px; }
    .empty-results p { max-width: 340px; }
    .empty-icon { display: grid; place-items: center; width: 72px; height: 72px; margin-bottom: 22px; border-radius: 23px; color: var(--accent); background: rgba(var(--accent-rgb), .1); }
    .panel-switch { display: none; }
     .source button, .account-action { padding: 9px 12px; font-size: 12px; }
    .source-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
     .source-details,.example-details { margin-top:12px;padding:12px;border:1px solid rgba(128,128,128,.18);border-radius:10px; }
     .example-details { margin-bottom: 16px; }
    .source-details p { margin-top:10px; }
    .source-actions button { padding: 10px; font-size: 12px; overflow-wrap: anywhere; }
    .file-input { display: none; }
    .sources { display: grid; gap: 10px; margin: 16px 0; }
    .source { padding: 12px; border: 1px solid rgba(128,128,128,.2); border-radius: 10px; overflow-wrap: anywhere; font-size: 12px; }
    .source button { margin-top: 8px; }
    .error { color: #c0392b; font-size: 12px; overflow-wrap: anywhere; }
    .delete { padding: 8px; margin-bottom: 18px; font-size: 12px; }
    progress { width: 100%; }
    @media (max-width: 760px) {
        .agent { width: calc(100% - 24px); padding-top: 24px; }
        .hero-icon { display: none; }
        .workspace { grid-template-columns: minmax(0, 1fr); }
         .onboarding-grid { grid-template-columns: 1fr; }
         .journey { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 3px; }
         .journey li { flex-direction: column; text-align: center; font-size: 9px; padding: 7px 3px; }
        .panel-switch { display: flex; gap: 8px; }
        .panel-switch button { flex: 1; padding: 12px; background: var(--button); font-size: 12px; }
        .panel-switch button.active { border-color: var(--accent); background: rgba(var(--accent-rgb), .1); }
        .mobile-hidden { display: none; }
        .card { padding: 18px; border-radius: 16px; }
        .empty-results { min-height: 250px; }
    }
</style>
