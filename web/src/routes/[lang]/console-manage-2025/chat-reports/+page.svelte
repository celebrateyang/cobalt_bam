<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { onMount } from "svelte";

    import { currentApiURL } from "$lib/api/api-url";
    import { auth } from "$lib/api/social";

    type Report = {
        id: number;
        match_id: string;
        reason: string;
        details: string | null;
        phase: string;
        status: string;
        admin_note: string | null;
        reviewed_by: string | null;
        reviewed_at: number | null;
        created_at: number;
        reporter_email: string | null;
        reporter_name: string | null;
        reported_email: string | null;
        reported_name: string | null;
    };

    let reports: Report[] = [];
    let drafts: Record<number, { status: string; note: string }> = {};
    let status = "pending";
    let pageNum = 1;
    let pages = 0;
    let total = 0;
    let loading = true;
    let savingId: number | null = null;
    let error = "";
    $: lang = $page.params.lang;

    const token = () => window.localStorage.getItem("admin_token");
    const reasonLabel = (reason: string) => ({
        inappropriate_content: "不当内容",
        harassment: "骚扰或辱骂",
        suspected_minor: "疑似未成年",
        spam_or_scam: "垃圾信息或诈骗",
        other: "其他",
    }[reason] || reason);
    const formatTime = (value: number | null) => value
        ? new Date(value < 1e12 ? value * 1000 : value).toLocaleString("zh-CN")
        : "-";

    async function requireToken() {
        const value = token();
        if (!value) await goto(`/${lang}/console-manage-2025`);
        return value;
    }

    async function loadReports() {
        loading = true;
        error = "";
        try {
            const adminToken = await requireToken();
            if (!adminToken) return;
            const params = new URLSearchParams({ page: String(pageNum), limit: "20" });
            if (status) params.set("status", status);
            const response = await fetch(`${currentApiURL()}/user/admin/random-chat-reports?${params}`, {
                headers: { Authorization: `Bearer ${adminToken}` },
            });
            if (response.status === 401) {
                auth.logout();
                await goto(`/${lang}/console-manage-2025`);
                return;
            }
            const body = await response.json().catch(() => ({}));
            if (!response.ok || body?.status !== "success") throw new Error(body?.error?.message || "加载失败");
            reports = body.data.reports || [];
            total = body.data.pagination?.total || 0;
            pages = body.data.pagination?.pages || 0;
            drafts = Object.fromEntries(reports.map((report) => [report.id, {
                status: report.status === "pending" ? "reviewed" : report.status,
                note: report.admin_note || "",
            }]));
        } catch (cause) {
            error = cause instanceof Error ? cause.message : "加载失败";
        } finally {
            loading = false;
        }
    }

    async function review(report: Report) {
        savingId = report.id;
        error = "";
        try {
            const adminToken = await requireToken();
            if (!adminToken) return;
            const draft = drafts[report.id];
            const response = await fetch(`${currentApiURL()}/user/admin/random-chat-reports/${report.id}/review`, {
                method: "POST",
                headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
                body: JSON.stringify({ status: draft.status, adminNote: draft.note }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok || body?.status !== "success") throw new Error(body?.error?.message || "保存失败");
            await loadReports();
            window.dispatchEvent(new CustomEvent("admin-chat-report-updated"));
        } catch (cause) {
            error = cause instanceof Error ? cause.message : "保存失败";
        } finally {
            savingId = null;
        }
    }

    async function changeFilter() {
        pageNum = 1;
        await loadReports();
    }

    onMount(async () => {
        const verified = await auth.verify();
        if (verified.status !== "success") {
            await goto(`/${lang}/console-manage-2025`);
            return;
        }
        await loadReports();
    });
</script>

<svelte:head><title>聊天举报 - 管理后台</title></svelte:head>

<div class="admin-container">
    <header>
        <div><h1>随机聊天举报</h1><p>审核用户提交的举报。举报提交后双方已被加入互相不再匹配名单。</p></div>
        <label>状态
            <select bind:value={status} on:change={changeFilter}>
                <option value="pending">待审核</option>
                <option value="reviewed">已审核</option>
                <option value="actioned">已处理</option>
                <option value="dismissed">已驳回</option>
                <option value="">全部</option>
            </select>
        </label>
    </header>

    {#if error}<div class="error">{error}</div>{/if}
    {#if loading}
        <p>加载中...</p>
    {:else if reports.length === 0}
        <div class="empty">当前没有符合条件的举报。</div>
    {:else}
        <div class="report-list">
            {#each reports as report}
                <article>
                    <div class="report-head">
                        <strong>#{report.id} · {reasonLabel(report.reason)}</strong>
                        <span class:pending={report.status === "pending"}>{report.status}</span>
                    </div>
                    <dl>
                        <div><dt>举报时间</dt><dd>{formatTime(report.created_at)}</dd></div>
                        <div><dt>会话 / 阶段</dt><dd>{report.match_id} / {report.phase}</dd></div>
                        <div><dt>举报人</dt><dd>{report.reporter_name || "-"} · {report.reporter_email || "-"}</dd></div>
                        <div><dt>被举报人</dt><dd>{report.reported_name || "-"} · {report.reported_email || "-"}</dd></div>
                    </dl>
                    <div class="details"><b>用户说明</b><p>{report.details || "未填写"}</p></div>
                    <div class="review-row">
                        <select bind:value={drafts[report.id].status}>
                            <option value="reviewed">已审核</option>
                            <option value="actioned">已处理</option>
                            <option value="dismissed">已驳回</option>
                        </select>
                        <textarea bind:value={drafts[report.id].note} placeholder="审核备注（选填）"></textarea>
                        <button on:click={() => review(report)} disabled={savingId === report.id}>{savingId === report.id ? "保存中..." : "保存审核"}</button>
                    </div>
                </article>
            {/each}
        </div>
    {/if}

    <footer>
        <span>共 {total} 条</span>
        <button disabled={pageNum <= 1 || loading} on:click={() => { pageNum -= 1; loadReports(); }}>上一页</button>
        <span>{pageNum} / {Math.max(pages, 1)}</span>
        <button disabled={pageNum >= pages || loading} on:click={() => { pageNum += 1; loadReports(); }}>下一页</button>
    </footer>
</div>

<style>
    .admin-container { max-width: 1180px; padding: 30px 24px 60px; }
    header { display: flex; justify-content: space-between; gap: 24px; align-items: end; margin-bottom: 22px; }
    h1 { margin: 0 0 8px; } header p { margin: 0; color: var(--subtext); }
    label { display: grid; gap: 6px; font-size: .86rem; color: var(--subtext); }
    select, textarea { border: 1px solid var(--popup-stroke); border-radius: 8px; padding: 9px; color: var(--text); background: var(--popup-bg); }
    .report-list { display: grid; gap: 14px; }
    article { padding: 20px; border: 1px solid var(--popup-stroke); border-radius: 14px; background: var(--popup-bg); }
    .report-head { display: flex; justify-content: space-between; gap: 12px; }
    .report-head span { padding: 3px 9px; border-radius: 999px; background: rgba(100,100,100,.12); }
    .report-head span.pending { color: #b45309; background: #fef3c7; }
    dl { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 20px; margin: 18px 0; }
    dl div { min-width: 0; } dt { color: var(--subtext); font-size: .78rem; } dd { margin: 3px 0 0; overflow-wrap: anywhere; }
    .details { padding: 12px; border-radius: 9px; background: rgba(100,100,100,.07); } .details p { margin: 6px 0 0; white-space: pre-wrap; }
    .review-row { display: grid; grid-template-columns: 130px 1fr auto; gap: 10px; align-items: stretch; margin-top: 14px; }
    textarea { min-height: 70px; resize: vertical; }
    button { border: 0; border-radius: 8px; padding: 9px 14px; cursor: pointer; } button:disabled { opacity: .5; cursor: not-allowed; }
    .review-row button { color: white; background: #2563eb; }
    .error { margin-bottom: 14px; padding: 12px; color: #b91c1c; background: #fee2e2; border-radius: 9px; }
    .empty { padding: 40px; text-align: center; border: 1px dashed var(--popup-stroke); border-radius: 12px; color: var(--subtext); }
    footer { display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 18px; }
    @media (max-width: 760px) { header { align-items: stretch; flex-direction: column; } dl, .review-row { grid-template-columns: 1fr; } }
</style>
