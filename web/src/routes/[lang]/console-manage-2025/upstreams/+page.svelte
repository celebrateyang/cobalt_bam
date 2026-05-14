<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";

    import { auth } from "$lib/api/social";
    import { currentApiURL } from "$lib/api/api-url";

    type UpstreamNode = {
        url: string;
        region?: "cn" | "global" | string;
        healthy: boolean;
        circuitOpen: boolean;
        inFlight: number;
        consecutiveFailures: number;
        latencyMs: number | null;
        lastSuccessAt: string | null;
        lastFailureAt: string | null;
        lastFailureReason: string | null;
        circuitOpenUntil: string | null;
    };

    type UpstreamHealth = {
        status: string;
        configured: boolean;
        total: number;
        available: number;
        upstreams: UpstreamNode[];
    };

    let health: UpstreamHealth | null = null;
    let loading = true;
    let refreshing = false;
    let error = "";
    let lastUpdated = "";
    let autoRefresh = true;
    let refreshTimer: ReturnType<typeof setInterval> | undefined;

    $: lang = $page.params.lang;
    $: endpoint = `${currentApiURL()}/upstreams/health`;
    $: upstreams = health?.upstreams ?? [];

    onMount(() => {
        void init();
        refreshTimer = setInterval(() => {
            if (autoRefresh && !refreshing) {
                void loadHealth(true);
            }
        }, 30000);

        return () => {
            if (refreshTimer) clearInterval(refreshTimer);
        };
    });

    async function init() {
        const verified = await auth.verify();
        if (verified.status !== "success") {
            goto(`/${lang}/console-manage-2025`);
            return;
        }

        await loadHealth(false);
    }

    async function loadHealth(silent: boolean) {
        const token =
            typeof window !== "undefined"
                ? window.localStorage.getItem("admin_token")
                : null;

        if (!token) {
            goto(`/${lang}/console-manage-2025`);
            return;
        }

        if (silent) {
            refreshing = true;
        } else {
            loading = true;
        }
        error = "";

        try {
            const response = await fetch(endpoint, {
                method: "GET",
                headers: {
                    Accept: "application/json",
                    Authorization: `Bearer ${token}`,
                },
            });

            const data = await response.json().catch(() => null);

            if (response.status === 401) {
                auth.logout();
                goto(`/${lang}/console-manage-2025`);
                return;
            }

            if (!response.ok || data?.status !== "ok") {
                throw new Error(data?.error?.message || `Request failed: ${response.status}`);
            }

            health = data as UpstreamHealth;
            lastUpdated = new Date().toLocaleString();
        } catch (e) {
            error = e instanceof Error ? e.message : "Failed to load upstream health";
        } finally {
            loading = false;
            refreshing = false;
        }
    }

    async function copyEndpoint() {
        if (typeof navigator === "undefined" || !navigator.clipboard) return;
        await navigator.clipboard.writeText(endpoint);
    }

    const formatDate = (value: string | null) => {
        if (!value) return "-";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleString();
    };

    const nodeStatus = (node: UpstreamNode) => {
        if (node.circuitOpen) return "Circuit open";
        if (!node.healthy) return "Unhealthy";
        return "Healthy";
    };
</script>

<svelte:head>
    <title>Upstreams - FreeSaveVideo</title>
</svelte:head>

