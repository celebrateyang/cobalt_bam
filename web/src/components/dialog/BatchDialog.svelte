<script lang="ts">
    import { page } from "$app/stores";
    import { get } from "svelte/store";
    import { t } from "$lib/i18n/translations";
    import { buildSaveRequest, savingHandler } from "$lib/api/saving-handler";
    import {
        markCollectionDownloadedItems,
        unmarkCollectionDownloadedItems,
    } from "$lib/api/collection-memory";
    import {
        fetchCurrentUserPointsProfile,
        showPointsInsufficientDialog as openPointsInsufficientDialog,
    } from "$lib/points/ui";
    import {
        clearPendingBatchIntent,
        savePendingBatchIntent,
    } from "$lib/pwa/batch-intent";
    import { createDialog } from "$lib/state/dialogs";
    import {
        queue as queueStore,
        waitForPointsRelease,
    } from "$lib/state/task-manager/queue";
    import { scheduleQueueRetry } from "$lib/task-manager/retry-scheduler";
    import { buildQueueRetryRequest } from "$lib/task-manager/retry-request";
    import {
        clerkEnabled,
        isSignedIn,
    } from "$lib/state/clerk";
    import { requireDownloadAuth } from "$lib/auth/download-auth";
    import { uuid } from "$lib/util";
    import { COLLECTION_PAGE_SIZE, COLLECTION_SELECTION_LIMIT, collectionVideoIdentity, selectCollectionPage, collectionItemOrder } from "$lib/collection-selection";
    import {
        MEMBERSHIP_DOWNLOAD_LIMIT_ERROR,
        showMembershipDownloadLimitDialog,
    } from "$lib/membership/download-limit";
    import {
        prepareAutoSaveDirectory,
        supportsAutoSaveDirectory,
    } from "$lib/storage/auto-save";

    import type { DialogBatchItem } from "$lib/types/dialog";
    import type { CobaltSaveRequestBody } from "$lib/types/api";
    import type { DownloadModeOption } from "$lib/types/settings";

    import DialogContainer from "$components/dialog/DialogContainer.svelte";

    import IconBoxMultiple from "@tabler/icons-svelte/IconBoxMultiple.svelte";
    import IconDownload from "@tabler/icons-svelte/IconDownload.svelte";
    import IconCircleCheck from "@tabler/icons-svelte/IconCircleCheck.svelte";
    import IconPlayerStop from "@tabler/icons-svelte/IconPlayerStop.svelte";
    import IconArrowBackUp from "@tabler/icons-svelte/IconArrowBackUp.svelte";

    export let id: string;
    export let title = "";
    export let items: DialogBatchItem[] = [];
    export let downloadedItems: DialogBatchItem[] | null = [];
    export let collectionTotalCount: number | undefined = undefined;
    export let dismissable = true;
    export let collectionKey: string | undefined = undefined;
    export let collectionSourceUrl: string | undefined = undefined;
    export let downloadMode: DownloadModeOption | undefined = undefined;
    export let selectedUrls: string[] = [];
    export let autoStart = false;

    let close: () => void;

    let selected: boolean[] = [];
    let currentPage = 1;
    let sortOrder: "original" | "title-asc" | "title-desc" = "original";
    let selectionLimitNotice = false;
    let downloadedSelected: boolean[] = [];
    let running = false;
    let cancelRequested = false;
    let progress = 0;
    let totalToRun = 0;

    let itemsKey: string | null = null;
    let pointsPreviewRequired = 0;
    let pointsPreviewLoading = false;
    let pointsPreviewReady = false;
    let pointsCheckLoading = false;
    let pointsPreviewTimer: ReturnType<typeof setTimeout> | null = null;
    let pointsPreviewRequestId = 0;

    let viewingDownloaded = false;
    $: safeDownloadedItems = Array.isArray(downloadedItems) ? downloadedItems : [];
    let downloadedItemsKey = "";
    let selectAllCheckbox: HTMLInputElement | null = null;
    const rateLimitErrorCode = "error.api.rate_exceeded";
    const baseBatchDelayMs = 1200;
    const rateLimitBackoffMs = 4000;
    const maxRateLimitRetries = 2;
    const queueRetryBackoffMs = 1500;
    const maxQueueErrorRetries = 1;
    const retryableQueueErrorCodes = new Set([
        "queue.fetch.bad_response",
        "queue.fetch.empty_tunnel",
        "queue.fetch.network_error",
        "queue.fetch.timeout",
        "queue.fetch.stalled",
    ]);
    const queueTaskTimeoutMs = 30 * 60 * 1000;
    const POINTS_PER_MINUTE = 2;
    const MIN_POINTS_PER_DOWNLOAD = 2;
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let rateLimitSkipNotified = false;
    let autoStartConsumed = false;

    const waitForQueueItemDone = (taskId: string) =>
        new Promise<"done" | "error" | "missing" | "timeout" | "cancelled">((resolve) => {
            let seen = false;
            let settled = false;
            let timer: ReturnType<typeof setTimeout> | null = null;
            let unsubscribe: (() => void) | null = null;

            const settle = (status: "done" | "error" | "missing" | "timeout" | "cancelled") => {
                if (settled) return;
                settled = true;
                if (timer) {
                    clearTimeout(timer);
                }
                if (unsubscribe) {
                    unsubscribe();
                    unsubscribe = null;
                }
                resolve(status);
            };

            unsubscribe = queueStore.subscribe((queueData) => {
                if (cancelRequested) {
                    settle("cancelled");
                    return;
                }

                const item = queueData[taskId];
                if (!item) {
                    if (seen) {
                        settle("missing");
                    }
                    return;
                }

                seen = true;

                if (item.state === "done") {
                    settle("done");
                } else if (item.state === "error") {
                    settle("error");
                }
            });

            if (settled && unsubscribe) {
                unsubscribe();
                unsubscribe = null;
            }

            if (settled) {
                return;
            }

            timer = setTimeout(() => {
                settle("timeout");
            }, queueTaskTimeoutMs);
        });

    const buildBatchRequest = (item: DialogBatchItem): CobaltSaveRequestBody => {
        const request = buildSaveRequest(item.url);

        // Only batch downloads should go through the processing queue.
        // Keep single-link behavior unchanged.
        if (downloadMode) {
            request.downloadMode = downloadMode;
        }
        if (item.title) {
            request.filenameTitle = item.title.slice(0, 300);
        }
        request.localProcessing = "forced";
        request.batch = true;
        if (
            (!downloadMode || downloadMode === "auto") &&
            /(?:^|\.)bilibili\.com$/i.test(new URL(item.url).hostname)
        ) {
            request.bilibiliDirectBridge = true;
        }

        return request;
    };

    const computeItemsKey = (batchItems: DialogBatchItem[]) =>
        batchItems.map((item) => item.url).join("\n");

    const computeDownloadedItemsKey = (batchItems: DialogBatchItem[]) =>
        batchItems.map((item) => item.itemKey || item.url).join("\n");

    const isItemRestricted = (item: DialogBatchItem | undefined) =>
        item?.availability === "platform_restricted";

    const currentReturnPath = () =>
        `${$page.url.pathname}${$page.url.search}${$page.url.hash}`;

    const persistCurrentBatchIntent = (autostartIntent: boolean) => {
        const selectedItems = items.filter((_, index) => selected[index]);
        if (!selectedItems.length) return;

        savePendingBatchIntent({
            title: title || undefined,
            items,
            selectedUrls: selectedItems.map((item) => item.url),
            collectionKey,
            collectionSourceUrl,
            downloadMode,
            returnPath: currentReturnPath(),
            autostart: autostartIntent,
        });
    };

    const resetStateForItems = () => {
        const selectedUrlSet = new Set(
            Array.isArray(selectedUrls) && selectedUrls.length
                ? selectedUrls
                : [],
        );
        const identities = new Set([...selectedUrlSet].map(collectionVideoIdentity).filter(Boolean));
        let remaining = COLLECTION_SELECTION_LIMIT;
        selected = items.map((item) => {
            const identity = collectionVideoIdentity(item.url);
            const match = selectedUrlSet.has(item.url) || (identity && identities.has(identity));
            if (remaining > 0 && !isItemRestricted(item) && match) {
                remaining--;
                return true;
            }
            return false;
        });
        selectionLimitNotice = false;
        running = false;
        pointsCheckLoading = false;
        cancelRequested = false;
        progress = 0;
        totalToRun = 0;
        clearPointsPreviewState();
        autoStartConsumed = false;
    };

    const resetRunState = () => {
        running = false;
        pointsCheckLoading = false;
        cancelRequested = false;
        progress = 0;
        totalToRun = 0;
    };

    const pointsForDuration = (durationSeconds: number | undefined) => {
        if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds)) {
            return MIN_POINTS_PER_DOWNLOAD;
        }

        const baseMinutes = Math.max(1, Math.ceil(durationSeconds / 60));
        return Math.max(MIN_POINTS_PER_DOWNLOAD, baseMinutes * POINTS_PER_MINUTE);
    };

    const readDuration = (item: DialogBatchItem) => {
        if (typeof item.duration === "number" && Number.isFinite(item.duration)) {
            return item.duration;
        }

        return undefined;
    };

    const fetchDuration = async (item: DialogBatchItem) => {
        return readDuration(item);
    };

    const clearPointsPreviewState = () => {
        pointsPreviewRequestId += 1;
        pointsPreviewRequired = 0;
        pointsPreviewLoading = false;
        pointsPreviewReady = false;

        if (pointsPreviewTimer) {
            clearTimeout(pointsPreviewTimer);
            pointsPreviewTimer = null;
        }

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
        persistCurrentBatchIntent(true);
        openPointsInsufficientDialog(currentPoints, requiredPoints, () => {
            close?.();
        }, `${$page.url.pathname}${$page.url.search}${$page.url.hash}`);
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

    const fetchUserPointsProfile = async () => {
        const profile = await fetchCurrentUserPointsProfile();
        if (!profile) {
            throw new Error("failed to load points");
        }

        if (!profile.membershipActive && !Number.isFinite(profile.points)) {
            throw new Error("invalid points");
        }

        return profile;
    };

    const prepareBatch = async (selectedItems: DialogBatchItem[]) => {
        let requiredPoints = 0;

        for (const item of selectedItems) {
            if (cancelRequested) break;

            const duration = readDuration(item);
            requiredPoints += pointsForDuration(duration);
        }

        return { requiredPoints };
    };

    const computePointsPreview = async (
        requestId: number,
        selectionSnapshot = selected,
    ) => {
        const selectedItems = items.filter((_, i) => selectionSnapshot[i]);
        if (!selectedItems.length) {
            if (requestId !== pointsPreviewRequestId) return;
            pointsPreviewRequired = 0;
            pointsPreviewLoading = false;
            pointsPreviewReady = true;
            return;
        }

        pointsPreviewLoading = true;
        let requiredPoints = 0;

        for (const item of selectedItems) {
            const duration = await fetchDuration(item);
            if (requestId !== pointsPreviewRequestId) return;
            requiredPoints += pointsForDuration(duration);
        }

        if (requestId !== pointsPreviewRequestId) return;
        pointsPreviewRequired = requiredPoints;
        pointsPreviewLoading = false;
        pointsPreviewReady = true;
    };

    const schedulePointsPreview = (selectionSnapshot = selected) => {
        if (!clerkEnabled || running) {
            cancelPointsPreview();
            return;
        }

        if (selectionSnapshot.filter(Boolean).length === 0) {
            cancelPointsPreview();
            pointsPreviewRequired = 0;
            pointsPreviewReady = true;
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
            void computePointsPreview(requestId, selectionSnapshot);
        }, 200);
    };

    $: {
        const nextKey = computeItemsKey(items);
        if (nextKey !== itemsKey) {
            itemsKey = nextKey;
            resetStateForItems();
            viewingDownloaded = items.length === 0 && safeDownloadedItems.length > 0;
            schedulePointsPreview();
        }
    }

    $: {
        const nextKey = computeDownloadedItemsKey(safeDownloadedItems);
        if (nextKey !== downloadedItemsKey) {
            downloadedItemsKey = nextKey;
            downloadedSelected = safeDownloadedItems.map(() => false);
        }
    }

    $: if (
        autoStart &&
        !autoStartConsumed &&
        !running &&
        !pointsCheckLoading &&
        !viewingDownloaded &&
        selectedCountValue > 0 &&
        (!clerkEnabled || (pointsPreviewReady && !pointsPreviewLoading))
    ) {
        autoStartConsumed = true;
        void downloadSelected();
    }

    const toggleDownloadedView = () => {
        viewingDownloaded = !viewingDownloaded;
        currentPage = 1;
        if (viewingDownloaded) {
            cancelPointsPreview();
        } else {
            schedulePointsPreview();
        }
    };

    $: selectedCountValue = selected.filter(Boolean).length;
    $: downloadedSelectedCountValue = downloadedSelected.filter(Boolean).length;
    $: activeItems = viewingDownloaded ? safeDownloadedItems : items;
    $: orderedIndices = collectionItemOrder(activeItems, sortOrder, $page.params.lang || "en");
    $: pageCount = Math.max(1, Math.ceil(activeItems.length / COLLECTION_PAGE_SIZE));
    $: currentPage = Math.max(1, Math.min(currentPage, pageCount));
    $: pageStart = (currentPage - 1) * COLLECTION_PAGE_SIZE;
    $: pageItems = orderedIndices.slice(pageStart, pageStart + COLLECTION_PAGE_SIZE)
        .map((index) => ({ item: activeItems[index], index }));
    $: pageIndices = pageItems.map((entry) => entry.index)
        .filter((index) => !isItemRestricted(activeItems[index]));
    $: activeSelectionTotal = pageIndices.length;
    $: activeSelectedCount = pageIndices.filter((index) =>
        viewingDownloaded ? downloadedSelected[index] : selected[index]).length;
    $: activeSelectionAll =
        activeSelectionTotal > 0 && activeSelectedCount === activeSelectionTotal;
    $: activeSelectionPartial =
        activeSelectedCount > 0 && activeSelectedCount < activeSelectionTotal;
    $: if (selectAllCheckbox) {
        selectAllCheckbox.indeterminate = activeSelectionPartial;
    }

    const setSelectedAt = (index: number, value: boolean) => {
        if (isItemRestricted(items[index])) return;
        if (value && !selected[index] && selectedCountValue >= COLLECTION_SELECTION_LIMIT) {
            selectionLimitNotice = true;
            return;
        }
        selectionLimitNotice = false;
        const nextSelected = selected.map((current, i) => (i === index ? value : current));
        selected = nextSelected;
        schedulePointsPreview(nextSelected);
    };

    const setDownloadedSelectedAt = (index: number, value: boolean) => {
        downloadedSelected = downloadedSelected.map((current, i) =>
            i === index ? value : current,
        );
    };

    const handleItemSelectionChange = (index: number, event: Event) => {
        const target = event.currentTarget;
        if (target instanceof HTMLInputElement) {
            setSelectedAt(index, target.checked);
        }
    };

    const handleDownloadedSelectionChange = (index: number, event: Event) => {
        const target = event.currentTarget;
        if (target instanceof HTMLInputElement) {
            setDownloadedSelectedAt(index, target.checked);
        }
    };

    const setAll = (value: boolean) => {
        const nextSelected = selectCollectionPage(selected, pageIndices, value);
        selectionLimitNotice = value && pageIndices.some((index) => !nextSelected[index]);
        selected = nextSelected;
        schedulePointsPreview(nextSelected);
    };

    const setAllDownloaded = (value: boolean) => {
        downloadedSelected = selectCollectionPage(downloadedSelected, pageIndices, value, Infinity);
    };

    const handleAllSelectionChange = (event: Event) => {
        const target = event.currentTarget;
        if (!(target instanceof HTMLInputElement)) return;

        const shouldSelect = target.checked;
        if (viewingDownloaded) {
            setAllDownloaded(shouldSelect);
        } else {
            setAll(shouldSelect);
        }
    };

    const dedupeByItemKeyOrUrl = (batchItems: DialogBatchItem[]) => {
        const seen = new Set<string>();
        const result: DialogBatchItem[] = [];

        for (const item of batchItems) {
            const key = item.itemKey || item.url;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            result.push(item);
        }

        return result;
    };

    const markSelectedDownloaded = async () => {
        if (!collectionKey || running || pointsCheckLoading || !clerkEnabled || !$isSignedIn) {
            return;
        }

        const selectedItems = items.filter((item, index) => selected[index] && item.itemKey);
        if (!selectedItems.length) return;

        const ok = await markCollectionDownloadedItems({
            collectionKey,
            title: title || undefined,
            sourceUrl: collectionSourceUrl,
            items: selectedItems.map((item) => ({
                itemKey: item.itemKey!,
                url: item.url,
                title: item.title,
            })),
        });
        if (!ok) return;

        const markedKeys = new Set(selectedItems.map((item) => item.itemKey));
        downloadedItems = dedupeByItemKeyOrUrl([
            ...safeDownloadedItems,
            ...selectedItems,
        ]);
        items = items.filter((item) => !item.itemKey || !markedKeys.has(item.itemKey));
        selected = items.map(() => false);
        schedulePointsPreview();
    };

    const unmarkDownloadedItems = async (itemsToUnmark: DialogBatchItem[]) => {
        if (!collectionKey || running || pointsCheckLoading || !clerkEnabled || !$isSignedIn) {
            return;
        }

        const itemKeys = itemsToUnmark
            .map((item) => item.itemKey)
            .filter((key): key is string => typeof key === "string" && key.length > 0);
        if (!itemKeys.length) return;

        const ok = await unmarkCollectionDownloadedItems({ collectionKey, itemKeys });
        if (!ok) return;

        const unmarkedKeys = new Set(itemKeys);
        downloadedItems = safeDownloadedItems.filter(
            (item) => !item.itemKey || !unmarkedKeys.has(item.itemKey),
        );
        items = dedupeByItemKeyOrUrl([...items, ...itemsToUnmark]);
        downloadedSelected = downloadedItems.map(() => false);
        let remaining = COLLECTION_SELECTION_LIMIT;
        selected = items.map((item) => {
            if (remaining > 0 && !isItemRestricted(item) && unmarkedKeys.has(item.itemKey || "")) {
                remaining--;
                return true;
            }
            return false;
        });
        viewingDownloaded = downloadedItems.length > 0;
        schedulePointsPreview();
    };

    const unmarkSelectedDownloaded = async () => {
        const selectedItems = safeDownloadedItems.filter(
            (item, index) => downloadedSelected[index] && item.itemKey,
        );
        await unmarkDownloadedItems(
            selectedItems.length === 0 && safeDownloadedItems.length === 1
                ? safeDownloadedItems
                : selectedItems,
        );
    };

    type BatchSaveMode = "auto" | "manual";

    const confirmBatchDownloadReadiness = () =>
        new Promise<BatchSaveMode | false>((resolve) => {
            const autoSaveSupported = supportsAutoSaveDirectory();
            createDialog({
                id: "batch-download-readiness",
                type: "small",
                meowbalt: "question",
                dismissable: false,
                title: $t("dialog.batch.start_confirm.title"),
                bodyText: $t(
                    autoSaveSupported
                        ? "dialog.batch.start_confirm.auto_save_body"
                        : "dialog.batch.start_confirm.unsupported_body"
                ),
                buttons: [
                    {
                        text: $t("button.cancel"),
                        main: false,
                        action: () => resolve(false),
                    },
                    {
                        text: $t("dialog.batch.start_confirm.manual"),
                        main: !autoSaveSupported,
                        action: () => resolve("manual"),
                    },
                    ...(autoSaveSupported
                        ? [{
                            text: $t("dialog.batch.start_confirm.auto_save"),
                            main: true,
                            action: async () => {
                                try {
                                    const ready = await prepareAutoSaveDirectory({ prompt: true });
                                    resolve(ready ? "auto" : false);
                                } catch (error) {
                                    console.error("[batch] unable to prepare auto-save directory", error);
                                    resolve(false);
                                }
                            },
                        }]
                        : []),
                ],
            });
        });

    const downloadSelected = async () => {
        if (running || pointsCheckLoading) return;
        if (selectedCountValue > COLLECTION_SELECTION_LIMIT) return;
        if (clerkEnabled && (!pointsPreviewReady || pointsPreviewLoading)) return;

        if (!$isSignedIn) {
            persistCurrentBatchIntent(true);
            const signedIn = await requireDownloadAuth({
                // Close native <dialog> first (it sits in the browser top-layer and can cover Clerk).
                beforeOpenClerk: async () => {
                    close?.();
                    await new Promise((r) => setTimeout(r, 200));
                },
            });
            if (!signedIn) {
                return;
            }
        }

        const selectedItems = items.filter((_, i) => selected[i]);
        if (!selectedItems.length) return;

        const saveMode = await confirmBatchDownloadReadiness();
        if (!saveMode) return;

        const requiredPoints = clerkEnabled ? pointsPreviewRequired : 0;

        let currentPoints = 0;
        if (requiredPoints > 0) {
            pointsCheckLoading = true;
            let membershipActive = false;
            try {
                const profile = await fetchUserPointsProfile();
                membershipActive = profile.membershipActive;
                currentPoints = Number(profile.points ?? 0);
            } catch {
                pointsCheckLoading = false;
                showPointsError();
                return;
            }

            if (!membershipActive && currentPoints < requiredPoints) {
                pointsCheckLoading = false;
                showPointsInsufficient(currentPoints, requiredPoints);
                return;
            }

            pointsCheckLoading = false;
        }

        running = true;
        clearPendingBatchIntent();
        cancelPointsPreview();
        cancelRequested = false;
        progress = 0;
        totalToRun = selectedItems.length;

        if (cancelRequested) {
            resetRunState();
            return;
        }

        // close dialog immediately; downloads continue in background
        close();
        // allow dialog stack to settle before any subsequent dialogs open
        await new Promise((r) => setTimeout(r, 200));
        const batchSessionId = uuid();

        for (const item of selectedItems) {
            if (cancelRequested) break;

            const taskId = uuid();
            const request = buildBatchRequest(item);
            const queueMeta: {
                batchSessionId: string;
                batchSelectionTotal: number;
                autoSaveEnabled: boolean;
                collectionMemory?: {
                    collectionKey: string;
                    title?: string;
                    sourceUrl?: string;
                    itemKey: string;
                    itemUrl?: string;
                    itemTitle?: string;
                };
            } = {
                batchSessionId,
                batchSelectionTotal: selectedItems.length,
                autoSaveEnabled: saveMode === "auto",
            };

            if (clerkEnabled && collectionKey && $isSignedIn && item.itemKey) {
                queueMeta.collectionMemory = {
                    collectionKey,
                    title: title || undefined,
                    sourceUrl: collectionSourceUrl,
                    itemKey: item.itemKey,
                    itemUrl: item.url,
                    itemTitle: item.title,
                };
            }
            let response = null;
            let rateLimitRetries = 0;
            let queueRetries = 0;
            let shouldStopBatch = false;
            let itemCompleted = false;
            let shouldSkipItem = false;

            while (!cancelRequested && !itemCompleted) {
                const launchAttempt = async () => {
                    let attemptRequest = request;
                    if (queueRetries > 0) {
                        const pointsReleased = await waitForPointsRelease(taskId);
                        if (!pointsReleased) return null;
                        const retryItem = get(queueStore)[taskId];
                        attemptRequest = buildQueueRetryRequest(
                            request,
                            taskId,
                            retryItem?.points?.status,
                        );
                    }
                    return savingHandler({
                        request: attemptRequest,
                        skipPoints: true,
                        oldTaskId: taskId,
                        suppressErrors: true,
                        queueMeta,
                    });
                };
                if (rateLimitRetries > 0 || queueRetries > 0) {
                    response = await scheduleQueueRetry(taskId, async () => {
                        const retryResponse = await launchAttempt();
                        const retryItem = get(queueStore)[taskId];
                        if (
                            retryResponse?.status !== "error" &&
                            retryItem &&
                            (retryItem.state === "waiting" || retryItem.state === "running")
                        ) {
                            await waitForQueueItemDone(taskId);
                        }
                        return retryResponse;
                    });
                } else {
                    response = await launchAttempt();
                }

                if (response?.status === "error" && response.error.code === rateLimitErrorCode) {
                    rateLimitRetries += 1;
                    if (rateLimitRetries > maxRateLimitRetries) {
                        if (!rateLimitSkipNotified) {
                            rateLimitSkipNotified = true;
                            createDialog({
                                id: "batch-rate-limit-skipped",
                                type: "small",
                                meowbalt: "error",
                                title: $t("dialog.batch.points_check_failed"),
                                bodyText: "rate limit hit; batch stopped. please retry later.",
                                buttons: [
                                    {
                                        text: $t("button.gotit"),
                                        main: true,
                                        action: () => {},
                                    },
                                ],
                            });
                        }
                        shouldStopBatch = true;
                        break;
                    }
                    await sleep(rateLimitBackoffMs * rateLimitRetries);
                    continue;
                }

                if (
                    response?.status === "error" &&
                    response.error.code === MEMBERSHIP_DOWNLOAD_LIMIT_ERROR
                ) {
                    cancelRequested = true;
                    await showMembershipDownloadLimitDialog(response.error.context);
                    break;
                }

                if (shouldStopBatch || !response || response.status === "error") {
                    const code = response?.status === "error" ? response.error.code : undefined;
                    if (
                        code === "error.api.points.insufficient" ||
                        code === "error.api.points.unavailable" ||
                        code === "error.api.user.disabled" ||
                        code === "error.api.auth.clerk.missing" ||
                        code === "error.api.auth.clerk.invalid"
                    ) {
                        cancelRequested = true;
                    } else {
                        shouldSkipItem = true;
                    }
                    break;
                }

                const queuedItem = get(queueStore)[taskId];
                if (!queuedItem) {
                    itemCompleted = true;
                    break;
                }

                const queueResult = await waitForQueueItemDone(taskId);
                if (queueResult === "done") {
                    itemCompleted = true;
                    break;
                }

                const latestQueueItem = get(queueStore)[taskId];
                const queueErrorCode =
                    latestQueueItem?.state === "error"
                        ? latestQueueItem.errorCode
                        : undefined;
                const shouldRetryQueueError =
                    queueResult === "error" &&
                    !!queueErrorCode &&
                    retryableQueueErrorCodes.has(queueErrorCode) &&
                    queueRetries < maxQueueErrorRetries;

                if (shouldRetryQueueError) {
                    queueRetries += 1;
                    await sleep(queueRetryBackoffMs * queueRetries);
                    continue;
                }

                shouldSkipItem = true;
                break;
            }

            if (!itemCompleted && !shouldSkipItem) break;

            progress += 1;

            if (!cancelRequested) {
                await sleep(baseBatchDelayMs);
            }
        }

        resetRunState();
    };

