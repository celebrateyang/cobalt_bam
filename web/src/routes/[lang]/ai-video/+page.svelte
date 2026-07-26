<script lang="ts">
    import { page } from "$app/stores";
    import { onDestroy, onMount } from "svelte";
    import { fetchMembershipFeatureEligibility } from "$lib/api/membership";
    import { signIn } from "$lib/state/clerk";
    import {
        cancelAiVideoJob,
        createAndUploadAiVideo,
        createImportedAiVideo,
        deleteAiVideoJob,
        getAiVideoDraft,
        getAiVideoJob,
        getAiVideoResults,
        getPendingAiVideoImport,
        listAiVideoJobs,
        queueAiVideoRender,
        retryAiVideoJob,
        saveAiVideoDraft,
        type AiVideoDraft,
        type AiVideoJob,
        type AiVideoResults,
        type PendingAiVideoImport,
    } from "$lib/api/ai-video";

    const languages = ["de", "en", "es", "fr", "ja", "ko", "ru", "th", "vi", "zh"];
    const terminalStatuses = new Set(["draft_ready", "completed", "failed", "cancelled", "deleted"]);
    const deletableStatuses = new Set(["draft_ready", "completed", "failed", "cancelled"]);
    let eligible: boolean | null = null;
    let eligibilityReason: string | null = null;
    let loading = true;
    let busy = false;
    let error = "";
    let notice = "";
    let file: File | null = null;
    let sourceLanguage = "auto";
    let targetLanguage = "en";
    let subtitleMode: "translated" | "bilingual" = "bilingual";
    let uploadProgress = 0;
    let jobs: AiVideoJob[] = [];
    let activeJob: AiVideoJob | null = null;
    let draft: AiVideoDraft | null = null;
    let results: AiVideoResults | null = null;
    let pendingImport: PendingAiVideoImport | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let resultTimer: ReturnType<typeof setTimeout> | null = null;
    let lastPreviewRefreshAt = 0;
    $: zh = $page.params.lang === "zh";
    $: previewFocus = draft?.clips.find((clip) => clip.enabled)?.focusX ?? 0.5;

    const message = (en: string, cn: string) => zh ? cn : en;
    const setError = (value: unknown) => {
        error = value instanceof Error ? value.message : String(value);
        notice = "";
    };

    const refreshJobs = async () => {
        jobs = (await listAiVideoJobs()).jobs;
    };

    const clearResultTimer = () => {
        if (resultTimer) clearTimeout(resultTimer);
        resultTimer = null;
    };

    const loadDraft = async (jobId: string) => {
        clearResultTimer();
        results = null;
        draft = await getAiVideoDraft(jobId);
        activeJob = draft.job;
    };

    const loadResults = async (jobId: string) => {
        clearResultTimer();
        draft = null;
        results = await getAiVideoResults(jobId);
        activeJob = results.job;
        resultTimer = setTimeout(() => {
            if (activeJob?.id === jobId && activeJob.status === "completed") void loadResults(jobId).catch(setError);
        }, 8 * 60 * 1000);
    };

    const refreshResultLinks = async () => {
        if (!results || Date.now() - lastPreviewRefreshAt < 30_000) return;
        lastPreviewRefreshAt = Date.now();
        try { await loadResults(results.job.id); }
        catch (value) { setError(value); }
    };

    const handleVisibilityChange = () => {
        if (!document.hidden && results) void refreshResultLinks();
    };

    const poll = async (jobId: string) => {
        if (timer) clearTimeout(timer);
        try {
            const next = (await getAiVideoJob(jobId)).job;
            activeJob = next;
            jobs = [next, ...jobs.filter((item) => item.id !== next.id)];
            if (next.status === "draft_ready") await loadDraft(next.id);
            if (next.status === "completed") await loadResults(next.id);
            if (!terminalStatuses.has(next.status)) timer = setTimeout(() => poll(jobId), document.hidden ? 10_000 : 2500);
        } catch (value) {
            setError(value);
        }
    };

    const selectJob = async (job: AiVideoJob) => {
        clearResultTimer();
        error = "";
        notice = "";
        activeJob = job;
        draft = null;
        results = null;
        if (job.status === "draft_ready") await loadDraft(job.id);
        else if (job.status === "completed") await loadResults(job.id);
        else if (!terminalStatuses.has(job.status)) await poll(job.id);
    };

    const startImport = async () => {
        if (!pendingImport || busy) return;
        busy = true;
        clearResultTimer();
        error = "";
        notice = "";
        draft = null;
        results = null;
        try {
            const job = await createImportedAiVideo({ token: pendingImport.token, sourceLanguage, targetLanguage, subtitleMode });
            pendingImport = null;
            activeJob = job;
            jobs = [job, ...jobs.filter((item) => item.id !== job.id)];
            await poll(job.id);
        } catch (value) { setError(value); }
        finally { busy = false; }
    };

    const start = async () => {
        if (!file || busy) return;
        busy = true;
        clearResultTimer();
        error = "";
        notice = "";
        draft = null;
        uploadProgress = 0;
        try {
            const job = await createAndUploadAiVideo({ file, sourceLanguage, targetLanguage, subtitleMode, onProgress: (value) => uploadProgress = value });
            activeJob = job;
            jobs = [job, ...jobs.filter((item) => item.id !== job.id)];
            await poll(job.id);
        } catch (value) {
            setError(value);
        } finally {
            busy = false;
        }
    };

    const save = async () => {
        if (!draft || busy) return;
        busy = true;
        error = "";
        try {
            const result = await saveAiVideoDraft(draft);
            draft.job = result.job;
            activeJob = result.job;
            draft = { ...draft, segments: [...draft.segments], clips: [...draft.clips] };
            notice = message("Draft saved.", "草稿已保存。");
        } catch (value) {
            setError(value);
            if ((value as { code?: string })?.code === "AI_VIDEO_DRAFT_REVISION_CONFLICT") await loadDraft(draft.job.id);
        } finally {
            busy = false;
        }
    };

    const renderDraft = async () => {
        if (!draft || busy || !draft.clips.some((clip) => clip.enabled)) return;
        busy = true;
        error = "";
        notice = "";
        try {
            const saved = await saveAiVideoDraft(draft);
            draft.job = saved.job;
            const queued = await queueAiVideoRender(draft.job.id, saved.job.draftRevision);
            activeJob = queued.job;
            jobs = [queued.job, ...jobs.filter((item) => item.id !== queued.job.id)];
            draft = null;
            await poll(queued.job.id);
        } catch (value) {
            setError(value);
            if ((value as { code?: string })?.code === "AI_VIDEO_DRAFT_REVISION_CONFLICT" && draft) await loadDraft(draft.job.id);
        } finally { busy = false; }
    };

    const retry = async () => {
        if (!activeJob || busy) return;
        busy = true;
        error = "";
        try {
            activeJob = (await retryAiVideoJob(activeJob.id)).job;
            await poll(activeJob.id);
        } catch (value) { setError(value); }
        finally { busy = false; }
    };

    const cancel = async () => {
        if (!activeJob || busy) return;
        busy = true;
        try { activeJob = (await cancelAiVideoJob(activeJob.id)).job; await refreshJobs(); }
        catch (value) { setError(value); }
        finally { busy = false; }
    };

    const removeJob = async (job: AiVideoJob) => {
        if (busy || !deletableStatuses.has(job.status)) return;
        if (!window.confirm(message("Delete this task and schedule all of its files for removal? Used membership minutes will not be restored.", "删除此任务并清理它的全部文件吗？已使用的会员分钟不会返还。"))) return;
        busy = true;
        error = "";
        try {
            await deleteAiVideoJob(job.id);
            jobs = jobs.filter((item) => item.id !== job.id);
            if (activeJob?.id === job.id) {
                clearResultTimer();
                activeJob = null;
                draft = null;
                results = null;
            }
            notice = message("Task deleted. Stored files are being removed in the background.", "任务已删除，相关文件正在后台清理。");
        } catch (value) { setError(value); }
        finally { busy = false; }
    };

    onMount(async () => {
        document.addEventListener("visibilitychange", handleVisibilityChange);
        try {
            const result = await fetchMembershipFeatureEligibility("ai_video_studio");
            eligible = result.eligible;
            eligibilityReason = result.reason;
            if (eligible) {
                pendingImport = getPendingAiVideoImport();
                await refreshJobs();
                const running = jobs.find((job) => !terminalStatuses.has(job.status));
                if (running) await selectJob(running);
            }
        } catch (value) { setError(value); }
        finally { loading = false; }
    });
    onDestroy(() => {
        if (typeof document !== "undefined") document.removeEventListener("visibilitychange", handleVisibilityChange);
        if (timer) clearTimeout(timer);
        clearResultTimer();
        if (draft && !busy) void save();
    });
