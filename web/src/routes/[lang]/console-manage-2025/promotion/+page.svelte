<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { auth } from "$lib/api/social";
    import { currentApiURL } from "$lib/api/api-url";

    type PromotionSubmission = {
        id: number;
        user_id: number;
        clerk_user_id: string;
        promotion_type: "post" | "video" | string;
        access_method: string;
        requested_points: number;
        status: "PENDING" | "APPROVED" | "REJECTED" | string;
        awarded_points: number;
        admin_note: string | null;
        reviewed_by: string | null;
        reviewed_at: number | string | null;
        created_at: number | string;
        updated_at: number | string;
        user?: {
            primary_email: string | null;
            full_name: string | null;
            avatar_url: string | null;
        };
    };

    let submissions: PromotionSubmission[] = [];
    let loading = true;
    let error = "";
    let reviewingId: number | null = null;

    let search = "";
    let statusFilter = "";
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

        await loadSubmissions();
    });

    const typeLabel = (promotionType: string) => {
        if (promotionType === "post") return "Post Promotion";
        if (promotionType === "video") return "Video Promotion";
        return promotionType;
    };

    const statusLabel = (status: string) => {
        if (status === "PENDING") return "Pending";
        if (status === "APPROVED") return "Approved";
        if (status === "REJECTED") return "Rejected";
        return status;
    };

    async function loadSubmissions() {
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
            if (statusFilter) params.set("status", statusFilter);

            const res = await fetch(
                `${currentApiURL()}/user/admin/promotion-submissions?${params.toString()}`,
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
                throw new Error(data?.error?.message || "Failed to load submissions");
            }

            submissions = Array.isArray(data?.data?.submissions)
                ? data.data.submissions
                : [];

            const pagination = data?.data?.pagination || {};
            total = pagination.total ?? 0;
            pages = pagination.pages ?? 0;
            pageNum = pagination.page ?? pageNum;
            limit = pagination.limit ?? limit;
        } catch (e) {
            submissions = [];
            error = e instanceof Error ? e.message : "Network error";
        } finally {
            loading = false;
        }
    }

    async function reviewSubmission(item: PromotionSubmission, action: "approve" | "reject") {
        if (reviewingId) return;

        reviewingId = item.id;
        error = "";

        try {
            const token = getToken();
            if (!token) {
                goto(`/${lang}/console-manage-2025`);
                return;
            }

            const res = await fetch(
                `${currentApiURL()}/user/admin/promotion-submissions/${item.id}/review`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        action,
                        awardedPoints: action === "approve" ? item.requested_points : 0,
                    }),
                },
            );

            if (res.status === 401) {
                auth.logout();
                goto(`/${lang}/console-manage-2025`);
                return;
            }

            const data = await res.json().catch(() => ({}));
            if (!res.ok || data?.status !== "success") {
                throw new Error(data?.error?.message || "Failed to review submission");
            }

            await loadSubmissions();
        } catch (e) {
            error = e instanceof Error ? e.message : "Network error";
        } finally {
            reviewingId = null;
        }
    }

    async function goToPage(next: number) {
        if (loading) return;
        if (next < 1) return;
        if (pages && next > pages) return;
        pageNum = next;
        await loadSubmissions();
    }

    async function handleSearch() {
        pageNum = 1;
        await loadSubmissions();
    }

    async function handleLimitChange(nextLimit: number) {
        limit = nextLimit;
        pageNum = 1;
        await loadSubmissions();
    }

    async function handleStatusFilterChange(nextStatus: string) {
        statusFilter = nextStatus;
        pageNum = 1;
        await loadSubmissions();
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
</script>

<svelte:head>
    <title>Promotion Submissions - Console</title>
</svelte:head>

<div class="admin-container">
    <header class="admin-header">
        <h1>Promotion Submissions</h1>
    </header>

    <div class="toolbar">
        <div class="search">
            <input
                type="text"
                placeholder="Search access details / user email / Clerk ID"
                bind:value={search}
                on:keydown={(e) => e.key === "Enter" && handleSearch()}
            />
            <button class="btn-primary" on:click={handleSearch}>Search</button>
        </div>

        <div class="filters">
            <label class="status-filter">
                <span>Status</span>
                <select
                    bind:value={statusFilter}
                    on:change={() => handleStatusFilterChange(statusFilter)}
                >
                    <option value="">All</option>
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                </select>
            </label>

            <div class="pager">
                <span class="meta">Total {total}</span>
                <label class="limit">
                    <span>Per page</span>
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
                >
                    Prev
                </button>
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
                >
                    Next
                </button>
            </div>
        </div>
    </div>

    {#if error}
        <div class="error-message">{error}</div>
    {/if}

    {#if loading}
        <div class="loading">Loading...</div>
    {:else if submissions.length === 0}
        <div class="empty">No submissions</div>
    {:else}
        <div class="table-wrap">
            <table class="submissions-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Created At</th>
                        <th>User</th>
                        <th>Type</th>
                        <th>Access Details</th>
                        <th>Requested</th>
                        <th>Status</th>
                        <th>Review</th>
                    </tr>
                </thead>
                <tbody>
                    {#each submissions as item (item.id)}
                        <tr>
                            <td class="mono">{item.id}</td>
                            <td class="mono">{formatDate(item.created_at)}</td>
                            <td>
                                <div class="user-meta">
                                    <div>{item.user?.full_name || "-"}</div>
                                    <div class="sub mono selectable">
                                        {item.user?.primary_email || item.clerk_user_id}
                                    </div>
                                </div>
                            </td>
                            <td>{typeLabel(item.promotion_type)}</td>
                            <td>
                                <div class="access-cell">
                                    <div class="text clamp">{item.access_method}</div>
                                    <button
                                        class="btn-secondary btn-copy"
                                        type="button"
                                        on:click={() => copyText(item.access_method)}
                                    >
                                        Copy
                                    </button>
                                </div>
                            </td>
                            <td class="mono">{item.requested_points}</td>
                            <td>
                                <span class={`status ${item.status.toLowerCase()}`}>
                                    {statusLabel(item.status)}
                                </span>
                            </td>
                            <td>
                                {#if item.status === "PENDING"}
                                    <div class="review-actions">
                                        <button
                                            class="btn-approve"
                                            disabled={reviewingId === item.id}
                                            on:click={() => reviewSubmission(item, "approve")}
                                        >
                                            {reviewingId === item.id ? "..." : "Approve"}
                                        </button>
                                        <button
                                            class="btn-reject"
                                            disabled={reviewingId === item.id}
                                            on:click={() => reviewSubmission(item, "reject")}
                                        >
                                            {reviewingId === item.id ? "..." : "Reject"}
                                        </button>
                                    </div>
                                {:else}
                                    <div class="subtext mono">
                                        {item.status === "APPROVED"
                                            ? `+${item.awarded_points}`
                                            : "-"}
                                    </div>
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
        max-width: 1300px;
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

    .toolbar {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 12px;
    }

    .filters {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
    }

    .search {
        display: grid;
        grid-template-columns: minmax(260px, 1fr) auto;
        gap: 10px;
        width: 100%;
    }

    .search input,
    .status-filter select {
        width: 100%;
        padding: 10px 12px;
        border-radius: var(--border-radius);
        border: 1px solid var(--input-border);
        background: var(--input-background);
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

    .btn-approve {
        background: var(--green);
        color: var(--white);
    }

    .btn-reject {
        background: var(--red);
        color: var(--white);
    }

    button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .status-filter {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 0.85rem;
        color: var(--subtext);
    }

    .pager {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
    }

    .limit {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--subtext);
        font-size: 0.85rem;
    }

    .limit select {
        min-width: 72px;
        padding: 8px 10px;
        border-radius: var(--border-radius);
        border: 1px solid var(--input-border);
        background: var(--input-background);
        color: var(--text);
    }

    .meta {
        color: var(--subtext);
        font-size: 0.85rem;
    }

    .error-message {
        margin: 8px 0 12px;
        color: var(--red);
        font-weight: 600;
    }

    .loading,
    .empty {
        color: var(--subtext);
        padding: 20px 0;
    }

    .table-wrap {
        width: 100%;
        overflow: auto;
        border-radius: calc(var(--border-radius) + 2px);
        border: 1px solid var(--surface-2);
        background: var(--surface-0);
    }

    .submissions-table {
        width: 100%;
        border-collapse: collapse;
        min-width: 1080px;
    }

    .submissions-table th,
    .submissions-table td {
        padding: 10px;
        border-bottom: 1px solid var(--surface-2);
        text-align: left;
        vertical-align: top;
    }

    .submissions-table th {
        color: var(--subtext);
        font-size: 12px;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        font-weight: 700;
        background: var(--surface-1);
        position: sticky;
        top: 0;
        z-index: 1;
    }

    .mono {
        font-family: var(--monospace);
    }

    .sub {
        color: var(--subtext);
        font-size: 0.8rem;
    }

    .selectable {
        user-select: text;
    }

    .access-cell {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .btn-copy {
        width: fit-content;
        padding: 4px 8px;
        font-size: 0.75rem;
    }

    .text {
        white-space: pre-wrap;
        line-height: 1.45;
    }

    .clamp {
        max-height: 140px;
        overflow: auto;
    }

    .status {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 2px 10px;
        font-size: 12px;
        font-weight: 700;
        border: 1px solid var(--surface-2);
        color: var(--subtext);
        background: var(--surface-1);
    }

    .status.pending {
        border-color: var(--yellow);
        color: var(--yellow);
    }

    .status.approved {
        border-color: var(--green);
        color: var(--green);
    }

    .status.rejected {
        border-color: var(--red);
        color: var(--red);
    }

    .review-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }

    @media screen and (max-width: 980px) {
        .admin-container {
            padding: calc(var(--padding) * 1.2);
        }

        .search {
            grid-template-columns: 1fr;
        }
    }
</style>

