<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import { device } from "$lib/device";

    import IconFolderDown from "@tabler/icons-svelte/IconFolderDown.svelte";

    export let batch = false;
    export let afterClick = false;
    export let collapsible = false;
    export let open = false;
    export let compact = false;

    $: platformKey = device.is.iOS
        ? "save.location.ios"
        : device.is.android
            ? "save.location.android"
            : "save.location.desktop";
</script>

{#if collapsible}
    <details class="save-location-hint" class:compact {open}>
        <summary>
            <IconFolderDown />
            <span>{$t("save.location.summary")}</span>
        </summary>
        <div class="hint-body">
            {#if batch}
                <p>{$t("save.location.batch_auto")}</p>
            {/if}
            {#if afterClick}
                <p>{$t("save.location.after_click")}</p>
            {/if}
            <p>{$t(platformKey)}</p>
            <p>{$t("save.location.default")}</p>
            {#if device.browser.wechat}
                <p>{$t("save.location.wechat")}</p>
            {/if}
        </div>
    </details>
{:else}
    <div class="save-location-hint" class:compact role="note">
        <div class="hint-title">
            <IconFolderDown />
            <span>{$t("save.location.summary")}</span>
        </div>
        <div class="hint-body">
            {#if batch}
                <p>{$t("save.location.batch_auto")}</p>
            {/if}
            {#if afterClick}
                <p>{$t("save.location.after_click")}</p>
            {/if}
            <p>{$t(platformKey)}</p>
            <p>{$t("save.location.default")}</p>
            {#if device.browser.wechat}
                <p>{$t("save.location.wechat")}</p>
            {/if}
        </div>
    </div>
{/if}

<style>
    .save-location-hint {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 11px 12px;
        border: 1px solid color-mix(in srgb, var(--secondary) 28%, transparent);
        border-left: 4px solid var(--secondary);
        border-radius: 8px;
        background: color-mix(in srgb, var(--secondary) 9%, var(--button));
        color: var(--text);
        text-align: left;
    }

    .save-location-hint.compact {
        padding: 9px 10px;
        gap: 6px;
    }

    .hint-title,
    summary {
        display: flex;
        align-items: center;
        gap: 7px;
        color: var(--secondary);
        font-size: 13px;
        font-weight: 700;
        line-height: 1.35;
        cursor: default;
    }

    summary {
        list-style: none;
        cursor: pointer;
    }

    summary::-webkit-details-marker {
        display: none;
    }

    .hint-title :global(svg),
    summary :global(svg) {
        width: 17px;
        height: 17px;
        flex: 0 0 auto;
        stroke-width: 2.1px;
    }

    .hint-body {
        display: flex;
        flex-direction: column;
        gap: 5px;
        color: var(--gray);
        font-size: 12.5px;
        font-weight: 500;
        line-height: 1.45;
    }

    .hint-body p {
        margin: 0;
    }
</style>