</script>

<svelte:head><title>{message("AI Video Studio", "AI 视频工作室")}</title></svelte:head>

<main class="studio">
    <header class="hero">
        <div>
            <p class="eyebrow"><span></span> MEMBER STUDIO</p>
            <h1>{message("AI Video Studio", "AI 视频工作室")}</h1>
            <p class="hero-copy">{message("Turn long videos into polished short clips with translated subtitles.", "从长视频中自动发现高光，快速生成带翻译字幕的精彩短片。")}</p>
        </div>
        <div class="hero-badge" aria-hidden="true">
            <span>AI</span>
            <svg viewBox="0 0 24 24"><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></svg>
        </div>
    </header>

    {#if loading}
        <section class="card">{message("Checking membership...", "正在检查会员状态……")}</section>
    {:else if !eligible}
        <section class="card gate">
            <h2>{message("Membership required", "仅会员可使用")}</h2>
            <p>{message("You can explore this feature, but processing a video requires an active membership.", "你可以查看该功能，但正式处理视频需要有效会员。")}</p>
            {#if eligibilityReason === "SIGN_IN_REQUIRED"}
                <button on:click={() => signIn()}>{message("Sign in", "登录")}</button>
            {:else}
                <a class="button" href="/{$page.params.lang}/account#membership">{message("View membership", "查看会员")}</a>
            {/if}
        </section>
    {:else}
        <section class="card uploader">
            <div class="section-heading">
                <span class="step">01</span>
                <div><h2>{message("Create a draft", "创建 AI 草稿")}</h2><p>{message("Upload a source video to begin", "上传视频，AI 将自动完成分析与切片")}</p></div>
            </div>
            <label class="dropzone" class:has-file={file}>
                <input class="file-input" type="file" accept="video/*" on:change={(event) => file = event.currentTarget.files?.[0] || null} />
                <span class="upload-icon"><svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 15v4h14v-4"/></svg></span>
                <span class="drop-copy">
                    <strong>{file ? file.name : message("Choose a video to upload", "点击选择要上传的视频")}</strong>
                    <small>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : message("MP4, MOV, WebM · up to 1 GiB / 60 minutes", "支持 MP4、MOV、WebM · 最大 1 GiB / 60 分钟")}</small>
                </span>
                <span class="choose-button">{file ? message("Replace", "更换视频") : message("Browse", "选择文件")}</span>
            </label>
            <div class="fields">
                <label>{message("Spoken language", "原始语言")}
                    <select bind:value={sourceLanguage}><option value="auto">Auto</option>{#each languages as lang}<option value={lang}>{lang.toUpperCase()}</option>{/each}</select>
                </label>
                <label>{message("Translate to", "翻译为")}
                    <select bind:value={targetLanguage}>{#each languages as lang}<option value={lang}>{lang.toUpperCase()}</option>{/each}</select>
                </label>
                <label>{message("Subtitle style", "字幕模式")}
                    <select bind:value={subtitleMode}><option value="bilingual">Bilingual</option><option value="translated">Translated</option></select>
                </label>
            </div>
            <p class="privacy"><svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>{message("Your source file is normally removed 24 hours after completion. Draft metadata is retained for 30 days.", "源文件通常在任务完成 24 小时后自动清理，草稿数据保留 30 天。")}</p>
            <div class="actions"><button disabled={!file || busy} on:click={start}>{busy ? message("Working...", "处理中……") : message("Upload and analyze", "上传并分析")}</button>
                {#if pendingImport}<button class="secondary" disabled={busy} on:click={startImport}>{message(`Analyze recent download: ${pendingImport.filename}`, `分析最近下载：${pendingImport.filename}`)}</button>{/if}
            </div>
            {#if uploadProgress > 0 && uploadProgress < 1}<progress value={uploadProgress} max="1"></progress>{/if}
        </section>

        {#if error}<p class="alert error">{error}</p>{/if}
        {#if notice}<p class="alert success">{notice}</p>{/if}

        <div class="workspace">
            <aside class="card jobs">
                <div class="panel-heading"><div><span class="step">02</span><h2>{message("Recent jobs", "最近任务")}</h2></div><span class="count">{jobs.length}</span></div>
                {#if jobs.length === 0}<p class="muted">{message("No jobs yet.", "暂无任务。")}</p>{/if}
                {#each jobs as job}
                    <div class="job-row">
                        <button class="job-select" class:active={activeJob?.id === job.id} on:click={() => selectJob(job)}>
                            <strong>{job.sourceFilename || job.id}</strong><span>{job.status} · {job.progress}%</span>
                        </button>
                        {#if deletableStatuses.has(job.status)}
                            <button class="job-delete" aria-label={message("Delete task", "删除任务")} title={message("Delete task", "删除任务")} disabled={busy} on:click={() => removeJob(job)}>×</button>
                        {/if}
                    </div>
                {/each}
            </aside>

            <section class="card editor">
                {#if activeJob && !draft && !results}
                    <h2>{message("Task progress", "任务进度")}</h2>
                    <p><strong>{activeJob.status}</strong>{#if activeJob.failedStage} · {activeJob.failedStage}{/if}</p>
                    <progress value={activeJob.progress} max="100"></progress>
                    {#if activeJob.status === "failed"}
                        <p class="error">{activeJob.errorCode || "AI_VIDEO_PROCESSING_FAILED"}</p>
                        {#if activeJob.errorRetryable}<button on:click={retry} disabled={busy}>{message("Retry failed stage", "重试失败阶段")}</button>{/if}
                    {:else if !terminalStatuses.has(activeJob.status)}
                        <button class="secondary" on:click={cancel} disabled={busy}>{message("Cancel", "取消")}</button>
                    {/if}
                {:else if draft}
                    <div class="source-preview"><!-- svelte-ignore a11y-media-has-caption --><video src={draft.sourcePreviewUrl} controls preload="metadata" style:object-position={`${previewFocus * 100}% 50%`}></video></div>
                    <h2>{message("Highlight candidates", "精彩片段候选")}</h2>
                    <p class="muted">{message("Clips must remain between 15 and 90 seconds.", "每个切片必须保持在 15–90 秒之间。")}</p>
                    <div class="clips">
                        {#each draft.clips as clip}
                            <article>
                                <label class="check"><input type="checkbox" bind:checked={clip.enabled} /> {message("Include", "启用")}</label>
                                <input class="title" bind:value={clip.title} maxlength="120" />
                                <div class="times"><label>Start <input type="number" min="0" step="0.1" value={clip.startMs / 1000} on:change={(event) => clip.startMs = Math.round(Number(event.currentTarget.value) * 1000)} /></label><label>End <input type="number" min="15" step="0.1" value={clip.endMs / 1000} on:change={(event) => clip.endMs = Math.round(Number(event.currentTarget.value) * 1000)} /></label></div>
                                <label>{message("Horizontal focus", "水平焦点")}<input type="range" min="0" max="1" step="0.01" bind:value={clip.focusX} /></label>
                                <p class="clip-summary"><strong>{message("Summary", "亮点摘要")}:</strong> {clip.reason}</p>
                            </article>
                        {/each}
                    </div>
                    <h2>{message("Translated subtitles", "翻译字幕")}</h2>
                    <div class="segments">
                        {#each draft.segments as segment}
                            <article><time>{(segment.startMs / 1000).toFixed(1)}–{(segment.endMs / 1000).toFixed(1)}s{segment.speaker ? ` · ${segment.speaker}` : ""}</time><p>{segment.sourceText}</p><textarea bind:value={segment.translatedText} maxlength="4000"></textarea></article>
                        {/each}
                    </div>
                    <div class="sticky actions"><button class="secondary" on:click={save} disabled={busy}>{message("Save draft", "保存草稿")}</button><button on:click={renderDraft} disabled={busy || !draft.clips.some((clip) => clip.enabled)}>{message("Render vertical videos", "生成竖屏视频")}</button></div>
                {:else if results}
                    <h2>{message("Rendered clips", "生成结果")}</h2>
                    <p class="muted">{message("Download links are refreshed for 10 minutes. Files are retained for 7 days.", "下载链接每次刷新后有效 10 分钟，文件保留 7 天。")}</p>
                    <div class="results">
                        {#each results.assets.filter((asset) => asset.kind === "output") as output}
                            <article>
                                {#if output.previewUrl}<!-- svelte-ignore a11y-media-has-caption --><video src={output.previewUrl} controls playsinline preload="metadata" on:error={refreshResultLinks}></video>{/if}
                                <h3>{output.title || output.filename}</h3>
                                {#if output.summary}<p class="result-summary">{output.summary}</p>{/if}
                                <div class="actions">
                                    <a class="button" href={output.downloadUrl}>{message("Download MP4", "下载 MP4")}</a>
                                    {#each results.assets.filter((asset) => asset.clipId === output.clipId && asset.kind !== "output") as subtitle}
                                        <a class="button secondary-link" href={subtitle.downloadUrl}>{subtitle.kind.toUpperCase()}</a>
                                    {/each}
                                </div>
                            </article>
                        {/each}
                    </div>
                {:else}
                    <div class="empty-state">
                        <div class="empty-visual"><svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="m10 9 5 3-5 3V9Z"/></svg><span>✦</span></div>
                        <p class="eyebrow">{message("READY WHEN YOU ARE", "等待创作")}</p>
                        <h2>{message("Your AI draft will appear here", "AI 草稿将在这里生成")}</h2>
                        <p class="muted">{message("Upload a video above or select a recent job to continue.", "上传视频开始创作，或从左侧选择一项最近任务。")}</p>
                        <div class="flow"><span>{message("Upload", "上传")}</span><i>→</i><span>{message("Analyze", "分析")}</span><i>→</i><span>{message("Edit & export", "编辑导出")}</span></div>
                    </div>
                {/if}
            </section>
        </div>
    {/if}
</main>

<style>
    .studio { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 36px 0 80px; color: var(--text); }
    header { margin-bottom: 22px; } h1 { margin: 4px 0 8px; font-size: clamp(30px, 5vw, 52px); } h2 { margin: 0 0 14px; font-size: 19px; }
    .eyebrow { color: var(--accent); font-weight: 800; letter-spacing: .14em; font-size: 12px; }
    .card { background: var(--button); border: 1px solid rgba(128,128,128,.2); border-radius: 18px; padding: 20px; box-shadow: 0 14px 34px rgba(0,0,0,.06); }
    .uploader { display: grid; gap: 16px; } label { display: grid; gap: 7px; font-size: 13px; font-weight: 650; }
    .fields { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    input, select, textarea { box-sizing: border-box; width: 100%; border: 1px solid rgba(128,128,128,.35); border-radius: 10px; padding: 10px; color: inherit; background: var(--background); }
    button, .button { border: 0; border-radius: 11px; padding: 11px 16px; color: white; background: var(--accent); font-weight: 750; cursor: pointer; text-decoration: none; width: fit-content; }
    button:disabled { opacity: .5; cursor: wait; } button.secondary, .secondary-link { background: transparent; color: inherit; border: 1px solid rgba(128,128,128,.4); }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    progress { width: 100%; accent-color: var(--accent); } .workspace { display: grid; grid-template-columns: 260px 1fr; gap: 18px; margin-top: 18px; align-items: start; }
    .jobs { display: grid; gap: 8px; } .job-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: stretch; gap: 4px; } .jobs .job-select { width: 100%; background: transparent; color: inherit; text-align: left; display: grid; gap: 4px; border: 1px solid transparent; min-width: 0; }
    .jobs .job-select.active { border-color: var(--accent); background: rgba(var(--accent-rgb), .08); } .jobs .job-delete { width: 34px; padding: 0; color: #b33; background: transparent; border: 1px solid rgba(179,51,51,.22); font-size: 20px; } .jobs span, .muted, time, .privacy { opacity: .72; font-size: 12px; }
    .editor { min-height: 260px; } .clips, .segments { display: grid; gap: 12px; margin-bottom: 24px; } .clips { grid-template-columns: repeat(3, 1fr); }
    article { border: 1px solid rgba(128,128,128,.22); border-radius: 13px; padding: 13px; } article p { line-height: 1.5; } .clip-summary { font-size: 13px; opacity: .82; } .check { display: flex; align-items: center; } .check input { width: auto; }
    .title { margin: 10px 0; font-weight: 750; } .times { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } textarea { min-height: 76px; resize: vertical; }
    .sticky { position: sticky; bottom: 12px; display: flex; justify-content: flex-end; } .alert { border-radius: 12px; padding: 12px 16px; margin: 14px 0; } .error { color: #c43b3b; background: rgba(196,59,59,.09); } .success { color: #287b37; background: rgba(40,123,55,.09); }
    .source-preview { width: min(320px, 100%); aspect-ratio: 9 / 16; margin: 0 auto 22px; overflow: hidden; border-radius: 16px; background: #000; } .source-preview video { width: 100%; height: 100%; object-fit: cover; }
    .results { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; } .results video { width: 100%; aspect-ratio: 9 / 16; object-fit: cover; border-radius: 10px; background: #000; } .results h3 { margin: 10px 0 6px; } .result-summary { margin: 0 0 12px; line-height: 1.45; font-size: 13px; opacity: .82; }
    .gate { display: grid; gap: 10px; max-width: 620px; }
    @media (max-width: 820px) { .workspace { grid-template-columns: 1fr; } .clips, .results { grid-template-columns: 1fr; } .jobs { max-height: 220px; overflow: auto; } }
    @media (max-width: 560px) { .studio { width: min(100% - 20px, 1180px); padding-top: 20px; } .fields { grid-template-columns: 1fr; } .card { padding: 15px; border-radius: 14px; } }

    /* Refined studio shell */
    .studio { width: min(1180px, calc(100% - 40px)); padding-top: 44px; }
    .hero { display: flex; justify-content: space-between; align-items: center; gap: 30px; margin-bottom: 30px; }
    .hero h1 { margin: 7px 0 10px; font-size: clamp(36px, 5vw, 56px); line-height: 1.05; letter-spacing: -.045em; }
    .hero-copy { max-width: 640px; margin: 0; font-size: 15px; line-height: 1.7; opacity: .68; }
    .eyebrow { margin: 0; font-size: 11px; font-weight: 850; }
    .eyebrow > span { display: inline-block; width: 18px; height: 2px; margin: 0 7px 3px 0; background: currentColor; }
    .hero-badge { position: relative; display: grid; width: 104px; height: 104px; flex: 0 0 auto; place-items: center; border-radius: 30px; color: #fff; background: linear-gradient(145deg, var(--accent), #96c45a); box-shadow: 0 18px 45px rgba(var(--accent-rgb), .25); transform: rotate(3deg); }
    .hero-badge > span { font-size: 34px; font-weight: 900; letter-spacing: -.08em; }
    .hero-badge svg { position: absolute; top: 10px; right: 10px; width: 27px; fill: none; stroke: currentColor; stroke-width: 1.5; }
    .card { border-color: rgba(128,128,128,.16); border-radius: 22px; padding: 24px; box-shadow: 0 18px 50px rgba(25,35,18,.055); }
    .uploader { gap: 20px; }
    .section-heading, .panel-heading, .panel-heading > div { display: flex; align-items: center; gap: 11px; }
    .section-heading p { margin: 5px 0 0; font-size: 12px; opacity: .58; }
    .step { display: grid; width: 34px; height: 34px; flex: 0 0 auto; place-items: center; border-radius: 11px; color: var(--accent); background: rgba(var(--accent-rgb), .11); font-size: 11px; font-weight: 850; }
    .dropzone { display: flex; min-height: 82px; align-items: center; gap: 16px; padding: 15px 18px; border: 1.5px dashed rgba(var(--accent-rgb), .42); border-radius: 16px; background: rgba(var(--accent-rgb), .035); cursor: pointer; transition: .2s ease; }
    .dropzone:hover, .dropzone.has-file { border-color: var(--accent); background: rgba(var(--accent-rgb), .07); transform: translateY(-1px); }
    .file-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
    .upload-icon { display: grid; width: 50px; height: 50px; flex: 0 0 auto; place-items: center; border-radius: 15px; color: var(--accent); background: rgba(var(--accent-rgb), .12); }
    .upload-icon svg { width: 24px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .drop-copy { display: grid; min-width: 0; flex: 1; gap: 5px; }
    .drop-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
    .drop-copy small { opacity: .58; font-weight: 500; }
    .choose-button { padding: 9px 13px; border: 1px solid rgba(128,128,128,.2); border-radius: 10px; background: var(--button); font-size: 12px; }
    input, select, textarea { border-color: rgba(128,128,128,.24); border-radius: 12px; padding: 11px 12px; outline: none; transition: .2s; }
    input:focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(var(--accent-rgb), .1); }
    button, .button { border-radius: 12px; padding: 12px 18px; box-shadow: 0 6px 16px rgba(var(--accent-rgb), .17); transition: .18s ease; }
    button:not(:disabled):hover, .button:hover { filter: brightness(.97); transform: translateY(-1px); }
    .privacy { display: flex; align-items: center; gap: 8px; margin: 0; line-height: 1.5; }
    .privacy svg { width: 17px; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
    .workspace { grid-template-columns: 280px minmax(0, 1fr); align-items: stretch; }
    .panel-heading { justify-content: space-between; margin-bottom: 8px; }
    .count { display: grid; min-width: 25px; height: 25px; place-items: center; border-radius: 9px; background: rgba(128,128,128,.1); font-size: 11px; font-weight: 800; }
    .jobs { align-content: start; }
    .jobs .job-select { border-color: rgba(128,128,128,.1); background: rgba(128,128,128,.035); box-shadow: none; }
    .jobs .job-select strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .editor { min-height: 320px; }
    .empty-state { display: flex; min-height: 270px; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    .empty-visual { position: relative; display: grid; width: 72px; height: 72px; margin-bottom: 18px; place-items: center; border-radius: 23px; color: var(--accent); background: rgba(var(--accent-rgb), .1); }
    .empty-visual svg { width: 35px; fill: none; stroke: currentColor; stroke-width: 1.5; }
    .empty-visual span { position: absolute; top: -10px; right: -6px; font-size: 23px; }
    .empty-state h2 { margin: 8px 0; font-size: 22px; }
    .empty-state > .muted { max-width: 420px; margin: 0; line-height: 1.6; }
    .flow { display: flex; align-items: center; gap: 9px; margin-top: 24px; }
    .flow span { padding: 7px 10px; border-radius: 8px; background: rgba(128,128,128,.075); font-size: 11px; font-weight: 750; }
    .flow i { opacity: .35; font-style: normal; }
    @media (max-width: 820px) { .workspace { grid-template-columns: 1fr; } .hero-badge { width: 82px; height: 82px; border-radius: 24px; } }
    @media (max-width: 560px) { .studio { width: min(100% - 20px, 1180px); padding-top: 24px; } .hero { align-items: flex-start; } .hero-badge { display: none; } .card { padding: 16px; border-radius: 17px; } .dropzone { align-items: flex-start; flex-wrap: wrap; } .drop-copy { width: calc(100% - 70px); } .choose-button { margin-left: 66px; } .flow { gap: 5px; } .flow span { padding: 6px 7px; } }
</style>
