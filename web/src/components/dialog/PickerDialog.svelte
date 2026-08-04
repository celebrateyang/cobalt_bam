<script lang="ts">
    import { device } from "$lib/device";
    import { t } from "$lib/i18n/translations";
    import {
        prepareAutoSaveDirectory,
        saveFileToAutoSaveDirectory,
        supportsAutoSaveDirectory,
    } from "$lib/storage/auto-save";

    import type { Optional } from "$lib/types/generic";
    import type { DialogButton } from "$lib/types/dialog";
    import type { DialogPickerItem } from "$lib/types/dialog";

    import DialogContainer from "$components/dialog/DialogContainer.svelte";

    import PickerItem from "$components/dialog/PickerItem.svelte";
    import DialogButtons from "$components/dialog/DialogButtons.svelte";

    import IconBoxMultiple from "@tabler/icons-svelte/IconBoxMultiple.svelte";

    export let id: string;
    export let items: Optional<DialogPickerItem[]> = undefined;
    export let buttons: Optional<DialogButton[]> = undefined;
    export let dismissable = true;

    let dialogDescription = "dialog.picker.description.";

    if (device.is.iOS) {
        dialogDescription += "ios";
    } else if (device.is.mobile) {
        dialogDescription += "phone";
    } else {
        dialogDescription += "desktop";
    }

    let close: () => void;

    $: selectableIndexes = (items ?? [])
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => (item.type ?? "photo") === "photo")
        .map(({ index }) => index);
    $: batchAvailable = selectableIndexes.length > 1 && supportsAutoSaveDirectory();

    let selected = new Set<number>();
    let initializedItems: DialogPickerItem[] | undefined;
    let saving = false;
    let completed = 0;
    let failed = 0;

    $: if (items !== initializedItems) {
        initializedItems = items;
        selected = new Set(selectableIndexes);
        completed = 0;
        failed = 0;
    }

    const setSelected = (index: number, checked: boolean) => {
        const next = new Set(selected);
        if (checked) next.add(index);
        else next.delete(index);
        selected = next;
    };

    const selectAll = () => {
        selected = new Set(selectableIndexes);
    };

    const selectNone = () => {
        selected = new Set();
    };

    const extensionForType = (contentType: string) => {
        const extensions: Record<string, string> = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
            "image/avif": "avif",
        };
        return extensions[contentType.split(";")[0].toLowerCase()] ?? "jpg";
    };

    const responseFilename = (response: Response) => {
        const disposition = response.headers.get("content-disposition") ?? "";
        const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
        if (utf8) {
            try { return decodeURIComponent(utf8); } catch { /* use fallback */ }
        }
        return disposition.match(/filename="?([^";]+)"?/i)?.[1];
    };

    const saveSelected = async () => {
        if (saving || selected.size === 0) return;
        const ready = await prepareAutoSaveDirectory({ prompt: true });
        if (!ready) return;

        saving = true;
        completed = 0;
        failed = 0;

        for (const index of [...selected].sort((a, b) => a - b)) {
            const item = items?.[index];
            if (!item) continue;
            try {
                const response = await fetch(item.url);
                if (!response.ok) throw new Error(`download failed (${response.status})`);
                const blob = await response.blob();
                const filename = item.filename
                    || responseFilename(response)
                    || `image-${String(index + 1).padStart(2, "0")}.${extensionForType(blob.type)}`;
                const file = new File([blob], filename, { type: blob.type });
                await saveFileToAutoSaveDirectory(file, filename);
                completed += 1;
            } catch (error) {
                failed += 1;
                console.error(`[picker] batch image save failed index=${index}`, error);
            }
        }

        saving = false;
    };
</script>

