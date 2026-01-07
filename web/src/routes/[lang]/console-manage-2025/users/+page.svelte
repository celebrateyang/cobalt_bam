<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { auth } from "$lib/api/social";
    import { currentApiURL } from "$lib/api/api-url";

    type AdminUser = {
        id: number;
        clerk_user_id: string;
        primary_email: string | null;
        full_name: string | null;
        avatar_url: string | null;
        last_seen_at: number | string | null;
        points: number;
        is_disabled: boolean | null;
        created_at: number | string;
        updated_at: number | string;
    };

    type CreditOrder = {
        id: number;
        user_id: number;
        clerk_user_id: string;
        provider: string;
        product_key: string;
        points: number;
        amount_fen: number;
        currency: string;
        out_trade_no: string;
        status: string;
        provider_transaction_id: string | null;
        paid_at: number | string | null;
        created_at: number | string;
        updated_at: number | string;
    };

    let users: AdminUser[] = [];
    let loading = true;
    let error = "";
    let info = "";

    let search = "";
    let pageNum = 1;
    let limit = 20;
    let total = 0;
    let pages = 0;

    type SortKey = "created_at" | "last_seen_at" | "points";
    type SortOrder = "asc" | "desc";

    let sort: SortKey = "created_at";
    let order: SortOrder = "desc";

    let pointsDraft: Record<number, string> = {};
    let saving: Record<number, boolean> = {};
    let copiedUserId: number | null = null;
    let copiedTimeout: ReturnType<typeof setTimeout> | null = null;

    let showOrdersModal = false;
    let activeUser: AdminUser | null = null;
    let orders: CreditOrder[] = [];
    let ordersLoading = false;
    let ordersError = "";
    let ordersStatus = "";
    let ordersPageNum = 1;
    let ordersLimit = 20;
    let ordersTotal = 0;
    let ordersPages = 0;
    let copiedOrderId: number | null = null;
    let copiedOrderTimeout: ReturnType<typeof setTimeout> | null = null;

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

        await loadUsers();
    });

    async function loadUsers() {
        loading = true;
        error = "";
        info = "";

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
            params.set("sort", sort);
            params.set("order", order);

            const res = await fetch(
                `${currentApiURL()}/user/admin/users?${params.toString()}`,
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

            const data = await res.json();
            if (!res.ok || data.status !== "success") {
                throw new Error(data?.error?.message || "加载失败");
            }

            users = Array.isArray(data?.data?.users) ? data.data.users : [];

            const pagination = data?.data?.pagination || {};
            total = pagination.total ?? 0;
            pages = pagination.pages ?? 0;
            pageNum = pagination.page ?? pageNum;
            limit = pagination.limit ?? limit;

            const nextDraft: Record<number, string> = {};
            for (const u of users) {
                nextDraft[u.id] = String(u.points);
            }
            pointsDraft = nextDraft;
        } catch (e) {
            users = [];
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
        await loadUsers();
    }

    async function handleSearch() {
        pageNum = 1;
        await loadUsers();
    }

    async function handleLimitChange(nextLimit: number) {
        limit = nextLimit;
        pageNum = 1;
        await loadUsers();
    }

    const getAriaSort = (key: SortKey) => {
        if (sort !== key) return "none";
        return order === "asc" ? "ascending" : "descending";
    };

    const getSortIcon = (key: SortKey) => {
        if (sort !== key) return "⇅";
        return order === "asc" ? "↑" : "↓";
    };

    async function handleSort(nextSort: SortKey) {
        if (loading) return;
        if (sort === nextSort) {
            order = order === "asc" ? "desc" : "asc";
        } else {
            sort = nextSort;
            order = "desc";
        }

        pageNum = 1;
        await loadUsers();
    }

    function formatDate(ts: number | string | null | undefined) {
        if (ts == null) return "-";
        const raw =
            typeof ts === "string" ? Number.parseInt(ts, 10) : ts;
        if (!Number.isFinite(raw)) return "-";

        // tolerate seconds timestamps (10-digit) just in case
        const ms = raw < 1e12 ? raw * 1000 : raw;

        const d = new Date(ms);
        if (Number.isNaN(d.getTime())) return "-";
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }

    const copyText = async (text: string) => {
        const normalized = String(text ?? "").trim();
        if (!normalized) return false;

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(normalized);
                return true;
            }
        } catch {
            // fall back
        }

        try {
            const textarea = document.createElement("textarea");
            textarea.value = normalized;
            textarea.setAttribute("readonly", "");
            textarea.style.position = "fixed";
            textarea.style.top = "-1000px";
            textarea.style.left = "-1000px";
            document.body.appendChild(textarea);
            textarea.select();
            textarea.setSelectionRange(0, textarea.value.length);
            const ok = document.execCommand("copy");
            document.body.removeChild(textarea);
            return ok;
        } catch {
            return false;
        }
    };

    async function handleCopyEmail(userId: number, email: string) {
        const ok = await copyText(email);
        if (!ok) return;

        copiedUserId = userId;
        if (copiedTimeout) clearTimeout(copiedTimeout);
        copiedTimeout = setTimeout(() => {
            copiedUserId = null;
            copiedTimeout = null;
        }, 1500);
    }

    const formatAmount = (amountFen: number | null | undefined, currency?: string) => {
        if (amountFen == null || !Number.isFinite(amountFen)) return "-";
        const amount = (amountFen / 100).toFixed(2);
        if (!currency || currency === "CNY") return `¥${amount}`;
        return `${amount} ${currency}`;
    };

    const closeOrders = () => {
        showOrdersModal = false;
        activeUser = null;
        orders = [];
        ordersError = "";
        ordersLoading = false;
        ordersStatus = "";
        ordersPageNum = 1;
        ordersTotal = 0;
        ordersPages = 0;
        copiedOrderId = null;
        if (copiedOrderTimeout) clearTimeout(copiedOrderTimeout);
        copiedOrderTimeout = null;
    };

    async function loadOrders() {
        if (!activeUser) return;

        ordersLoading = true;
        ordersError = "";

        try {
            const token = getToken();
            if (!token) {
                goto(`/${lang}/console-manage-2025`);
                return;
            }

            const params = new URLSearchParams();
            params.set("page", String(ordersPageNum));
            params.set("limit", String(ordersLimit));
            if (ordersStatus) params.set("status", ordersStatus);

            const res = await fetch(
                `${currentApiURL()}/user/admin/users/${activeUser.id}/orders?${params.toString()}`,
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

            orders = Array.isArray(data?.data?.orders) ? data.data.orders : [];

            const pagination = data?.data?.pagination || {};
            ordersTotal = pagination.total ?? 0;
            ordersPages = pagination.pages ?? 0;
            ordersPageNum = pagination.page ?? ordersPageNum;
            ordersLimit = pagination.limit ?? ordersLimit;
        } catch (e) {
            orders = [];
            ordersError = e instanceof Error ? e.message : "网络错误";
        } finally {
            ordersLoading = false;
        }
    }

    async function openOrders(user: AdminUser) {
        activeUser = user;
        showOrdersModal = true;
        orders = [];
        ordersError = "";
        ordersStatus = "";
        ordersPageNum = 1;
        ordersLimit = 20;
        await loadOrders();
    }

    async function goToOrdersPage(next: number) {
        if (ordersLoading) return;
        if (next < 1) return;
        if (ordersPages && next > ordersPages) return;
        ordersPageNum = next;
        await loadOrders();
    }

    async function handleOrdersStatusChange(nextStatus: string) {
        ordersStatus = nextStatus;
        ordersPageNum = 1;
        await loadOrders();
    }

    async function handleOrdersLimitChange(nextLimit: number) {
        ordersLimit = nextLimit;
        ordersPageNum = 1;
        await loadOrders();
    }

    async function handleCopyOutTradeNo(orderId: number, outTradeNo: string) {
        const ok = await copyText(outTradeNo);
        if (!ok) return;

        copiedOrderId = orderId;
        if (copiedOrderTimeout) clearTimeout(copiedOrderTimeout);
        copiedOrderTimeout = setTimeout(() => {
            copiedOrderId = null;
            copiedOrderTimeout = null;
        }, 1500);
    }

    const parsePointsDraft = (draft: string | undefined) => {
        const normalized = String(draft ?? "").trim();
        if (!/^\d+$/.test(normalized)) return null;
        const points = Number.parseInt(normalized, 10);
        if (!Number.isFinite(points) || !Number.isInteger(points)) return null;
        return points;
    };

    async function savePoints(userId: number) {
        const token = getToken();
        if (!token) {
            goto(`/${lang}/console-manage-2025`);
            return;
        }

        const nextPoints = parsePointsDraft(pointsDraft[userId]);
        if (nextPoints == null || nextPoints < 0) {
            error = "积分必须是非负整数";
            return;
        }

        saving = { ...saving, [userId]: true };
        error = "";
        info = "";

        try {
            const res = await fetch(
                `${currentApiURL()}/user/admin/users/${userId}/points`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ points: nextPoints }),
                },
            );

            if (res.status === 401) {
                auth.logout();
                goto(`/${lang}/console-manage-2025`);
                return;
            }

            const data = await res.json();
            if (!res.ok || data.status !== "success") {
                throw new Error(data?.error?.message || "更新失败");
            }

            const updated = data?.data?.user as AdminUser | undefined;
            if (updated) {
                users = users.map((u) => (u.id === userId ? updated : u));
                pointsDraft = { ...pointsDraft, [userId]: String(updated.points) };
            }

            info = "积分已更新";
        } catch (e) {
            error = e instanceof Error ? e.message : "更新失败";
        } finally {
            saving = { ...saving, [userId]: false };
        }
    }
