<script lang="ts">
    import { onMount } from "svelte";

    import {
        platformRequestsAdminApi,
        type PlatformRequest,
        type PlatformRequestStatus,
    } from "$lib/api/platform-requests";

    let requests: PlatformRequest[] = [];
    let loading = true;
    let message = "";
    let search = "";
    let status: PlatformRequestStatus | "" = "";
    let savingId: number | null = null;
    let page = 1;
    let pages = 1;

    const load = async () => {
        loading = true;
        message = "";
        try {
            const response = await platformRequestsAdminApi.list({
                page,
                status: status || undefined,
                search,
            });
            if (response.status === "success") {
                requests = response.data.requests;
                pages = Math.max(1, response.data.pagination.pages);
            } else {
                message = response.error.message || "加载失败";
            }
        } catch {
            message = "无法连接 API";
        }
        loading = false;
    };

    const save = async (item: PlatformRequest) => {
        savingId = item.id;
        try {
            const response = await platformRequestsAdminApi.update(
                item.id,
                item.status,
                item.adminNote || "",
            );
            if (response.status === "success") {
                requests = requests.map((entry) => entry.id === item.id ? response.data.request : entry);
                message = "已保存";
            } else {
                message = response.error.message || "保存失败";
            }
        } catch {
            message = "无法连接 API";
        }
        savingId = null;
    };

    onMount(load);
</script>

<svelte:head><title>平台愿望单管理</title></svelte:head>

<section class="admin-page">
    <header>
        <div><p class="eyebrow">SUPPORT</p><h1>平台愿望单</h1></div>
        <div class="filters">
            <input bind:value={search} placeholder="搜索域名或备注" />
            <select bind:value={status}>
                <option value="">全部状态</option>
                <option value="pending">待评估</option>
                <option value="planned">已计划</option>
                <option value="supported">已支持</option>
                <option value="rejected">暂无法支持</option>
            </select>
            <button type="button" on:click={async () => { page = 1; await load(); }}>查询</button>
        </div>
    </header>

    {#if message}<p class="notice">{message}</p>{/if}
    {#if loading}
        <p class="empty">加载中…</p>
    {:else if requests.length === 0}
        <p class="empty">暂无平台需求</p>
    {:else}
        <div class="cards">
            {#each requests as item}
                <article>
                    <div class="row heading">
                        <div><strong>{item.domain}</strong><span>{item.voteCount} 票</span></div>
                        <a href={item.homepageUrl} target="_blank" rel="noreferrer noopener nofollow">访问 ↗</a>
                    </div>
                    <div class="row fields">
                        <label>状态
                            <select bind:value={item.status}>
                                <option value="pending">待评估</option>
                                <option value="planned">已计划</option>
                                <option value="supported">已支持</option>
                                <option value="rejected">暂无法支持</option>
                            </select>
                        </label>
                        <label class="note">管理员备注
                            <textarea bind:value={item.adminNote} maxlength="2000" placeholder="向用户说明计划或限制"></textarea>
                        </label>
                    </div>
                    <div class="row footer">
                        <span>提交于 {new Date(item.createdAt).toLocaleString()}</span>
                        <button type="button" disabled={savingId === item.id} on:click={() => save(item)}>
                            {savingId === item.id ? "保存中…" : "保存"}
                        </button>
                    </div>
                </article>
            {/each}
        </div>
    {/if}

    {#if pages > 1}
        <div class="pagination">
            <button disabled={page <= 1} on:click={async () => { page -= 1; await load(); }}>上一页</button>
            <span>{page} / {pages}</span>
            <button disabled={page >= pages} on:click={async () => { page += 1; await load(); }}>下一页</button>
        </div>
    {/if}
</section>

<style>
    .admin-page { width: min(1100px, calc(100% - 32px)); padding: 32px 0 70px; display: grid; gap: 20px; }
    header, .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    h1, p { margin: 0; }
    .eyebrow { color: var(--primary); font-size: .75rem; font-weight: 800; letter-spacing: .12em; }
    .filters { display: flex; flex-wrap: wrap; gap: 8px; }
    input, select, textarea, button { border: 1px solid var(--separator); border-radius: 9px; background: var(--background); color: var(--text); font: inherit; }
    input, select { min-height: 40px; padding: 0 10px; }
    button { min-height: 40px; padding: 0 14px; cursor: pointer; font-weight: 700; }
    .cards { display: grid; gap: 12px; }
    article { display: grid; gap: 16px; padding: 18px; border: 1px solid var(--separator); border-radius: 14px; }
    .heading > div { display: flex; gap: 10px; align-items: baseline; }
    .heading span, .footer span { color: var(--secondary); font-size: .88rem; }
    .heading a { color: var(--primary); }
    .fields { align-items: stretch; }
    label { display: grid; gap: 6px; font-weight: 700; }
    label.note { flex: 1; }
    textarea { min-height: 72px; padding: 10px; resize: vertical; font-weight: 400; }
    .footer { border-top: 1px solid var(--separator); padding-top: 12px; }
    .notice, .empty { padding: 16px; border-radius: 10px; background: var(--secondary-background); }
    .pagination { display: flex; justify-content: center; align-items: center; gap: 10px; }
    @media (max-width: 760px) { header, .fields { align-items: stretch; flex-direction: column; } .filters { width: 100%; } .filters > * { flex: 1; } }
</style>