<DialogContainer {id} {dismissable} bind:close>
    <div
        class="dialog-body picker-dialog"
        class:three-columns={items && items.length <= 3}
    >
        <div class="popup-header">
            <div class="popup-title-container">
                <IconBoxMultiple />
                <h2 class="popup-title" tabindex="-1">
                    {$t("dialog.picker.title")}
                </h2>
            </div>
            <div class="subtext popup-description">
                {$t(dialogDescription)}
            </div>
        </div>
        <div class="picker-body">
            {#if items}
                {#each items as item, i}
                    <PickerItem
                        {item}
                        number={i + 1}
                        selectable={batchAvailable && selectableIndexes.includes(i)}
                        selected={selected.has(i)}
                        selectionDisabled={saving}
                        onSelectionChange={(checked) => setSelected(i, checked)}
                    />
                {/each}
            {/if}
        </div>
        {#if batchAvailable}
            <div class="picker-batch-actions">
                <div class="picker-selection-actions">
                    <button class="secondary" disabled={saving} on:click={selectAll}>
                        {$t("dialog.batch.select_all")}
                    </button>
                    <button class="secondary" disabled={saving} on:click={selectNone}>
                        {$t("dialog.batch.select_none")}
                    </button>
                </div>
                <button class="picker-save-selected" disabled={saving || selected.size === 0} on:click={saveSelected}>
                    {saving
                        ? $t("dialog.picker.batch.saving", { count: completed + failed, max: selected.size })
                        : $t("dialog.picker.batch.save_selected", { count: selected.size })}
                </button>
                {#if !saving && completed + failed > 0}
                    <div class:has-errors={failed > 0} class="picker-batch-status">
                        {$t("dialog.picker.batch.complete", { count: completed, max: failed })}
                    </div>
                {/if}
            </div>
        {/if}
        {#if buttons}
            <DialogButtons {buttons} closeFunc={close} />
        {/if}
    </div>
</DialogContainer>

<style>
    .picker-dialog {
        --picker-item-size: 120px;
        gap: var(--padding);
        max-height: calc(
            90% - env(safe-area-inset-bottom) - env(safe-area-inset-top)
        );
        width: auto;
    }

    .popup-header {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 3px;
        max-width: calc(var(--picker-item-size) * 4);
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
    }

    .popup-description {
        font-size: 13px;
        padding: 0;
    }

    .popup-title:focus-visible {
        box-shadow: none !important;
    }

    .picker-body {
        overflow-y: scroll;
        display: grid;
        justify-items: center;
        grid-template-columns: 1fr 1fr 1fr 1fr;
    }

    .picker-batch-actions {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: calc(var(--padding) / 2);
    }

    .picker-selection-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: calc(var(--padding) / 2);
    }

    .picker-selection-actions button,
    .picker-save-selected {
        min-height: 38px;
    }

    .picker-batch-status {
        color: var(--green);
        text-align: center;
        font-size: 13px;
    }

    .picker-batch-status.has-errors {
        color: var(--red);
    }

    .three-columns .picker-body {
        grid-template-columns: 1fr 1fr 1fr;
    }

    .three-columns .popup-header {
        max-width: calc(var(--picker-item-size) * 3);
    }

    :global(.picker-item) {
        width: var(--picker-item-size);
        height: var(--picker-item-size);
    }

    @media screen and (max-width: 535px) {
        .picker-body {
            grid-template-columns: 1fr 1fr 1fr;
        }

        .popup-header {
            max-width: calc(var(--picker-item-size) * 3);
        }
    }

    @media screen and (max-width: 400px) {
        .picker-dialog {
            --picker-item-size: 115px;
        }
    }

    @media screen and (max-width: 380px) {
        .picker-dialog {
            --picker-item-size: 110px;
        }
    }

    @media screen and (max-width: 365px) {
        .picker-dialog {
            --picker-item-size: 105px;
        }
    }

    @media screen and (max-width: 350px) {
        .picker-dialog {
            --picker-item-size: 100px;
        }
    }

    @media screen and (max-width: 335px) {
        .picker-body,
        .three-columns .picker-body {
            grid-template-columns: 1fr 1fr;
        }

        .popup-header {
            max-width: calc(var(--picker-item-size) * 3);
        }
    }

    @media screen and (max-width: 255px) {
        .picker-dialog {
            --picker-item-size: 120px;
        }

        .picker-body,
        .three-columns .picker-body {
            grid-template-columns: 1fr;
        }
    }
</style>
