<script lang="ts">
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { browser } from "$app/environment";
    import { onDestroy, tick } from "svelte";

    import { t } from "$lib/i18n/translations";

    import dialogs, { createDialog } from "$lib/state/dialogs";

    import { link, downloadButtonState } from "$lib/state/omnibox";
    import cachedInfo from "$lib/state/server-info";
    import { updateSetting } from "$lib/state/settings";
    import { turnstileSolved } from "$lib/state/turnstile";
    import { savingHandler } from "$lib/api/saving-handler";
    import API from "$lib/api/api";
    import { clerkEnabled } from "$lib/state/clerk";
    import {
        clearCollectionMemory,
        getCollectionDownloadedItemKeys,
    } from "$lib/api/collection-memory";

    import type { Optional } from "$lib/types/generic";
    import type { DownloadModeOption } from "$lib/types/settings";
    import type { DialogBatchItem } from "$lib/types/dialog";
    import type { CobaltExpandResponse } from "$lib/types/expand";

    import IconLink from "@tabler/icons-svelte/IconLink.svelte";
    import IconLoader2 from "@tabler/icons-svelte/IconLoader2.svelte";

    import ClearButton from "$components/save/buttons/ClearButton.svelte";
    import DownloadButton from "$components/save/buttons/DownloadButton.svelte";

    import Switcher from "$components/buttons/Switcher.svelte";
    import ActionButton from "$components/buttons/ActionButton.svelte";
    import SettingsButton from "$components/buttons/SettingsButton.svelte";

    import IconMute from "$components/icons/Mute.svelte";
    import IconMusic from "$components/icons/Music.svelte";
    import IconSparkles from "$components/icons/Sparkles.svelte";
    import IconClipboard from "$components/icons/Clipboard.svelte";

    export let feedbackHref: string | null = null;
    export let feedbackText: string | null = null;
    export let onFeedbackClick:
        | ((event: MouseEvent) => void | Promise<void>)
        | null = null;
    export let collectionGuideText: string | null = null;
    export let batchGuideText: string | null = null;
    export let collectionGuideBody: string | null = null;
    export let batchGuideBody: string | null = null;
    export let collectionGuidePlatforms: string[] = [];
    export let batchGuidePlatforms: string[] = [];

    let linkInput: Optional<HTMLInputElement>;

    let isFocused = false;

    let isDisabled = false;
    let isLoading = false;
    let isBotCheckOngoing = false;
    let submitInFlight = false;

    const DEFAULT_BATCH_MAX_ITEMS = 20;

    const resolveBatchMaxItems = (value: unknown) => {
        if (typeof value === "number" && Number.isFinite(value)) {
            const normalized = Math.floor(value);
            if (normalized === 0) return Number.POSITIVE_INFINITY;
            if (normalized > 0) return normalized;
        }

        return DEFAULT_BATCH_MAX_ITEMS;
    };

    let batchMaxItems: number = DEFAULT_BATCH_MAX_ITEMS;
    let batchLimitEnabled = true;
    let batchLimitExceeded = false;
    let feedbackLinkWidth = 0;

    type GuideKey = "collection" | "batch";
    let activeGuide: GuideKey | null = null;
    let guideHideTimer: ReturnType<typeof setTimeout> | null = null;

    const extractUrls = (text: string) => {
        const matches = text.match(/https?:\/\/[^\s]+/gi) ?? [];
        const urls: string[] = [];

        for (const match of matches) {
            try {
                const parsed = new URL(match);
                if (parsed.protocol !== "https:") continue;
                urls.push(parsed.toString());
            } catch {
                // ignore
            }
        }

        return [...new Set(urls)];
    };

    const isBilibiliUrl = (url: string) => {
        try {
            const parsed = new URL(url);
            return (
                parsed.hostname === "b23.tv" ||
                parsed.hostname === "bilibili.com" ||
                parsed.hostname.endsWith(".bilibili.com")
            );
        } catch {
            return false;
        }
    };

    const isDouyinUrl = (url: string) => {
        try {
            const parsed = new URL(url);
            return (
                parsed.hostname === "v.douyin.com" ||
                parsed.hostname === "douyin.com" ||
                parsed.hostname.endsWith(".douyin.com") ||
                parsed.hostname === "iesdouyin.com" ||
                parsed.hostname.endsWith(".iesdouyin.com")
            );
        } catch {
            return false;
        }
    };

    const isTikTokUrl = (url: string) => {
        try {
            const parsed = new URL(url);
            return parsed.hostname === "tiktok.com" || parsed.hostname.endsWith(".tiktok.com");
        } catch {
            return false;
        }
    };

    const isBilibiliVideoPage = (url: string) => {
        try {
            const parsed = new URL(url);
            return (
                (parsed.hostname === "b23.tv" ||
                    parsed.hostname === "bilibili.com" ||
                    parsed.hostname.endsWith(".bilibili.com")) &&
                parsed.pathname.startsWith("/video/")
            );
        } catch {
            return false;
        }
    };

    const isDouyinVideoPage = (url: string) => {
        try {
            const parsed = new URL(url);
            return (
                (parsed.hostname === "douyin.com" ||
                    parsed.hostname === "www.douyin.com" ||
                    parsed.hostname.endsWith(".douyin.com")) &&
                (parsed.pathname.startsWith("/video/") ||
                    parsed.pathname.startsWith("/note/"))
            );
        } catch {
            return false;
        }
    };

    const getCurrentLang = () =>
        $page.url.pathname.match(/^\/([a-z]{2})/)?.[1] || "en";

    const getDouyinGuidePath = () =>
        `/${getCurrentLang()}/guide/douyin-download-guide`;

    const getDouyinGuideUrl = () => {
        const guidePath = getDouyinGuidePath();
        return browser ? new URL(guidePath, $page.url.origin).toString() : guidePath;
    };

    const isDouyinSearchOrJingxuanUrl = (url: string) => {
        if (!isDouyinUrl(url)) return false;

        try {
            const parsed = new URL(url);
            const target = `${parsed.pathname}${parsed.search}${parsed.hash}`.toLowerCase();
            return target.includes("search") || target.includes("jingxuan");
        } catch {
            return false;
        }
    };

    const showDouyinGuideDialog = () => {
        const isZh = getCurrentLang() === "zh";
        const guidePath = getDouyinGuidePath();
        const guideUrl = getDouyinGuideUrl();

        createDialog({
            id: "douyin-search-guide",
            type: "small",
            icon: "warn-red",
            leftAligned: true,
            title: isZh
                ? "\u8fd9\u4e0d\u662f\u53ef\u4e0b\u8f7d\u7684\u6296\u97f3\u89c6\u9891\u94fe\u63a5"
                : "This Douyin link is not a direct video link",
            bodyHtml: isZh
                ? `\u4f60\u7c98\u8d34\u7684\u662f\u6296\u97f3 <code>search</code> \u6216 <code>jingxuan</code> \u9875\u9762\u5730\u5740\uff0c\u4e0d\u662f\u5177\u4f53\u89c6\u9891\u7684\u5206\u4eab\u94fe\u63a5\u3002<br /><br />\u8bf7\u5148\u6253\u5f00\u5177\u4f53\u89c6\u9891\uff0c\u518d\u70b9\u201c\u5206\u4eab\u201d\u590d\u5236\u94fe\u63a5\u3002<br /><br />\u6559\u7a0b\u5730\u5740\uff1a<br /><a href="${guideUrl}" target="_blank" rel="noopener noreferrer">${guideUrl}</a>`
                : `You pasted a Douyin <code>search</code> or <code>jingxuan</code> page URL instead of a specific video share link.<br /><br />Open the actual video first, then use Douyin's share action to copy the link.<br /><br />Guide:<br /><a href="${guideUrl}" target="_blank" rel="noopener noreferrer">${guideUrl}</a>`,
            buttons: [
                {
                    text: isZh ? "\u53bb\u770b\u6559\u7a0b" : "Open guide",
                    main: true,
                    action: () => goto(guidePath),
                },
                {
                    text: $t("button.gotit"),
                    main: false,
                    action: () => {},
                },
            ],
        });
    };

    const isTikTokVideoPage = (url: string) => {
        try {
            const parsed = new URL(url);
            if (!(parsed.hostname === "tiktok.com" || parsed.hostname.endsWith(".tiktok.com"))) {
                return false;
            }
            return parsed.pathname.includes("/video/") || parsed.pathname.includes("/photo/");
        } catch {
            return false;
        }
    };

    $: detectedUrls = extractUrls($link);
    $: isDownloadable = detectedUrls.length > 0;
    $: isBatchInput = detectedUrls.length > 1;
    $: batchMaxItems = resolveBatchMaxItems($cachedInfo?.info?.cobalt?.batchMaxItems);
    $: batchLimitEnabled = Number.isFinite(batchMaxItems) && batchMaxItems > 0;
    $: batchLimitExceeded = batchLimitEnabled && detectedUrls.length > batchMaxItems;

    const showBatchLimitDialog = (count: number) => {
        if (!batchLimitEnabled) return;

        createDialog({
            id: "batch-limit",
            type: "small",
            meowbalt: "error",
            title: $t("dialog.batch.limit.title"),
            bodyText: $t("dialog.batch.limit.body", {
                count,
                max: batchMaxItems,
            }),
            buttons: [
                {
                    text: $t("button.gotit"),
                    main: true,
                    action: () => {},
                },
            ],
        });
    };

    type BatchDialogMemoryInfo = {
        downloadedItems: DialogBatchItem[];
        collectionTotalCount: number;
    };

    const openBatchDialog = (
        items: DialogBatchItem[],
        title?: string,
        collectionKey?: string,
        collectionSourceUrl?: string,
        memoryInfo?: BatchDialogMemoryInfo,
    ) => {
        if (batchLimitEnabled && items.length > batchMaxItems) {
            showBatchLimitDialog(items.length);
            return;
        }

        createDialog({
            id: "batch-download",
            type: "batch",
            title,
            items,
            downloadedItems: memoryInfo?.downloadedItems,
            collectionTotalCount: memoryInfo?.collectionTotalCount,
            collectionKey,
            collectionSourceUrl,
        });
    };

    const submit = async () => {
        if (submitInFlight || $dialogs.length > 0 || isDisabled || isLoading || !isDownloadable) {
            return;
        }

        submitInFlight = true;
        let handedOffToSavingHandler = false;
        downloadButtonState.set("think");

        try {
            const blockedDouyinGuideUrl = detectedUrls.find(isDouyinSearchOrJingxuanUrl);
            if (blockedDouyinGuideUrl) {
                showDouyinGuideDialog();
                return;
            }

            // Multiple links => batch dialog immediately (platform-agnostic).
            if (isBatchInput) {
                if (batchLimitExceeded) {
                    showBatchLimitDialog(detectedUrls.length);
                    return;
                }

                openBatchDialog(
                    detectedUrls.map((url) => ({ url })),
                    $t("dialog.batch.title")
                );
                return;
            }

            const url = detectedUrls[0];
            if (!url) return;

            // Only expand for services that support collection/playlist detection.
            if (!isBilibiliUrl(url) && !isDouyinUrl(url) && !isTikTokUrl(url)) {
                handedOffToSavingHandler = true;
                return savingHandler({ url });
            }

            let expanded: Optional<CobaltExpandResponse>;
            try {
                expanded = await API.expand(url);
            } catch {
                handedOffToSavingHandler = true;
                return savingHandler({ url });
            }
            if (!expanded || expanded.status === "error") {
                handedOffToSavingHandler = true;
                return savingHandler({ url });
            }

            const items = expanded.items ?? [];
            const hasBatch = expanded.kind !== "single" && items.length > 1;

            if (!hasBatch) {
                handedOffToSavingHandler = true;
                return savingHandler({ url });
            }

        const batchItems: DialogBatchItem[] = items.map((item) => ({
            url: item.url,
            title: item.title,
            duration: item.duration,
            itemKey: item.itemKey,
        }));

        const collectionKey =
            expanded.status === "ok" ? expanded.collectionKey : undefined;

        let visibleBatchItems = batchItems;
        let memoryInfo: BatchDialogMemoryInfo | undefined = undefined;
        if (collectionKey && clerkEnabled) {
            const downloadedItemKeys =
                await getCollectionDownloadedItemKeys(collectionKey);
            if (downloadedItemKeys.length > 0) {
                const downloadedSet = new Set(downloadedItemKeys);
                const downloadedItems = batchItems.filter(
                    (item) => item.itemKey && downloadedSet.has(item.itemKey),
                );
                memoryInfo = {
                    downloadedItems,
                    collectionTotalCount: batchItems.length,
                };
                visibleBatchItems = batchItems.filter(
                    (item) => !item.itemKey || !downloadedSet.has(item.itemKey),
                );
            }

            if (visibleBatchItems.length === 0) {
                createDialog({
                    id: "batch-memory-empty",
                    type: "small",
                    title: $t("dialog.batch.memory.empty.title"),
                    bodyText: $t("dialog.batch.memory.empty.body"),
                    buttons: [
                        {
                            text: $t("button.gotit"),
                            main: true,
                            action: () => {},
                        },
                        ...(memoryInfo?.downloadedItems?.length
                            ? [
                                  {
                                      text: $t("dialog.batch.view_downloaded"),
                                      main: false,
                                      action: () =>
                                          openBatchDialog(
                                              [],
                                              expanded.title || $t("dialog.batch.title"),
                                              collectionKey,
                                              url,
                                              memoryInfo,
                                          ),
                                  },
                              ]
                            : []),
                        {
                            text: $t("dialog.batch.memory.clear"),
                            main: false,
                            action: async () => {
                                await clearCollectionMemory(collectionKey);
                            },
                        },
                    ],
                });
                return;
            }
        }

        if (batchLimitEnabled && visibleBatchItems.length > batchMaxItems) {
            const canFallbackToSingle =
                isBilibiliVideoPage(url) || isDouyinVideoPage(url) || isTikTokVideoPage(url);

            const subsetCounts = (() => {
                const limit = batchMaxItems;
                const candidates = [limit, 50, 20, 10, 5];
                const unique = new Set<number>();

                for (const candidate of candidates) {
                    if (
                        typeof candidate === "number" &&
                        Number.isFinite(candidate) &&
                        candidate > 1 &&
                        candidate <= limit
                    ) {
                        unique.add(candidate);
                    }
                }

                return [...unique].sort((a, b) => b - a).slice(0, 3);
            })();

            const batchTitle = expanded.title || $t("dialog.batch.title");
            const openSubset = (count: number) => {
                const subset = visibleBatchItems.slice(0, count);
                const title =
                    subset.length < visibleBatchItems.length
                        ? `${batchTitle} (${subset.length}/${memoryInfo?.collectionTotalCount || visibleBatchItems.length})`
                        : batchTitle;
                openBatchDialog(subset, title, collectionKey, url, memoryInfo);
            };

            createDialog({
                id: "batch-limit-expanded",
                type: "small",
                meowbalt: "error",
                title: $t("dialog.batch.limit.title"),
                bodyText: $t("dialog.batch.limit.body", {
                    count: visibleBatchItems.length,
                    max: batchMaxItems,
                }),
                buttons: [
                    ...subsetCounts.map((count, index) => ({
                        text: $t("dialog.batch.limit.download_first", { count }),
                        main: index === 0,
                        action: () => openSubset(count),
                    })),
                    ...(canFallbackToSingle
                        ? [
                              {
                                  text: $t("dialog.batch.detect.download_single"),
                                  main: subsetCounts.length === 0,
                                  action: () => {
                                      setTimeout(() => savingHandler({ url }), 200);
                                  },
                              },
                          ]
                        : []),
                    {
                        text: $t("button.gotit"),
                        main: subsetCounts.length === 0 && !canFallbackToSingle,
                        action: () => {},
                    },
                ],
            });
            return;
        }

        // If user pasted an explicit collection URL, go straight to batch list.
        if (!isBilibiliVideoPage(url) && !isDouyinVideoPage(url) && !isTikTokVideoPage(url)) {
            openBatchDialog(
                visibleBatchItems,
                expanded.title || $t("dialog.batch.title"),
                collectionKey,
                url,
                memoryInfo,
            );
            return;
        }

        const promptTitle = $t("dialog.batch.detect.title");
        const isCollection =
            expanded.kind === "bilibili-ugc-season" ||
            expanded.kind === "douyin-mix" ||
            expanded.kind === "tiktok-playlist";
        const promptBody =
            isCollection
                ? $t("dialog.batch.detect.body.collection", {
                      title: expanded.title ?? url,
                      count: items.length,
                  })
                : $t("dialog.batch.detect.body.parts", {
                      title: expanded.title ?? url,
                      count: items.length,
                  });

        createDialog({
            id: "batch-detect",
            type: "small",
            title: promptTitle,
            bodyText: promptBody,
            buttons: [
                {
                    text: $t("dialog.batch.detect.download_single"),
                    main: false,
                    action: () => {
                        setTimeout(() => savingHandler({ url }), 200);
                    },
                },
                {
                    text: $t("dialog.batch.detect.download_batch"),
                    main: true,
                    action: () => {
                        setTimeout(
                            () =>
                                openBatchDialog(
                                    visibleBatchItems,
                                    expanded.title || $t("dialog.batch.title"),
                                    collectionKey,
                                    url,
                                    memoryInfo,
                                ),
                            200
                        );
                    },
                },
            ],
        });
        } finally {
            submitInFlight = false;
            if (!handedOffToSavingHandler) {
                downloadButtonState.set("idle");
            }
        }
    };

    $: linkFromHash = $page.url.hash.replace("#", "") || "";
    $: linkFromQuery = (browser ? $page.url.searchParams.get("u") : 0) || "";

    $: if (linkFromHash || linkFromQuery) {
        if (extractUrls(linkFromHash).length > 0) {
            $link = linkFromHash;
        } else if (extractUrls(linkFromQuery).length > 0) {
            $link = linkFromQuery;
        }

        // clear hash and query to prevent bookmarking unwanted links
        const currentLang =
            $page.url.pathname.match(/^\/([a-z]{2})/)?.[1] || "en";
        goto(`/${currentLang}`, { replaceState: true });
    }

    $: if ($cachedInfo?.info?.cobalt?.turnstileSitekey) {
        if ($turnstileSolved) {
            isBotCheckOngoing = false;
        } else {
            isBotCheckOngoing = true;
        }
    } else {
        isBotCheckOngoing = false;
    }

    const pasteClipboard = () => {
        if ($dialogs.length > 0 || isDisabled || isLoading) {
            return;
        }

        navigator.clipboard.readText().then(async (text: string) => {
            const matchLinks = text.match(/https?:\/\/[^\s]+/gi);
            if (!matchLinks?.length) return;

            $link = matchLinks.join(" ");

            if (!isBotCheckOngoing) {
                await tick(); // wait for button to render
                if (!batchLimitExceeded) {
                    submit();
                }
            }
        });
    };

    const changeDownloadMode = (mode: DownloadModeOption) => {
        updateSetting({ save: { downloadMode: mode } });
    };

    const handleKeydown = (e: KeyboardEvent) => {
        if (!linkInput || $dialogs.length > 0 || isDisabled || isLoading) {
            return;
        }

        if (e.metaKey || e.ctrlKey || e.key === "/") {
            linkInput.focus();
        }

        if (e.key === "Enter" && isDownloadable && isFocused) {
            submit();
        }

        if (["Escape", "Clear"].includes(e.key) && isFocused) {
            $link = "";
        }

        if (e.target === linkInput) {
            return;
        }

        switch (e.key) {
            case "D":
                pasteClipboard();
                break;
            case "J":
                changeDownloadMode("auto");
                break;
            case "K":
                changeDownloadMode("audio");
                break;
            case "L":
                changeDownloadMode("mute");
                break;
            default:
                break;
        }
    };

    const handleFeedbackLinkClick = (event: MouseEvent) => {
        if (!onFeedbackClick) return;
        event.preventDefault();
        void onFeedbackClick(event);
    };

    const clearGuideHideTimer = () => {
        if (!guideHideTimer) return;
        clearTimeout(guideHideTimer);
        guideHideTimer = null;
    };

    const showGuidePopover = (guide: GuideKey) => {
        clearGuideHideTimer();
        activeGuide = guide;
    };

    const scheduleHideGuidePopover = () => {
        clearGuideHideTimer();
        guideHideTimer = setTimeout(() => {
            activeGuide = null;
            guideHideTimer = null;
        }, 120);
    };

    const toggleGuidePopover = (guide: GuideKey) => {
        clearGuideHideTimer();
        activeGuide = activeGuide === guide ? null : guide;
    };

    $: activeGuideTitle =
        activeGuide === "collection"
            ? collectionGuideText
            : activeGuide === "batch"
              ? batchGuideText
              : null;
    $: activeGuideBody =
        activeGuide === "collection"
            ? collectionGuideBody
            : activeGuide === "batch"
              ? batchGuideBody
              : null;
    $: activeGuidePlatforms =
        activeGuide === "collection"
            ? collectionGuidePlatforms
            : activeGuide === "batch"
              ? batchGuidePlatforms
              : [];
    $: actionRightOffset =
        feedbackHref && feedbackText ? Math.max(0, feedbackLinkWidth + 10) : 0;

    onDestroy(() => {
        clearGuideHideTimer();
    });
