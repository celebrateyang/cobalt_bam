<script lang="ts">
    import { t } from "$lib/i18n/translations";

    import { downloadFile } from "$lib/download";
    import type { DialogPickerItem } from "$lib/types/dialog";

    import Skeleton from "$components/misc/Skeleton.svelte";

    import IconMovie from "@tabler/icons-svelte/IconMovie.svelte";
    import IconPhoto from "@tabler/icons-svelte/IconPhoto.svelte";
    import IconGif from "@tabler/icons-svelte/IconGif.svelte";
    import IconMusic from "@tabler/icons-svelte/IconMusic.svelte";

    export let item: DialogPickerItem;
    export let number: number;

    let imageLoaded = false;
    const isTunnel = (() => {
        try {
            return new URL(item.url).pathname === "/tunnel";
        } catch {
            return false;
        }
    })();

    $: itemType = item.type ?? "photo";
    $: itemKind = item.kind ?? "video";
</script>

<button
    class="picker-item"
    on:click={() =>
        downloadFile({
            url: item.url,
            urlType: isTunnel ? "tunnel" : "redirect",
        })}
>
    <div class="picker-type">
        {#if itemKind === "audio"}
            <IconMusic />
        {:else if itemType === "video"}
            <IconMovie />
        {:else if itemType === "gif"}
            <IconGif />
        {:else}
            <IconPhoto />
        {/if}
    </div>

    <img
        class="picker-image"
        src={item.thumb ?? item.url}
        class:loading={!imageLoaded}
        class:video-thumbnail={["video", "gif"].includes(itemType)}
        on:load={() => (imageLoaded = true)}
        alt="{$t(`a11y.dialog.picker.item.${itemType}`)} {number}"
    />
    <Skeleton class="picker-image elevated" hidden={imageLoaded} />

    {#if item.label || item.note}
        <div class="picker-meta">
            {#if item.label}
                <div class="picker-label">{item.label}</div>
            {/if}
            {#if item.note}
                <div class="picker-note">{item.note}</div>
            {/if}
        </div>
    {/if}
</button>

<style>
    .picker-item {
        position: relative;
        background: none;
        padding: 2px;
        box-shadow: none;
        border-radius: calc(var(--border-radius) / 2 + 2px);
    }

    :global(.picker-image) {
        display: block;
        width: 100%;
        height: 100%;

        aspect-ratio: 1/1;
        pointer-events: all;

        object-fit: cover;
        border-radius: calc(var(--border-radius) / 2);
    }

    .picker-image.loading {
        display: none;
    }

    .picker-image.video-thumbnail {
        pointer-events: none;
    }

    :global(.picker-item:active .picker-image) {
        opacity: 0.7;
    }

    @media (hover: hover) {
        :global(.picker-item:hover .picker-image) {
            opacity: 0.7;
        }
    }

    .picker-type {
        position: absolute;
        color: var(--white);
        background: rgba(0, 0, 0, 0.5);
        width: 24px;
        height: 24px;
        z-index: 9;

        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;

        top: 6px;
        left: 6px;

        border-radius: 6px;

        pointer-events: none;
    }

    .picker-type :global(svg) {
        width: 22px;
        height: 22px;
    }

    .picker-meta {
        position: absolute;
        left: 6px;
        right: 6px;
        bottom: 6px;
        z-index: 9;
        pointer-events: none;

        background: rgba(0, 0, 0, 0.62);
        color: var(--white);
        border-radius: 7px;
        padding: 6px 7px;

        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
    }

    .picker-label {
        font-size: 11px;
        line-height: 1.2;
        font-weight: 600;
        word-break: break-word;
        text-align: left;
    }

    .picker-note {
        font-size: 10px;
        line-height: 1.2;
        opacity: 0.9;
        text-align: left;
    }
</style>
