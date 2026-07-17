<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";

    import { t } from "$lib/i18n/translations";
    import { requireDownloadAuth } from "$lib/auth/download-auth";
    import {
        platformRequestsApi,
        type PlatformPreview,
        type PlatformRequest,
        type PlatformRequestStatus,
    } from "$lib/api/platform-requests";

    let requests: PlatformRequest[] = [];
    let input = "";
    let search = "";
    let sort: "votes" | "newest" = "votes";
    let status: PlatformRequestStatus | "" = "";
    let loading = true;
    let submitting = false;
    let votingId: number | null = null;
    let preview: PlatformPreview | null = null;
    let message = "";
    let pageNumber = 1;
    let totalPages = 1;

    $: lang = $page.params.lang || "en";

    const statusLabel = (value: PlatformRequestStatus) => $t(`requests.status_${value}`);

    const loadRequests = async () => {
        loading = true;
        const response = await platformRequestsApi.list({
            page: pageNumber,
            sort,
            status: status || undefined,
            search,
        });
        if (response.status === "success") {
            requests = response.data.requests;
            totalPages = Math.max(1, response.data.pagination.pages);
        } else {
            message = $t("requests.load_error");
        }
        loading = false;
    };

    const runPreview = async () => {
        if (!input.trim() || submitting) return;
        submitting = true;
        message = "";
        preview = null;
        const response = await platformRequestsApi.preview(input);
        if (response.status === "success") {
            preview = response.data;
            if (preview.result === "already_supported") message = $t("requests.already_supported");
            if (preview.result === "already_requested") message = $t("requests.already_requested");
        } else {
            message = response.error.code === "INVALID_URL"
                ? $t("requests.invalid_url")
                : $t("requests.submit_error");
        }
        submitting = false;
    };

    const createRequest = async () => {
        if (!preview || preview.result !== "new" || submitting) return;
        const path = `/${lang}/requests?domain=${encodeURIComponent(preview.domain)}&source=${$page.url.searchParams.get("source") === "unsupported_download" ? "unsupported_download" : "request_page"}`;
        await goto(path, { replaceState: true, keepFocus: true, noScroll: true });
        const signedIn = await requireDownloadAuth();
        if (!signedIn) return;

        submitting = true;
        const source = $page.url.searchParams.get("source") === "unsupported_download"
            ? "unsupported_download"
            : "request_page";
        const response = await platformRequestsApi.create(preview.domain, source);
        if (response.status === "success") {
            preview = response.data;
            message = response.data.result === "created"
                ? $t("requests.created")
                : $t("requests.already_requested");
            await loadRequests();
        } else {
            message = $t("requests.submit_error");
        }
        submitting = false;
    };

    const toggleVote = async (item: PlatformRequest) => {
        if (votingId !== null) return;
        const signedIn = await requireDownloadAuth();
        if (!signedIn) return;
        votingId = item.id;
        const response = item.votedByMe
            ? await platformRequestsApi.unvote(item.id)
            : await platformRequestsApi.vote(item.id);
        if (response.status === "success") {
            requests = requests.map((entry) => entry.id === item.id ? response.data.request : entry);
            if (preview?.request?.id === item.id) {
                preview = { ...preview, request: response.data.request };
            }
        } else {
            message = $t("requests.vote_error");
        }
        votingId = null;
    };

    const togglePreviewVote = async () => {
        if (preview?.request) await toggleVote(preview.request);
    };

    const applyFilters = async () => {
        pageNumber = 1;
        await loadRequests();
    };

    onMount(async () => {
        const domain = $page.url.searchParams.get("domain");
        if (domain) input = domain;
        await loadRequests();
        if (domain) await runPreview();
    });
</script>

<svelte:head>
    <title>{$t("requests.meta_title")}</title>
    <meta name="description" content={$t("requests.meta_description")} />
</svelte:head>