<div class="upstreams-admin">
    <header class="page-header">
        <div>
            <h1>Upstreams</h1>
            <p>Monitor the upstream fallback pool used by the production API.</p>
        </div>
        <div class="header-actions">
            <label class="toggle">
                <input type="checkbox" bind:checked={autoRefresh} />
                Auto refresh
            </label>
            <button class="btn-secondary" type="button" on:click={copyEndpoint}>
                Copy URL
            </button>
            <button
                class="btn-primary"
                type="button"
                on:click={() => loadHealth(false)}
                disabled={loading || refreshing}
            >
                {loading || refreshing ? "Refreshing..." : "Refresh"}
            </button>
        </div>
    </header>

    <div class="endpoint-row">
        <span>Endpoint</span>
        <code>{endpoint}</code>
    </div>

    {#if error}
        <div class="error-banner">{error}</div>
    {/if}

    {#if loading}
        <div class="panel placeholder">Loading upstream health...</div>
    {:else if health}
        <section class="summary-grid">
            <div class="metric">
                <span>Status</span>
                <strong>{health.status}</strong>
            </div>
            <div class="metric">
                <span>Configured</span>
                <strong>{health.configured ? "Yes" : "No"}</strong>
            </div>
            <div class="metric">
                <span>Available</span>
                <strong>{health.available} / {health.total}</strong>
            </div>
            <div class="metric">
                <span>Last updated</span>
                <strong>{lastUpdated || "-"}</strong>
            </div>
        </section>

        <section class="panel">
            <div class="panel-header">
                <h2>Nodes</h2>
                {#if refreshing}
                    <span class="muted">Refreshing...</span>
                {/if}
            </div>

            {#if upstreams.length === 0}
                <div class="placeholder">No upstream nodes configured.</div>
            {:else}
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>URL</th>
                                <th>Region</th>
                                <th>Status</th>
                                <th>Latency</th>
                                <th>In flight</th>
                                <th>Failures</th>
                                <th>Last success</th>
                                <th>Last failure</th>
                                <th>Reason</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each upstreams as node (node.url)}
                                <tr>
                                    <td class="url-cell">{node.url}</td>
                                    <td>
                                        <span class="region-pill" class:is-cn={node.region === "cn"}>
                                            {node.region || "global"}
                                        </span>
                                    </td>
                                    <td>
                                        <span
                                            class="status-pill"
                                            class:is-healthy={node.healthy && !node.circuitOpen}
                                            class:is-warning={node.circuitOpen}
                                            class:is-danger={!node.healthy && !node.circuitOpen}
                                        >
                                            {nodeStatus(node)}
                                        </span>
                                    </td>
                                    <td>{node.latencyMs === null ? "-" : `${node.latencyMs} ms`}</td>
                                    <td>{node.inFlight}</td>
                                    <td>{node.consecutiveFailures}</td>
                                    <td>{formatDate(node.lastSuccessAt)}</td>
                                    <td>{formatDate(node.lastFailureAt)}</td>
                                    <td class="reason-cell">
                                        {#if node.circuitOpenUntil}
                                            <div>Open until {formatDate(node.circuitOpenUntil)}</div>
                                        {/if}
                                        <div>{node.lastFailureReason || "-"}</div>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {/if}
        </section>

        <section class="panel">
            <div class="panel-header">
                <h2>Raw JSON</h2>
            </div>
            <pre>{JSON.stringify(health, null, 2)}</pre>
        </section>
    {/if}
</div>

<style>
    .upstreams-admin {
        padding: calc(var(--padding) * 2) 0 calc(var(--padding) * 4);
    }

    .page-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: calc(var(--padding) * 1.5);
        margin-bottom: calc(var(--padding) * 1.5);
    }

    .page-header h1 {
        margin: 0 0 6px 0;
        font-size: 1.6rem;
        font-weight: 800;
        color: var(--button-text);
    }

    .page-header p {
        margin: 0;
        color: var(--gray);
    }

    .header-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
    }

    .toggle {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--button-text);
        font-size: 0.9rem;
        font-weight: 700;
        white-space: nowrap;
    }

    .endpoint-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: calc(var(--padding) * 1.5);
        color: var(--gray);
        min-width: 0;
    }

    .endpoint-row code {
        color: var(--button-text);
        background: var(--button);
        border-radius: 6px;
        padding: 6px 8px;
        word-break: break-all;
    }

    .summary-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: calc(var(--padding) * 1.5);
    }

    .metric,
    .panel {
        background: var(--popup-bg);
        border-radius: var(--border-radius);
        box-shadow: 0 0 0 1.5px var(--popup-stroke) inset;
    }

    .metric {
        padding: calc(var(--padding) * 1.1);
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .metric span,
    .muted {
        color: var(--gray);
        font-size: 0.85rem;
    }

    .metric strong {
        color: var(--button-text);
        font-size: 1.25rem;
    }

    .panel {
        padding: calc(var(--padding) * 1.25);
        margin-bottom: calc(var(--padding) * 1.5);
    }

    .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: var(--padding);
    }

    .panel-header h2 {
        margin: 0;
        font-size: 1.1rem;
    }

    .placeholder {
        padding: calc(var(--padding) * 2);
        color: var(--gray);
        text-align: center;
    }

    .table-wrap {
        overflow-x: auto;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        min-width: 1040px;
    }

    th,
    td {
        padding: 11px 10px;
        border-bottom: 1px solid var(--popup-stroke);
        text-align: left;
        vertical-align: top;
        color: var(--button-text);
        font-size: 0.86rem;
    }

    th {
        color: var(--gray);
        font-weight: 800;
    }

    .url-cell,
    .reason-cell {
        word-break: break-word;
    }

    .status-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 92px;
        padding: 5px 8px;
        border-radius: 999px;
        font-size: 0.78rem;
        font-weight: 800;
        background: rgba(120, 120, 120, 0.14);
    }

    .region-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 58px;
        padding: 5px 8px;
        border-radius: 999px;
        font-size: 0.78rem;
        font-weight: 800;
        background: rgba(59, 130, 246, 0.16);
        color: var(--button-text);
    }

    .region-pill.is-cn {
        background: rgba(34, 197, 94, 0.16);
    }

    .status-pill.is-healthy {
        background: rgba(34, 197, 94, 0.16);
        color: var(--button-text);
    }

    .status-pill.is-warning {
        background: rgba(245, 158, 11, 0.18);
        color: var(--button-text);
    }

    .status-pill.is-danger {
        background: rgba(239, 68, 68, 0.16);
        color: var(--button-text);
    }

    pre {
        margin: 0;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-word;
        color: var(--button-text);
        font-size: 0.82rem;
        line-height: 1.5;
    }

    .btn-primary,
    .btn-secondary {
        border: none;
        border-radius: var(--border-radius);
        padding: 9px 12px;
        font-size: 0.85rem;
        font-weight: 800;
        cursor: pointer;
        box-shadow: var(--button-box-shadow);
    }

    .btn-primary {
        background: var(--blue);
        color: var(--white);
    }

    .btn-primary:disabled {
        opacity: 0.55;
        cursor: not-allowed;
    }

    .btn-secondary {
        background: var(--button);
        color: var(--button-text);
    }

    .error-banner {
        margin-bottom: calc(var(--padding) * 1.5);
        padding: 10px 12px;
        border-radius: var(--border-radius);
        background: rgba(255, 0, 0, 0.12);
        color: var(--button-text);
        box-shadow: 0 0 0 1px rgba(255, 0, 0, 0.2) inset;
    }

    @media (max-width: 900px) {
        .page-header {
            flex-direction: column;
        }

        .header-actions {
            width: 100%;
            justify-content: flex-start;
        }

        .summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }

    @media (max-width: 560px) {
        .summary-grid {
            grid-template-columns: 1fr;
        }

        .endpoint-row {
            align-items: flex-start;
            flex-direction: column;
        }
    }
</style>
