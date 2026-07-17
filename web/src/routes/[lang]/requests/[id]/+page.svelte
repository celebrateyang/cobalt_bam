<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/stores";

    import { t } from "$lib/i18n/translations";
    import { requireDownloadAuth } from "$lib/auth/download-auth";
    import { platformRequestsApi, type PlatformRequest } from "$lib/api/platform-requests";

    let request: PlatformRequest | null = null;
    let loading = true;
    let voting = false;
    let error = "";
    $: lang = $page.params.lang || "en";

    const loadRequest = async () => {
        const id = Number.parseInt($page.params.id || "", 10);
        const response = await platformRequestsApi.get(id);
        if (response.status === "success") request = response.data.request;
        else error = $t("requests.not_found");
        loading = false;
    };

    const toggleVote = async () => {
        if (!request || voting) return;
        const signedIn = await requireDownloadAuth();
        if (!signedIn) return;
        voting = true;
        const response = request.votedByMe
            ? await platformRequestsApi.unvote(request.id)
            : await platformRequestsApi.vote(request.id);
        if (response.status === "success") request = response.data.request;
        else error = $t("requests.vote_error");
        voting = false;
    };

    onMount(loadRequest);
</script>

<svelte:head><title>{request?.domain || $t("requests.meta_title")}</title></svelte:head>

<main class="detail-page">
    <a class="back" href={`/${lang}/requests`}>← {$t("requests.back_to_list")}</a>
    {#if loading}
        <p>{$t("requests.loading")}</p>
    {:else if error || !request}
        <p class="notice">{error || $t("requests.not_found")}</p>
    {:else}
        <article>
            <div class="heading">
                <div>
                    <span class={`status status-${request.status}`}>{$t(`requests.status_${request.status}`)}</span>
                    <h1>{request.domain}</h1>
                </div>
                <a class="external" href={request.homepageUrl} target="_blank" rel="nofollow noreferrer noopener">
                    {$t("requests.visit_platform")} ↗
                </a>
            </div>
            {#if request.adminNote}
                <section><h2>{$t("requests.admin_note")}</h2><p>{request.adminNote}</p></section>
            {/if}
            <div class="vote-panel">
                <div><strong>{request.voteCount}</strong><span>{$t("requests.votes")}</span></div>
                <button class:active={request.votedByMe} type="button" on:click={toggleVote} disabled={voting}>
                    {request.votedByMe ? $t("requests.voted") : $t("requests.vote")}
                </button>
            </div>
        </article>
    {/if}
</main>

<style>
    .detail-page { width: min(850px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0 80px; display: grid; gap: 22px; }
    .back { color: var(--secondary); text-decoration: none; font-weight: 700; }
    article { display: grid; gap: 30px; padding: 34px; border: 1px solid var(--separator); border-radius: 22px; background: var(--background); }
    .heading { display: flex; align-items: start; justify-content: space-between; gap: 20px; }
    h1 { margin: 10px 0 0; overflow-wrap: anywhere; font-size: clamp(2rem, 7vw, 4rem); }
    h2, p { margin: 0; }
    section { display: grid; gap: 8px; color: var(--secondary); }
    .status { display: inline-flex; padding: 5px 9px; border-radius: 999px; background: var(--secondary-background); font-weight: 800; font-size: .8rem; }
    .status-planned, .status-supported { color: var(--primary); }
    .status-rejected { color: var(--error); }
    .external, button { min-height: 44px; padding: 0 16px; border-radius: 11px; display: inline-flex; align-items: center; justify-content: center; font-weight: 750; text-decoration: none; }
    .external { color: var(--button-text); background: var(--primary); }
    .vote-panel { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-top: 22px; border-top: 1px solid var(--separator); }
    .vote-panel > div { display: flex; align-items: baseline; gap: 8px; }
    .vote-panel strong { font-size: 2rem; }
    .vote-panel span { color: var(--secondary); }
    button { border: 1px solid var(--separator); background: var(--background); color: var(--text); cursor: pointer; }
    button.active { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 18%, var(--background)); }
    .notice { padding: 24px; border: 1px solid var(--separator); border-radius: 14px; }
    @media (max-width: 620px) { article { padding: 24px 18px; } .heading { flex-direction: column; } .external { width: 100%; } }
</style>
