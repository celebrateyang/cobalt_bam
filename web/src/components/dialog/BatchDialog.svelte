<script lang="ts">
    import { page } from "$app/stores";
    import { t } from "$lib/i18n/translations";
    import { savingHandler } from "$lib/api/saving-handler";
    import { isSignedIn, signIn } from "$lib/state/clerk";

    import type { DialogBatchItem } from "$lib/types/dialog";

    import DialogContainer from "$components/dialog/DialogContainer.svelte";

    import IconBoxMultiple from "@tabler/icons-svelte/IconBoxMultiple.svelte";
    import IconCopy from "@tabler/icons-svelte/IconCopy.svelte";
    import IconDownload from "@tabler/icons-svelte/IconDownload.svelte";
    import IconSquareCheck from "@tabler/icons-svelte/IconSquareCheck.svelte";
    import IconSquare from "@tabler/icons-svelte/IconSquare.svelte";
    import IconPlayerStop from "@tabler/icons-svelte/IconPlayerStop.svelte";

    export let id: string;
    export let title = "";
    export let items: DialogBatchItem[] = [];
    export let dismissable = true;

    let close: () => void;

    let selected: boolean[] = [];
    let running = false;
    let cancelRequested = false;
    let progress = 0;
    let totalToRun = 0;

    let itemsKey = "";

    const computeItemsKey = (batchItems: DialogBatchItem[]) =>
        batchItems.map((item) => item.url).join("\n");

    const resetStateForItems = () => {
        selected = items.map(() => true);
        running = false;
        cancelRequested = false;
        progress = 0;
        totalToRun = 0;
    };

    $: {
        const nextKey = computeItemsKey(items);
        if (nextKey !== itemsKey) {
            itemsKey = nextKey;
            resetStateForItems();
        }
    }

    const selectedCount = () => selected.filter(Boolean).length;

    const setSelectedAt = (index: number, value: boolean) => {
        selected = selected.map((current, i) => (i === index ? value : current));
    };

    const handleItemSelectionChange = (index: number, event: Event) => {
        const target = event.currentTarget;
        if (target instanceof HTMLInputElement) {
            setSelectedAt(index, target.checked);
        }
    };

    const setAll = (value: boolean) => {
        selected = selected.map(() => value);
    };

    const copyUrls = async (urls: string[]) => {
        try {
            await navigator.clipboard.writeText(urls.join("\n"));
        } catch {
            // ignore
        }
    };

    const downloadSelected = async () => {
        if (running) return;

        if (!$isSignedIn) {
            // Close native <dialog> first (it sits in the browser top-layer and can cover Clerk).
            close?.();
            await new Promise((r) => setTimeout(r, 200));
            await signIn({
                afterSignInUrl: $page.url.href,
                afterSignUpUrl: $page.url.href,
            });
            return;
        }

        const urls = items.filter((_, i) => selected[i]).map((i) => i.url);
        if (!urls.length) return;

        running = true;
        cancelRequested = false;
        progress = 0;
        totalToRun = urls.length;

        // close dialog immediately; downloads continue in background
        close();
        // allow dialog stack to settle before any subsequent dialogs open
        await new Promise((r) => setTimeout(r, 200));

        for (const url of urls) {
            if (cancelRequested) break;
            progress += 1;
            await savingHandler({ url });
            await new Promise((r) => setTimeout(r, 250));
        }

        running = false;
        cancelRequested = false;
    };

    const downloadSingle = async (url: string) => {
        if (running) return;
        if (!$isSignedIn) {
            close?.();
            await new Promise((r) => setTimeout(r, 200));
            await signIn({
                afterSignInUrl: $page.url.href,
                afterSignUpUrl: $page.url.href,
            });
            return;
        }

        await savingHandler({ url });
    };
</script>

