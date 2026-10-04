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

    import Meowbalt from "$components/misc/Meowbalt.svelte";
    import DialogButtons from "$components/dialog/DialogButtons.svelte";
    import SavingTutorial from "$components/dialog/SavingTutorial.svelte";
    import SaveLocationHint from "$components/save/SaveLocationHint.svelte";
    import SupportLink from "$components/save/SupportLink.svelte";
    import VerticalActionButton from "$components/buttons/VerticalActionButton.svelte";

    import IconShare2 from "@tabler/icons-svelte/IconShare2.svelte";
    import IconDownload from "@tabler/icons-svelte/IconDownload.svelte";
    import IconFileDownload from "@tabler/icons-svelte/IconFileDownload.svelte";

    import CopyIcon from "$components/misc/CopyIcon.svelte";

    export let id: string;
    export let dismissable = true;
    export let bodyText: string = "";

    export let url: string = "";
    export let file: File | undefined = undefined;
    export let urlType: CobaltFileUrlType | undefined = undefined;
    export let onSaveResult: ((outcome: SaveOutcome) => void) | undefined = undefined;
    export let saveContext: SaveContext = { source: "dialog" };

    let close: () => void;

    let copied = false;
    let saving = false;
    let outcome: SaveOutcome | undefined;
    let attempted = false;

    const save = async (method: "download" | "share" | "copy") => {
        if (saving) return;
        saving = true;
        const repeat = attempted || saveContext.repeat;
        attempted = true;
        try {
            outcome = await saveWithFeedback(method, {
                file, url, urlType, onSaveResult,
                saveContext: { ...saveContext, repeat },
            });
            copied = outcome === "copied";
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

    $: canDirectDownload = device.supports.directDownload
        && !(device.is.iOS && urlType === "redirect");
    $: canShare = device.supports.share && (!file || !navigator.canShare || navigator.canShare({ files: [file] }));

    $: if (copied) {
        setTimeout(() => {
            copied = false;
        }, 1500);
    }
</script>

<DialogContainer {id} {dismissable} bind:close>
    <div class="dialog-body popup-body">
        <div class="meowbalt-container">
            <Meowbalt emotion="question" />
        </div>

        <div class="dialog-inner-container">
            <div class="popup-header">
                <IconFileDownload />
                <h2 class="popup-title" tabindex="-1">
                    {$t("dialog.saving.title")}
                </h2>
            </div>

            <div class="action-buttons">
                {#if canDirectDownload}
                    <VerticalActionButton
                        id="save-download"
                        fill
                        elevated
                        disabled={saving}
                        click={() => save("download")}
                    >
                        <IconDownload />
                        {$t(device.is.iOS && file ? "save.action.files" : "button.download")}
                    </VerticalActionButton>
                {/if}

                {#if canShare}
                    <VerticalActionButton
                        id="save-share"
                        fill
                        elevated
                        disabled={saving}
                        click={() => save("share")}
                    >
                        <IconShare2 />
                        {$t(device.is.iOS && file ? "save.action.share" : "button.share")}
                    </VerticalActionButton>
                {/if}

                {#if !file}
                    <VerticalActionButton
                        id="save-copy"
                        fill
                        elevated
                        disabled={saving}
                        click={() => save("copy")}
                        ariaLabel={copied ? $t("button.copied") : ""}
                    >
                        <CopyIcon check={copied} />
                        {$t("button.copy")}
                    </VerticalActionButton>
                {/if}
            </div>

            {#if device.is.iOS && !file}
                <SavingTutorial />
            {/if}

            {#if outcome && outcome !== "dialog"}
                <p class="body-text" role="status" aria-live="polite">{$t(`save.result.${outcome}`)}</p>
                {#if outcome === "failed" || outcome === "cancelled"}<SupportLink />{/if}
            {:else if file}
                <p class="body-text">{$t("save.result.ready")}</p>
            {/if}
            {#if device.is.iOS && file}
                <p class="body-text">{$t("save.ios_help")}</p>
            {/if}

            {#if bodyText}
                <div class="body-text">
                    {bodyText}
                </div>
            {/if}

            <SaveLocationHint afterClick={canDirectDownload} compact />
        </div>

        <DialogButtons
            buttons={[
                {
                    text: $t("button.done"),
                    main: true,
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
        overflow-y: scroll;
        gap: 8px;
        width: 100%;
    }

    .popup-body {
        max-width: 340px;
        width: calc(100% - var(--padding) - var(--dialog-padding) * 2);
        max-height: 70%;
        margin: calc(var(--padding) / 2);
    }

    .meowbalt-container {
        position: absolute;
        top: -126px;
        right: 0;
        /* simulate meowbalt being behind the popup */
        clip-path: inset(0px 0px 14px 0px);
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

    .action-buttons {
        display: flex;
        flex-direction: row;
        gap: calc(var(--padding) / 2);
        position: relative;
    }

    .action-buttons :global(.button.vertical.fill) {
        flex: 1 1 0;
        min-width: 0;
        width: auto;
        min-height: 64px;
        padding: 10px 8px;
        white-space: normal;
        line-height: 1.3;
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
