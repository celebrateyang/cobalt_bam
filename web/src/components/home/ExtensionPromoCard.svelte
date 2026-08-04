<script lang="ts">
    import { onMount } from "svelte";
    import IconCheck from "@tabler/icons-svelte/IconCheck.svelte";
    import IconPuzzle from "@tabler/icons-svelte/IconPuzzle.svelte";

    import { t } from "$lib/i18n/translations";
    import {
        detectFreeSaveVideoExtensionInstalled,
        isChromiumLike,
        openFreeSaveVideoExtensionStore,
    } from "$lib/extension/freesavevideo";

    let extensionStatus: "checking" | "installed" | "missing" = "checking";

    onMount(() => {
        if (!isChromiumLike()) {
            extensionStatus = "missing";
            return;
        }

        void detectFreeSaveVideoExtensionInstalled().then((installed) => {
            extensionStatus = installed ? "installed" : "missing";
        });
    });

    $: actionLabel =
        extensionStatus === "installed"
            ? $t("home.extension.installed")
            : extensionStatus === "checking"
              ? $t("home.extension.checking")
              : $t("home.extension.install");
</script>

<button
    type="button"
    class="extension-shortcut"
    class:installed={extensionStatus === "installed"}
    aria-label={actionLabel}
    title={actionLabel}
    aria-busy={extensionStatus === "checking"}
    on:click={() => {
        if (extensionStatus === "missing") openFreeSaveVideoExtensionStore();
    }}
>
    <span class="extension-icon" aria-hidden="true">
        <IconPuzzle size={25} stroke={1.9} />
    </span>
    {#if extensionStatus === "installed"}
        <span class="installed-mark" aria-hidden="true">
            <IconCheck size={11} stroke={3} />
        </span>
    {/if}
</button>

<style>
    .extension-shortcut {
        position: relative;
        width: 38px;
        height: 38px;
        flex: 0 0 38px;
        display: grid;
        place-items: center;
        padding: 0;
        border-radius: 50%;
        border: 1px solid var(--surface-2);
        color: var(--accent-strong);
        background: color-mix(in srgb, var(--surface-1) 94%, var(--accent));
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        cursor: pointer;
        transition:
            transform 0.16s ease,
            background-color 0.16s ease,
            border-color 0.16s ease;
    }

    .extension-shortcut:hover {
        transform: translateY(-1px);
        border-color: color-mix(in srgb, var(--accent) 42%, var(--surface-2));
        background: var(--accent-background);
    }

    .extension-shortcut[aria-busy="true"] {
        opacity: 0.68;
        cursor: wait;
    }

    .extension-shortcut.installed {
        color: var(--accent-strong);
        background: var(--accent-background);
        cursor: default;
    }

    .extension-icon {
        display: grid;
        place-items: center;
    }

    .installed-mark {
        position: absolute;
        right: -3px;
        bottom: -2px;
        width: 16px;
        height: 16px;
        display: grid;
        place-items: center;
        border: 2px solid var(--background);
        border-radius: 50%;
        color: white;
        background: var(--accent-strong);
    }

    @media (prefers-reduced-motion: reduce) {
        .extension-shortcut {
            transition: none;
        }
    }
</style>
