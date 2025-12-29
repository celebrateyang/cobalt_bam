<script lang="ts">
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { browser } from "$app/environment";
    import { SvelteComponent, tick } from "svelte";

    import { t } from "$lib/i18n/translations";

    import dialogs, { createDialog } from "$lib/state/dialogs";

    import { link } from "$lib/state/omnibox";
    import cachedInfo from "$lib/state/server-info";
    import { updateSetting } from "$lib/state/settings";
    import { turnstileSolved } from "$lib/state/turnstile";
    import { savingHandler } from "$lib/api/saving-handler";
    import API from "$lib/api/api";

    import type { Optional } from "$lib/types/generic";
    import type { DownloadModeOption } from "$lib/types/settings";
    import type { DialogBatchItem } from "$lib/types/dialog";

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

    let linkInput: Optional<HTMLInputElement>;

    let isFocused = false;

    let isDisabled = false;
    let isLoading = false;
    let isBotCheckOngoing = false;

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

    $: detectedUrls = extractUrls($link);
    $: isDownloadable = detectedUrls.length > 0;
    $: isBatchInput = detectedUrls.length > 1;

    const openBatchDialog = (items: DialogBatchItem[], title?: string) => {
        createDialog({
            id: "batch-download",
            type: "batch",
            title,
            items,
        });
    };

    const submit = async () => {
        if ($dialogs.length > 0 || isDisabled || isLoading || !isDownloadable) {
            return;
        }

        // Multiple links => batch dialog immediately (platform-agnostic).
        if (isBatchInput) {
            openBatchDialog(
                detectedUrls.map((url) => ({ url })),
                $t("dialog.batch.title")
            );
            return;
        }

        const url = detectedUrls[0];
        if (!url) return;

        // For non-Bilibili services, keep the current behavior (no extra API call).
        if (!isBilibiliUrl(url)) {
            return savingHandler({ url });
        }

        const expanded = await API.expand(url);
        if (!expanded || expanded.status === "error") {
            return savingHandler({ url });
        }

        const items = expanded.items ?? [];
        const hasBatch = expanded.kind !== "single" && items.length > 1;

        if (!hasBatch) {
            return savingHandler({ url });
        }

        const batchItems: DialogBatchItem[] = items.map((item) => ({
            url: item.url,
            title: item.title,
            duration: item.duration,
        }));

        // If user pasted an explicit collection URL, go straight to batch list.
        if (!isBilibiliVideoPage(url)) {
            openBatchDialog(batchItems, expanded.title || $t("dialog.batch.title"));
            return;
        }

        const promptTitle = $t("dialog.batch.detect.title");
        const promptBody =
            expanded.kind === "bilibili-ugc-season"
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
                                    batchItems,
                                    expanded.title || $t("dialog.batch.title")
                                ),
                            200
                        );
                    },
                },
            ],
        });
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
                submit();
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
</script>

<svelte:window on:keydown={handleKeydown} />

<div id="omnibox">
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
                bind:disabled={isDisabled}
                bind:loading={isLoading}
            />
        {/if}
    </div>

    {#if isBatchInput}
        <div class="batch-hint" aria-live="polite">
            {$t("save.batch.detected", { count: detectedUrls.length })}
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

        <ActionButton id="paste" click={pasteClipboard}>
            <IconClipboard />
            <span id="paste-desktop-text">{$t("save.paste")}</span>
            <span id="paste-mobile-text">{$t("save.paste.long")}</span>
        </ActionButton>
    </div>
</div>

<style>
    #omnibox {
        display: flex;
        flex-direction: column;
        max-width: 800px; /* Increased from 640px */
        width: 100%;
        gap: 16px; /* Increased gap */
        margin: 0 auto; /* Center alignment */
    }

    .batch-hint {
        margin-top: -6px;
        padding: 0 18px;
        font-size: 13px;
        color: var(--secondary-600);
        opacity: 0.9;
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
        color: var(--secondary);

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
        color: var(--gray);
        opacity: 0.8;
    }

    /* fix for safari */
    input:disabled {
        opacity: 1;
    }

    #action-container {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        padding: 0 10px; /* Indent actions slightly */
    }

    #paste-mobile-text {
        display: none;
    }

    @media screen and (max-width: 600px) {
        #omnibox {
            max-width: 100%;
            gap: 12px;
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
        #action-container {
            flex-direction: column;
            gap: 8px;
            padding: 0;
        }

        #action-container :global(.button) {
            width: 100%;
            justify-content: center;
        }

        #paste-mobile-text {
            display: block;
        }

        #paste-desktop-text {
            display: none;
        }
    }
</style>
