<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";

    import { currentApiURL } from "$lib/api/api-url";
    import { auth } from "$lib/api/social";

    type AssetUser = {
        id: number;
        clerkUserId: string;
        primaryEmail: string | null;
        fullName: string | null;
        avatarUrl: string | null;
    };

    type AiVideoAsset = {
        id: string;
        product: "highlight" | "video_agent";
        jobId: string | null;
        projectId: string | null;
        projectTitle: string | null;
        runId: string | null;
        userId: number;
        kind: string;
        kindGroup: "source" | "output" | "subtitle" | "other";
        assetStatus: string | null;
        previewable: boolean;
        objectKey: string;
        objectGeneration: string;
        mime: string | null;
        sizeBytes: number | null;
        expiresAt: number | null;
        cleanupStatus: string;
        cleanupAttempts: number;
        cleanupAfter: number | null;
        createdAt: number;
        sourceFilename: string | null;
        sourceKind: string;
        sourceDurationMs: number | null;
        sourceWidth: number | null;
        sourceHeight: number | null;
        jobStatus: string;
        jobCreatedAt: number;
        jobCompletedAt: number | null;
        user: AssetUser;
    };

    type StorageSummary = {
        objectCount: number;
        jobCount: number;
        userCount: number;
        totalSizeBytes: number;
        sourceSizeBytes: number;
        outputSizeBytes: number;
        subtitleSizeBytes: number;
        intermediateSizeBytes: number;
        highlightCount: number;
        agentCount: number;
        pendingCleanupSizeBytes: number;
        pendingCleanupCount: number;
    };

    const emptySummary: StorageSummary = {
        objectCount: 0,
        jobCount: 0,
        userCount: 0,
        totalSizeBytes: 0,
        sourceSizeBytes: 0,
        outputSizeBytes: 0,
        subtitleSizeBytes: 0,
        intermediateSizeBytes: 0,
        highlightCount: 0,
        agentCount: 0,
        pendingCleanupSizeBytes: 0,
        pendingCleanupCount: 0,
    };

    let assets: AiVideoAsset[] = [];
    let summary = emptySummary;
    let loading = true;
    let summaryLoading = true;
    let error = "";
    let search = "";
    let product = "";
    let kindGroup = "";
    let jobStatus = "";
    let cleanupStatus = "";
    let rangeDays = 30;
    let pageNum = 1;
    let limit = 20;
    let total = 0;
    let pages = 0;
    let previewLoadingId = "";
    let previewErrors: Record<string, string> = {};
    let copiedId = "";

    $: lang = $page.params.lang;

    const getToken = () =>
        typeof window !== "undefined"
            ? window.localStorage.getItem("admin_token")
            : null;

    onMount(async () => {
        const verified = await auth.verify();
        if (verified.status !== "success") {
            goto(`/${lang}/console-manage-2025`);
            return;
        }
        await Promise.all([loadSummary(), loadAssets()]);
    });

    function formatDate(timestamp: number | null | undefined) {
        if (timestamp == null || !Number.isFinite(timestamp)) return "-";
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) return "-";
        return new Intl.DateTimeFormat("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        }).format(date);
    }

    function formatBytes(bytes: number | null | undefined) {
        if (bytes == null || !Number.isFinite(bytes)) return "-";
        if (bytes === 0) return "0 B";
        const units = ["B", "KB", "MB", "GB", "TB"];
        const unitIndex = Math.min(
            Math.floor(Math.log(bytes) / Math.log(1024)),
            units.length - 1,
        );
        const value = bytes / 1024 ** unitIndex;
        return `${value.toFixed(unitIndex === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
    }

    function formatDuration(durationMs: number | null) {
        if (durationMs == null) return "-";
        const totalSeconds = Math.round(durationMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return hours
            ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
            : `${minutes}:${String(seconds).padStart(2, "0")}`;
    }

    function kindLabel(value: string) {
        return {
            source: "源视频",
            output: "生成视频",
            srt: "SRT 字幕",
            vtt: "VTT 字幕",
            ass: "ASS 字幕",
            rendered_video: "生成视频",
            subtitle_srt: "SRT 字幕",
            subtitle_vtt: "VTT 字幕",
            subtitle_ass: "ASS 字幕",
            dub_audio: "配音音频",
            tts_audio: "TTS 音频",
            audio_chunk: "音频片段",
            transcript: "转写文本",
            asr_raw: "转写原始数据",
            checkpoint: "处理记录",
        }[value] || value;
    }

    const assetKey = (asset: AiVideoAsset) => `${asset.product}:${asset.id}`;

    function rangeStart() {
        return rangeDays > 0 ? Date.now() - rangeDays * 24 * 60 * 60 * 1000 : null;
    }

    async function adminFetch(path: string, init?: RequestInit) {
        const token = getToken();
        if (!token) {
            await goto(`/${lang}/console-manage-2025`);
            throw new Error("管理员登录已失效");
        }
        const response = await fetch(`${currentApiURL()}${path}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${token}`,
                ...init?.headers,
            },
        });
        if (response.status === 401) {
            auth.logout();
            await goto(`/${lang}/console-manage-2025`);
            throw new Error("管理员登录已失效");
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.status !== "success") {
            throw new Error(data?.error?.message || "请求失败");
        }
        return data.data;
    }

    async function loadSummary() {
        summaryLoading = true;
        try {
            const data = await adminFetch("/user/admin/ai-video/storage/summary");
            summary = data?.summary || emptySummary;
        } catch (caught) {
            error = caught instanceof Error ? caught.message : "汇总信息加载失败";
        } finally {
            summaryLoading = false;
        }
    }

    async function loadAssets() {
        loading = true;
        error = "";
        try {
            const params = new URLSearchParams({
                page: String(pageNum),
                limit: String(limit),
                sort: "created_at",
                order: "desc",
            });
            if (search.trim()) params.set("search", search.trim());
            if (product) params.set("product", product);
            if (kindGroup) params.set("kindGroup", kindGroup);
            if (jobStatus) params.set("jobStatus", jobStatus);
            if (cleanupStatus) params.set("cleanupStatus", cleanupStatus);
            const from = rangeStart();
            if (from) params.set("createdFrom", String(from));

            const data = await adminFetch(
                `/user/admin/ai-video/storage?${params.toString()}`,
            );
            assets = Array.isArray(data?.assets) ? data.assets : [];
            total = Number(data?.pagination?.total || 0);
            pages = Number(data?.pagination?.pages || 0);
            pageNum = Number(data?.pagination?.page || pageNum);
        } catch (caught) {
            assets = [];
            error = caught instanceof Error ? caught.message : "文件列表加载失败";
        } finally {
            loading = false;
        }
    }

    async function applyFilters() {
        pageNum = 1;
        await loadAssets();
    }

    async function changePage(nextPage: number) {
        if (loading || nextPage < 1 || (pages && nextPage > pages)) return;
        pageNum = nextPage;
        await loadAssets();
    }

    async function changeLimit() {
        pageNum = 1;
        await loadAssets();
    }

    async function openPreview(asset: AiVideoAsset) {
        const key = assetKey(asset);
        const previewWindow = window.open("", "_blank");
        if (!previewWindow) {
            previewErrors = {
                ...previewErrors,
                [key]: "浏览器阻止了预览窗口，请允许弹窗后重试",
            };
            return;
        }
        previewWindow.opener = null;
        previewLoadingId = key;
        previewErrors = { ...previewErrors, [key]: "" };
        try {
            const data = await adminFetch(
                `/user/admin/ai-video/storage/${asset.id}/preview-url?product=${asset.product}`,
                { method: "POST" },
            );
            previewWindow.location.replace(data.url);
        } catch (caught) {
            previewWindow.close();
            previewErrors = {
                ...previewErrors,
                [key]: caught instanceof Error ? caught.message : "预览失败",
            };
        } finally {
            previewLoadingId = "";
        }
    }

    async function copyObjectKey(asset: AiVideoAsset) {
        const key = assetKey(asset);
        try {
            await navigator.clipboard.writeText(asset.objectKey);
            copiedId = key;
            window.setTimeout(() => {
                if (copiedId === key) copiedId = "";
            }, 1500);
        } catch {
            previewErrors = { ...previewErrors, [key]: "复制 Object Key 失败" };
        }
    }
</script>

<svelte:head>
    <title>AI 视频存储 - console-manage-2025</title>
</svelte:head>

<div class="admin-container">
    <header class="admin-header">
        <div>
            <h1>AI 视频存储</h1>
            <p>查看高光剪辑与 Video Agent 的素材、成片、字幕和处理文件。</p>
        </div>
        <button
            class="btn-secondary"
            type="button"
            disabled={loading || summaryLoading}
            on:click={() => Promise.all([loadSummary(), loadAssets()])}
        >
            刷新
        </button>
    </header>

    <section class="summary-grid" aria-label="存储汇总">
        <article class="summary-card">
            <span>对象数量</span>
            <strong>{summaryLoading ? "…" : summary.objectCount}</strong>
            <small>高光剪辑 {summary.highlightCount} / Video Agent {summary.agentCount} · {summary.jobCount} 个任务或项目 / {summary.userCount} 个用户</small>
        </article>
        <article class="summary-card">
            <span>总存储容量</span>
            <strong>{summaryLoading ? "…" : formatBytes(summary.totalSizeBytes)}</strong>
            <small>数据库中未删除的资产 · 处理文件 {formatBytes(summary.intermediateSizeBytes)}</small>
        </article>
        <article class="summary-card">
            <span>源视频</span>
            <strong>{summaryLoading ? "…" : formatBytes(summary.sourceSizeBytes)}</strong>
            <small>用户上传或导入的视频</small>
        </article>
        <article class="summary-card">
            <span>生成内容</span>
            <strong>{summaryLoading ? "…" : formatBytes(summary.outputSizeBytes)}</strong>
            <small>字幕 {formatBytes(summary.subtitleSizeBytes)}</small>
        </article>
        <article class="summary-card warning">
            <span>待清理</span>
            <strong>{summaryLoading ? "…" : formatBytes(summary.pendingCleanupSizeBytes)}</strong>
            <small>{summary.pendingCleanupCount} 个对象</small>
        </article>
    </section>

    <div class="toolbar">
        <input
            type="search"
            placeholder="邮箱、用户 ID、文件名、项目/运行 ID、Object Key"
            bind:value={search}
            on:keydown={(event) => event.key === "Enter" && applyFilters()}
        />
        <select bind:value={product} on:change={applyFilters} aria-label="所属产品">
            <option value="">全部产品</option>
            <option value="highlight">高光剪辑</option>
            <option value="video_agent">Video Agent</option>
        </select>
        <select bind:value={kindGroup} on:change={applyFilters} aria-label="文件类型">
            <option value="">全部文件类型</option>
            <option value="source">源视频</option>
            <option value="output">生成视频</option>
            <option value="subtitle">字幕</option>
            <option value="other">处理文件</option>
        </select>
        <select bind:value={jobStatus} on:change={applyFilters} aria-label="任务状态">
            <option value="">全部任务状态</option>
            <option value="uploading">uploading</option>
            <option value="queued_ingest">queued_ingest</option>
            <option value="ingesting">ingesting</option>
            <option value="transcribing">transcribing</option>
            <option value="analyzing">analyzing</option>
            <option value="draft_ready">draft_ready</option>
            <option value="rendering">rendering</option>
            <option value="ready">ready</option>
            <option value="running">running</option>
            <option value="partially_completed">partially_completed</option>
            <option value="completed">completed</option>
            <option value="failed">failed</option>
            <option value="cancelled">cancelled</option>
        </select>
        <select bind:value={cleanupStatus} on:change={applyFilters} aria-label="清理状态">
            <option value="">全部清理状态</option>
            <option value="active">active</option>
            <option value="pending">pending</option>
            <option value="retry">retry</option>
        </select>
        <select bind:value={rangeDays} on:change={applyFilters} aria-label="上传时间">
            <option value={1}>最近 24 小时</option>
            <option value={7}>最近 7 天</option>
            <option value={30}>最近 30 天</option>
            <option value={90}>最近 90 天</option>
            <option value={0}>全部时间</option>
        </select>
        <button class="btn-primary" type="button" on:click={applyFilters}>查询</button>
    </div>

    <div class="list-meta">
        <span>共 {total} 个文件</span>
        <div class="pager">
            <label>
                每页
                <select bind:value={limit} on:change={changeLimit} disabled={loading}>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                </select>
            </label>
            <button
                class="btn-secondary"
                type="button"
                disabled={loading || pageNum <= 1}
                on:click={() => changePage(pageNum - 1)}
            >上一页</button>
            <span>{total ? `${pageNum} / ${pages}` : "0 / 0"}</span>
            <button
                class="btn-secondary"
                type="button"
                disabled={loading || !pages || pageNum >= pages}
                on:click={() => changePage(pageNum + 1)}
            >下一页</button>
        </div>
    </div>

    {#if error}
        <div class="error-message">{error}</div>
    {/if}

    {#if loading}
        <div class="state-box">正在加载文件列表…</div>
    {:else if assets.length === 0}
        <div class="state-box">当前筛选条件下没有 AI 视频文件。</div>
    {:else}
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>上传/生成时间</th>
                        <th>产品与文件</th>
                        <th>用户</th>
                        <th>大小与视频信息</th>
                        <th>任务状态</th>
                        <th>清理状态</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    {#each assets as asset (assetKey(asset))}
                        <tr>
                            <td class="mono nowrap">{formatDate(asset.createdAt)}</td>
                            <td>
                                <div class="file-heading">
                                    <span class={`product product-${asset.product}`}>{asset.product === "highlight" ? "高光剪辑" : "Video Agent"}</span>
                                    <span class={`kind kind-${asset.kindGroup}`}>{kindLabel(asset.kind)}</span>
                                    <strong title={asset.sourceFilename || asset.objectKey}>
                                        {asset.sourceFilename || `${asset.kind}-${asset.id.slice(0, 8)}`}
                                    </strong>
                                </div>
                                {#if asset.projectTitle}<div class="sub">项目：{asset.projectTitle}</div>{/if}
                                <div class="sub mono ellipsis" title={asset.objectKey}>
                                    {asset.objectKey}
                                </div>
                                {#if asset.jobId}<div class="sub mono">Job: {asset.jobId}</div>{/if}
                                {#if asset.projectId}<div class="sub mono">Project: {asset.projectId}</div>{/if}
                                {#if asset.runId}<div class="sub mono">Run: {asset.runId}</div>{/if}
                            </td>
                            <td>
                                <strong>{asset.user.primaryEmail || asset.user.fullName || "未知用户"}</strong>
                                <div class="sub">本地用户 #{asset.userId}</div>
                                <div class="sub mono ellipsis" title={asset.user.clerkUserId}>
                                    {asset.user.clerkUserId}
                                </div>
                            </td>
                            <td>
                                <strong>{formatBytes(asset.sizeBytes)}</strong>
                                <div class="sub">{asset.mime || "-"}</div>
                                {#if asset.sourceDurationMs || asset.sourceWidth || asset.sourceHeight}
                                    <div class="sub">
                                        {formatDuration(asset.sourceDurationMs)}
                                        {asset.sourceWidth && asset.sourceHeight
                                            ? ` · ${asset.sourceWidth}×${asset.sourceHeight}`
                                            : ""}
                                    </div>
                                {/if}
                            </td>
                            <td>
                                <span class={`badge job-${asset.jobStatus}`}>{asset.jobStatus}</span>
                                <div class="sub">任务创建 {formatDate(asset.jobCreatedAt)}</div>
                            </td>
                            <td>
                                <span class={`badge cleanup-${asset.cleanupStatus}`}>
                                    {asset.cleanupStatus}
                                </span>
                                {#if asset.assetStatus}<div class="sub">文件状态：{asset.assetStatus}</div>{/if}
                                <div class="sub">
                                    到期：{formatDate(asset.expiresAt)}
                                </div>
                                <div class="sub">
                                    清理：{formatDate(asset.cleanupAfter)}
                                </div>
                            </td>
                            <td>
                                <div class="actions">
                                    <button
                                        class="link-button"
                                        type="button"
                                        disabled={previewLoadingId === assetKey(asset) || !asset.previewable || (asset.product === "video_agent" && (asset.assetStatus !== "ready" || (asset.expiresAt !== null && asset.expiresAt <= Date.now())))}
                                        on:click={() => openPreview(asset)}
                                    >
                                        {previewLoadingId === assetKey(asset) ? "生成中…" : "短时预览"}
                                    </button>
                                    <button
                                        class="link-button"
                                        type="button"
                                        on:click={() => copyObjectKey(asset)}
                                    >
                                        {copiedId === assetKey(asset) ? "已复制" : "复制 Key"}
                                    </button>
                                </div>
                                {#if previewErrors[assetKey(asset)]}
                                    <div class="row-error">{previewErrors[assetKey(asset)]}</div>
                                {/if}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>

<style>
    .admin-container {
        width: 100%;
        max-width: 1600px;
        padding: calc(var(--padding) * 2);
    }

    .admin-header,
    .list-meta,
    .pager,
    .toolbar,
    .actions,
    .file-heading {
        display: flex;
        align-items: center;
    }

    .admin-header,
    .list-meta {
        justify-content: space-between;
        gap: var(--padding);
    }

    .admin-header {
        margin-bottom: calc(var(--padding) * 1.5);
    }

    h1 {
        margin: 0;
        font-size: 1.8rem;
        color: var(--text);
    }

    .admin-header p {
        margin: 6px 0 0;
        color: var(--text);
        opacity: 0.7;
    }

    .summary-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(150px, 1fr));
        gap: 12px;
        margin-bottom: calc(var(--padding) * 1.5);
    }

    .summary-card {
        display: grid;
        gap: 6px;
        padding: 16px;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: var(--background-secondary);
        color: var(--text);
    }

    .summary-card strong {
        font-size: 1.5rem;
    }

    .summary-card span,
    .summary-card small {
        opacity: 0.72;
    }

    .summary-card.warning {
        border-color: rgba(170, 120, 0, 0.45);
    }

    .toolbar {
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: var(--padding);
    }

    input,
    select,
    button {
        min-height: 38px;
        border-radius: 6px;
        font: inherit;
    }

    input,
    select {
        border: 1px solid var(--border);
        padding: 8px 10px;
        background: var(--background);
        color: var(--text);
    }

    input {
        width: min(390px, 80vw);
    }

    button {
        border: none;
        padding: 8px 12px;
        font-weight: 700;
        cursor: pointer;
    }

    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .btn-primary {
        background: var(--primary);
        color: var(--button-text);
    }

    .btn-secondary {
        background: var(--button-hover-transparent);
        color: var(--text);
    }

    .list-meta {
        margin-bottom: 10px;
        color: var(--text);
    }

    .pager {
        gap: 8px;
    }

    .pager label {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .table-wrap {
        width: 100%;
        overflow-x: auto;
        border: 1px solid var(--border);
        border-radius: 8px;
    }

    table {
        width: 100%;
        min-width: 1440px;
        border-collapse: collapse;
        color: var(--text);
        font-size: 0.88rem;
    }

    th,
    td {
        padding: 11px 12px;
        border-bottom: 1px solid var(--border);
        text-align: left;
        vertical-align: top;
    }

    th {
        background: var(--background-secondary);
        font-size: 0.8rem;
        text-transform: uppercase;
    }

    tr:last-child td {
        border-bottom: none;
    }

    .file-heading {
        gap: 8px;
        max-width: 330px;
    }

    .file-heading strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .product,
    .kind,
    .badge {
        display: inline-flex;
        align-items: center;
        min-height: 23px;
        padding: 2px 7px;
        border-radius: 999px;
        background: var(--button-hover-transparent);
        font-size: 0.76rem;
        font-weight: 800;
        white-space: nowrap;
    }

    .product-highlight,
    .kind-source,
    .job-completed,
    .cleanup-active {
        background: rgba(74, 122, 28, 0.15);
        color: #4a7a1c;
    }

    .product-video_agent,
    .kind-output {
        background: rgba(35, 105, 190, 0.15);
        color: #2369be;
    }

    .cleanup-pending,
    .cleanup-retry,
    .job-failed {
        background: rgba(190, 45, 45, 0.14);
        color: #be2d2d;
    }

    .sub {
        margin-top: 4px;
        opacity: 0.67;
        font-size: 0.77rem;
        line-height: 1.35;
    }

    .mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    .nowrap {
        white-space: nowrap;
    }

    .ellipsis {
        max-width: 330px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        user-select: text;
    }

    .actions {
        gap: 6px;
        flex-wrap: wrap;
    }

    .link-button {
        min-height: 30px;
        padding: 4px 8px;
        background: var(--button-hover-transparent);
        color: var(--text);
        font-size: 0.78rem;
    }

    .row-error,
    .error-message {
        color: var(--red);
        font-weight: 700;
    }

    .row-error {
        max-width: 220px;
        margin-top: 6px;
        font-size: 0.75rem;
    }

    .error-message,
    .state-box {
        margin-top: var(--padding);
        padding: var(--padding);
        border: 1px solid var(--border);
        border-radius: 8px;
        color: var(--text);
    }

    @media screen and (max-width: 1050px) {
        .summary-grid {
            grid-template-columns: repeat(2, minmax(150px, 1fr));
        }
    }

    @media screen and (max-width: 750px) {
        .admin-container {
            padding: var(--padding);
        }

        .admin-header,
        .list-meta {
            align-items: flex-start;
            flex-direction: column;
        }

        .summary-grid {
            grid-template-columns: 1fr;
        }

        input,
        .toolbar,
        .pager {
            width: 100%;
        }
    }
</style>
