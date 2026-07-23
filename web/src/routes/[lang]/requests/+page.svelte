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
        <div class="hero-glow hero-glow-one"></div>
        <div class="hero-glow hero-glow-two"></div>
        <div class="hero-content">
            <p class="eyebrow"><span></span>{$t("requests.eyebrow")}</p>
            <h1>{$t("requests.title")}</h1>
            <p class="intro">{$t("requests.subtitle")}</p>

            <form class="submit-form" on:submit|preventDefault={runPreview}>
                <label for="platform-url">{$t("requests.input_label")}</label>
                <div class="input-row">
                    <div class="url-field">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>
                        </svg>
                        <input
                            id="platform-url"
                            bind:value={input}
                            placeholder={$t("requests.input_placeholder")}
                            autocomplete="url"
                        />
                    </div>
                    <button class="primary" type="submit" disabled={submitting || !input.trim()}>
                        {submitting ? $t("requests.checking") : $t("requests.check")}
                        <span aria-hidden="true">→</span>
                    </button>
                </div>
            </form>
        </div>

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
                <p class="section-kicker">FreeSaveVideo</p>
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
                            <a class="external-link" href={item.homepageUrl} target="_blank" rel="nofollow noreferrer noopener" aria-label={$t("requests.visit_platform")}>
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M7 17 17 7M9 7h8v8"/>
                                </svg>
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
    .requests-page { --accent: var(--secondary-600, #4f7f1c); --brand: var(--secondary, #82b52d); width: min(1120px, calc(100% - 48px)); margin: 0 auto; padding: 54px 0 88px; display: grid; gap: 64px; }
    .hero { position: relative; isolation: isolate; overflow: hidden; display: grid; gap: 18px; padding: clamp(34px, 6vw, 68px); border: 1px solid color-mix(in srgb, var(--brand) 22%, var(--separator)); border-radius: 30px; background: linear-gradient(125deg, color-mix(in srgb, var(--brand) 8%, var(--background)) 0%, var(--background) 58%); box-shadow: 0 24px 70px rgba(32, 61, 13, .09); }
    .hero-content { position: relative; z-index: 1; max-width: 830px; display: grid; gap: 18px; }
    .hero-glow { position: absolute; z-index: -1; border-radius: 999px; pointer-events: none; }
    .hero-glow-one { width: 310px; height: 310px; right: -80px; top: -120px; background: color-mix(in srgb, var(--brand) 16%, transparent); }
    .hero-glow-two { width: 180px; height: 180px; right: 170px; bottom: -120px; border: 30px solid color-mix(in srgb, var(--brand) 10%, transparent); }
    .eyebrow { display: flex; align-items: center; gap: 10px; color: var(--accent); font-weight: 800; letter-spacing: .08em; font-size: .78rem; }
    .eyebrow span { width: 28px; height: 2px; border-radius: 2px; background: var(--brand); }
    h1, h2, p { margin: 0; }
    h1 { color: var(--text); font-size: clamp(2.25rem, 5.5vw, 4.4rem); letter-spacing: -.045em; line-height: 1.05; max-width: 800px; text-wrap: balance; }
    h2 { color: var(--text); font-size: clamp(1.55rem, 3vw, 2.15rem); letter-spacing: -.025em; }
    .intro { max-width: 680px; color: color-mix(in srgb, var(--text) 68%, transparent); font-size: 1.05rem; line-height: 1.75; }
    .submit-form { display: grid; gap: 10px; margin-top: 12px; }
    label { color: var(--text); font-size: .9rem; font-weight: 750; }
    .input-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; }
    .url-field { position: relative; display: flex; align-items: center; }
    .url-field svg { position: absolute; left: 17px; width: 20px; height: 20px; fill: none; stroke: color-mix(in srgb, var(--text) 45%, transparent); stroke-width: 1.8; stroke-linecap: round; pointer-events: none; }
    input, select { min-height: 50px; padding: 0 15px; border: 1px solid color-mix(in srgb, var(--text) 13%, transparent); border-radius: 13px; outline: none; background: color-mix(in srgb, var(--background) 96%, transparent); color: var(--text); font: inherit; transition: border-color .2s, box-shadow .2s; }
    input:focus, select:focus { border-color: var(--brand); box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand) 16%, transparent); }
    .url-field input { width: 100%; min-width: 0; min-height: 58px; padding-left: 49px; font-size: 1rem; box-shadow: 0 10px 30px rgba(25, 46, 13, .06); }
    button, .secondary { min-height: 44px; padding: 0 18px; border: 1px solid color-mix(in srgb, var(--text) 14%, transparent); border-radius: 12px; background: var(--background); color: var(--text); font: inherit; font-weight: 750; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 9px; text-decoration: none; transition: transform .18s, box-shadow .18s, border-color .18s; }
    button:hover:not(:disabled), .secondary:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--brand) 65%, transparent); }
    button.primary { min-height: 58px; padding-inline: 24px; background: var(--accent); color: #fff; border-color: transparent; box-shadow: 0 10px 24px color-mix(in srgb, var(--accent) 25%, transparent); }
    button.active { color: var(--accent); background: color-mix(in srgb, var(--brand) 13%, var(--background)); border-color: var(--brand); }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .notice { position: relative; z-index: 1; padding: 13px 16px; color: var(--accent); border: 1px solid color-mix(in srgb, var(--brand) 25%, transparent); border-radius: 12px; background: color-mix(in srgb, var(--brand) 10%, var(--background)); }
    .preview-card { position: relative; z-index: 1; display: flex; justify-content: space-between; gap: 20px; align-items: center; padding: 18px; border: 1px solid color-mix(in srgb, var(--brand) 25%, var(--separator)); border-radius: 16px; background: var(--background); box-shadow: 0 10px 24px rgba(32, 61, 13, .06); }
    .preview-card > div:first-child { display: grid; gap: 6px; }
    .preview-card a { color: var(--accent); }
    .preview-actions { display: flex; gap: 8px; }
    .list-section { display: grid; gap: 24px; }
    .list-heading { display: flex; align-items: end; justify-content: space-between; gap: 24px; }
    .list-heading > div:first-child > p:last-child { color: color-mix(in srgb, var(--text) 62%, transparent); margin-top: 8px; line-height: 1.6; }
    .section-kicker { margin-bottom: 7px; color: var(--accent); font-size: .73rem; font-weight: 850; letter-spacing: .13em; text-transform: uppercase; }
    .filters { display: flex; flex-wrap: wrap; gap: 9px; justify-content: flex-end; }
    .filters input { width: 200px; }
    .request-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .request-card { min-width: 0; min-height: 132px; padding: 21px; border: 1px solid color-mix(in srgb, var(--text) 11%, transparent); border-radius: 18px; background: var(--background); box-shadow: 0 8px 26px rgba(24, 39, 16, .045); display: grid; align-content: space-between; gap: 20px; transition: transform .2s, box-shadow .2s, border-color .2s; }
    .request-card:hover { transform: translateY(-3px); border-color: color-mix(in srgb, var(--brand) 45%, transparent); box-shadow: 0 16px 36px rgba(32, 61, 13, .09); }
    .card-top, .card-bottom { display: flex; justify-content: space-between; gap: 14px; align-items: center; }
    .card-top > div { min-width: 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .domain { color: var(--text); font-size: 1.08rem; font-weight: 850; text-decoration: none; overflow-wrap: anywhere; }
    .domain:hover { color: var(--accent); }
    .external-link { flex: 0 0 auto; width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; color: var(--accent); background: color-mix(in srgb, var(--brand) 10%, var(--background)); transition: background .18s, transform .18s; }
    .external-link svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
    .status { padding: 5px 9px; border-radius: 999px; color: color-mix(in srgb, var(--text) 62%, transparent); font-size: .72rem; font-weight: 800; background: color-mix(in srgb, var(--text) 6%, var(--background)); }
    .status-planned { color: #925d08; background: #fff5dc; }
    .status-supported { color: var(--accent); background: color-mix(in srgb, var(--brand) 13%, var(--background)); }
    .status-rejected { color: var(--error); background: color-mix(in srgb, var(--error) 9%, var(--background)); }
    .note { color: color-mix(in srgb, var(--text) 62%, transparent); line-height: 1.5; }
    .card-bottom > span { color: var(--accent); font-size: .9rem; font-weight: 700; }
    .empty { padding: 46px; text-align: center; color: color-mix(in srgb, var(--text) 58%, transparent); border: 1px dashed color-mix(in srgb, var(--text) 18%, transparent); border-radius: 18px; background: color-mix(in srgb, var(--text) 2%, var(--background)); }
    .pagination { display: flex; align-items: center; justify-content: center; gap: 12px; }
    @media (max-width: 760px) {
        .requests-page { width: min(100% - 28px, 1120px); padding-top: 22px; gap: 42px; }
        .hero { padding: 30px 20px; border-radius: 22px; }
        .input-row, .request-grid { grid-template-columns: 1fr; }
        button.primary { width: 100%; }
        .list-heading { align-items: stretch; flex-direction: column; }
        .filters { justify-content: stretch; }
        .filters input, .filters select { flex: 1 1 150px; width: auto; }
        .preview-card { align-items: stretch; flex-direction: column; }
    }
    @media (prefers-reduced-motion: reduce) { button, .secondary, .request-card, .external-link { transition: none; } }
</style>
