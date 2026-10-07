<script lang="ts">
    import { t } from "$lib/i18n/translations";

    import { device } from "$lib/device";
    import { onDestroy } from "svelte";
    import { trackSave, type SaveContext, type SaveOutcome } from "$lib/analytics/saving";
    import {
        saveWithFeedback,
    } from "$lib/download";

    import type { CobaltFileUrlType } from "$lib/types/api";

    import DialogContainer from "$components/dialog/DialogContainer.svelte";

    import DialogButtons from "$components/dialog/DialogButtons.svelte";
    import SaveLocationHint from "$components/save/SaveLocationHint.svelte";

    import IconDownload from "@tabler/icons-svelte/IconDownload.svelte";
    import IconFileDownload from "@tabler/icons-svelte/IconFileDownload.svelte";


    export let id: string;
    export let dismissable = true;
    export let bodyText: string = "";

    export let url: string = "";
    export let file: File | undefined = undefined;
    export let urlType: CobaltFileUrlType | undefined = undefined;
    export let onSaveResult: ((outcome: SaveOutcome) => void) | undefined = undefined;
    export let saveContext: SaveContext = { source: "dialog" };

    let close: () => void;

    let saving = false;
    let outcome: SaveOutcome | undefined;
    let attempted = false;

    const save = async () => {
        if (saving) return;
        saving = true;
        const repeat = attempted || saveContext.repeat;
        attempted = true;
        try {
            // Installed iOS apps save files through the native sheet.
            const method = device.is.iOS && file && !device.supports.directDownload
                && device.supports.share ? "share" : "download";
            outcome = await saveWithFeedback(method, {
                file, url, urlType, onSaveResult,
                saveContext: { ...saveContext, repeat },
            });
        } finally {
            saving = false;
        }
    };

    onDestroy(() => {
        if (!attempted) {
            trackSave("dismissed", "ask", saveContext);
            onSaveResult?.("cancelled");
        }
    });

</script>

<DialogContainer {id} {dismissable} bind:close>
    <div class="dialog-body popup-body">
        <div class="dialog-inner-container">
            <div class="popup-header">
                <IconFileDownload />
                <h2 class="popup-title" tabindex="-1">
                    {$t("button.download")}
                </h2>
            </div>

            <button id="save-download" class="button active download-button" disabled={saving} on:click={save}>
                <IconDownload />
                {$t(device.is.iOS && file ? "save.action.files" : "button.download")}
            </button>

            {#if outcome && outcome !== "dialog"}
                <p class="body-text" role="status" aria-live="polite">{$t(`save.result.${outcome}`)}</p>
            {:else if file}
                <p class="body-text">{$t("save.result.ready")}</p>
            {/if}
            {#if device.is.iOS && file}
                <p class="body-text">{$t("save.ios_help")}</p>
            {/if}

            {#if bodyText && !outcome}
                <div class="body-text">
                    {bodyText}
                </div>
            {/if}

            <SaveLocationHint afterClick={outcome === "download"} collapsible compact />
        </div>

        <DialogButtons
            buttons={[
                {
                    text: $t("button.done"),
                    main: false,
                    action: () => {},
                },
            ]}
            closeFunc={close}
        />
    </div>
</DialogContainer>

<style>
    .popup-body,
    .dialog-inner-container {
        display: flex;
        flex-direction: column;
        gap: var(--padding);
    }

    .dialog-inner-container {
        overflow-y: auto;
        gap: 8px;
        width: 100%;
    }

    .popup-body {
        max-width: 340px;
        width: calc(100% - var(--padding) - var(--dialog-padding) * 2);
        max-height: 70%;
        margin: calc(var(--padding) / 2);
    }

    .popup-header {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: calc(var(--padding) / 2);
        color: var(--secondary);
    }

    .popup-header :global(svg) {
        height: 21px;
        width: 21px;
    }

    .popup-title {
        color: var(--secondary);
        font-size: 19px;
    }

    .popup-title:focus-visible {
        box-shadow: none !important;
    }

    .download-button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-height: 44px;
        gap: calc(var(--padding) / 2);
    }

    .body-text {
        font-size: 13px;
        font-weight: 500;
        line-height: 1.5;
        color: var(--gray);
        white-space: pre-wrap;
        user-select: text;
        -webkit-user-select: text;
    }
</style>
