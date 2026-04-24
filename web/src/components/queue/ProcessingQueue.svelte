<script lang="ts">
    import { onMount } from "svelte";
    import { get } from "svelte/store";
    import { t } from "$lib/i18n/translations";
    import { beforeNavigate, onNavigate } from "$app/navigation";

    import { openFile } from "$lib/download";
    import { clearFileStorage } from "$lib/storage/opfs";

    import { getProgress } from "$lib/task-manager/queue";
    import { queueVisible } from "$lib/state/queue-visibility";
    import { currentTasks } from "$lib/state/task-manager/current-tasks";
    import { clearQueue, queue as readableQueue } from "$lib/state/task-manager/queue";

    import SectionHeading from "$components/misc/SectionHeading.svelte";
    import PopoverContainer from "$components/misc/PopoverContainer.svelte";
    import ProcessingStatus from "$components/queue/ProcessingStatus.svelte";
    import ProcessingQueueItem from "$components/queue/ProcessingQueueItem.svelte";
    import ProcessingQueueStub from "$components/queue/ProcessingQueueStub.svelte";

    import IconDownload from "@tabler/icons-svelte/IconDownload.svelte";
    import IconAlertTriangle from "@tabler/icons-svelte/IconAlertTriangle.svelte";
    import IconX from "@tabler/icons-svelte/IconX.svelte";

    const popoverAction = () => {
        $queueVisible = !$queueVisible;
    };
    let bulkSaving = false;

    $: queue = Object.entries($readableQueue);

    $: latestBatchSummary = (() => {
        type BatchSummary = {
            total: number;
            seen: number;
            completed: number;
            success: number;
        };

        const summaries = new Map<string, BatchSummary>();

        for (const [, item] of queue) {
            if (!item.batchSessionId) continue;

            const summary = summaries.get(item.batchSessionId) || {
                total: 0,
                seen: 0,
                completed: 0,
                success: 0,
            };

            summary.seen += 1;

            const total = item.batchSelectionTotal;
            if (typeof total === "number" && Number.isFinite(total) && total > 0) {
                summary.total = Math.max(summary.total, total);
            }

            if (item.state === "done") {
                summary.success += 1;
                summary.completed += 1;
            } else if (item.state === "error") {
                summary.completed += 1;
            }

            summaries.set(item.batchSessionId, summary);
        }

        if (summaries.size === 0) return null;

        const latestSessionId = [...summaries.keys()].at(-1);
        if (!latestSessionId) return null;

        const latest = summaries.get(latestSessionId);
        if (!latest) return null;

        const total = latest.total > 0 ? latest.total : latest.seen;
        const finished = total > 0 && latest.completed >= total;

        return {
            total,
            success: latest.success,
            finished,
        };
    })();

    $: queueNotice = (() => {
        if (latestBatchSummary) {
            if (latestBatchSummary.finished) {
                return {
                    key: "queue.success_notice",
                    count: latestBatchSummary.success,
                };
            }

            return {
                key: "queue.waiting_notice",
                count: latestBatchSummary.total,
            };
        }

        return {
            key: "queue.waiting_notice",
            count: queue.length,
        };
    })();

    $: totalProgress = queue.length ? queue.map(
        ([, item]) => getProgress(item, $currentTasks) * 100
    ).reduce((a, b) => a + b) / (100 * queue.length) : 0;

    $: indeterminate = queue.length > 0 && totalProgress === 0;
    $: pendingCount = queue.filter(([, item]) => item.state === "waiting" || item.state === "running").length;
    $: doneCount = queue.filter(([, item]) => item.state === "done" && Boolean(item.resultFile)).length;
    $: canBulkSave = doneCount > 0 && pendingCount === 0;

    const saveAllDownloaded = () => {
        if (bulkSaving || typeof window === "undefined") {
            return;
        }

        const snapshot = Object.entries(get(readableQueue)).filter(([, item]) =>
            item.state === "done" && Boolean(item.resultFile)
        );
        if (!snapshot.length) {
            return;
        }

        bulkSaving = true;
        try {
            for (const [id, item] of snapshot) {
                if (item.state !== "done" || !item.resultFile) {
                    continue;
                }
                try {
                    openFile(new File([item.resultFile], item.filename, {
                        type: item.mimeType,
                    }));
                    console.log(`[queue] bulkSave: triggered download id=${id}`);
                } catch (error) {
                    console.error(`[queue] bulkSave: openFile failed id=${id}`, error);
                }
            }
        } finally {
            setTimeout(() => {
                bulkSaving = false;
            }, 1200);
        }
    };

    onNavigate(() => {
        $queueVisible = false;
    });

    onMount(() => {
        // clear old files from storage on first page load
        clearFileStorage();
    });

    beforeNavigate((event) => {
        if (event.type === "leave" && (totalProgress > 0 && totalProgress < 1)) {
            event.cancel();
        }
    });
