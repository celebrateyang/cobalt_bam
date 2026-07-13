<script lang="ts">
    import { page } from "$app/stores";

    import { t } from "$lib/i18n/translations";
    import IconCrown from "@tabler/icons-svelte/IconCrown.svelte";

export let tabName: string;
export let tabLink: string;
export let beta = false;
export let memberOnly = false;
export let preloadCode: "off" | "hover" | "tap" | "viewport" | "eager" | null = null;

    const firstTabPage = ["save", "remux", "settings"];

    let tab: HTMLElement;

    // Extract the actual page path after the language prefix
    $: currentTab = $page.url.pathname.replace(/^\/[a-z]{2}/, '').split("/")[1] || "save";
    $: baseTabPath = tabLink.replace(/^\/[a-z]{2}/, '').split("/")[1] || "save";

    $: isTabActive = currentTab === baseTabPath;

    const showTab = (e: HTMLElement) => {
        if (e) {
            e.scrollIntoView({
                inline: firstTabPage.includes(tabName) ? "end" : "start",
                block: "nearest",
                behavior: "smooth",
            });
        }
    };

    $: if (isTabActive && tab) {
        showTab(tab);
    }
</script>

<a
    id="sidebar-tab-{tabName}"
    class="sidebar-tab"
    class:active={isTabActive}
    href={tabLink}
    data-sveltekit-preload-code={preloadCode ?? undefined}
    bind:this={tab}
    on:focus={() => showTab(tab)}
    aria-current={isTabActive ? "page" : undefined}
>
    {#if beta}
        <div class="beta-sign" aria-label={$t("general.beta")}>β</div>
    {/if}
    {#if memberOnly}
        <div
            class="member-sign"
            aria-label={$t("tabs.member_only")}
            title={$t("tabs.member_only")}
        >
            <IconCrown />
        </div>
    {/if}
    <slot></slot>
    {$t(`tabs.${tabName}`)}
</a>

<style>
    .sidebar-tab {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 3px;
        padding: 9px 3px;
        color: var(--sidebar-tab-text);
        font-size: var(--sidebar-font-size);
        opacity: 1;
        height: fit-content;
        border-radius: 12px;
        transition:
            transform 0.16s ease,
            background-color 0.16s ease,
            color 0.16s ease;

        text-decoration: none;
        text-decoration-line: none;
        position: relative;
        scroll-behavior: smooth;

        cursor: pointer;
    }

    .sidebar-tab :global(svg) {
        stroke-width: 1.6px;
        height: 22px;
        width: 22px;
    }

    :global([data-iphone="true"] .sidebar-tab svg) {
        will-change: transform;
    }

    .sidebar-tab.active {
        color: var(--sidebar-tab-active-text);
        background: var(--sidebar-tab-active-bg);
        opacity: 1;
        transform: none;
        transition: none;
        box-shadow: 0 8px 18px rgba(24, 54, 8, 0.16);
        animation: pressButton 0.3s;
        cursor: default;
    }

    .sidebar-tab:not(.active):active {
        transform: scale(0.95);
    }

    :global([data-reduce-motion="true"]) .sidebar-tab:active {
        transform: none;
    }

    .beta-sign {
        position: absolute;
        transform: translateX(16px) translateY(-6px);
        opacity: 0.7;
    }

    .member-sign {
        position: absolute;
        top: 2px;
        right: 2px;
        width: 17px;
        height: 17px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        color: var(--accent);
        background: var(--sidebar-bg);
        box-shadow: 0 0 0 1px rgba(var(--accent-rgb), 0.32);
    }

    .member-sign :global(svg) {
        width: 11px;
        height: 11px;
        stroke-width: 2px;
    }

    @keyframes pressButton {
        0% {
            transform: scale(0.9);
        }
        50% {
            transform: scale(1.015);
        }
        100% {
            transform: scale(1);
        }
    }

    @media (hover: hover) {
        .sidebar-tab:active:not(.active) {
            opacity: 1;
            background-color: var(--sidebar-hover);
        }

        .sidebar-tab:hover:not(.active) {
            opacity: 1;
            background-color: var(--sidebar-hover);
        }
    }

    @media screen and (max-width: 535px) {
        .sidebar-tab {
            padding: 5px var(--padding);
            min-width: calc(var(--sidebar-width) / 2);
        }

        .sidebar-tab.active {
            z-index: 2;
        }

        .sidebar-tab:active:not(.active) {
            transform: scale(0.9);
        }

        @keyframes pressButton {
            0% {
                transform: scale(0.8);
            }
            50% {
                transform: scale(1.02);
            }
            100% {
                transform: scale(1);
            }
        }
    }
</style>
