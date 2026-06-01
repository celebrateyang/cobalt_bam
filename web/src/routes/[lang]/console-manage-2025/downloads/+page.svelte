<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";

    import { currentApiURL } from "$lib/api/api-url";
    import { auth } from "$lib/api/social";

    type AttemptUser = {
        primary_email: string | null;
        full_name: string | null;
        avatar_url: string | null;
    };

    type DownloadAttempt = {
        id: number;
        request_id: string;
        user_id: number | null;
        clerk_user_id: string | null;
        email: string | null;
        source_url: string;
        source_host: string | null;
        service: string | null;
        status: "pending" | "success" | "failed" | "exception" | string;
        http_status: number | null;
        body_status: string | null;
        error_code: string | null;
        error_message: string | null;
        points_outcome: string | null;
        points_required: number | null;
        points_before: number | null;
        points_after: number | null;
        submitted_at: number | string;
        completed_at: number | string | null;
        elapsed_ms: number | null;
        user?: AttemptUser;
    };

    type SortKey = "submitted_at" | "completed_at" | "status" | "elapsed_ms";
    type SortOrder = "asc" | "desc";

    let attempts: DownloadAttempt[] = [];
    let loading = true;
    let error = "";
    let search = "";
    let host = "";
    let status = "";
    let rangeHours = 48;
    let pageNum = 1;
    let limit = 20;
    let total = 0;
    let pages = 0;
    let sort: SortKey = "submitted_at";
    let order: SortOrder = "desc";
    let mediaUrls: Record<number, string> = {};
    let mediaLoadingId: number | null = null;
    let mediaErrorId: number | null = null;

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

        await loadAttempts();
    });

    function formatDate(ts: number | string | null | undefined) {
        if (ts == null) return "-";
        const raw = typeof ts === "string" ? Number.parseInt(ts, 10) : ts;
        if (!Number.isFinite(raw)) return "-";
        const ms = raw < 1e12 ? raw * 1000 : raw;
        const d = new Date(ms);
        if (Number.isNaN(d.getTime())) return "-";

        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
    }

    function formatDuration(ms: number | null | undefined) {
        if (ms == null || !Number.isFinite(ms)) return "-";
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    }

    function displayEmail(item: DownloadAttempt) {
        return item.email || item.user?.primary_email || "unknown";
    }

    function displayReason(item: DownloadAttempt) {
        if (item.status === "success") return "-";
        return item.error_message || item.error_code || item.body_status || "-";
    }

    function cleanUrl(value: string | null | undefined) {
        const trimmed = String(value || "").trim();
        const unquoted = trimmed.replace(/^["']+|["']+$/g, "");
        return unquoted || "#";
    }

    function displaySourceUrl(value: string | null | undefined) {
        const url = cleanUrl(value);

        try {
            const parsed = new URL(url);
            const match = parsed.pathname.match(/^\/_shortLink\/([^/]+)\/?$/);
            if (
                match?.[1] &&
                ["douyin.com", "www.douyin.com"].includes(parsed.hostname)
            ) {
                return `https://v.douyin.com/${encodeURIComponent(decodeURIComponent(match[1]))}/`;
            }
        } catch {
            // Keep the stored source URL when it cannot be parsed.
        }

        return url;
    }

    function rangeStart() {
        return Date.now() - rangeHours * 60 * 60 * 1000;
    }

    async function loadAttempts() {
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
            params.set("from", String(rangeStart()));
            params.set("sort", sort);
            params.set("order", order);
            if (status) params.set("status", status);
            if (host.trim()) params.set("host", host.trim());
            if (search.trim()) params.set("search", search.trim());

            const res = await fetch(
                `${currentApiURL()}/user/admin/download-attempts?${params.toString()}`,
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
                throw new Error(data?.error?.message || "Failed to load downloads");
            }

            attempts = Array.isArray(data?.data?.attempts)
                ? data.data.attempts
                : [];

            const pagination = data?.data?.pagination || {};
            total = pagination.total ?? 0;
            pages = pagination.pages ?? 0;
            pageNum = pagination.page ?? pageNum;
            limit = pagination.limit ?? limit;
        } catch (e) {
            attempts = [];
            error = e instanceof Error ? e.message : "Network error";
        } finally {
            loading = false;
        }
    }

    async function handleSearch() {
        pageNum = 1;
        await loadAttempts();
    }

    async function handleStatusChange(nextStatus: string) {
        status = nextStatus;
        pageNum = 1;
        await loadAttempts();
    }

    async function handleRangeChange(nextRange: number) {
        rangeHours = Number(nextRange);
        pageNum = 1;
        await loadAttempts();
    }

    async function handleLimitChange(nextLimit: number) {
        limit = Number(nextLimit);
        pageNum = 1;
        await loadAttempts();
    }

    async function goToPage(next: number) {
        if (loading || next < 1 || (pages && next > pages)) return;
        pageNum = next;
        await loadAttempts();
    }

    const getAriaSort = (key: SortKey) => {
        if (sort !== key) return "none";
        return order === "asc" ? "ascending" : "descending";
    };

    const getSortIcon = (key: SortKey) => {
        if (sort !== key) return "sort";
        return order === "asc" ? "asc" : "desc";
    };

    async function handleSort(nextSort: SortKey) {
        if (loading) return;
        if (sort === nextSort) {
            order = order === "asc" ? "desc" : "asc";
        } else {
            sort = nextSort;
            order = nextSort === "status" ? "asc" : "desc";
        }

        pageNum = 1;
        await loadAttempts();
    }

    function canOpenVideo(item: DownloadAttempt) {
        return item.status === "success" && item.service === "weibo";
    }

    async function openVideo(item: DownloadAttempt) {
        if (!canOpenVideo(item) || mediaLoadingId === item.id) return;

        const popup = window.open("", "_blank");
        mediaLoadingId = item.id;
        mediaErrorId = null;

        try {
            const token = getToken();
            if (!token) {
                popup?.close();
                goto(`/${lang}/console-manage-2025`);
                return;
            }

            const res = await fetch(
                `${currentApiURL()}/user/admin/download-attempts/${item.id}/media-url`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                },
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data?.status !== "success" || !data?.data?.url) {
                throw new Error(data?.error?.message || "Failed to refresh video URL");
            }

            const url = cleanUrl(data.data.url);
            mediaUrls = { ...mediaUrls, [item.id]: url };
            if (popup) {
                popup.location.href = url;
            } else {
                window.open(url, "_blank", "noopener,noreferrer");
            }
        } catch {
            popup?.close();
            mediaErrorId = item.id;
        } finally {
            mediaLoadingId = null;
        }
    }
