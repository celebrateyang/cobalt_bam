<script lang="ts">
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { t } from "$lib/i18n/translations";
    import API from "$lib/api/api";
    import { currentApiURL } from "$lib/api/api-url";
    import { buildSaveRequest, savingHandler } from "$lib/api/saving-handler";
    import { createDialog } from "$lib/state/dialogs";
    import {
        checkSignedIn,
        clerkEnabled,
        getClerkToken,
        isSignedIn,
        signIn,
    } from "$lib/state/clerk";

    import type { DialogBatchItem } from "$lib/types/dialog";
    import type { CobaltAPIResponse, CobaltSaveRequestBody } from "$lib/types/api";

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
    let pointsPreviewRequired = 0;
    let pointsPreviewLoading = false;
    let pointsCheckLoading = false;
    let pointsPreviewTimer: ReturnType<typeof setTimeout> | null = null;
    let pointsPreviewRequestId = 0;

    type PrefetchedResponse = {
        request: CobaltSaveRequestBody;
        response: CobaltAPIResponse;
    };

    let durationCache = new Map<string, number>();
    let prefetchedCache = new Map<string, PrefetchedResponse>();
    let prefetchedRequests = new Map<string, Promise<PrefetchedResponse | undefined>>();

    const buildBatchRequest = (url: string): CobaltSaveRequestBody => {
        const request = buildSaveRequest(url);

        // Only batch downloads should go through the processing queue.
        // Keep single-link behavior unchanged.
        request.localProcessing = "forced";

        return request;
    };

    const computeItemsKey = (batchItems: DialogBatchItem[]) =>
        batchItems.map((item) => item.url).join("\n");

    const resetStateForItems = () => {
        selected = items.map(() => true);
        running = false;
        pointsCheckLoading = false;
        cancelRequested = false;
        progress = 0;
        totalToRun = 0;
        clearPointsPreviewState();
    };

    const resetRunState = () => {
        running = false;
        pointsCheckLoading = false;
        cancelRequested = false;
        progress = 0;
        totalToRun = 0;
    };

    const accountPath = () => {
        const lang = $page.params.lang || "en";
        return `/${lang}/account`;
    };

    const pointsFromDuration = (durationSeconds: number) =>
        durationSeconds > 0 ? Math.ceil(durationSeconds / 60) : 0;

    const readDuration = (item: DialogBatchItem) => {
        if (typeof item.duration === "number" && Number.isFinite(item.duration)) {
            return item.duration;
        }

        const cached = durationCache.get(item.url);
        if (typeof cached === "number" && Number.isFinite(cached)) {
            return cached;
        }

        return undefined;
    };

    const fetchPrefetched = async (item: DialogBatchItem) => {
        const cached = prefetchedCache.get(item.url);
        if (cached) {
            return cached;
        }

        const existing = prefetchedRequests.get(item.url);
        if (existing) {
            return await existing;
        }

        const task = (async () => {
            const request = buildBatchRequest(item.url);
            const response = await API.request(request);

            if (!response) return undefined;

            const prefetched = { request, response };

            if (response.status !== "error") {
                prefetchedCache.set(item.url, prefetched);

                if (
                    typeof response.duration === "number" &&
                    Number.isFinite(response.duration)
                ) {
                    durationCache.set(item.url, response.duration);
                }
            }

            return prefetched;
        })();

        prefetchedRequests.set(item.url, task);

        const result = await task;
        prefetchedRequests.delete(item.url);
        return result;
    };

    const fetchDuration = async (item: DialogBatchItem) => {
        const known = readDuration(item);
        if (typeof known === "number" && Number.isFinite(known)) {
            return known;
        }

        const prefetched = await fetchPrefetched(item);
        const duration =
            prefetched?.response &&
            prefetched.response.status !== "error" &&
            typeof prefetched.response.duration === "number" &&
            Number.isFinite(prefetched.response.duration)
                ? prefetched.response.duration
                : undefined;

        return duration;
    };

    const clearPointsPreviewState = () => {
        pointsPreviewRequestId += 1;
        pointsPreviewRequired = 0;
        pointsPreviewLoading = false;

        if (pointsPreviewTimer) {
            clearTimeout(pointsPreviewTimer);
            pointsPreviewTimer = null;
        }

        durationCache.clear();
        prefetchedCache.clear();
        prefetchedRequests.clear();
    };

    const cancelPointsPreview = () => {
        pointsPreviewRequestId += 1;
        pointsPreviewLoading = false;

        if (pointsPreviewTimer) {
            clearTimeout(pointsPreviewTimer);
            pointsPreviewTimer = null;
        }
    };

    const showPointsInsufficient = (currentPoints: number, requiredPoints: number) => {
        createDialog({
            id: "batch-points-insufficient",
            type: "small",
            meowbalt: "error",
            title: $t("dialog.batch.points_insufficient.title"),
            bodyText: $t("dialog.batch.points_insufficient.body", {
                current: currentPoints,
                required: requiredPoints,
            }),
            buttons: [
                {
                    text: $t("button.cancel"),
                    main: false,
                    action: () => {},
                },
                {
                    text: $t("button.buy_points"),
                    main: true,
                    action: () => {
                        close?.();
                        setTimeout(() => {
                            void goto(accountPath());
                        }, 200);
                    },
                },
            ],
        });
    };

    const showPointsError = () => {
        createDialog({
            id: "batch-points-error",
            type: "small",
            meowbalt: "error",
            bodyText: $t("dialog.batch.points_check_failed"),
            buttons: [
                {
                    text: $t("button.gotit"),
                    main: true,
                    action: () => {},
                },
            ],
        });
    };

    const fetchUserPoints = async () => {
        const token = await getClerkToken();
        if (!token) throw new Error("missing token");

        const apiBase = currentApiURL();
        const res = await fetch(`${apiBase}/user/me`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || data?.status !== "success") {
            throw new Error(data?.error?.message || "failed to load points");
        }

        const points = data?.data?.user?.points;
        if (!Number.isFinite(points)) {
            throw new Error("invalid points");
        }

        return points as number;
    };

    const consumePoints = async (points: number) => {
        const token = await getClerkToken();
        if (!token) throw new Error("missing token");

        const apiBase = currentApiURL();
        const res = await fetch(`${apiBase}/user/points/consume`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ points }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || data?.status !== "success") {
            return {
                ok: false,
                code: data?.error?.code as string | undefined,
            };
        }

        return { ok: true };
    };

    const prepareBatch = async (selectedItems: DialogBatchItem[]) => {
        const cache = new Map<string, PrefetchedResponse>();
        let totalDurationSeconds = 0;

        for (const item of selectedItems) {
            if (cancelRequested) break;

            const prefetched = await fetchPrefetched(item);
            if (prefetched) {
                cache.set(item.url, prefetched);
            }

            const duration = readDuration(item);
            if (typeof duration === "number" && Number.isFinite(duration)) {
                totalDurationSeconds += duration;
            }
        }

        const requiredPoints = pointsFromDuration(totalDurationSeconds);

        return { requiredPoints, cache };
    };

    const computePointsPreview = async (requestId: number) => {
        const selectedItems = items.filter((_, i) => selected[i]);
        if (!selectedItems.length) {
            if (requestId !== pointsPreviewRequestId) return;
            pointsPreviewRequired = 0;
            pointsPreviewLoading = false;
            return;
        }

        pointsPreviewLoading = true;
        let totalDurationSeconds = 0;

        for (const item of selectedItems) {
            const duration = await fetchDuration(item);
            if (requestId !== pointsPreviewRequestId) return;
            if (typeof duration === "number" && Number.isFinite(duration)) {
                totalDurationSeconds += duration;
            }
        }

        if (requestId !== pointsPreviewRequestId) return;
        pointsPreviewRequired = pointsFromDuration(totalDurationSeconds);
        pointsPreviewLoading = false;
    };

    const schedulePointsPreview = () => {
        if (!clerkEnabled || running) {
            cancelPointsPreview();
            return;
        }

        if (selectedCount() === 0) {
            cancelPointsPreview();
            pointsPreviewRequired = 0;
            return;
        }

        pointsPreviewRequestId += 1;
        const requestId = pointsPreviewRequestId;

        if (pointsPreviewTimer) {
            clearTimeout(pointsPreviewTimer);
        }

        pointsPreviewLoading = true;

        pointsPreviewTimer = setTimeout(() => {
            pointsPreviewTimer = null;
            void computePointsPreview(requestId);
        }, 200);
    };

    $: {
        const nextKey = computeItemsKey(items);
        if (nextKey !== itemsKey) {
            itemsKey = nextKey;
            resetStateForItems();
            schedulePointsPreview();
        }
    }

    const selectedCount = () => selected.filter(Boolean).length;

    const setSelectedAt = (index: number, value: boolean) => {
        selected = selected.map((current, i) => (i === index ? value : current));
        schedulePointsPreview();
    };

    const handleItemSelectionChange = (index: number, event: Event) => {
        const target = event.currentTarget;
        if (target instanceof HTMLInputElement) {
            setSelectedAt(index, target.checked);
        }
    };

    const setAll = (value: boolean) => {
        selected = selected.map(() => value);
        schedulePointsPreview();
    };

    const copyUrls = async (urls: string[]) => {
        try {
            await navigator.clipboard.writeText(urls.join("\n"));
        } catch {
            // ignore
        }
    };

    const downloadSelected = async () => {
        if (running || pointsCheckLoading) return;
        if (clerkEnabled && pointsPreviewLoading) return;

        if (!$isSignedIn) {
            const alreadySignedIn = await checkSignedIn();
            if (!alreadySignedIn) {
                // Close native <dialog> first (it sits in the browser top-layer and can cover Clerk).
                close?.();
                await new Promise((r) => setTimeout(r, 200));
                await signIn({
                    fallbackRedirectUrl: $page.url.href,
                    signUpFallbackRedirectUrl: $page.url.href,
                });
                return;
            }
        }

        const selectedItems = items.filter((_, i) => selected[i]);
        if (!selectedItems.length) return;

        const requiredPoints = clerkEnabled ? pointsPreviewRequired : 0;

        let currentPoints = 0;
        if (requiredPoints > 0) {
            pointsCheckLoading = true;
            try {
                currentPoints = await fetchUserPoints();
            } catch {
                pointsCheckLoading = false;
                showPointsError();
                return;
            }

            if (currentPoints < requiredPoints) {
                pointsCheckLoading = false;
                showPointsInsufficient(currentPoints, requiredPoints);
                return;
            }

            pointsCheckLoading = false;
        }

        running = true;
        cancelPointsPreview();
        cancelRequested = false;
        progress = 0;
        totalToRun = selectedItems.length;

        const { cache } = await prepareBatch(selectedItems);

        if (cancelRequested) {
            resetRunState();
            return;
        }

        if (requiredPoints > 0) {
            try {
                const result = await consumePoints(requiredPoints);
                if (!result.ok) {
                    if (result.code === "INSUFFICIENT_POINTS") {
                        showPointsInsufficient(currentPoints, requiredPoints);
                    } else {
                        showPointsError();
                    }
                    resetRunState();
                    return;
                }
            } catch {
                showPointsError();
                resetRunState();
                return;
            }
        }

        // close dialog immediately; downloads continue in background
        close();
        // allow dialog stack to settle before any subsequent dialogs open
        await new Promise((r) => setTimeout(r, 200));

        for (const item of selectedItems) {
            if (cancelRequested) break;
            progress += 1;
            const cached = cache.get(item.url);
            if (cached) {
                await savingHandler({
                    request: cached.request,
                    response: cached.response,
                    skipPoints: true,
                });
            } else {
                await savingHandler({
                    request: buildBatchRequest(item.url),
                    skipPoints: true,
                });
            }
            await new Promise((r) => setTimeout(r, 250));
        }

        resetRunState();
    };

    const downloadSingle = async (url: string) => {
        if (running) return;
        if (!$isSignedIn) {
            const alreadySignedIn = await checkSignedIn();
            if (!alreadySignedIn) {
                close?.();
                await new Promise((r) => setTimeout(r, 200));
                await signIn({
                    fallbackRedirectUrl: $page.url.href,
                    signUpFallbackRedirectUrl: $page.url.href,
                });
                return;
            }
        }

        const item = items.find((entry) => entry.url === url) || { url };
        const { requiredPoints, cache } = await prepareBatch([item]);

        if (requiredPoints > 0) {
            let currentPoints;
            try {
                currentPoints = await fetchUserPoints();
            } catch {
                showPointsError();
                return;
            }

            if (currentPoints < requiredPoints) {
                showPointsInsufficient(currentPoints, requiredPoints);
                return;
            }

            try {
                const result = await consumePoints(requiredPoints);
                if (!result.ok) {
                    if (result.code === "INSUFFICIENT_POINTS") {
                        showPointsInsufficient(currentPoints, requiredPoints);
                    } else {
                        showPointsError();
                    }
                    return;
                }
            } catch {
                showPointsError();
                return;
            }
        }

        const cached = cache.get(url);
        if (cached) {
            await savingHandler({
                request: cached.request,
                response: cached.response,
                skipPoints: true,
            });
        } else {
            await savingHandler({
                request: buildBatchRequest(url),
                skipPoints: true,
            });
        }
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
                disabled={running || pointsCheckLoading}
                on:click={() => setAll(true)}
            >
                <IconSquareCheck />
                {$t("dialog.batch.select_all")}
            </button>
            <button
                class="button elevated toolbar-button"
                disabled={running || pointsCheckLoading}
                on:click={() => setAll(false)}
            >
                <IconSquare />
                {$t("dialog.batch.select_none")}
            </button>
            <button
                class="button elevated toolbar-button"
                disabled={running || pointsCheckLoading || selectedCount() === 0}
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
                            disabled={running || pointsCheckLoading}
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
                            disabled={running || pointsCheckLoading}
                            on:click={() => copyUrls([item.url])}
                            aria-label={$t("button.copy")}
                            title={$t("button.copy")}
                        >
                            <IconCopy />
                        </button>
                        <button
                            class="button elevated icon-button"
                            disabled={running || pointsCheckLoading}
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
            {#if clerkEnabled && selectedCount() > 0}
                <div class="points-preview" aria-live="polite">
                    {#if pointsPreviewLoading}
                        {$t("dialog.batch.points_preview.loading")}
                    {:else}
                        {$t("dialog.batch.points_preview", {
                            required: pointsPreviewRequired,
                        })}
                    {/if}
                </div>
            {/if}
            <button
                class="button elevated footer-button"
                disabled={running || pointsCheckLoading}
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
                    disabled={
                        selectedCount() === 0 ||
                        pointsCheckLoading ||
                        (clerkEnabled && pointsPreviewLoading)
                    }
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

    .points-preview {
        margin-right: auto;
        font-size: 12px;
        color: var(--gray);
        display: flex;
        align-items: center;
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
