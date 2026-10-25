<script lang="ts">
    import { onDestroy } from "svelte";
    import { t } from "$lib/i18n/translations";
    import DialogContainer from "./DialogContainer.svelte";

    export let id: string;
    export let sourceUrl: string;
    export let size: string;
    export let transferPath: string;
    export let onDecision: (proceed: boolean) => void;

    let close: () => void;
    let guide = false;
    let copied = false;
    let copyFailed = false;
    let decided = false;
    const decide = (proceed: boolean) => {
        if (decided) return;
        decided = true;
        onDecision(proceed);
        close();
    };
    onDestroy(() => { if (!decided) onDecision(false); });
    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(sourceUrl);
            copied = true;
            copyFailed = false;
        } catch {
            copyFailed = true;
        }
    };
</script>

<DialogContainer {id} managedCancel={true} bind:close ariaLabel={$t("dialog.mobile_large.title")}>
    <div class="dialog-body mobile-large-download">
        <h2>{$t("dialog.mobile_large.title")}</h2>
        <p>{$t("dialog.mobile_large.body", { size })}</p>
        {#if guide}
            <p>{$t("dialog.mobile_large.steps")}</p>
            <input aria-label={$t("dialog.mobile_large.video_link")} value={sourceUrl} readonly on:focus={(event) => event.currentTarget.select()} />
            <button type="button" on:click={copyLink}>{$t(copied ? "dialog.mobile_large.copied" : "dialog.mobile_large.copy")}</button>
            {#if copyFailed}<p role="status">{$t("dialog.mobile_large.copy_failed")}</p>{/if}
            <p>{$t("dialog.mobile_large.transfer_limit")}</p>
            <a href={transferPath} target="_blank" rel="noopener noreferrer">{$t("dialog.mobile_large.transfer")}</a>
        {:else}
            <button class="recommended" type="button" on:click={() => guide = true}>{$t("dialog.mobile_large.desktop")}</button>
        {/if}
        <button type="button" on:click={() => decide(true)}>{$t("dialog.mobile_large.continue")}</button>
        <button type="button" on:click={() => decide(false)}>{$t("dialog.mobile_large.cancel")}</button>
    </div>
</DialogContainer>

<style>
    .mobile-large-download { display: flex; flex-direction: column; gap: 12px; width: min(400px, calc(100vw - 64px)); max-height: 80vh; overflow-y: auto; }
    h2 { margin: 0; font-size: 1.2rem; }
    p { margin: 0; line-height: 1.6; white-space: pre-line; }
    input, button { font: inherit; padding: 10px; border: 1px solid var(--gray); border-radius: 8px; color: inherit; background: transparent; }
    input { width: 100%; box-sizing: border-box; }
    button { cursor: pointer; white-space: normal; }
    .recommended, a { color: var(--accent); }
</style>