</script>

<DialogContainer {id} {dismissable} bind:close>
    <div class="dialog-body batch-dialog">
        <div class="popup-header">
            <div class="popup-title-container">
                <IconBoxMultiple />
                <h2 class="popup-title" tabindex="-1" title={title || $t("dialog.batch.title")}>
                    {title || $t("dialog.batch.title")}
                </h2>
            </div>
            <div class="subtext popup-description">
                {#if running}
                    {$t("dialog.batch.status.running")}: {progress}/{totalToRun}
                {:else}
                    {#if !viewingDownloaded}
                        <div class="summary-chip">
                            {$t("dialog.batch.status.selected")}: <strong>{selectedCountValue}/{COLLECTION_SELECTION_LIMIT}</strong>
                        </div>
                        <div class="summary-chip">{$t("dialog.batch.total", { count: items.length })}</div>
                    {:else}
                        <div class="summary-chip">
                            {$t("dialog.batch.status.selected")}: {downloadedSelectedCountValue}/{safeDownloadedItems.length}
                        </div>
                    {/if}
                    {#if clerkEnabled && collectionKey && $isSignedIn && safeDownloadedItems.length > 0}
                        <div class="summary-chip">
                            {$t("dialog.batch.status.downloaded")}: {safeDownloadedItems.length}
                            {#if collectionTotalCount}
                                /{collectionTotalCount}
                            {/if}
                        </div>
                    {/if}
                {/if}
            </div>
        </div>

        <details class="batch-notice">
            <summary>{$t("dialog.batch.footer_reminder")}</summary>
            <div class="batch-notice-line">
                {$t("dialog.batch.manual_save_hint")}
            </div>
            <div class="batch-notice-line">
                {$t("dialog.batch.keep_screen_on_hint")}
            </div>
        </details>

        <div class="batch-toolbar">
            <label class="batch-sort">
                <span>{$t("dialog.batch.sort")}</span>
                <select bind:value={sortOrder} disabled={running || pointsCheckLoading}
                    on:change={() => currentPage = 1}>
                    <option value="original">{$t("dialog.batch.sort_original")}</option>
                    <option value="title-asc">{$t("dialog.batch.sort_title_asc")}</option>
                    <option value="title-desc">{$t("dialog.batch.sort_title_desc")}</option>
                </select>
            </label>
            {#if !viewingDownloaded}
                {#if clerkEnabled && collectionKey && $isSignedIn}
                    <button
                        class="button elevated toolbar-button"
                        disabled={running || pointsCheckLoading || selectedCountValue === 0}
                        on:click={markSelectedDownloaded}
                    >
                        <IconCircleCheck />
                        {$t("dialog.batch.mark_selected_downloaded")}
                    </button>
                {/if}
            {:else}
                <button
                    class="button elevated toolbar-button"
                    disabled={
                        running ||
                        pointsCheckLoading ||
                        (downloadedSelectedCountValue === 0 && safeDownloadedItems.length !== 1)
                    }
                    on:click={unmarkSelectedDownloaded}
                >
                    <IconArrowBackUp />
                    {$t("dialog.batch.mark_selected_pending")}
                </button>
            {/if}

            {#if clerkEnabled && collectionKey && $isSignedIn && safeDownloadedItems.length > 0}
                <button
                    class="button elevated toolbar-button"
                    disabled={running || pointsCheckLoading}
                    on:click={toggleDownloadedView}
                >
                    <IconCircleCheck />
                    {viewingDownloaded
                        ? $t("dialog.batch.view_pending")
                        : $t("dialog.batch.view_downloaded")}
                </button>
            {/if}
        </div>

        <div class="batch-list" role="list">
            <div class="batch-selection-header">
                <label class="batch-check batch-check-master">
                    <input
                        bind:this={selectAllCheckbox}
                        type="checkbox"
                        checked={activeSelectionAll}
                        on:change={handleAllSelectionChange}
                        disabled={running || pointsCheckLoading || activeSelectionTotal === 0}
                        aria-label={activeSelectionAll
                            ? $t("dialog.batch.select_page_none")
                            : $t("dialog.batch.select_page")}
                        title={activeSelectionAll
                            ? $t("dialog.batch.select_page_none")
                            : $t("dialog.batch.select_page")}
                    />
                    <span>{activeSelectionAll ? $t("dialog.batch.select_page_none") : $t("dialog.batch.select_page")}</span>
                </label>
                {#if activeSelectedCount > 0 && !activeSelectionAll}
                    <button class="button elevated page-clear" disabled={running || pointsCheckLoading}
                        on:click={() => viewingDownloaded ? setAllDownloaded(false) : setAll(false)}>
                        {$t("dialog.batch.select_page_none")}
                    </button>
                {/if}
            </div>

            {#each pageItems as entry (entry.item.url)}
                {@const item = entry.item}
                {@const i = entry.index}
                <div
                    class="batch-item"
                    class:selected={viewingDownloaded ? downloadedSelected[i] : selected[i]}
                    class:downloaded={viewingDownloaded}
                    class:restricted={!viewingDownloaded && isItemRestricted(item)}
                    role="listitem"
                >
                    {#if viewingDownloaded}
                        <label class="batch-check downloaded-check">
                            <input
                                type="checkbox"
                                checked={downloadedSelected[i]}
                                on:change={(event) => handleDownloadedSelectionChange(i, event)}
                                disabled={running || pointsCheckLoading || isItemRestricted(item)}
                                aria-label={$t("a11y.dialog.batch.select_item")}
                            />
                        </label>
                    {:else}
                        <label class="batch-check">
                            <input
                                type="checkbox"
                                checked={selected[i]}
                                on:change={(event) => handleItemSelectionChange(i, event)}
                                disabled={running || pointsCheckLoading || isItemRestricted(item) || (!selected[i] && selectedCountValue >= COLLECTION_SELECTION_LIMIT)}
                                aria-label={$t("a11y.dialog.batch.select_item")}
                            />
                        </label>
                    {/if}

                    <div class="batch-text">
                        <div class="batch-title" title={item.title || item.url}>
                            {item.title || item.url}
                        </div>
                        {#if item.title}
                            <div class="batch-url" title={item.url}>
                                {item.url}
                            </div>
                        {/if}
                        {#if !viewingDownloaded && isItemRestricted(item)}
                            <div class="batch-restricted-note">
                                {$t("error.api.content.platform_restricted", { service: "Bilibili" })}
                            </div>
                        {/if}
                    </div>

                    {#if viewingDownloaded}
                        <div class="batch-actions">
                            <button
                                class="button elevated icon-button"
                                disabled={running || pointsCheckLoading}
                                on:click={() => void unmarkDownloadedItems([item])}
                                aria-label={$t("dialog.batch.mark_selected_pending")}
                                title={$t("dialog.batch.mark_selected_pending")}
                            >
                                <IconArrowBackUp />
                            </button>
                        </div>
                    {/if}
                </div>
            {/each}
        </div>

        <div class="batch-pagination">
            <button class="button elevated" disabled={currentPage === 1}
                on:click={() => currentPage--}>{$t("dialog.batch.page_previous")}</button>
            <span aria-live="polite">{$t("dialog.batch.page_status", { page: currentPage, total: pageCount })}</span>
            <button class="button elevated" disabled={currentPage === pageCount}
                on:click={() => currentPage++}>{$t("dialog.batch.page_next")}</button>
        </div>
        {#if !viewingDownloaded && (selectionLimitNotice || selectedCountValue >= COLLECTION_SELECTION_LIMIT)}
            <div class="batch-notice-line" role="status">{$t("dialog.batch.selection_limit", { max: COLLECTION_SELECTION_LIMIT })}</div>
        {/if}

        <div class="batch-footer">
            <div class="batch-footer-actions">
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
                    {#if viewingDownloaded}
                        <button
                            class="button elevated footer-button active"
                            disabled={running || pointsCheckLoading}
                            on:click={toggleDownloadedView}
                        >
                            {$t("dialog.batch.view_pending")}
                        </button>
                    {:else}
                        <button
                            class="button elevated footer-button active"
                            disabled={
                                selectedCountValue === 0 ||
                                pointsCheckLoading ||
                                (clerkEnabled &&
                                    (!pointsPreviewReady || pointsPreviewLoading))
                            }
                            on:click={downloadSelected}
                        >
                            <IconDownload />
                            {$t("dialog.batch.download_selected")} ({selectedCountValue})
                        </button>
                    {/if}
                {/if}
            </div>

            {#if !viewingDownloaded && clerkEnabled && selectedCountValue > 0}
                <div class="points-preview" aria-live="polite">
                    {#if pointsPreviewLoading || !pointsPreviewReady}
                        {$t("dialog.batch.points_preview.loading")}
                    {:else}
                        {$t("dialog.batch.points_preview", {
                            required: pointsPreviewRequired,
                        })}
                    {/if}
                </div>
            {/if}
        </div>
    </div>
</DialogContainer>

<style>
    .batch-sort {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        max-width: 100%;
    }
    .batch-sort select {
        appearance: auto;
        max-width: 100%;
        min-height: 34px;
        padding: 5px 10px;
        border-radius: 10px;
        border: 2px solid var(--secondary);
        background: var(--button);
        color: var(--text);
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 2px 5px color-mix(in srgb, var(--secondary) 8%, transparent);
    }
    .batch-sort select:hover:not(:disabled) {
        background: color-mix(in srgb, var(--secondary) 8%, var(--button));
    }
    .batch-sort select:focus-visible {
        outline: 2px solid var(--secondary);
        outline-offset: 3px;
    }
    .batch-sort select:disabled { cursor: default; opacity: 0.6; }
    .batch-pagination {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        flex-wrap: wrap;
        padding-top: 0;
    }
    .batch-pagination button {
        padding: 6px 12px;
        min-height: 34px;
        border: 1px solid var(--surface-2);
        border-radius: 10px;
    }
    .batch-pagination span { font-size: 13px; font-variant-numeric: tabular-nums; }
    .batch-pagination button:disabled { opacity: 0.45; }
    .batch-dialog {
        --surface-1: var(--button);
        --surface-2: var(--popup-stroke);
        box-sizing: border-box;
        align-items: stretch;
        gap: 8px;
        padding: 16px;
        height: calc(96dvh - env(safe-area-inset-bottom) - env(safe-area-inset-top));
        max-height: calc(96dvh - env(safe-area-inset-bottom) - env(safe-area-inset-top));
        width: min(920px, calc(100vw - 32px));
        overflow-x: hidden;
        overflow-y: auto;
    }
    .batch-dialog > * { flex-shrink: 0; }

    .popup-header {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--surface-2);
    }

    .popup-title-container {
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        gap: 6px;
        min-width: 0;
        color: var(--text);
    }

    .popup-title-container :global(svg) {
        height: 18px;
        width: 18px;
        flex-shrink: 0;
        color: var(--secondary);
        margin-top: 2px;
    }

    .popup-title {
        font-size: 15px;
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        overflow-wrap: anywhere;
        margin: 0;
    }

    .popup-description {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
        font-size: 11px;
        padding: 0;
    }
    .summary-chip {
        padding: 3px 6px;
        border-radius: 8px;
        background: color-mix(in srgb, var(--secondary) 7%, var(--surface-1));
        color: var(--text);
        font-variant-numeric: tabular-nums;
    }

    .popup-title:focus-visible {
        box-shadow: none !important;
    }

    .batch-toolbar {
        display: flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
    }

    .batch-notice {
        padding: 6px 10px;
        border-radius: 8px;
        border: 1px solid color-mix(in srgb, var(--secondary) 22%, transparent);
        background: color-mix(in srgb, var(--secondary) 5%, var(--surface-1));
    }
    .batch-notice summary {
        font-size: 11px;
        line-height: 1.4;
        color: var(--gray);
        cursor: pointer;
    }
    .batch-notice[open] .batch-notice-line { margin-top: 6px; }

    .batch-notice-line {
        font-size: 11px;
        line-height: 1.4;
        color: color-mix(in srgb, var(--text) 82%, var(--popup-bg));
    }

    .toolbar-button {
        min-height: 34px;
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 5px 10px;
        font-size: 12px;
        border: 2px solid var(--secondary);
        border-radius: 10px;
        background: var(--button);
        color: var(--text);
        font-weight: 600;
    }
    .toolbar-button:hover:not(:disabled) {
        background: color-mix(in srgb, var(--secondary) 8%, var(--button));
    }
    .toolbar-button:disabled { opacity: 0.6; }

    .toolbar-button :global(svg) {
        width: 15px;
        height: 15px;
    }

    .batch-list {
        flex: 1 1 auto;
        min-height: 160px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 0 6px 2px 0;
        scrollbar-width: thin;
        scrollbar-color: var(--input-border) transparent;
    }

    .batch-selection-header {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        position: sticky;
        top: 0;
        z-index: 1;
        padding: 5px 10px;
        font-size: 12px;
        background: var(--popup-bg);
        border-bottom: 1px solid var(--surface-2);
    }

    .batch-item {
        display: grid;
        grid-template-columns: 24px 1fr auto;
        gap: 10px;
        align-items: center;
        flex-shrink: 0;
        padding: 14px;
        border-radius: 12px;
        background: var(--surface-1);
        border: 1px solid var(--surface-2);
        transition: background-color 0.15s, border-color 0.15s;
    }
    .batch-item:hover { border-color: color-mix(in srgb, var(--secondary) 45%, var(--surface-2)); }
    .batch-item.selected {
        border-color: var(--secondary);
        background: color-mix(in srgb, var(--secondary) 8%, var(--surface-1));
    }

    .batch-check {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
    }

    .batch-check input {
        width: 18px;
        height: 18px;
        accent-color: var(--secondary);
    }

    .batch-check-master {
        justify-content: flex-start;
        gap: 10px;
        min-height: 24px;
    }
    .page-clear { padding: 6px 10px; }

    .batch-item.downloaded .batch-title {
        color: var(--gray);
        font-weight: 500;
    }

    .batch-item.restricted {
        opacity: 0.72;
    }

    .batch-restricted-note {
        color: var(--red);
        font-size: 12px;
        line-height: 1.35;
    }

    .batch-text {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .batch-title {
        font-weight: 600;
        color: var(--text);
        font-size: 15px;
        line-height: 1.5;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow-wrap: anywhere;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .batch-url {
        font-size: 12px;
        color: var(--gray);
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
        flex-direction: column;
        gap: 6px;
        width: 100%;
        padding-top: 8px;
        border-top: 1px solid var(--surface-2);
    }

    .batch-footer-actions {
        display: flex;
        gap: calc(var(--padding) / 2);
        justify-content: flex-end;
    }

    .points-preview {
        font-size: 12px;
        color: var(--gray);
        display: flex;
        align-items: center;
        justify-content: flex-end;
        line-height: 1.35;
        text-align: right;
        width: 100%;
    }

    .footer-button {
        min-height: 38px;
        min-width: 140px;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 8px;
        padding: 0 14px;
        border-radius: 10px;
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
            width: calc(100vw - 16px);
            padding: 12px;
            gap: 6px;
            height: calc(98dvh - env(safe-area-inset-bottom) - env(safe-area-inset-top));
            max-height: calc(98dvh - env(safe-area-inset-bottom) - env(safe-area-inset-top));
        }
        .popup-title { font-size: 13px; }
        .batch-sort { width: 100%; }
        .batch-sort select { flex: 1; min-width: 0; }
        .toolbar-button { flex: 1 1 auto; padding: 5px 8px; }
        .batch-item { padding: 9px; gap: 8px; }
        .batch-title { font-size: 14px; }
        .batch-pagination { gap: 10px; }

        .batch-footer-actions {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            width: 100%;
        }

        .footer-button {
            min-width: 0;
            width: 100%;
            padding: 0 10px;
            gap: 6px;
            line-height: 1.1;
            text-align: center;
            white-space: normal;
            overflow-wrap: anywhere;
            min-height: 40px;
            height: auto;
        }

        .points-preview {
            justify-content: center;
            text-align: center;
            order: 2;
            padding: 0 4px;
        }
    }
</style>
