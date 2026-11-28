<script lang="ts">
    import dialogs from "$lib/state/dialogs";
    import { subtitleDownloadNotice } from "$lib/state/subtitle-download";
    import { t } from "$lib/i18n/translations";
    import SubtitleDownload from "$components/save/SubtitleDownload.svelte";

    import SmallDialog from "$components/dialog/SmallDialog.svelte";
    import DownloadOfferDialog from "$components/dialog/DownloadOfferDialog.svelte";
    import PickerDialog from "$components/dialog/PickerDialog.svelte";
    import SavingDialog from "$components/dialog/SavingDialog.svelte";
    import TikTokDownloadDialog from "$components/dialog/TikTokDownloadDialog.svelte";
    import PreviewDownloadDialog from "$components/dialog/PreviewDownloadDialog.svelte";
    import BatchDialog from "$components/dialog/BatchDialog.svelte";
    import FeedbackDialog from "$components/dialog/FeedbackDialog.svelte";
    import MembershipUpgradeDialog from "$components/dialog/MembershipUpgradeDialog.svelte";
    import XinpianchangDownloadDialog from './XinpianchangDownloadDialog.svelte';
    import RedditPhotosDialog from './RedditPhotosDialog.svelte';
    import MobileLargeDownloadDialog from './MobileLargeDownloadDialog.svelte';
    import YoutubeClipDialog from './YoutubeClipDialog.svelte';

    $: backdropVisible = $dialogs.length > 0;
</script>

<!--
    this is the cleanest way of passing props without typescript throwing a fit.
    more info here: https://github.com/microsoft/TypeScript/issues/46680
-->
<div id="dialog-holder">
    {#each $dialogs as dialog}
        {#if dialog.type === "download-offer"}
            <DownloadOfferDialog {...dialog} />
        {:else if dialog.type === "small"}
            <SmallDialog {...dialog} />
        {:else if dialog.type === "picker"}
            <PickerDialog {...dialog} />
        {:else if dialog.type === "saving"}
            <SavingDialog {...dialog} />
        {:else if dialog.type === "tiktok-download"}
            <TikTokDownloadDialog {...dialog} />
        {:else if dialog.type === "preview-download"}
            <PreviewDownloadDialog {...dialog} />
        {:else if dialog.type === "batch"}
            <BatchDialog {...dialog} />
        {:else if dialog.type === "feedback"}
            <FeedbackDialog {...dialog} />
        {:else if dialog.type === "membership-upgrade"}
            <MembershipUpgradeDialog {...dialog} />
        {:else if dialog.type === 'xinpianchang-download'}
            <XinpianchangDownloadDialog {...dialog} />
        {:else if dialog.type === 'reddit-photos'}
            <RedditPhotosDialog {...dialog} />
        {:else if dialog.type === 'mobile-large-download'}
            <MobileLargeDownloadDialog {...dialog} />
        {:else if dialog.type === 'youtube-clip'}
            <YoutubeClipDialog {...dialog} />
        {/if}
    {/each}
    <div id="dialog-backdrop" class:visible={backdropVisible}></div>
</div>

{#if $subtitleDownloadNotice && !$dialogs.length}
    {#key $subtitleDownloadNotice}
        <aside class="subtitle-notice" aria-label={$t("subtitles.started")}>
            <div class="notice-header">
                <span>{$t("subtitles.started")}</span>
                <button class="button" type="button" aria-label={$t("subtitles.close")} on:click={() => subtitleDownloadNotice.set(null)}>×</button>
            </div>
            <SubtitleDownload url={$subtitleDownloadNotice.url} filename={$subtitleDownloadNotice.filename} />
        </aside>
    {/key}
{/if}

<style>
    .subtitle-notice {
        position: fixed;
        inset-inline-end: 16px;
        inset-block-end: max(16px, env(safe-area-inset-bottom));
        z-index: 98;
        width: min(330px, calc(100vw - 32px));
        padding: 12px;
        display: grid;
        gap: 8px;
        background: var(--popup-bg);
        box-shadow: 0 0 0 1px var(--popup-stroke) inset, 0 4px 20px var(--dialog-backdrop);
        border-radius: var(--border-radius);
    }

    .notice-header { display: flex; justify-content: space-between; align-items: center; }
    :global(dialog) {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background: none;

        max-height: 100%;
        max-width: 100%;
        height: 100%;
        width: 100%;
        margin: 0;
        padding: 0;
        border: none;
        pointer-events: all;

        inset-inline-start: unset;
        inset-inline-end: unset;

        overflow: hidden;
    }

    :global(dialog:modal) {
        inset-block-start: 0;
        inset-block-end: 0;
    }

    :global(dialog:modal::backdrop) {
        display: none;
    }

    #dialog-holder {
        position: fixed;
        padding-top: env(safe-area-inset-top);
        height: 100%;
        width: 100%;
        z-index: 99;

        display: flex;
        justify-content: center;
        align-items: center;

        pointer-events: none;
    }

    #dialog-backdrop {
        position: absolute;
        height: 100%;
        width: 100%;
        z-index: -1;

        background-color: var(--dialog-backdrop);

        backdrop-filter: blur(7px);
        -webkit-backdrop-filter: blur(7px);

        opacity: 0;
        transition: opacity 0.2s;
    }

    #dialog-backdrop.visible {
        opacity: 1;
    }

    :global([data-reduce-transparency="true"]) #dialog-backdrop {
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
    }

    :global(.dialog-body) {
        --dialog-padding: 18px;

        display: flex;
        flex-direction: column;
        align-items: center;

        background: var(--popup-bg);
        box-shadow:
            0 0 0 2px var(--popup-stroke) inset,
            0 0 60px 10px var(--popup-bg);
        border-radius: 29px;

        padding: var(--dialog-padding);

        position: relative;
        will-change: transform;
    }

    :global(dialog.open .dialog-body) {
        animation: modal-in 0.35s;
    }

    :global(dialog.closing .dialog-body) {
        animation: modal-out 0.15s;
        opacity: 0;
    }

    @media screen and (max-width: 535px) {
        :global(dialog) {
            justify-content: flex-end;
        }

        :global(dialog.open .dialog-body) {
            animation: modal-in-mobile 0.4s;
        }

        :global(dialog .dialog-body) {
            margin-bottom: calc(
                var(--padding) / 2 + env(safe-area-inset-bottom)
            ) !important;
            box-shadow: 0 0 0 2px var(--popup-stroke) inset;
        }
    }

    @keyframes modal-in {
        from {
            transform: scale(0.8);
            opacity: 0;
        }
        30% {
            opacity: 1;
        }
        50% {
            transform: scale(1.005);
        }
        100% {
            transform: scale(1);
        }
    }

    @keyframes modal-out {
        from {
            opacity: 1;
        }
        to {
            opacity: 0;
            transform: scale(0.9);
            visibility: hidden;
        }
    }

    @keyframes modal-in-mobile {
        0% {
            transform: translateY(0);
            opacity: 0;
        }
        1% {
            transform: translateY(200px);
        }
        30% {
            opacity: 1;
        }
        50% {
            transform: translateY(-5px);
        }
        100% {
            transform: translateY(0px);
        }
    }
</style>
