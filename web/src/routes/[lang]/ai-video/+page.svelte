<script lang="ts">
    import { page } from "$app/stores";
    import { onDestroy, onMount } from "svelte";
    import { fetchMembershipFeatureEligibility } from "$lib/api/membership";
    import { signIn } from "$lib/state/clerk";
    import {
        cancelAiVideoJob,
        createAndUploadAiVideo,
        getAiVideoDraft,
        getAiVideoJob,
        listAiVideoJobs,
        retryAiVideoJob,
        saveAiVideoDraft,
        type AiVideoDraft,
        type AiVideoJob,
    } from "$lib/api/ai-video";

    const languages = ["de", "en", "es", "fr", "ja", "ko", "ru", "th", "vi", "zh"];
    const terminalStatuses = new Set(["draft_ready", "failed", "cancelled", "deleted"]);
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
    let timer: ReturnType<typeof setTimeout> | null = null;
    $: zh = $page.params.lang === "zh";

    const message = (en: string, cn: string) => zh ? cn : en;
    const setError = (value: unknown) => {
        error = value instanceof Error ? value.message : String(value);
        notice = "";
    };

    const refreshJobs = async () => {
        jobs = (await listAiVideoJobs()).jobs;
    };

    const loadDraft = async (jobId: string) => {
        draft = await getAiVideoDraft(jobId);
        activeJob = draft.job;
    };

    const poll = async (jobId: string) => {
        if (timer) clearTimeout(timer);
        try {
            const next = (await getAiVideoJob(jobId)).job;
            activeJob = next;
            jobs = [next, ...jobs.filter((item) => item.id !== next.id)];
            if (next.status === "draft_ready") await loadDraft(next.id);
            if (!terminalStatuses.has(next.status)) timer = setTimeout(() => poll(jobId), 2500);
        } catch (value) {
            setError(value);
        }
    };

    const selectJob = async (job: AiVideoJob) => {
        error = "";
        notice = "";
        activeJob = job;
        draft = null;
        if (job.status === "draft_ready") await loadDraft(job.id);
        else if (!terminalStatuses.has(job.status)) await poll(job.id);
    };

    const start = async () => {
        if (!file || busy) return;
        busy = true;
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

    onMount(async () => {
        try {
            const result = await fetchMembershipFeatureEligibility("ai_video_studio");
            eligible = result.eligible;
            eligibilityReason = result.reason;
            if (eligible) await refreshJobs();
        } catch (value) { setError(value); }
        finally { loading = false; }
    });
    onDestroy(() => { if (timer) clearTimeout(timer); });
</script>

<svelte:head><title>{message("AI Video Studio", "AI 视频工作室")}</title></svelte:head>

<main class="studio">
    <header>
        <p class="eyebrow">MEMBER STUDIO</p>
        <h1>{message("AI Video Studio", "AI 视频工作室")}</h1>
        <p>{message("Find highlight clips and create editable translated subtitles.", "自动提取精彩切片，并生成可编辑的翻译字幕。")}</p>
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
            <h2>{message("Create a draft", "创建 AI 草稿")}</h2>
            <label>{message("Video (max 1 GiB / 60 minutes)", "视频（最大 1 GiB / 60 分钟）")}
                <input type="file" accept="video/*" on:change={(event) => file = event.currentTarget.files?.[0] || null} />
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
            <p class="privacy">{message("Your video is uploaded to our server and sent to the configured AI provider for transcription and analysis. Source files are normally removed 24 hours after the task completes; draft metadata is retained for 30 days.", "你的视频会上传到服务器，并发送给配置的 AI 服务进行转写与分析。源文件通常在任务完成 24 小时后清理，草稿元数据保留 30 天。")}</p>
            <button disabled={!file || busy} on:click={start}>{busy ? message("Working...", "处理中……") : message("Upload and analyze", "上传并分析")}</button>
            {#if uploadProgress > 0 && uploadProgress < 1}<progress value={uploadProgress} max="1"></progress>{/if}
        </section>

        {#if error}<p class="alert error">{error}</p>{/if}
        {#if notice}<p class="alert success">{notice}</p>{/if}

        <div class="workspace">
            <aside class="card jobs">
                <h2>{message("Recent jobs", "最近任务")}</h2>
                {#if jobs.length === 0}<p class="muted">{message("No jobs yet.", "暂无任务。")}</p>{/if}
                {#each jobs as job}
                    <button class:active={activeJob?.id === job.id} on:click={() => selectJob(job)}>
                        <strong>{job.sourceFilename || job.id}</strong><span>{job.status} · {job.progress}%</span>
                    </button>
                {/each}
            </aside>

            <section class="card editor">
                {#if activeJob && !draft}
                    <h2>{message("Analysis progress", "分析进度")}</h2>
                    <p><strong>{activeJob.status}</strong>{#if activeJob.failedStage} · {activeJob.failedStage}{/if}</p>
                    <progress value={activeJob.progress} max="100"></progress>
                    {#if activeJob.status === "failed"}
                        <p class="error">{activeJob.errorCode || "AI_VIDEO_PROCESSING_FAILED"}</p>
                        {#if activeJob.errorRetryable}<button on:click={retry} disabled={busy}>{message("Retry failed stage", "重试失败阶段")}</button>{/if}
                    {:else if !terminalStatuses.has(activeJob.status)}
                        <button class="secondary" on:click={cancel} disabled={busy}>{message("Cancel", "取消")}</button>
                    {/if}
                {:else if draft}
                    <h2>{message("Highlight candidates", "精彩片段候选")}</h2>
                    <p class="muted">{message("Clips must remain between 15 and 90 seconds.", "每个切片必须保持在 15–90 秒之间。")}</p>
                    <div class="clips">
                        {#each draft.clips as clip}
                            <article>
                                <label class="check"><input type="checkbox" bind:checked={clip.enabled} /> {message("Include", "启用")}</label>
                                <input class="title" bind:value={clip.title} maxlength="160" />
                                <div class="times"><label>Start <input type="number" min="0" step="0.1" value={clip.startMs / 1000} on:change={(event) => clip.startMs = Math.round(Number(event.currentTarget.value) * 1000)} /></label><label>End <input type="number" min="15" step="0.1" value={clip.endMs / 1000} on:change={(event) => clip.endMs = Math.round(Number(event.currentTarget.value) * 1000)} /></label></div>
                                <p>{clip.reason}</p>
                            </article>
                        {/each}
                    </div>
                    <h2>{message("Translated subtitles", "翻译字幕")}</h2>
                    <div class="segments">
                        {#each draft.segments as segment}
                            <article><time>{(segment.startMs / 1000).toFixed(1)}–{(segment.endMs / 1000).toFixed(1)}s{segment.speaker ? ` · ${segment.speaker}` : ""}</time><p>{segment.sourceText}</p><textarea bind:value={segment.translatedText} maxlength="4000"></textarea></article>
                        {/each}
                    </div>
                    <div class="sticky"><button on:click={save} disabled={busy}>{message("Save draft", "保存草稿")}</button></div>
                {:else}
                    <h2>{message("Your draft will appear here", "草稿将在这里显示")}</h2>
                    <p class="muted">{message("Upload a video or choose a recent job.", "上传视频或选择一个最近任务。")}</p>
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
    button:disabled { opacity: .5; cursor: wait; } button.secondary { background: transparent; color: inherit; border: 1px solid rgba(128,128,128,.4); }
    progress { width: 100%; accent-color: var(--accent); } .workspace { display: grid; grid-template-columns: 260px 1fr; gap: 18px; margin-top: 18px; align-items: start; }
    .jobs { display: grid; gap: 8px; } .jobs button { width: 100%; background: transparent; color: inherit; text-align: left; display: grid; gap: 4px; border: 1px solid transparent; }
    .jobs button.active { border-color: var(--accent); background: rgba(var(--accent-rgb), .08); } .jobs span, .muted, time, .privacy { opacity: .72; font-size: 12px; }
    .editor { min-height: 260px; } .clips, .segments { display: grid; gap: 12px; margin-bottom: 24px; } .clips { grid-template-columns: repeat(3, 1fr); }
    article { border: 1px solid rgba(128,128,128,.22); border-radius: 13px; padding: 13px; } article p { line-height: 1.5; } .check { display: flex; align-items: center; } .check input { width: auto; }
    .title { margin: 10px 0; font-weight: 750; } .times { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } textarea { min-height: 76px; resize: vertical; }
    .sticky { position: sticky; bottom: 12px; display: flex; justify-content: flex-end; } .alert { border-radius: 12px; padding: 12px 16px; margin: 14px 0; } .error { color: #c43b3b; background: rgba(196,59,59,.09); } .success { color: #287b37; background: rgba(40,123,55,.09); }
    .gate { display: grid; gap: 10px; max-width: 620px; }
    @media (max-width: 820px) { .workspace { grid-template-columns: 1fr; } .clips { grid-template-columns: 1fr; } .jobs { max-height: 220px; overflow: auto; } }
    @media (max-width: 560px) { .studio { width: min(100% - 20px, 1180px); padding-top: 20px; } .fields { grid-template-columns: 1fr; } .card { padding: 15px; border-radius: 14px; } }
</style>
