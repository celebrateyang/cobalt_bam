<script lang="ts">
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { clerkUser, clerkLoaded, signIn } from "$lib/state/clerk";
    import { createAgentProject, deleteAgentProject, downloadAgentAsset, getAgentProject, getAgentCapabilities, importAgentSource, listAgentProjects, uploadAgentSource,
        type AgentProject, type AgentSource } from "$lib/api/video-agent";
    import { getPendingAiVideoImport, type PendingAiVideoImport } from "$lib/api/ai-video";
    import { t } from "$lib/i18n/translations";
    import IconSparkles from "@tabler/icons-svelte/IconSparkles.svelte";
    import IconScissors from "@tabler/icons-svelte/IconScissors.svelte";
    import IconUpload from "@tabler/icons-svelte/IconUpload.svelte";
    import IconPlayerPlay from "@tabler/icons-svelte/IconPlayerPlay.svelte";
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
    let mounted = false;
    let loadKey = "";
    let epoch = 0;
    let uploadController: AbortController | null = null;
    let resumeSourceId: string | undefined;
    let fileInput: HTMLInputElement;
    let activePanel: "conversation" | "results" = "conversation";
    const exampleKeys = ["clips_example", "translation_example", "dubbing_example"];
    $: highlightLink = `/${$page.params.lang || "en"}/ai-video`;
    $: agentLink = `${highlightLink}/video-agent`;
    $: if (mounted && $clerkLoaded && `${$clerkUser?.id || ""}:${projectId}` !== loadKey) {
        loadKey = `${$clerkUser?.id || ""}:${projectId}`;
        uploadController?.abort();
        request = "";
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
        projects = []; sources = []; selectedProject = null; errorKey = ""; errorCode = ""; nextCursor = null; executionEnabled = false;
        if (!$clerkUser) { loading = false; return; }
        loading = true;
        try {
            const [listResult, detailResult, capabilitiesResult] = await Promise.allSettled([listAgentProjects(), projectId ? getAgentProject(projectId) : Promise.resolve(null), getAgentCapabilities()]);
            if (version !== epoch) return;
            if(capabilitiesResult.status === "fulfilled")executionEnabled = capabilitiesResult.value.executionEnabled;
            if (listResult.status === "fulfilled") { projects = listResult.value.projects; nextCursor = listResult.value.nextCursor; }
            else reportError(listResult.reason);
            if (detailResult.status === "fulfilled") { selectedProject = detailResult.value?.project || null; sources = detailResult.value?.sources || []; }
            else reportError(detailResult.reason);
        } catch (error) { if (version === epoch) reportError(error); }
        finally { if (version === epoch) loading = false; }
    };
    const refreshSources = async () => {
        const id = projectId;
        const version = epoch;
        if (!id || !$clerkUser) return;
        const detail = await getAgentProject(id);
        if (version === epoch && id === projectId) { selectedProject = detail.project; sources = detail.sources; }
    };
    const create = async () => {
        busy = true; errorKey = "";
        try { const result = await createAgentProject(title); title = ""; await goto(`${agentLink}/projects/${result.project.id}`); }
        catch (error) { reportError(error); } finally { busy = false; }
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
        if (!file || !selectedProject) return;
        if (file.size > 1024 ** 3) { errorKey = "file_too_large"; errorCode = ""; return; }
        const controller = new AbortController(); uploadController = controller;
        busy = true; progress = 0; errorKey = "";
        try { await uploadAgentSource({ projectId, file, sourceId: resumeSourceId, onProgress: (value) => { progress = value; }, signal: controller.signal }); }
        catch (error) { if (!controller.signal.aborted) reportError(error); }
        finally {
            uploadController = null; busy = false; progress = null;
            await refreshSources().catch(reportError);
        }
    };
    const importSource = async () => {
        pendingImport = getPendingAiVideoImport();
        if (!pendingImport || !selectedProject) return;
        busy = true; errorKey = "";
        try {
            await importAgentSource(projectId, pendingImport.token);
            sessionStorage.removeItem("fsv_ai_video_import_v1"); pendingImport = null;
            await refreshSources();
        } catch (error) { reportError(error); } finally { busy = false; }
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
        }, 5000);
        return () => { mounted = false; epoch++; clearInterval(timer); uploadController?.abort(); };
    });

    const chooseExample = (key: string) => {
        request = $t(`video-agent.${key}`);
        activePanel = "conversation";
    };