</script>

<svelte:head>
    <title>用户管理 - 管理后台</title>
</svelte:head>

<div class="admin-container">
    <header class="admin-header">
        <h1>用户管理</h1>
    </header>

    <div class="toolbar">
        <div class="search">
            <input
                type="text"
                placeholder="搜索邮箱 / 姓名 / Clerk ID"
                bind:value={search}
                on:keydown={(e) => e.key === "Enter" && handleSearch()}
            />
            <button class="btn-primary" on:click={handleSearch}>搜索</button>
        </div>

        <div class="pager">
            <span class="meta">共 {total} 用户</span>
            <label class="limit">
                <span>每页</span>
                <select
                    bind:value={limit}
                    on:change={() => handleLimitChange(limit)}
                >
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

    {#if info}
        <div class="info-message">{info}</div>
    {/if}

    {#if loading}
        <div class="loading">加载中...</div>
    {:else if users.length === 0}
        <div class="empty">暂无用户</div>
    {:else}
        <div class="table-wrap">
            <table class="users-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>用户</th>
                        <th>邮箱</th>
                        <th aria-sort={getAriaSort("points")} class="sortable">
                            <button
                                type="button"
                                class="sort-trigger"
                                aria-label="按积分排序"
                                disabled={loading}
                                on:click={() => handleSort("points")}
                            >
                                积分
                                <span
                                    class="sort-indicator"
                                    aria-hidden="true"
                                    >{getSortIcon("points")}</span
                                >
                            </button>
                        </th>
                        <th>订单</th>
                        <th
                            aria-sort={getAriaSort("last_seen_at")}
                            class="sortable"
                        >
                            <button
                                type="button"
                                class="sort-trigger"
                                aria-label="按最近活跃排序"
                                disabled={loading}
                                on:click={() => handleSort("last_seen_at")}
                            >
                                最近活跃
                                <span
                                    class="sort-indicator"
                                    aria-hidden="true"
                                    >{getSortIcon("last_seen_at")}</span
                                >
                            </button>
                        </th>
                        <th
                            aria-sort={getAriaSort("created_at")}
                            class="sortable"
                        >
                            <button
                                type="button"
                                class="sort-trigger"
                                aria-label="按创建时间排序"
                                disabled={loading}
                                on:click={() => handleSort("created_at")}
                            >
                                创建时间
                                <span
                                    class="sort-indicator"
                                    aria-hidden="true"
                                    >{getSortIcon("created_at")}</span
                                >
                            </button>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {#each users as user (user.id)}
                        <tr>
                            <td class="mono">{user.id}</td>
                            <td>
                                <div class="user-cell">
                                    {#if user.avatar_url}
                                        <img
                                            class="avatar"
                                            src={user.avatar_url}
                                            alt={user.full_name ||
                                                user.primary_email ||
                                                user.clerk_user_id}
                                        />
                                    {:else}
                                        <div class="avatar placeholder">
                                            {(user.full_name ||
                                                user.primary_email ||
                                                user.clerk_user_id)
                                                ?.charAt(0)
                                                ?.toUpperCase() || "U"}
                                        </div>
                                    {/if}
                                    <div class="user-meta">
                                        <div class="name">
                                            {user.full_name || "-"}
                                        </div>
                                        <div class="sub mono">
                                            {user.clerk_user_id}
                                        </div>
                                    </div>
                                </div>
                            </td>
                            <td>
                                {#if user.primary_email}
                                    <div class="email-cell">
                                        <span
                                            class="mono selectable email-text"
                                            title={user.primary_email}
                                            >{user.primary_email}</span
                                        >
                                        <button
                                            class="btn-secondary btn-copy"
                                            type="button"
                                            on:click={() =>
                                                handleCopyEmail(
                                                    user.id,
                                                    user.primary_email,
                                                )}
                                        >
                                            {copiedUserId === user.id
                                                ? "已复制"
                                                : "复制"}
                                        </button>
                                    </div>
                                {:else}
                                    -
                                {/if}
                            </td>
                            <td>
                                <div class="points-cell">
                                    <input
                                        class="points-input"
                                        type="number"
                                        min="0"
                                        step="1"
                                        bind:value={pointsDraft[user.id]}
                                        disabled={saving[user.id]}
                                    />
                                    <button
                                        class="btn-primary btn-save"
                                        disabled={saving[user.id] ||
                                            parsePointsDraft(pointsDraft[user.id]) == null ||
                                            parsePointsDraft(pointsDraft[user.id]) === user.points}
                                        on:click={() => savePoints(user.id)}
                                    >
                                        {saving[user.id]
                                            ? "保存中..."
                                            : "保存"}
                                    </button>
                                </div>
                            </td>
                            <td>
                                <button
                                    class="btn-secondary btn-orders"
                                    type="button"
                                    on:click={() => void openOrders(user)}
                                >
                                    查看
                                </button>
                            </td>
                            <td>{formatDate(user.last_seen_at)}</td>
                            <td>{formatDate(user.created_at)}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>

{#if showOrdersModal && activeUser}
    <div class="modal-overlay" on:click={closeOrders}>
        <div class="modal modal-orders" on:click|stopPropagation>
            <header class="modal-header">
                <div class="modal-title">
                    <h2>订单信息</h2>
                    <div class="modal-subtitle mono selectable">
                        用户 #{activeUser.id}
                        {#if activeUser.primary_email}
                            · {activeUser.primary_email}
                        {:else if activeUser.full_name}
                            · {activeUser.full_name}
                        {:else}
                            · {activeUser.clerk_user_id}
                        {/if}
                    </div>
                </div>
                <button class="btn-secondary btn-close" type="button" on:click={closeOrders}>
                    关闭
                </button>
            </header>

            <div class="modal-toolbar">
                <label class="filter">
                    <span>状态</span>
                    <select
                        bind:value={ordersStatus}
                        on:change={() => void handleOrdersStatusChange(ordersStatus)}
                        disabled={ordersLoading}
                    >
                        <option value="">全部</option>
                        <option value="CREATED">CREATED</option>
                        <option value="PAID">PAID</option>
                        <option value="FAILED">FAILED</option>
                        <option value="CLOSED">CLOSED</option>
                    </select>
                </label>

                <label class="filter">
                    <span>每页</span>
                    <select
                        bind:value={ordersLimit}
                        on:change={() => void handleOrdersLimitChange(ordersLimit)}
                        disabled={ordersLoading}
                    >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                    </select>
                </label>

                <button
                    class="btn-secondary"
                    type="button"
                    disabled={ordersLoading}
                    on:click={() => void loadOrders()}
                >
                    刷新
                </button>
            </div>

            {#if ordersError}
                <div class="error-message">{ordersError}</div>
            {/if}

            {#if ordersLoading}
                <div class="loading">加载中...</div>
            {:else if orders.length === 0}
                <div class="empty">暂无订单</div>
            {:else}
                <div class="table-wrap modal-table-wrap">
                    <table class="orders-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>状态</th>
                                <th>积分</th>
                                <th>金额</th>
                                <th>渠道</th>
                                <th>订单号</th>
                                <th>支付时间</th>
                                <th>创建时间</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each orders as o (o.id)}
                                <tr>
                                    <td class="mono">{o.id}</td>
                                    <td>
                                        <span
                                            class={`status-badge status-${String(
                                                o.status || "",
                                            ).toLowerCase()}`}
                                            >{o.status}</span
                                        >
                                    </td>
                                    <td class="mono">{o.points}</td>
                                    <td class="mono">
                                        {formatAmount(o.amount_fen, o.currency)}
                                    </td>
                                    <td class="mono">{o.provider}</td>
                                    <td>
                                        <div class="order-no-cell">
                                            <span
                                                class="mono selectable order-no"
                                                title={o.out_trade_no}
                                                >{o.out_trade_no}</span
                                            >
                                            <button
                                                class="btn-secondary btn-copy"
                                                type="button"
                                                on:click={() =>
                                                    void handleCopyOutTradeNo(
                                                        o.id,
                                                        o.out_trade_no,
                                                    )}
                                            >
                                                {copiedOrderId === o.id
                                                    ? "已复制"
                                                    : "复制"}
                                            </button>
                                        </div>
                                    </td>
                                    <td class="mono">{formatDate(o.paid_at)}</td>
                                    <td class="mono">
                                        {formatDate(o.created_at)}
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>

                <div class="pager modal-pager">
                    <span class="meta">共 {ordersTotal} 单</span>
                    <button
                        class="btn-secondary"
                        disabled={ordersLoading || ordersPageNum <= 1}
                        on:click={() => void goToOrdersPage(ordersPageNum - 1)}
                        >上一页</button
                    >
                    <span class="meta">
                        {#if ordersTotal === 0}
                            0 / 0
                        {:else}
                            {ordersPageNum} / {ordersPages}
                        {/if}
                    </span>
                    <button
                        class="btn-secondary"
                        disabled={ordersLoading ||
                            (ordersPages ? ordersPageNum >= ordersPages : true)}
                        on:click={() => void goToOrdersPage(ordersPageNum + 1)}
                        >下一页</button
                    >
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .admin-container {
        width: 100%;
        max-width: 1200px;
        margin: 0;
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

    .info-message {
        background: var(--green);
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
        min-width: 980px;
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

    th.sortable {
        white-space: nowrap;
    }

    th[aria-sort="ascending"],
    th[aria-sort="descending"] {
        color: var(--text);
    }

    .sort-trigger {
        all: unset;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        color: inherit;
        font: inherit;
    }

    .sort-trigger:hover:not(:disabled) {
        color: var(--text);
    }

    .sort-trigger:focus-visible {
        outline: 2px solid var(--blue);
        outline-offset: 2px;
        border-radius: 6px;
    }

    .sort-trigger:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .sort-indicator {
        width: 1.2em;
        text-align: center;
        font-size: 0.85em;
        opacity: 0.9;
    }

    th[aria-sort="none"] .sort-indicator {
        opacity: 0.5;
    }

    tbody td {
        padding: 12px 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        color: var(--text);
        font-size: 0.9rem;
        vertical-align: middle;
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
        min-width: 260px;
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
        max-width: 360px;
    }

    .selectable {
        user-select: text;
        -webkit-user-select: text;
        cursor: text;
    }

    .email-cell {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 280px;
        max-width: 380px;
    }

    .email-text {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .btn-copy {
        padding: 8px 10px;
        font-size: 0.8rem;
        white-space: nowrap;
    }

    .points-cell {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .points-input {
        width: 110px;
        padding: 9px 10px;
        border: none;
        border-radius: var(--border-radius);
        background: var(--button);
        color: var(--text);
        box-shadow: var(--button-box-shadow);
        font-family: "IBM Plex Mono", monospace;
    }

    .points-input:focus {
        outline: none;
        background: var(--button-hover);
        box-shadow: 0 0 0 2px var(--blue) inset;
    }

    .btn-save {
        padding: 9px 12px;
        font-size: 0.8rem;
    }

    .btn-orders {
        padding: 9px 12px;
        font-size: 0.8rem;
        white-space: nowrap;
    }

    .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.55);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: calc(var(--padding) * 2);
        z-index: 3000;
    }

    .modal {
        width: 100%;
        max-width: 1100px;
        max-height: 90vh;
        overflow: auto;
        background: var(--popup-bg);
        border-radius: calc(var(--border-radius) * 1.5);
        padding: calc(var(--padding) * 2);
        box-shadow:
            0 0 0 1.5px var(--popup-stroke) inset,
            0 16px 40px rgba(0, 0, 0, 0.25);
    }

    .modal-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--padding);
        margin-bottom: var(--padding);
    }

    .modal-title h2 {
        margin: 0;
        font-size: 1.3rem;
        font-weight: 800;
        color: var(--text);
    }

    .modal-subtitle {
        margin-top: 6px;
        color: var(--subtext);
        font-size: 0.85rem;
        line-height: 1.3;
    }

    .btn-close {
        white-space: nowrap;
    }

    .modal-toolbar {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: calc(var(--padding) / 2);
        flex-wrap: wrap;
        margin-bottom: var(--padding);
    }

    .filter {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--subtext);
        font-size: 0.85rem;
    }

    .filter select {
        padding: 8px 10px;
        border: none;
        border-radius: var(--border-radius);
        background: var(--button);
        color: var(--text);
        box-shadow: var(--button-box-shadow);
    }

    .modal-table-wrap {
        max-height: 55vh;
        overflow: auto;
    }

    .orders-table {
        min-width: 920px;
    }

    .status-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 0.78rem;
        font-weight: 900;
        letter-spacing: 0.2px;
        border: 1px solid rgba(0, 0, 0, 0.08);
        background: rgba(0, 0, 0, 0.06);
        color: var(--white);
        white-space: nowrap;
    }

    .status-created {
        border-color: #1d4ed8;
        background: #2563eb;
    }

    .status-paid {
        border-color: #15803d;
        background: #16a34a;
    }

    .status-failed {
        border-color: #b91c1c;
        background: #dc2626;
    }

    .status-closed {
        border-color: #475569;
        background: #64748b;
    }

    .order-no-cell {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 320px;
        max-width: 420px;
    }

    .order-no {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .modal-pager {
        justify-content: space-between;
        margin-top: var(--padding);
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

        .pager {
            justify-content: flex-start;
        }

        .modal-overlay {
            padding: var(--padding);
        }

        .modal {
            padding: calc(var(--padding) * 1.5);
        }

        .modal-toolbar {
            justify-content: flex-start;
        }
    }
</style>
