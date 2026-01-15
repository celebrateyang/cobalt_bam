<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import { page } from "$app/stores";
    import { fly, fade } from "svelte/transition";
    import { createEventDispatcher } from "svelte";

    import IconDotsVertical from "@tabler/icons-svelte/IconDotsVertical.svelte";
    import IconClipboard from "$components/icons/Clipboard.svelte";
    import IconHistory from "@tabler/icons-svelte/IconHistory.svelte";
    import IconComet from "@tabler/icons-svelte/IconComet.svelte";
    import IconInfoCircle from "@tabler/icons-svelte/IconInfoCircle.svelte";
    import IconX from "@tabler/icons-svelte/IconX.svelte";

    import { defaultNavPage } from "$lib/subnav";

    export let isOpen = false;

    const dispatch = createEventDispatcher();

    $: currentLang = $page.url.pathname.match(/^\/([a-z]{2})/)?.[1] || "en";

    $: menuItems = [
        {
            name: "clipboard",
            icon: IconClipboard,
            link: `/${currentLang}/clipboard`,
            label: $t("tabs.clipboard"),
        },
        {
            name: "history",
            icon: IconHistory,
            link: `/${currentLang}/history`,
            label: $t("tabs.history"),
        },
        {
            name: "faq",
            icon: IconComet,
            link: `/${currentLang}/faq`,
            label: $t("tabs.faq"),
        },
        {
            name: "about",
            icon: IconInfoCircle,
            link: `/${currentLang}${defaultNavPage("about")}`,
            label: $t("tabs.about"),
        },
    ];

    const toggle = () => {
        isOpen = !isOpen;
        dispatch("toggle", isOpen);
    };

    const close = () => {
        isOpen = false;
        dispatch("toggle", false);
    };

    const handleBackdropClick = () => {
        close();
    };

    const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && isOpen) {
            close();
        }
    };
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="mobile-more-menu">
    <button
        class="more-trigger"
        class:active={isOpen}
        on:click={toggle}
        aria-expanded={isOpen}
        aria-label={$t("tabs.more")}
    >
        {#if isOpen}
            <IconX />
        {:else}
            <IconDotsVertical />
        {/if}
        <span class="more-label">{$t("tabs.more")}</span>
    </button>

    {#if isOpen}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
            class="menu-backdrop"
            on:click={handleBackdropClick}
            transition:fade={{ duration: 150 }}
        ></div>
        <div
            class="menu-dropdown"
            transition:fly={{ y: 20, duration: 200 }}
            role="menu"
        >
            {#each menuItems as item}
                <a
                    href={item.link}
                    class="menu-item"
                    role="menuitem"
                    on:click={close}
                >
                    <svelte:component this={item.icon} />
                    <span>{item.label}</span>
                </a>
            {/each}
        </div>
    {/if}
</div>

<style>
    .mobile-more-menu {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .more-trigger {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 3px;
        padding: 5px var(--padding);
        min-width: calc(var(--sidebar-width) / 2);
        color: var(--sidebar-highlight);
        font-size: var(--sidebar-font-size);
        opacity: 0.75;
        height: fit-content;
        border-radius: var(--border-radius);
        transition: transform 0.2s;
        background: transparent;
        border: none;
        cursor: pointer;
        position: relative;
        z-index: 5;
    }

    .more-trigger :global(svg) {
        stroke-width: 1.2px;
        height: 22px;
        width: 22px;
    }

    .more-trigger.active {
        color: var(--sidebar-bg);
        background: var(--sidebar-highlight);
        opacity: 1;
    }

    .more-trigger:active:not(.active) {
        transform: scale(0.9);
    }

    .more-label {
        font-size: inherit;
    }

    .menu-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.4);
        z-index: 4;
    }

    .menu-dropdown {
        position: absolute;
        bottom: calc(100% + 12px);
        right: 0;
        min-width: 180px;
        background: var(--popup-bg);
        border: 1px solid var(--popup-stroke);
        border-radius: var(--border-radius);
        box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.2);
        padding: 8px;
        z-index: 5;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .menu-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        border-radius: calc(var(--border-radius) - 4px);
        color: var(--text);
        text-decoration: none;
        font-size: 15px;
        transition: background 0.15s;
    }

    .menu-item:hover,
    .menu-item:focus {
        background: var(--surface-2);
    }

    .menu-item :global(svg) {
        width: 20px;
        height: 20px;
        stroke-width: 1.5px;
        color: var(--subtext);
    }
</style>
