<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { auth } from "$lib/api/social";
    import { currentApiURL } from "$lib/api/api-url";

    type OrderUser = {
        primary_email: string | null;
        full_name: string | null;
        avatar_url: string | null;
    };

    type MembershipOrder = {
        id: number;
        user_id: number;
        provider: string;
        product_key: string;
        plan_key: string;
        duration_days: number;
        amount_fen: number;
        currency: string;
        out_trade_no: string;
        status: string;
        paid_at: number | string | null;
        created_at: number | string;
        user?: OrderUser;
    };

    type SortKey = "created_at" | "paid_at" | "status" | "duration_days";
    type SortOrder = "asc" | "desc";

    let orders: MembershipOrder[] = [];
    let loading = true;
    let error = "";
    let search = "";
    let status = "";
    let provider = "";
    let pageNum = 1;
    let limit = 20;
    let total = 0;
    let pages = 0;
    let sort: SortKey = "created_at";
    let order: SortOrder = "desc";

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
        await loadOrders();
    });

    function formatDate(ts: number | string | null | undefined) {
        if (ts == null) return "-";
        const raw = typeof ts === "string" ? Number.parseInt(ts, 10) : ts;
        if (!Number.isFinite(raw)) return "-";
        const date = new Date(raw < 1e12 ? raw * 1000 : raw);
        if (Number.isNaN(date.getTime())) return "-";
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    }

    const formatAmount = (amountFen: number, currency: string) =>
        currency === "CNY" ? `¥${(amountFen / 100).toFixed(2)}` : `${(amountFen / 100).toFixed(2)} ${currency}`;

    const planLabel = (order: MembershipOrder) =>
        order.plan_key === "member_monthly"
            ? "月会员"
            : order.plan_key === "member_yearly"
              ? "年会员"
              : order.plan_key;

    async function loadOrders() {
        loading = true;
        error = "";
        try {
            const token = getToken();
            if (!token) {
                goto(`/${lang}/console-manage-2025`);
                return;
            }

            const params = new URLSearchParams({
                page: String(pageNum),
                limit: String(limit),
                sort,
                order,
            });
            if (search.trim()) params.set("search", search.trim());
            if (status) params.set("status", status);
            if (provider) params.set("provider", provider);

            const response = await fetch(
                `${currentApiURL()}/user/admin/membership-orders?${params.toString()}`,
                { headers: { Authorization: `Bearer ${token}` } },
            );
            if (response.status === 401) {
                auth.logout();
                goto(`/${lang}/console-manage-2025`);
                return;
            }
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data?.status !== "success") {
                throw new Error(data?.error?.message || "加载失败");
            }
            orders = Array.isArray(data?.data?.orders) ? data.data.orders : [];
            const pagination = data?.data?.pagination || {};
            total = pagination.total ?? 0;
            pages = pagination.pages ?? 0;
            pageNum = pagination.page ?? pageNum;
            limit = pagination.limit ?? limit;
        } catch (cause) {
            orders = [];
            error = cause instanceof Error ? cause.message : "网络错误";
        } finally {
            loading = false;
        }
    }

    async function applyFilters() {
        pageNum = 1;
        await loadOrders();
    }

    async function goToPage(next: number) {
        if (loading || next < 1 || (pages && next > pages)) return;
        pageNum = next;
        await loadOrders();
    }

    const getAriaSort = (key: SortKey) =>
        sort === key ? (order === "asc" ? "ascending" : "descending") : "none";

    const getSortIcon = (key: SortKey) =>
        sort !== key ? "⇅" : order === "asc" ? "↑" : "↓";

    async function handleSort(nextSort: SortKey) {
        if (loading) return;
        if (sort === nextSort) {
            order = order === "asc" ? "desc" : "asc";
        } else {
            sort = nextSort;
            order = nextSort === "status" ? "asc" : "desc";
        }
        pageNum = 1;
        await loadOrders();
    }
