<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { auth } from "$lib/api/social";
    import { currentApiURL } from "$lib/api/api-url";

    type FeedbackItem = {
        id: number;
        user_id: number;
        clerk_user_id: string;
        video_url: string;
        phenomenon: string;
        suggestion: string | null;
        created_at: number | string;
        updated_at: number | string;
        user?: {
            primary_email: string | null;
            full_name: string | null;
            avatar_url: string | null;
        };
    };

    let feedback: FeedbackItem[] = [];
    let loading = true;
    let error = "";

    let search = "";
    let pageNum = 1;
    let limit = 20;
    let total = 0;
    let pages = 0;

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

        await loadFeedback();
    });

    async function loadFeedback() {
        loading = true;
        error = "";

        try {
            const token = getToken();
            if (!token) {
                goto(`/${lang}/console-manage-2025`);
                return;
            }

            const params = new URLSearchParams();
            params.set("page", String(pageNum));
            params.set("limit", String(limit));
            const normalizedSearch = search.trim();
            if (normalizedSearch) params.set("search", normalizedSearch);

            const res = await fetch(
                `${currentApiURL()}/user/admin/feedback?${params.toString()}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                },
            );

            if (res.status === 401) {
                auth.logout();
                goto(`/${lang}/console-manage-2025`);
                return;
            }

            const data = await res.json().catch(() => ({}));
            if (!res.ok || data?.status !== "success") {
                throw new Error(data?.error?.message || "加载失败");
            }

            feedback = Array.isArray(data?.data?.feedback) ? data.data.feedback : [];

            const pagination = data?.data?.pagination || {};
            total = pagination.total ?? 0;
            pages = pagination.pages ?? 0;
            pageNum = pagination.page ?? pageNum;
            limit = pagination.limit ?? limit;
        } catch (e) {
            feedback = [];
            error = e instanceof Error ? e.message : "网络错误";
        } finally {
            loading = false;
        }
    }

    async function goToPage(next: number) {
        if (loading) return;
        if (next < 1) return;
        if (pages && next > pages) return;
        pageNum = next;
        await loadFeedback();
    }

    async function handleSearch() {
        pageNum = 1;
        await loadFeedback();
    }

    async function handleLimitChange(nextLimit: number) {
        limit = nextLimit;
        pageNum = 1;
        await loadFeedback();
    }

    function formatDate(ts: number | string | null | undefined) {
        if (ts == null) return "-";
        const raw = typeof ts === "string" ? Number.parseInt(ts, 10) : ts;
        if (!Number.isFinite(raw)) return "-";

        const ms = raw < 1e12 ? raw * 1000 : raw;
        const d = new Date(ms);
        if (Number.isNaN(d.getTime())) return "-";

        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }

    const copyText = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // ignore
        }
    };

    function handleLogout() {
        auth.logout();
        goto(`/${lang}/console-manage-2025`);
    }
</script>

<svelte:head>
    <title>问题反馈 - 管理后台</title>
</svelte:head>

<div class="admin-container">
    <header class="admin-header">
        <h1>问题反馈</h1>
        <div class="header-actions">
            <button
                class="btn-secondary"
                on:click={() => goto(`/${lang}/console-manage-2025/accounts`)}
                >账号管理</button
            >
            <button
                class="btn-secondary"
                on:click={() => goto(`/${lang}/console-manage-2025/users`)}
                >用户管理</button
            >
            <button
                class="btn-secondary"
                on:click={() => goto(`/${lang}/console-manage-2025/videos`)}
                >视频管理</button
            >
            <button class="btn-logout" on:click={handleLogout}>退出登录</button>
        </div>
    </header>

    <div class="toolbar">
        <div class="search">
            <input
                type="text"
                placeholder="搜索视频链接 / 现象 / 用户邮箱 / Clerk ID"
                bind:value={search}
                on:keydown={(e) => e.key === "Enter" && handleSearch()}
            />
            <button class="btn-primary" on:click={handleSearch}>搜索</button>
        </div>

        <div class="pager">
            <span class="meta">共 {total} 条</span>
            <label class="limit">
                <span>每页</span>
                <select bind:value={limit} on:change={() => handleLimitChange(limit)}>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                </select>
            </label>
            <button
                class="btn-secondary"
                disabled={loading || pageNum <= 1}
                on:click={() => goToPage(pageNum - 1)}
                >上一页</button
            >
            <span class="meta">
                {#if total === 0}
                    0 / 0
                {:else}
                    {pageNum} / {pages}
                {/if}
            </span>
            <button
                class="btn-secondary"
                disabled={loading || (pages ? pageNum >= pages : true)}
                on:click={() => goToPage(pageNum + 1)}
                >下一页</button
            >
        </div>
    </div>

    {#if error}
        <div class="error-message">{error}</div>
    {/if}

    {#if loading}
        <div class="loading">加载中...</div>
    {:else if feedback.length === 0}
        <div class="empty">暂无反馈</div>
    {:else}
        <div class="table-wrap">
            <table class="feedback-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>时间</th>
                        <th>用户</th>
                        <th>视频链接</th>
                        <th>现象</th>
                        <th>建议</th>
                    </tr>
                </thead>
                <tbody>
                    {#each feedback as item (item.id)}
                        <tr>
                            <td class="mono">{item.id}</td>
                            <td class="mono">{formatDate(item.created_at)}</td>
                            <td>
                                <div class="user-cell">
                                    {#if item.user?.avatar_url}
                                        <img
                                            class="avatar"
                                            src={item.user.avatar_url}
                                            alt={item.user.full_name ||
                                                item.user.primary_email ||
                                                item.clerk_user_id}
                                        />
                                    {:else}
                                        <div class="avatar placeholder">
                                            {(item.user?.full_name ||
                                                item.user?.primary_email ||
                                                item.clerk_user_id)
                                                ?.charAt(0)
                                                ?.toUpperCase() || "U"}
                                        </div>
                                    {/if}
                                    <div class="user-meta">
                                        <div class="name">
                                            {item.user?.full_name || "-"}
                                        </div>
                                        <div class="sub-row">
                                            <span
                                                class="sub mono selectable"
                                                title={item.user?.primary_email ||
                                                    item.clerk_user_id}
                                            >
                                                {item.user?.primary_email ||
                                                    item.clerk_user_id}
                                            </span>
                                            <button
                                                class="btn-secondary btn-copy btn-copy-small"
                                                type="button"
                                                on:click={() =>
                                                    copyText(
                                                        item.user?.primary_email ||
                                                            item.clerk_user_id,
                                                    )}
                                            >
                                                复制
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </td>
                            <td class="url-cell">
                                <a
                                    class="mono url"
                                    href={item.video_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {item.video_url}
                                </a>
                                <button
                                    class="btn-secondary btn-copy"
                                    type="button"
                                    on:click={() => copyText(item.video_url)}
                                >
                                    复制
                                </button>
                            </td>
                            <td>
                                <div class="text clamp">
                                    {item.phenomenon}
                                </div>
                            </td>
                            <td>
                                <div class="text clamp">
                                    {item.suggestion || "-"}
                                </div>
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
        max-width: 1200px;
        margin: 0 auto;
        padding: calc(var(--padding) * 2);
    }

    .admin-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--padding);
        margin-bottom: calc(var(--padding) * 1.5);
    }

    .admin-header h1 {
        font-size: 1.8rem;
        font-weight: 800;
        margin: 0;
        color: var(--text);
    }

    .header-actions {
        display: flex;
        gap: calc(var(--padding) / 2);
        flex-wrap: wrap;
        align-items: center;
    }

    button {
        padding: 10px 14px;
        border: none;
        border-radius: var(--border-radius);
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }

    .btn-primary {
        background: var(--accent);
        color: var(--white);
    }

    .btn-primary:hover:not(:disabled) {
        background: var(--accent-hover);
    }

    .btn-secondary {
        background: var(--button);
        color: var(--text);
        box-shadow: var(--button-box-shadow);
    }

    .btn-secondary:hover:not(:disabled) {
        background: var(--button-hover);
    }

    .btn-logout {
        background: var(--red);
        color: var(--white);
    }

    .btn-logout:hover:not(:disabled) {
        opacity: 0.9;
    }

    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--padding);
        flex-wrap: wrap;
        margin-bottom: var(--padding);
    }

    .search {
        display: flex;
        gap: calc(var(--padding) / 2);
        align-items: center;
        flex: 1;
        min-width: 260px;
    }

    .search input {
        flex: 1;
        padding: 10px 12px;
        border: none;
        border-radius: var(--border-radius);
        background: var(--button);
        color: var(--text);
        box-shadow: var(--button-box-shadow);
        font-family: "IBM Plex Mono", monospace;
        font-size: 0.9rem;
        min-width: 220px;
    }

    .search input:focus {
        outline: none;
        background: var(--button-hover);
        box-shadow: 0 0 0 2px var(--blue) inset;
    }

    .pager {
        display: flex;
        align-items: center;
        gap: calc(var(--padding) / 2);
        flex-wrap: wrap;
        justify-content: flex-end;
    }

    .meta {
        color: var(--subtext);
        font-size: 0.85rem;
        white-space: nowrap;
    }

    .limit {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--subtext);
        font-size: 0.85rem;
    }

    .limit select {
        padding: 8px 10px;
        border: none;
        border-radius: var(--border-radius);
        background: var(--button);
        color: var(--text);
        box-shadow: var(--button-box-shadow);
    }

    .error-message {
        background: var(--red);
        color: var(--white);
        padding: var(--padding);
        border-radius: var(--border-radius);
        margin-bottom: var(--padding);
    }

    .loading,
    .empty {
        text-align: center;
        padding: calc(var(--padding) * 3);
        color: var(--subtext);
    }

    .table-wrap {
        overflow-x: auto;
        border-radius: var(--border-radius);
        background: var(--popup-bg);
        box-shadow: 0 0 0 1.5px var(--popup-stroke) inset;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        min-width: 1100px;
    }

    thead th {
        text-align: left;
        font-size: 0.8rem;
        color: var(--subtext);
        font-weight: 700;
        padding: 12px 14px;
        border-bottom: 1px solid var(--popup-stroke);
        background: var(--popup-bg);
        position: sticky;
        top: 0;
        z-index: 1;
    }

    tbody td {
        padding: 12px 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        color: var(--text);
        font-size: 0.9rem;
        vertical-align: top;
    }

    tbody tr:hover td {
        background: rgba(255, 255, 255, 0.03);
    }

    .mono {
        font-family: "IBM Plex Mono", monospace;
    }

    .user-cell {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 240px;
    }

    .avatar {
        width: 34px;
        height: 34px;
        border-radius: 999px;
        object-fit: cover;
        flex: 0 0 auto;
        background: var(--button);
        box-shadow: var(--button-box-shadow);
    }

    .avatar.placeholder {
        display: grid;
        place-items: center;
        font-weight: 800;
        color: var(--text);
    }

    .user-meta {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    .name {
        font-weight: 700;
        color: var(--text);
        line-height: 1.2;
    }

    .sub {
        color: var(--subtext);
        font-size: 0.78rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 340px;
    }

    .sub-row {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }

    .sub-row .sub {
        flex: 1;
        min-width: 0;
    }

    .selectable {
        user-select: text;
        -webkit-user-select: text;
        cursor: text;
    }

    .url-cell {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 320px;
        max-width: 420px;
    }

    .url {
        color: var(--blue);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 340px;
    }

    .btn-copy {
        padding: 8px 10px;
        font-size: 0.8rem;
        white-space: nowrap;
    }

    .btn-copy-small {
        padding: 6px 8px;
        font-size: 0.75rem;
    }

    .text {
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.45;
    }

    .clamp {
        display: -webkit-box;
        -webkit-line-clamp: 4;
        -webkit-box-orient: vertical;
        overflow: hidden;
        max-width: 360px;
    }

    @media screen and (max-width: 768px) {
        .admin-container {
            padding: var(--padding);
        }

        .admin-header {
            flex-direction: column;
            align-items: flex-start;
        }

        .admin-header h1 {
            font-size: 1.4rem;
        }

        .toolbar {
            align-items: stretch;
        }

        .search {
            min-width: 100%;
        }
    }
</style>