<DialogContainer {id} {dismissable} bind:close>
    <div class="dialog-body batch-dialog">
        <div class="popup-header">
            <div class="popup-title-container">
                <IconBoxMultiple />
                <h2 class="popup-title" tabindex="-1">
                    {title || $t("dialog.batch.title")}
                </h2>
            </div>
            <div class="subtext popup-description">
                {#if running}
                    {$t("dialog.batch.status.running")}: {progress}/{totalToRun}
                {:else}
                    {$t("dialog.batch.status.selected")}: {selectedCount()}/{items.length}
                {/if}
            </div>
        </div>

        <div class="batch-toolbar">
            <button
                class="button elevated toolbar-button"
                disabled={running}
                on:click={() => setAll(true)}
            >
                <IconSquareCheck />
                {$t("dialog.batch.select_all")}
            </button>
            <button
                class="button elevated toolbar-button"
                disabled={running}
                on:click={() => setAll(false)}
            >
                <IconSquare />
                {$t("dialog.batch.select_none")}
            </button>
            <button
                class="button elevated toolbar-button"
                disabled={running || selectedCount() === 0}
                on:click={() =>
                    copyUrls(items.filter((_, i) => selected[i]).map((i) => i.url))}
            >
                <IconCopy />
                {$t("dialog.batch.copy_selected")}
            </button>
        </div>

        <div class="batch-list" role="list">
            {#each items as item, i (item.url)}
                <div class="batch-item" role="listitem">
                    <label class="batch-check">
                        <input
                            type="checkbox"
                            checked={selected[i]}
                            on:change={(e) => handleItemSelectionChange(i, e)}
                            disabled={running}
                            aria-label={$t("a11y.dialog.batch.select_item")}
                        />
                    </label>

                    <div class="batch-text">
                        <div class="batch-title" title={item.title || item.url}>
                            {item.title || item.url}
                        </div>
                        {#if item.title}
                            <div class="batch-url" title={item.url}>
                                {item.url}
                            </div>
                        {/if}
                    </div>

                    <div class="batch-actions">
                        <button
                            class="button elevated icon-button"
                            disabled={running}
                            on:click={() => copyUrls([item.url])}
                            aria-label={$t("button.copy")}
                            title={$t("button.copy")}
                        >
                            <IconCopy />
                        </button>
                        <button
                            class="button elevated icon-button"
                            disabled={running}
                            on:click={() => downloadSingle(item.url)}
                            aria-label={$t("button.download")}
                            title={$t("button.download")}
                        >
                            <IconDownload />
                        </button>
                    </div>
                </div>
            {/each}
        </div>

        <div class="batch-footer">
            <button
                class="button elevated footer-button"
                disabled={running}
                on:click={() => close()}
            >
                {$t("button.cancel")}
            </button>

            {#if running}
                <button
                    class="button elevated footer-button red"
                    on:click={() => (cancelRequested = true)}
                >
                    <IconPlayerStop />
                    {$t("dialog.batch.stop")}
                </button>
            {:else}
                <button
                    class="button elevated footer-button active"
                    disabled={selectedCount() === 0}
                    on:click={downloadSelected}
                >
                    <IconDownload />
                    {$t("dialog.batch.download_selected")}
                </button>
            {/if}
        </div>
    </div>
</DialogContainer>

<style>
    .batch-dialog {
        gap: var(--padding);
        max-height: calc(
            90% - env(safe-area-inset-bottom) - env(safe-area-inset-top)
        );
        width: min(920px, calc(100% - var(--padding)));
    }

    .popup-header {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 3px;
    }

    .popup-title-container {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: calc(var(--padding) / 2);
        color: var(--secondary);
    }

    .popup-title-container :global(svg) {
        height: 21px;
        width: 21px;
    }

    .popup-title {
        font-size: 18px;
        line-height: 1.1;
        margin: 0;
    }

    .popup-description {
        font-size: 13px;
        padding: 0;
    }

    .popup-title:focus-visible {
        box-shadow: none !important;
    }

    .batch-toolbar {
        display: flex;
        gap: calc(var(--padding) / 2);
        flex-wrap: wrap;
    }

    .toolbar-button {
        height: 38px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 12px;
    }

    .toolbar-button :global(svg) {
        width: 18px;
        height: 18px;
    }

    .batch-list {
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding-right: 2px;
    }

    .batch-item {
        display: grid;
        grid-template-columns: 24px 1fr auto;
        gap: 10px;
        align-items: center;
        padding: 10px 12px;
        border-radius: 14px;
        background: var(--surface-1);
        border: 1px solid var(--surface-2);
    }

    .batch-check {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
    }

    .batch-check input {
        width: 16px;
        height: 16px;
    }

    .batch-text {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .batch-title {
        font-weight: 600;
        color: var(--secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .batch-url {
        font-size: 12px;
        opacity: 0.75;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        user-select: text;
        -webkit-user-select: text;
    }

    .batch-actions {
        display: flex;
        gap: 8px;
    }

    .icon-button {
        width: 38px;
        height: 38px;
        padding: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        border-radius: 999px;
    }

    .icon-button :global(svg) {
        width: 18px;
        height: 18px;
    }

    .batch-footer {
        display: flex;
        gap: calc(var(--padding) / 2);
        justify-content: flex-end;
        flex-wrap: wrap;
    }

    .footer-button {
        height: 40px;
        min-width: 140px;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 8px;
        padding: 0 14px;
    }

    .footer-button :global(svg) {
        width: 18px;
        height: 18px;
    }

    .footer-button.red {
        background-color: var(--red);
        color: var(--white);
    }

    @media screen and (max-width: 535px) {
        .batch-dialog {
            width: calc(100% - var(--padding));
        }

        .footer-button {
            min-width: 0;
            flex: 1;
        }
    }
</style>