</script>

<main class="agent">
    <header class="hero">
        <div>
            <p class="eyebrow">{$t("video-agent.preview")}</p>
            <h1>Video Agent</h1>
            <p class="description">{$t("video-agent.description")}</p>
        </div>
        <div class="hero-icon" aria-hidden="true"><IconSparkles size={38} /></div>
    </header>

    <div class="preview-note" role="note">
        <IconSparkles size={19} aria-hidden="true" />
        <p>{$t(executionEnabled ? "video-agent.plan_controls_hint" : "video-agent.preview_note")}</p>
        <a href={highlightLink}>{$t("video-agent.open_highlight")}</a>
    </div>

    {#if $clerkLoaded && !$clerkUser}
        <button class="secondary account-action" on:click={() => signIn()}>{$t("video-agent.sign_in")}</button>
    {/if}
    {#if errorKey}<p class="error" role="alert">{$t(`video-agent.${errorKey}`)} {errorCode ? `(${errorCode})` : ""}</p>{/if}
    {#if loading}<p class="muted" role="status">{$t("video-agent.loading")}</p>{/if}

    <div class="workspace">
        <aside class="card projects" aria-labelledby="agent-projects-title">
            <div class="panel-heading">
                <h2 id="agent-projects-title">{$t("video-agent.projects")}</h2>
                <span class="count">{projects.length}</span>
            </div>
            <form class="project-create" on:submit|preventDefault={create}>
                <label for="agent-project-title">{$t("video-agent.project_title")}</label>
                <input id="agent-project-title" bind:value={title} maxlength={120} required disabled={busy || !$clerkUser} />
                <button class="primary" disabled={busy || !$clerkUser || !title.trim()}>{$t("video-agent.create_project")}</button>
            </form>
            {#if !projects.length}<p class="muted">{$t("video-agent.projects_empty")}</p>{/if}
            <div class="project-list">
                {#each projects as project (project.id)}
                    <a href={`${agentLink}/projects/${project.id}`} class:chosen={project.id === projectId} aria-current={project.id === projectId ? "page" : undefined}>{project.title}</a>
                {/each}
                {#if nextCursor}<button class="secondary" disabled={busy} on:click={more}>{$t("video-agent.load_more")}</button>{/if}
            </div>
            <div class="quota"><IconScissors size={18} aria-hidden="true" /><p>{$t("video-agent.shared_quota")}</p></div>
        </aside>

        <div class="panel-switch" role="group" aria-label="Video Agent">
            <button class:active={activePanel === "conversation"} aria-pressed={activePanel === "conversation"} aria-controls="agent-conversation" on:click={() => activePanel = "conversation"}>{$t("video-agent.conversation")}</button>
            <button class:active={activePanel === "results"} aria-pressed={activePanel === "results"} aria-controls="agent-results" on:click={() => activePanel = "results"}>{$t("video-agent.results")}</button>
        </div>

        <section id="agent-conversation" class="card conversation" class:mobile-hidden={activePanel !== "conversation"} aria-labelledby="agent-conversation-title">
            <div class="panel-heading"><h2 id="agent-conversation-title"><IconMessageCircle size={20} aria-hidden="true" />{$t("video-agent.conversation")}</h2></div>
            <div class="welcome">
                <IconSparkles size={26} aria-hidden="true" />
                <h3>{$t("video-agent.request_label")}</h3>
                <p class="muted">{$t("video-agent.request_placeholder")}</p>
            </div>
            <div class="examples" aria-label={$t("video-agent.examples")}>
                {#each exampleKeys as key}
                    <button class="example" on:click={() => chooseExample(key)}>{$t(`video-agent.${key}`)}</button>
                {/each}
            </div>
            <div class="composer">
                <h3>{selectedProject?.title || $t("video-agent.select_project")}</h3>
                <p class="muted">{$t("video-agent.source_retention")}</p>
                <input class="file-input" type="file" accept=".mp4,.mov,.webm,.mkv,.m4v" bind:this={fileInput} on:change={upload} aria-label={$t("video-agent.upload")} />
                <div class="source-actions">
                    <button type="button" class="secondary" disabled={busy || !selectedProject} on:click={() => chooseFile()}><IconUpload size={17} aria-hidden="true" />{$t("video-agent.upload")}</button>
                    {#if pendingImport}<button type="button" class="secondary" disabled={busy || !selectedProject} on:click={importSource}>{$t("video-agent.import_download")}: {pendingImport.filename}</button>{/if}
                </div>
                <p class="muted">{$t("video-agent.import_hint")} <a href={`/${$page.params.lang || "en"}/`}>{$t("video-agent.open_downloader")}</a></p>
                {#if progress !== null}
                    <div role="status">{$t("video-agent.upload_progress")}: {progress}%</div>
                    <progress value={progress} max="100">{progress}%</progress>
                    <button type="button" class="secondary" on:click={() => uploadController?.abort()}>{$t("video-agent.pause_upload")}</button>
                {/if}
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
                {#if selectedProject}<button type="button" class="secondary delete" disabled={busy} on:click={remove}>{$t("video-agent.delete_project")}</button>{/if}
                <label for="agent-request">{$t("video-agent.request_label")}</label>
                <textarea id="agent-request" bind:value={request} maxlength={4000} rows={5} placeholder={$t("video-agent.request_placeholder")} aria-describedby="agent-execution-note"></textarea>
                <div class="composer-actions">
                    <a href="#agent-results" on:click={()=>activePanel="results"}>{$t("video-agent.plan")}</a>
                </div>
                <p id="agent-execution-note" class="muted execution-note">{$t("video-agent.unavailable")}</p>
            </div>
        </section>

        <section id="agent-results" class="card result-panel" class:mobile-hidden={activePanel !== "results"} aria-labelledby="agent-results-title">
            <div class="panel-heading"><h2 id="agent-results-title">{$t("video-agent.results")}</h2></div>
            {#if selectedProject}
                {#key selectedProject.id}<AgentExecutionPanel project={selectedProject} {sources} on:changed={()=>refreshSources().catch(reportError)} />{/key}
            {:else}
            <div class="empty-results">
                <div class="empty-icon" aria-hidden="true"><IconPlayerPlay size={32} /></div>
                <h3>{$t("video-agent.results_empty")}</h3>
                <p class="muted">{$t("video-agent.results_hint")}</p>
            </div>
            <div class="plan">
                <h3>{$t("video-agent.plan")}</h3>
                <p class="muted">{$t("video-agent.plan_hint")}</p>
            </div>
            {/if}
        </section>
    </div>
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
    .workspace { display: grid; grid-template-columns: 210px minmax(320px, 400px) minmax(280px, 1fr); gap: 16px; align-items: stretch; }
    .card { min-width: 0; padding: 22px; border: 1px solid rgba(128,128,128,.18); border-radius: 20px; background: var(--button); box-shadow: 0 14px 40px rgba(25,35,18,.05); }
    .panel-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .count { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 8px; background: rgba(128,128,128,.1); font-size: 11px; }
    .muted { opacity: .68; font-size: 12px; margin: 0; }
    .projects { display: flex; flex-direction: column; }
    .quota { display: flex; align-items: flex-start; gap: 9px; margin-top: auto; padding-top: 32px; color: var(--text); opacity: .65; font-size: 11px; }
    .quota > :global(svg) { flex-shrink: 0; }
    .quota p { margin: 0; }
    .welcome { padding: 14px 0 18px; }
    .welcome > :global(svg) { color: var(--accent); margin-bottom: 14px; }
    .examples { display: grid; gap: 8px; margin-bottom: 22px; }
    button { display: inline-flex; justify-content: center; align-items: center; gap: 7px; font: inherit; cursor: pointer; border: 1px solid rgba(128,128,128,.22); border-radius: 10px; color: inherit; }
    .example { padding: 10px 12px; text-align: left; justify-content: flex-start; background: rgba(128,128,128,.04); line-height: 1.5; font-size: 11px; }
    .example:hover { background: rgba(var(--accent-rgb), .08); border-color: var(--accent); }
    .composer { border-top: 1px solid rgba(128,128,128,.15); padding-top: 20px; }
    label { display: block; font-size: 12px; font-weight: 650; margin-bottom: 8px; }
    input, textarea { width: 100%; box-sizing: border-box; border: 1px solid rgba(128,128,128,.25); border-radius: 11px; padding: 12px; font: inherit; font-size: 12px; line-height: 1.6; background: var(--background); color: var(--text); margin-bottom: 16px; }
    textarea { resize: vertical; min-height: 140px; }
    input:focus-visible, textarea:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    .composer-actions { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; }
    .composer-actions a { padding: 11px 13px; font-size: 12px; color: inherit; }
    .primary { background: var(--accent); color: white; border-color: transparent; }
    .secondary { background: transparent; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .execution-note { margin-top: 12px; font-size: 11px; }
    .result-panel { display: flex; flex-direction: column; }
    .empty-results { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; text-align: center; min-height: 300px; padding: 28px 8px; }
    .empty-results p { max-width: 340px; }
    .empty-icon { display: grid; place-items: center; width: 72px; height: 72px; margin-bottom: 22px; border-radius: 23px; color: var(--accent); background: rgba(var(--accent-rgb), .1); }
    .plan { border-top: 1px solid rgba(128,128,128,.15); padding-top: 20px; }
    .plan h3 { font-size: 13px; }
    .panel-switch { display: none; }
    .project-create { margin-bottom: 16px; }
    .project-create button, .source button, .account-action { padding: 9px 12px; font-size: 12px; }
    .project-list { display: grid; gap: 8px; max-height: 360px; overflow-y: auto; }
    .project-list a { padding: 9px; overflow-wrap: anywhere; color: inherit; border-radius: 9px; font-size: 12px; }
    .project-list a.chosen { background: rgba(var(--accent-rgb), .15); }
    .source-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
    .source-actions button { padding: 10px; font-size: 12px; overflow-wrap: anywhere; }
    .file-input { display: none; }
    .sources { display: grid; gap: 10px; margin: 16px 0; }
    .source { padding: 12px; border: 1px solid rgba(128,128,128,.2); border-radius: 10px; overflow-wrap: anywhere; font-size: 12px; }
    .source button { margin-top: 8px; }
    .error { color: #c0392b; font-size: 12px; overflow-wrap: anywhere; }
    .delete { padding: 8px; margin-bottom: 18px; font-size: 12px; }
    progress { width: 100%; }
    @media (max-width: 1180px) {
        .workspace { grid-template-columns: minmax(300px, 400px) minmax(280px, 1fr); }
        .projects { grid-column: 1 / -1; gap: 16px; }
        .projects .panel-heading { margin: 0; gap: 12px; flex-shrink: 0; }
        .quota { margin: 0 0 0 auto; padding: 0; max-width: 220px; }
    }
    @media (max-width: 760px) {
        .agent { width: calc(100% - 24px); padding-top: 24px; }
        .hero-icon { display: none; }
        .workspace { grid-template-columns: minmax(0, 1fr); }
        .projects { flex-wrap: wrap; padding: 16px; }
        .quota { max-width: none; flex-basis: 100%; margin: 0; }
        .panel-switch { display: flex; gap: 8px; }
        .panel-switch button { flex: 1; padding: 12px; background: var(--button); font-size: 12px; }
        .panel-switch button.active { border-color: var(--accent); background: rgba(var(--accent-rgb), .1); }
        .mobile-hidden { display: none; }
        .card { padding: 18px; border-radius: 16px; }
        .empty-results { min-height: 250px; }
    }
</style>