</script>

<div id="processing-queue">
    <ProcessingStatus
        progress={totalProgress * 100}
        {indeterminate}
        expandAction={popoverAction}
    />

    <PopoverContainer
        id="processing-popover"
        expanded={$queueVisible}
        expandStart="right"
    >
        <div id="processing-header">
            <div class="header-top">
                <div class="header-title">
                    <SectionHeading
                        title={$t("queue.title")}
                        sectionId="queue"
                        nolink
                    />
                    <div class="queue-waiting-notice" aria-live="polite">
                        {$t(queueNotice.key, { count: queueNotice.count })}
                    </div>
                </div>
                <div class="header-buttons">
                    {#if canBulkSave}
                        <button
                            class="save-all-button"
                            on:click={saveAllDownloaded}
                            disabled={bulkSaving}
                            tabindex={!$queueVisible ? -1 : undefined}
                        >
                            <IconDownload />
                            {$t("queue.save_all_done")}
                        </button>
                    {/if}
                    {#if queue.length}
                        <button
                            class="clear-button"
                            on:click={clearQueue}
                            tabindex={!$queueVisible ? -1 : undefined}
                        >
                            <IconX />
                            {$t("button.clear")}
                        </button>
                    {/if}
                </div>
            </div>
        </div>

        <div id="processing-list" role="list" aria-labelledby="queue-title">
            {#each queue as [id, item]}
                <ProcessingQueueItem {id} info={item} />
            {/each}
            {#if queue.length === 0}
                <ProcessingQueueStub />
            {/if}
        </div>
        {#if doneCount > 0}
            <div class="queue-save-warning" role="note">
                <span class="warning-icon" aria-hidden="true">
                    <IconAlertTriangle />
                </span>
                <p>
                    {$t("queue.manual_save_warning")}
                </p>
            </div>
        {/if}
    </PopoverContainer>
</div>

<style>
    #processing-queue {
        --holder-padding: 12px;
        position: absolute;
        right: 0;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        justify-content: end;
        z-index: 9;
        pointer-events: none;
        padding: var(--holder-padding);
        width: calc(100% - var(--holder-padding) * 2);
    }

    #processing-queue :global(#processing-popover) {
        gap: 12px;
        padding: 16px;
        padding-bottom: 0;
        width: calc(100% - 16px * 2);
        max-width: 425px;
    }

    #processing-header {
        display: flex;
        flex-direction: column;
        flex-wrap: wrap;
        gap: 3px;
    }

    .header-top {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
    }

    .header-title {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
    }

    .queue-waiting-notice {
        font-size: 12px;
        line-height: 1.35;
        color: var(--gray);
    }

    .header-buttons {
        display: flex;
        flex-direction: row;
        gap: var(--padding);
    }

    .header-buttons button {
        font-size: 13px;
        font-weight: 500;
        padding: 0;
        background: none;
        box-shadow: none;
        text-align: left;
        border-radius: 3px;
        outline-offset: 5px;
    }

    .header-buttons button :global(svg) {
        height: 16px;
        width: 16px;
    }

    .clear-button {
        color: var(--medium-red);
    }

    .save-all-button {
        color: var(--secondary);
    }

    #processing-list {
        display: flex;
        flex-direction: column;
        max-height: 65vh;
        overflow-y: scroll;
        overflow-x: hidden;
    }

    .queue-save-warning {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        margin: 0 0 14px;
        padding: 10px 12px;
        border: 1px solid color-mix(in srgb, var(--secondary) 32%, transparent);
        border-left: 4px solid var(--secondary);
        border-radius: 8px;
        background:
            linear-gradient(
                90deg,
                color-mix(in srgb, var(--secondary) 12%, transparent),
                color-mix(in srgb, var(--button) 94%, transparent)
            );
        color: color-mix(in srgb, var(--text) 78%, var(--secondary));
        box-shadow: 0 8px 22px color-mix(in srgb, var(--secondary) 10%, transparent);
    }

    .queue-save-warning p {
        margin: 0;
        font-size: 13px;
        line-height: 1.45;
        font-weight: 600;
        letter-spacing: 0;
    }

    .warning-icon {
        display: flex;
        flex: 0 0 auto;
        justify-content: center;
        align-items: center;
        width: 22px;
        height: 22px;
        margin-top: 1px;
        border-radius: 50%;
        background-color: color-mix(in srgb, var(--secondary) 15%, var(--button));
        color: var(--secondary);
    }

    .warning-icon :global(svg) {
        width: 15px;
        height: 15px;
        stroke-width: 2.2px;
    }

    @media screen and (max-width: 535px) {
        #processing-queue {
            --holder-padding: 8px;
            padding-top: 4px;
            top: env(safe-area-inset-top);
        }

        .queue-save-warning {
            margin-bottom: 10px;
            padding: 9px 10px;
        }
    }
</style>