</script>

<svelte:window on:keydown={handleKeydown} />

<div id="omnibox" style={`--feedback-offset:${actionRightOffset}px;`}>
    <div class="input-row">
        <div
            id="input-container"
            class:focused={isFocused}
            class:downloadable={isDownloadable}
        >
            <div
                id="input-link-icon"
                class:loading={isLoading || isBotCheckOngoing}
            >
                {#if isLoading || isBotCheckOngoing}
                    <IconLoader2 />
                {:else}
                    <IconLink />
                {/if}
            </div>

            <input
                id="link-area"
                bind:value={$link}
                bind:this={linkInput}
                on:input={() => (isFocused = true)}
                on:focus={() => (isFocused = true)}
                on:blur={() => (isFocused = false)}
                spellcheck="false"
                autocomplete="off"
                autocapitalize="off"
                maxlength="8192"
                placeholder={$t("save.input.placeholder")}
                aria-label={isBotCheckOngoing
                    ? $t("a11y.save.link_area.turnstile")
                    : $t("a11y.save.link_area")}
                data-form-type="other"
                disabled={isDisabled}
            />

            {#if $link && !isLoading}
                <ClearButton click={() => ($link = "")} />
            {/if}
            {#if isDownloadable}
                <DownloadButton
                    url={detectedUrls[0]}
                    onDownload={submit}
                    blocked={isBatchInput && batchLimitExceeded}
                    bind:disabled={isDisabled}
                    bind:loading={isLoading}
                />
            {/if}
        </div>

        {#if feedbackHref && feedbackText}
            <a
                class="feedback-inline-link feedback-inline-link--desktop"
                href={feedbackHref}
                bind:clientWidth={feedbackLinkWidth}
                on:click={handleFeedbackLinkClick}
            >
                {feedbackText}
            </a>
        {/if}
    </div>

    {#if isBatchInput}
        <div class="batch-hint" class:error={batchLimitExceeded} aria-live="polite">
            {#if batchLimitExceeded}
                {$t("save.batch.too_many", {
                    count: detectedUrls.length,
                    max: batchMaxItems,
                })}
            {:else}
                {$t("save.batch.detected", { count: detectedUrls.length })}
            {/if}
        </div>
    {/if}

    <div id="action-container">
        <Switcher>
            <SettingsButton
                settingContext="save"
                settingId="downloadMode"
                settingValue="auto"
            >
                <IconSparkles />
                {$t("save.auto")}
            </SettingsButton>
            <SettingsButton
                settingContext="save"
                settingId="downloadMode"
                settingValue="audio"
            >
                <IconMusic />
                {$t("save.audio")}
            </SettingsButton>
            <SettingsButton
                settingContext="save"
                settingId="downloadMode"
                settingValue="mute"
            >
                <IconMute />
                {$t("save.mute")}
            </SettingsButton>
        </Switcher>

        <div class="action-right">
            {#if collectionGuideText || batchGuideText}
                <div
                    class="download-guides download-guides--desktop"
                    aria-label="Download guides"
                >
                    {#if collectionGuideText}
                        <button
                            type="button"
                            class="guide-inline-link"
                            on:mouseenter={() => showGuidePopover("collection")}
                            on:mouseleave={scheduleHideGuidePopover}
                            on:focus={() => showGuidePopover("collection")}
                            on:blur={scheduleHideGuidePopover}
                            on:click={() => toggleGuidePopover("collection")}
                        >
                            {collectionGuideText}
                        </button>
                    {/if}
                    {#if batchGuideText}
                        <button
                            type="button"
                            class="guide-inline-link"
                            on:mouseenter={() => showGuidePopover("batch")}
                            on:mouseleave={scheduleHideGuidePopover}
                            on:focus={() => showGuidePopover("batch")}
                            on:blur={scheduleHideGuidePopover}
                            on:click={() => toggleGuidePopover("batch")}
                        >
                            {batchGuideText}
                        </button>
                    {/if}
                </div>
            {/if}

            <ActionButton id="paste" click={pasteClipboard}>
                <IconClipboard />
                <span id="paste-desktop-text">{$t("save.paste")}</span>
                <span id="paste-mobile-text">{$t("save.paste.long")}</span>
            </ActionButton>
        </div>
    </div>

    <div class="mobile-help-links" aria-label="Mobile helper links">
        {#if feedbackHref && feedbackText}
            <a
                class="mobile-help-link"
                href={feedbackHref}
                on:click={handleFeedbackLinkClick}
            >
                {feedbackText}
            </a>
        {/if}
        {#if collectionGuideText}
            <button
                type="button"
                class="mobile-help-link mobile-guide-link"
                on:mouseenter={() => showGuidePopover("collection")}
                on:mouseleave={scheduleHideGuidePopover}
                on:focus={() => showGuidePopover("collection")}
                on:blur={scheduleHideGuidePopover}
                on:click={() => toggleGuidePopover("collection")}
            >
                {collectionGuideText}
            </button>
        {/if}
        {#if batchGuideText}
            <button
                type="button"
                class="mobile-help-link mobile-guide-link"
                on:mouseenter={() => showGuidePopover("batch")}
                on:mouseleave={scheduleHideGuidePopover}
                on:focus={() => showGuidePopover("batch")}
                on:blur={scheduleHideGuidePopover}
                on:click={() => toggleGuidePopover("batch")}
            >
                {batchGuideText}
            </button>
        {/if}
    </div>

    {#if activeGuideTitle && activeGuideBody}
        <div class="guide-popover-mask" aria-hidden="true"></div>
        <div
            class="guide-popover-area"
            role="presentation"
            on:mouseenter={clearGuideHideTimer}
            on:mouseleave={scheduleHideGuidePopover}
        >
            <div class="guide-popover" role="status" aria-live="polite">
                <div class="guide-popover-title">{activeGuideTitle}</div>
                <div class="guide-popover-body">{activeGuideBody}</div>
                {#if activeGuidePlatforms.length}
                    <div
                        class="guide-popover-platforms"
                        aria-label="Supported platforms"
                    >
                        {#each activeGuidePlatforms as platform}
                            <span class="guide-popover-chip">{platform}</span>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</div>

<style>
    #omnibox {
        display: flex;
        flex-direction: column;
        max-width: 800px; /* Increased from 640px */
        width: 100%;
        gap: 16px; /* Increased gap */
        margin: 0 auto; /* Center alignment */
        position: relative;
    }

    .batch-hint {
        margin-top: -6px;
        padding: 0 18px;
        font-size: 13px;
        color: var(--secondary-600);
        opacity: 0.9;
    }

    .batch-hint.error {
        color: var(--red);
        opacity: 1;
    }

    .input-row {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    #input-container {
        display: flex;
        /* Enhanced border and shadow */
        box-shadow:
            0 4px 6px -1px rgba(0, 0, 0, 0.1),
            0 2px 4px -1px rgba(0, 0, 0, 0.06),
            0 0 0 1.5px var(--input-border) inset;
        border-radius: 99px; /* Pill shape for modern feel */
        padding: 16px 24px; /* Larger padding */
        align-items: center;
        gap: 14px;
        font-size: 16px; /* Larger font */
        flex: 1;
        background: var(--background);
        transition: all 0.2s ease;
    }

    .feedback-inline-link {
        flex: 0 0 auto;
        font-size: 12px;
        line-height: 1.2;
        color: var(--subtext);
        text-decoration: none;
        white-space: nowrap;
    }

    .feedback-inline-link:hover {
        color: var(--accent);
        text-decoration: underline;
    }

    #input-container:hover {
        box-shadow:
            0 10px 15px -3px rgba(0, 0, 0, 0.1),
            0 4px 6px -2px rgba(0, 0, 0, 0.05),
            0 0 0 1.5px var(--gray) inset;
    }

    #input-container.downloadable {
        padding-right: 8px; /* Adjustment for button */
    }

    #input-container.focused {
        /* Stronger focus state */
        box-shadow:
            0 20px 25px -5px rgba(0, 0, 0, 0.1),
            0 10px 10px -5px rgba(0, 0, 0, 0.04),
            0 0 0 2px var(--secondary) inset;
        transform: translateY(-1px);
    }

    #input-link-icon {
        display: flex;
    }

    #input-link-icon :global(svg) {
        stroke: var(--gray);
        width: 24px; /* Larger icon */
        height: 24px;
        stroke-width: 2px;
        transition: stroke 0.2s ease;
    }

    #input-link-icon.loading :global(svg) {
        animation: spin 0.7s infinite linear;
    }

    @keyframes spin {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }

    #input-container.focused #input-link-icon :global(svg) {
        stroke: var(--secondary);
    }

    #input-container.downloadable #input-link-icon :global(svg) {
        stroke: var(--secondary);
    }

    #link-area {
        display: flex;
        width: 100%;
        margin: 0;
        padding: 0;
        height: 24px; /* Increased height */

        align-items: center;

        border: none;
        outline: none;
        background-color: transparent;
        color: var(--text);

        -webkit-tap-highlight-color: transparent;
        flex: 1;

        font-weight: 500;
        font-size: 18px; /* Larger input text */

        /* workaround for safari */
        /* font-size: inherit; removed to enforce size */
    }

    #link-area:focus-visible {
        box-shadow: unset !important;
    }

    #link-area::placeholder {
        color: var(--muted-strong);
        opacity: 1;
    }

    /* fix for safari */
    input:disabled {
        opacity: 1;
    }

    #action-container {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: calc(100% - var(--feedback-offset, 0px));
        min-height: 40px;
        padding: 0;
    }

    .action-right {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
        margin-left: auto;
        min-width: 0;
    }

    .download-guides {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 10px 14px;
        min-width: 0;
    }

    .guide-inline-link {
        font-size: 12px;
        line-height: 1.2;
        color: var(--subtext);
        text-decoration: none;
        white-space: nowrap;
        background: none;
        border: 0;
        padding: 0;
        cursor: pointer;
    }

    .guide-inline-link:hover {
        color: var(--accent);
        text-decoration: underline;
    }

    .mobile-help-links {
        display: none;
    }

    .mobile-help-link {
        font-size: 12px;
        line-height: 1.25;
        color: var(--subtext);
        text-decoration: none;
        background: none;
        border: 0;
        padding: 0;
        cursor: pointer;
        white-space: nowrap;
    }

    .mobile-help-link:hover {
        color: var(--accent);
        text-decoration: underline;
    }

    .mobile-help-link:visited {
        color: var(--subtext);
    }

    .guide-popover-area {
        position: absolute;
        top: calc(100% + 6px);
        right: var(--feedback-offset, 0px);
        width: calc(100% - var(--feedback-offset, 0px));
        z-index: 20;
        display: flex;
        justify-content: flex-end;
        padding: 0;
        pointer-events: auto;
    }

    .guide-popover-mask {
        display: none;
    }

    .guide-popover {
        max-width: min(520px, 100%);
        border: 1px solid var(--surface-2);
        border-radius: 12px;
        background: var(--surface-1);
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
        padding: 10px 12px;
        color: var(--text);
    }

    .guide-popover-title {
        font-size: 12.5px;
        font-weight: 700;
        line-height: 1.25;
        margin-bottom: 4px;
    }

    .guide-popover-body {
        font-size: 12.5px;
        color: var(--subtext);
        line-height: 1.45;
    }

    .guide-popover-platforms {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
    }

    .guide-popover-chip {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        border: 1px solid rgba(var(--accent-rgb), 0.2);
        background: rgba(var(--accent-rgb), 0.09);
        color: var(--text);
        font-size: 11.5px;
        line-height: 1;
        padding: 5px 9px;
        white-space: nowrap;
    }

    #paste-mobile-text {
        display: none;
    }

    @media screen and (max-width: 600px) {
        #omnibox {
            max-width: 100%;
            gap: 12px;
        }

        .input-row {
            flex-direction: column;
            gap: 8px;
        }

        .feedback-inline-link--desktop,
        .download-guides--desktop {
            display: none;
        }

        #action-container {
            flex-direction: column;
            align-items: stretch;
            justify-content: flex-start;
            gap: 8px;
            padding: 0;
            width: 100%;
        }

        #action-container :global(.switcher-parent),
        #action-container :global(.switcher) {
            width: 100%;
        }

        #action-container :global(.switcher .button) {
            flex: 1 1 0;
            justify-content: center;
        }

        .action-right {
            width: 100%;
            margin-left: 0;
            justify-content: stretch;
            align-items: stretch;
            gap: 0;
        }

        .mobile-help-links {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-wrap: wrap;
            gap: 8px 14px;
            margin-top: -2px;
            width: 100%;
            text-align: center;
        }

        .guide-popover-area {
            position: absolute;
            top: calc(100% + 4px);
            right: 0;
            width: 100%;
            padding: 0;
        }

        .guide-popover-mask {
            display: block;
            position: absolute;
            top: calc(100% + 4px);
            right: 0;
            width: 100%;
            height: 100vh;
            background: var(--background);
            opacity: 0.96;
            z-index: 18;
            pointer-events: none;
        }

        .guide-popover {
            width: 100%;
        }

        #action-container :global(#button-paste) {
            display: flex;
            width: 100%;
            min-width: 0;
            justify-content: center;
        }

        #paste-mobile-text {
            display: block;
            white-space: nowrap;
        }

        #paste-desktop-text {
            display: none;
        }

        #input-container {
            padding: 12px 16px;
            font-size: 16px;
        }

        #link-area {
            font-size: 16px;
        }
    }

    @media screen and (max-width: 440px) {
        .mobile-help-links {
            gap: 6px 12px;
        }

        .mobile-help-link {
            font-size: 11.5px;
        }
    }
</style>
