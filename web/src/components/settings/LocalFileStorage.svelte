<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/translations";
    import { formatFileSize } from "$lib/util";
    import { clearQueue, queue } from "$lib/state/task-manager/queue";
    import { currentTasks } from "$lib/state/task-manager/current-tasks";
    import {
        clearFileStorage,
        FILE_STORAGE_CHANGE_EVENT,
        getFileStorageUsage,
        type FileStorageUsage,
    } from "$lib/storage/opfs";

    let usage: FileStorageUsage | null = null;
    let busy = false;
    let failed = false;
    let cleared = false;

    $: processing = Object.keys($currentTasks).length > 0 ||
        Object.values($queue).some((item) =>
            item.state === "waiting" || item.state === "running"
        );

    const refresh = async () => {
        failed = false;
        try {
            usage = await getFileStorageUsage();
        } catch {
            failed = true;
        }
    };

    const clearFiles = async () => {
        if (processing || busy) return;
        if (!window.confirm($t("settings.local.storage.confirm"))) return;

        busy = true;
        cleared = false;
        failed = false;
        try {
            clearQueue();
            const removed = await clearFileStorage();
            await refresh();
            cleared = removed && usage?.files === 0;
            failed = !cleared;
        } catch {
            failed = true;
        } finally {
            busy = false;
        }
    };

    onMount(() => {
        void refresh();
        const updateUsage = () => void refresh();
        window.addEventListener(FILE_STORAGE_CHANGE_EVENT, updateUsage);

        return () => {
            window.removeEventListener(FILE_STORAGE_CHANGE_EVENT, updateUsage);
        };
    });
</script>

<div class="storage-management">
    <p class="subtext">{$t("settings.local.storage.description")}</p>

    {#if failed}
        <p class="storage-status error">{$t("settings.local.storage.error")}</p>
    {:else if !usage}
        <p class="storage-status">{$t("settings.local.storage.loading")}</p>
    {:else if !usage.available}
        <p class="storage-status">{$t("settings.local.storage.unavailable")}</p>
    {:else if usage.files === 0}
        <p class="storage-status">{$t("settings.local.storage.empty")}</p>
    {:else}
        <p class="storage-status">
            {$t("settings.local.storage.used", {
                size: formatFileSize(usage.bytes),
                count: usage.files,
            })}
        </p>
    {/if}

    {#if cleared && !failed}
        <p class="storage-status success">{$t("settings.local.storage.cleared")}</p>
    {/if}

    <button
        class="button clear-button"
        on:click={clearFiles}
        disabled={busy || processing || !usage?.available || usage.files === 0}
    >
        {busy
            ? $t("settings.local.storage.clearing")
            : $t("settings.local.storage.clear")}
    </button>

    {#if processing}
        <p class="subtext">{$t("settings.local.storage.processing")}</p>
    {/if}
</div>

<style>
    .storage-management {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
    }

    .storage-management p {
        margin: 0;
        white-space: pre-line;
    }

    .storage-status {
        font-weight: 600;
    }

    .storage-status.success {
        color: var(--green);
    }

    .storage-status.error {
        color: var(--red);
    }

    .clear-button {
        padding: 10px 16px;
    }
</style>
