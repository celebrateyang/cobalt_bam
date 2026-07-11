<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import { device } from "$lib/device";

    import IconFolderDown from "@tabler/icons-svelte/IconFolderDown.svelte";

    export let batch = false;
    export let afterClick = false;
    export let collapsible = false;
    export let open = false;
    export let compact = false;
    export let inline = false;

    $: platformKey = device.is.iOS
        ? "save.location.ios"
        : device.is.android
            ? "save.location.android"
            : "save.location.desktop";
</script>

{#if collapsible}
    <details class="save-location-hint" class:compact class:inline {open}>
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
    <div class="save-location-hint" class:compact class:inline role="note">
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

    .save-location-hint.inline {
        align-self: center;
        width: fit-content;
        max-width: min(680px, calc(100% - 24px));
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: var(--gray);
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

    .inline summary {
        padding: 5px 10px;
        border: 1px solid color-mix(in srgb, var(--secondary) 20%, var(--button-stroke));
        border-radius: 999px;
        background: color-mix(in srgb, var(--secondary) 7%, var(--button));
        color: color-mix(in srgb, var(--secondary) 84%, var(--text));
        font-size: 12px;
        transition:
            background-color 0.15s ease,
            border-color 0.15s ease,
            transform 0.15s ease;
    }

    .inline summary:hover {
        border-color: color-mix(in srgb, var(--secondary) 36%, var(--button-stroke));
        background: color-mix(in srgb, var(--secondary) 11%, var(--button));
        transform: translateY(-1px);
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

    .inline .hint-body {
        margin-top: 8px;
        padding: 10px 12px;
        border: 1px solid color-mix(in srgb, var(--secondary) 18%, transparent);
        border-radius: 8px;
        background: color-mix(in srgb, var(--button) 96%, var(--secondary));
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
    }
</style>