</script>

<svelte:head>
    <title>Downloads - console-manage-2025</title>
</svelte:head>

<div class="admin-container">
    <header class="admin-header">
        <h1>Downloads</h1>
    </header>

    <div class="toolbar">
        <div class="filters">
            <input
                type="text"
                placeholder="Search email, URL, service, error"
                bind:value={search}
                on:keydown={(e) => e.key === "Enter" && handleSearch()}
            />
            <input
                type="text"
                placeholder="Host"
                bind:value={host}
                on:keydown={(e) => e.key === "Enter" && handleSearch()}
            />
            <button class="btn-primary" type="button" on:click={handleSearch}>
                Search
            </button>

            <label class="filter">
                <span>Status</span>
                <select
                    bind:value={status}
                    on:change={() => void handleStatusChange(status)}
                    disabled={loading}
                >
                    <option value="">All</option>
                    <option value="pending">pending</option>
                    <option value="success">success</option>
                    <option value="failed">failed</option>
                    <option value="exception">exception</option>
                </select>
            </label>

            <label class="filter">
                <span>Range</span>
                <select
                    bind:value={rangeHours}
                    on:change={() => void handleRangeChange(rangeHours)}
                    disabled={loading}
                >
                    <option value={1}>1h</option>
                    <option value={6}>6h</option>
                    <option value={24}>24h</option>
                    <option value={48}>2d</option>
                </select>
            </label>
        </div>

        <div class="pager">
            <span class="meta">{total} rows</span>
            <label class="filter">
                <span>Per page</span>
                <select
                    bind:value={limit}
                    on:change={() => void handleLimitChange(limit)}
                    disabled={loading}
                >
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
                on:click={() => void goToPage(pageNum - 1)}
            >
                Prev
            </button>
            <span class="meta">{total === 0 ? "0 / 0" : `${pageNum} / ${pages}`}</span>
            <button
                class="btn-secondary"
                type="button"
                disabled={loading || (pages ? pageNum >= pages : true)}
                on:click={() => void goToPage(pageNum + 1)}
            >
                Next
            </button>
        </div>
    </div>

    {#if error}
        <div class="error-message">{error}</div>
    {/if}

    {#if loading}
        <div class="loading">Loading...</div>
    {:else if attempts.length === 0}
        <div class="empty">No download attempts in this window.</div>
    {:else}
        <div class="table-wrap">
            <table class="downloads-table">
                <thead>
                    <tr>
                        <th aria-sort={getAriaSort("submitted_at")} class="sortable">
                            <button
                                type="button"
                                class="sort-trigger"
                                disabled={loading}
                                on:click={() => void handleSort("submitted_at")}
                            >
                                Submitted
                                <span>{getSortIcon("submitted_at")}</span>
                            </button>
                        </th>
                        <th>User</th>
                        <th>URL</th>
                        <th aria-sort={getAriaSort("status")} class="sortable">
                            <button
                                type="button"
                                class="sort-trigger"
                                disabled={loading}
                                on:click={() => void handleSort("status")}
                            >
                                Status
                                <span>{getSortIcon("status")}</span>
                            </button>
                        </th>
                        <th>Reason</th>
                        <th aria-sort={getAriaSort("elapsed_ms")} class="sortable">
                            <button
                                type="button"
                                class="sort-trigger"
                                disabled={loading}
                                on:click={() => void handleSort("elapsed_ms")}
                            >
                                Time
                                <span>{getSortIcon("elapsed_ms")}</span>
                            </button>
                        </th>
                        <th>Points</th>
                    </tr>
                </thead>
                <tbody>
                    {#each attempts as item (item.id)}
                        <tr>
                            <td class="mono">{formatDate(item.submitted_at)}</td>
                            <td>
                                <div class="user-cell">
                                    <div class="email mono selectable" title={displayEmail(item)}>
                                        {displayEmail(item)}
                                    </div>
                                    <div class="sub">
                                        {item.user_id ? `#${item.user_id}` : "anonymous"}
                                    </div>
                                </div>
                            </td>
                            <td>
                                <a
                                    class="url-cell selectable"
                                    href={displaySourceUrl(item.source_url)}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={displaySourceUrl(item.source_url)}
                                >
                                    {displaySourceUrl(item.source_url)}
                                </a>
                                <div class="sub mono">
                                    {item.service || item.source_host || "-"} / {item.request_id}
                                </div>
                                {#if canOpenVideo(item)}
                                    <div class="media-actions">
                                        <button
                                            class="media-trigger"
                                            type="button"
                                            disabled={mediaLoadingId === item.id}
                                            on:click={() => void openVideo(item)}
                                        >
                                            {mediaLoadingId === item.id ? "Refreshing..." : "Open video"}
                                        </button>
                                        {#if mediaUrls[item.id]}
                                            <a
                                                class="media-url selectable"
                                                href={mediaUrls[item.id]}
                                                target="_blank"
                                                rel="noreferrer"
                                                title={mediaUrls[item.id]}
                                            >
                                                accessible URL
                                            </a>
                                        {/if}
                                        {#if mediaErrorId === item.id}
                                            <span class="media-error">refresh failed</span>
                                        {/if}
                                    </div>
                                {/if}
                            </td>
                            <td>
                                <span class={`status-badge status-${item.status}`}>
                                    {item.status}
                                </span>
                                <div class="sub">
                                    {item.http_status ?? "-"} / {item.body_status || "-"}
                                </div>
                            </td>
                            <td>
                                <div class="reason" title={displayReason(item)}>
                                    {displayReason(item)}
                                </div>
                                {#if item.error_code}
                                    <div class="sub mono">{item.error_code}</div>
                                {/if}
                            </td>
                            <td class="mono">{formatDuration(item.elapsed_ms)}</td>
                            <td>
                                <div class="mono">{item.points_outcome || "-"}</div>
                                <div class="sub">
                                    {item.points_required ?? "-"} / {item.points_before ?? "-"} -> {item.points_after ?? "-"}
                                </div>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
        <div class="pager pager-bottom">
            <span class="meta">{total} rows</span>
            <label class="filter">
                <span>Per page</span>
                <select
                    bind:value={limit}
                    on:change={() => void handleLimitChange(limit)}
                    disabled={loading}
                >
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
                on:click={() => void goToPage(pageNum - 1)}
            >
                Prev
            </button>
            <span class="meta">{total === 0 ? "0 / 0" : `${pageNum} / ${pages}`}</span>
            <button
                class="btn-secondary"
                type="button"
                disabled={loading || (pages ? pageNum >= pages : true)}
                on:click={() => void goToPage(pageNum + 1)}
            >
                Next
            </button>
        </div>
    {/if}
</div>

<style>
    .admin-container {
        width: 100%;
        max-width: 1500px;
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
        letter-spacing: 0;
    }

    .toolbar {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--padding);
        flex-wrap: wrap;
        margin-bottom: var(--padding);
    }

    .filters,
    .pager {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
    }

    .pager-bottom {
        justify-content: flex-end;
        margin-top: var(--padding);
    }

    input,
    select {
        min-height: 38px;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--background);
        color: var(--text);
        padding: 8px 10px;
        font: inherit;
    }

    input {
        width: min(320px, 70vw);
    }

    .filter {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--text);
        font-size: 0.9rem;
    }

    .btn-primary,
    .btn-secondary {
        min-height: 38px;
        border: none;
        border-radius: 6px;
        padding: 8px 12px;
        font-weight: 700;
        cursor: pointer;
    }

    .btn-primary {
        background: var(--primary);
        color: var(--button-text);
    }

    .btn-secondary {
        background: var(--button-hover-transparent);
        color: var(--text);
    }

    .btn-secondary:disabled,
    .btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .table-wrap {
        width: 100%;
        overflow-x: auto;
        border: 1px solid var(--border);
        border-radius: 8px;
    }

    .downloads-table {
        width: 100%;
        border-collapse: collapse;
        min-width: 1220px;
        font-size: 0.9rem;
    }

    th,
    td {
        padding: 11px 12px;
        border-bottom: 1px solid var(--border);
        text-align: left;
        vertical-align: top;
    }

    th {
        color: var(--text);
        font-size: 0.82rem;
        text-transform: uppercase;
        background: var(--background-secondary);
    }

    tr:last-child td {
        border-bottom: none;
    }

    .sort-trigger {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        border: none;
        background: transparent;
        color: inherit;
        padding: 0;
        cursor: pointer;
        font: inherit;
        font-weight: 800;
        text-transform: inherit;
    }

    .status-badge {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 3px 8px;
        border-radius: 999px;
        font-size: 0.78rem;
        font-weight: 800;
        background: var(--button-hover-transparent);
        color: var(--text);
    }

    .status-success {
        background: rgba(74, 122, 28, 0.15);
        color: #4a7a1c;
    }

    .status-failed,
    .status-exception {
        background: rgba(190, 45, 45, 0.14);
        color: #be2d2d;
    }

    .status-pending {
        background: rgba(170, 120, 0, 0.16);
        color: #8a6500;
    }

    .mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    .selectable {
        user-select: text;
    }

    .sub {
        margin-top: 4px;
        color: var(--text);
        opacity: 0.68;
        font-size: 0.78rem;
        line-height: 1.35;
    }

    .url-cell,
    .reason {
        display: block;
        max-width: 360px;
        color: var(--text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .url-cell {
        text-decoration: underline;
        text-underline-offset: 2px;
    }

    .media-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 6px;
        font-size: 0.78rem;
    }

    .media-trigger {
        border: none;
        border-radius: 4px;
        background: var(--primary);
        color: var(--button-text);
        padding: 3px 7px;
        cursor: pointer;
        font: inherit;
        font-weight: 700;
    }

    .media-trigger:disabled {
        opacity: 0.5;
        cursor: wait;
    }

    .media-url {
        color: var(--text);
        text-decoration: underline;
        text-underline-offset: 2px;
    }

    .media-error {
        color: var(--red);
    }

    .user-cell {
        min-width: 0;
    }

    .email {
        max-width: 220px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .meta,
    .loading,
    .empty,
    .error-message {
        color: var(--text);
    }

    .error-message {
        margin-bottom: var(--padding);
        color: var(--red);
        font-weight: 700;
    }

    .loading,
    .empty {
        padding: var(--padding);
        border: 1px solid var(--border);
        border-radius: 8px;
    }

    @media screen and (max-width: 750px) {
        .admin-container {
            padding: var(--padding);
        }

        input {
            width: 100%;
        }

        .filters,
        .pager {
            width: 100%;
            align-items: stretch;
        }
    }
</style>