<main class="requests-page">
    <section class="hero">
        <p class="eyebrow">{$t("requests.eyebrow")}</p>
        <h1>{$t("requests.title")}</h1>
        <p class="intro">{$t("requests.subtitle")}</p>

        <form class="submit-form" on:submit|preventDefault={runPreview}>
            <label for="platform-url">{$t("requests.input_label")}</label>
            <div class="input-row">
                <input
                    id="platform-url"
                    bind:value={input}
                    placeholder={$t("requests.input_placeholder")}
                    autocomplete="url"
                />
                <button class="primary" type="submit" disabled={submitting || !input.trim()}>
                    {submitting ? $t("requests.checking") : $t("requests.check")}
                </button>
            </div>
        </form>

        {#if message}
            <p class="notice" role="status">{message}</p>
        {/if}

        {#if preview}
            <div class="preview-card">
                <div>
                    <strong>{preview.domain}</strong>
                    <a href={preview.homepageUrl} target="_blank" rel="nofollow noreferrer noopener">
                        {$t("requests.visit_platform")}
                    </a>
                </div>
                {#if preview.result === "new"}
                    <button class="primary" type="button" on:click={createRequest} disabled={submitting}>
                        {$t("requests.submit")}
                    </button>
                {:else if preview.request}
                    <div class="preview-actions">
                        <a class="secondary" href={`/${lang}/requests/${preview.request.id}`}>
                            {$t("requests.view_details")}
                        </a>
                        <button
                            class:active={preview.request.votedByMe}
                            type="button"
                            on:click={togglePreviewVote}
                            disabled={votingId === preview.request.id}
                        >
                            {preview.request.votedByMe ? $t("requests.voted") : $t("requests.vote")}
                            · {preview.request.voteCount}
                        </button>
                    </div>
                {/if}
            </div>
        {/if}
    </section>

    <section class="list-section">
        <div class="list-heading">
            <div>
                <h2>{$t("requests.list_title")}</h2>
                <p>{$t("requests.list_subtitle")}</p>
            </div>
            <div class="filters">
                <input bind:value={search} placeholder={$t("requests.search_placeholder")} on:change={applyFilters} />
                <select bind:value={sort} on:change={applyFilters} aria-label={$t("requests.sort_label")}>
                    <option value="votes">{$t("requests.sort_votes")}</option>
                    <option value="newest">{$t("requests.sort_newest")}</option>
                </select>
                <select bind:value={status} on:change={applyFilters} aria-label={$t("requests.status_label")}>
                    <option value="">{$t("requests.status_all")}</option>
                    <option value="pending">{$t("requests.status_pending")}</option>
                    <option value="planned">{$t("requests.status_planned")}</option>
                    <option value="supported">{$t("requests.status_supported")}</option>
                    <option value="rejected">{$t("requests.status_rejected")}</option>
                </select>
            </div>
        </div>

        {#if loading}
            <p class="empty">{$t("requests.loading")}</p>
        {:else if requests.length === 0}
            <p class="empty">{$t("requests.empty")}</p>
        {:else}
            <div class="request-grid">
                {#each requests as item}
                    <article class="request-card">
                        <div class="card-top">
                            <div>
                                <a class="domain" href={`/${lang}/requests/${item.id}`}>{item.domain}</a>
                                <span class={`status status-${item.status}`}>{statusLabel(item.status)}</span>
                            </div>
                            <a href={item.homepageUrl} target="_blank" rel="nofollow noreferrer noopener" aria-label={$t("requests.visit_platform")}>
                                ↗
                            </a>
                        </div>
                        {#if item.adminNote}<p class="note">{item.adminNote}</p>{/if}
                        <div class="card-bottom">
                            <span>{$t("requests.vote_count", { count: item.voteCount })}</span>
                            <button
                                class:active={item.votedByMe}
                                type="button"
                                on:click={() => toggleVote(item)}
                                disabled={votingId === item.id}
                            >
                                {item.votedByMe ? $t("requests.voted") : $t("requests.vote")}
                            </button>
                        </div>
                    </article>
                {/each}
            </div>
        {/if}

        {#if totalPages > 1}
            <div class="pagination">
                <button type="button" disabled={pageNumber <= 1} on:click={async () => { pageNumber -= 1; await loadRequests(); }}>
                    {$t("requests.previous")}
                </button>
                <span>{pageNumber} / {totalPages}</span>
                <button type="button" disabled={pageNumber >= totalPages} on:click={async () => { pageNumber += 1; await loadRequests(); }}>
                    {$t("requests.next")}
                </button>
            </div>
        {/if}
    </section>
</main>

<style>
    .requests-page { width: min(1080px, calc(100% - 32px)); margin: 0 auto; padding: 56px 0 80px; display: grid; gap: 56px; }
    .hero { display: grid; gap: 18px; padding: 36px; border-radius: 24px; background: linear-gradient(145deg, var(--background), var(--secondary-background)); border: 1px solid var(--separator); }
    .eyebrow { margin: 0; color: var(--primary); font-weight: 800; text-transform: uppercase; letter-spacing: .12em; font-size: .8rem; }
    h1, h2, p { margin: 0; }
    h1 { font-size: clamp(2rem, 6vw, 3.8rem); line-height: 1; max-width: 780px; }
    .intro { max-width: 720px; color: var(--secondary); font-size: 1.05rem; line-height: 1.65; }
    .submit-form { display: grid; gap: 8px; margin-top: 8px; }
    label { font-weight: 700; }
    .input-row { display: grid; grid-template-columns: 1fr auto; gap: 10px; }
    input, select { min-height: 46px; padding: 0 14px; border: 1px solid var(--separator); border-radius: 12px; background: var(--background); color: var(--text); font: inherit; }
    button, .secondary { min-height: 42px; padding: 0 16px; border: 1px solid var(--separator); border-radius: 11px; background: var(--background); color: var(--text); font: inherit; font-weight: 750; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; text-decoration: none; }
    button.primary { background: var(--primary); color: var(--button-text); border-color: transparent; }
    button.active { background: color-mix(in srgb, var(--primary) 18%, var(--background)); border-color: var(--primary); }
    button:disabled { opacity: .55; cursor: wait; }
    .notice { padding: 12px 14px; border-radius: 10px; background: color-mix(in srgb, var(--primary) 12%, transparent); }
    .preview-card { display: flex; justify-content: space-between; gap: 20px; align-items: center; padding: 18px; border: 1px solid var(--separator); border-radius: 14px; background: var(--background); }
    .preview-card > div:first-child { display: grid; gap: 6px; }
    .preview-card a { color: var(--primary); }
    .preview-actions { display: flex; gap: 8px; }
    .list-section { display: grid; gap: 22px; }
    .list-heading { display: flex; align-items: end; justify-content: space-between; gap: 18px; }
    .list-heading p { color: var(--secondary); margin-top: 6px; }
    .filters { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    .filters input { width: 190px; }
    .request-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .request-card { min-width: 0; padding: 20px; border: 1px solid var(--separator); border-radius: 16px; background: var(--background); display: grid; gap: 18px; }
    .card-top, .card-bottom { display: flex; justify-content: space-between; gap: 14px; align-items: center; }
    .card-top > div { min-width: 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .domain { color: var(--text); font-size: 1.08rem; font-weight: 850; text-decoration: none; overflow-wrap: anywhere; }
    .status { padding: 4px 8px; border-radius: 999px; font-size: .75rem; font-weight: 800; background: var(--secondary-background); }
    .status-planned, .status-supported { color: var(--primary); }
    .status-rejected { color: var(--error); }
    .note { color: var(--secondary); line-height: 1.5; }
    .empty { padding: 36px; text-align: center; color: var(--secondary); border: 1px dashed var(--separator); border-radius: 16px; }
    .pagination { display: flex; align-items: center; justify-content: center; gap: 12px; }
    @media (max-width: 760px) {
        .requests-page { padding-top: 28px; }
        .hero { padding: 24px 18px; }
        .input-row, .request-grid { grid-template-columns: 1fr; }
        .list-heading { align-items: stretch; flex-direction: column; }
        .filters { justify-content: stretch; }
        .filters input, .filters select { flex: 1 1 150px; width: auto; }
        .preview-card { align-items: stretch; flex-direction: column; }
    }
</style>