</script>

<svelte:head>
    <title>会员订单 - 管理后台</title>
</svelte:head>

<div class="admin-container">
    <header class="admin-header">
        <h1>会员订单</h1>
    </header>

    <div class="toolbar">
        <div class="search">
            <input
                type="text"
                placeholder="搜索订单号 / 邮箱 / 姓名 / 套餐"
                bind:value={search}
                on:keydown={(event) => event.key === "Enter" && applyFilters()}
            />
            <button class="btn-primary" on:click={applyFilters}>搜索</button>
            <label class="filter">
                <span>状态</span>
                <select bind:value={status} on:change={applyFilters} disabled={loading}>
                    <option value="">全部</option>
                    <option value="CREATED">CREATED</option>
                    <option value="PAID">PAID</option>
                    <option value="FAILED">FAILED</option>
                    <option value="CLOSED">CLOSED</option>
                </select>
            </label>
            <label class="filter">
                <span>渠道</span>
                <select bind:value={provider} on:change={applyFilters} disabled={loading}>
                    <option value="">全部</option>
                    <option value="wechat">wechat</option>
                </select>
            </label>
        </div>

        <div class="pager">
            <span class="meta">共 {total} 单</span>
            <label class="filter">
                <span>每页</span>
                <select bind:value={limit} on:change={applyFilters} disabled={loading}>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                </select>
            </label>
            <button class="btn-secondary" disabled={loading || pageNum <= 1} on:click={() => goToPage(pageNum - 1)}>上一页</button>
            <span class="meta">{total === 0 ? "0 / 0" : `${pageNum} / ${pages}`}</span>
            <button class="btn-secondary" disabled={loading || !pages || pageNum >= pages} on:click={() => goToPage(pageNum + 1)}>下一页</button>
        </div>
    </div>

    {#if error}
        <div class="error-message">{error}</div>
    {:else if loading}
        <div class="loading">加载中...</div>
    {:else if orders.length === 0}
        <div class="empty">暂无会员订单</div>
    {:else}
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>用户</th>
                        <th>套餐</th>
                        <th aria-sort={getAriaSort("duration_days")} class="sortable"><button class="sort-trigger" on:click={() => handleSort("duration_days")}>期限 <span class="sort-indicator">{getSortIcon("duration_days")}</span></button></th>
                        <th aria-sort={getAriaSort("status")} class="sortable"><button class="sort-trigger" on:click={() => handleSort("status")}>状态 <span class="sort-indicator">{getSortIcon("status")}</span></button></th>
                        <th>金额</th>
                        <th>渠道</th>
                        <th>订单号</th>
                        <th aria-sort={getAriaSort("paid_at")} class="sortable"><button class="sort-trigger" on:click={() => handleSort("paid_at")}>支付时间 <span class="sort-indicator">{getSortIcon("paid_at")}</span></button></th>
                        <th aria-sort={getAriaSort("created_at")} class="sortable"><button class="sort-trigger" on:click={() => handleSort("created_at")}>创建时间 <span class="sort-indicator">{getSortIcon("created_at")}</span></button></th>
                    </tr>
                </thead>
                <tbody>
                    {#each orders as item (item.id)}
                        <tr>
                            <td class="mono">{item.id}</td>
                            <td>
                                <div class="user-email mono">{item.user?.primary_email || "-"}</div>
                                <div class="sub">#{item.user_id} · {item.user?.full_name || "-"}</div>
                            </td>
                            <td>{planLabel(item)}</td>
                            <td class="mono">{item.duration_days} 天</td>
                            <td><span class={`status status-${item.status.toLowerCase()}`}>{item.status}</span></td>
                            <td class="mono">{formatAmount(item.amount_fen, item.currency)}</td>
                            <td class="mono">{item.provider}</td>
                            <td class="mono selectable">{item.out_trade_no}</td>
                            <td class="mono">{formatDate(item.paid_at)}</td>
                            <td class="mono">{formatDate(item.created_at)}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>

<style>
    .admin-container { width: 100%; max-width: 1500px; margin: 0; padding: calc(var(--padding) * 2); }
    .admin-header { margin-bottom: calc(var(--padding) * 1.5); }
    .admin-header h1 { margin: 0; color: var(--text); font-size: 1.8rem; font-weight: 800; }
    button { padding: 10px 14px; border: none; border-radius: var(--border-radius); font-size: 0.85rem; font-weight: 600; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background: var(--accent); color: var(--white); }
    .btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
    .btn-secondary { background: var(--button); color: var(--text); box-shadow: var(--button-box-shadow); }
    .btn-secondary:hover:not(:disabled) { background: var(--button-hover); }
    .toolbar { display: flex; justify-content: space-between; align-items: center; gap: var(--padding); flex-wrap: wrap; margin-bottom: var(--padding); }
    .search { display: flex; align-items: center; gap: calc(var(--padding) / 2); flex: 1; min-width: 320px; flex-wrap: wrap; }
    .pager { display: flex; align-items: center; gap: calc(var(--padding) / 2); flex-wrap: wrap; justify-content: flex-end; }
    input { min-width: 270px; flex: 1; padding: 10px 12px; border: none; border-radius: var(--border-radius); background: var(--button); color: var(--text); box-shadow: var(--button-box-shadow); font-family: "IBM Plex Mono", monospace; }
    input:focus { outline: none; background: var(--button-hover); box-shadow: 0 0 0 2px var(--blue) inset; }
    .filter { display: inline-flex; align-items: center; gap: 6px; color: var(--subtext); font-size: 0.85rem; white-space: nowrap; }
    .filter select { padding: 8px 10px; border: none; border-radius: var(--border-radius); background: var(--button); color: var(--text); box-shadow: var(--button-box-shadow); }
    .meta, .sub { color: var(--subtext); font-size: 0.85rem; }
    .table-wrap { overflow-x: auto; border-radius: var(--border-radius); background: var(--popup-bg); box-shadow: 0 0 0 1.5px var(--popup-stroke) inset; }
    table { width: 100%; min-width: 1250px; border-collapse: collapse; }
    thead th { padding: 12px 14px; border-bottom: 1px solid var(--popup-stroke); text-align: left; color: var(--subtext); font-size: 0.8rem; font-weight: 700; }
    tbody td { padding: 12px 14px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); text-align: left; color: var(--text); font-size: 0.9rem; white-space: nowrap; }
    tbody tr:hover td { background: rgba(255, 255, 255, 0.03); }
    .sort-trigger { all: unset; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; color: inherit; font: inherit; }
    .sort-trigger:hover { color: var(--text); }
    .sort-indicator { width: 1.2em; text-align: center; font-size: 0.85em; opacity: 0.9; }
    th[aria-sort="none"] .sort-indicator { opacity: 0.5; }
    .mono { font-family: "IBM Plex Mono", monospace; }
    .selectable { user-select: text; -webkit-user-select: text; cursor: text; }
    .user-email { margin-bottom: 0.2rem; }
    .status { display: inline-flex; padding: 0.2rem 0.5rem; border-radius: 999px; font-weight: 600; font-size: 0.78rem; }
    .status-paid { color: #12824b; background: rgba(18, 130, 75, 0.14); }
    .status-created { color: #9a6600; background: rgba(188, 129, 0, 0.14); }
    .status-failed, .status-closed { color: #b23b3b; background: rgba(178, 59, 59, 0.14); }
    .loading, .empty { padding: calc(var(--padding) * 3); text-align: center; color: var(--subtext); }
    .error-message { padding: var(--padding); margin-bottom: var(--padding); border-radius: var(--border-radius); background: var(--red); color: var(--white); }
    @media (max-width: 800px) { .admin-container { padding: var(--padding); } input { min-width: 100%; } }
</style>
