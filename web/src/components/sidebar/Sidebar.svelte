<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import { page } from "$app/stores";
    import { defaultNavPage } from "$lib/subnav";

    import CobaltLogo from "$components/sidebar/CobaltLogo.svelte";
    import SidebarTab from "$components/sidebar/SidebarTab.svelte";
    import IconDownload from "@tabler/icons-svelte/IconDownload.svelte";
    import IconSettings from "@tabler/icons-svelte/IconSettings.svelte";
    import IconClipboard from "$components/icons/Clipboard.svelte";
    import IconVideo from "@tabler/icons-svelte/IconVideo.svelte";
    import IconHistory from "@tabler/icons-svelte/IconHistory.svelte";

    import IconRepeat from "@tabler/icons-svelte/IconRepeat.svelte";

    import IconUserCircle from "@tabler/icons-svelte/IconUserCircle.svelte";

    import IconComet from "@tabler/icons-svelte/IconComet.svelte";
    import IconHeart from "@tabler/icons-svelte/IconHeart.svelte";
    import IconInfoCircle from "@tabler/icons-svelte/IconInfoCircle.svelte";

    let screenWidth: number;

    // Get current language from URL
    $: currentLang = $page.url.pathname.match(/^\/([a-z]{2})/)?.[1] || "en";

    // Generate language-aware links
    $: homeLink = `/${currentLang}`;
    $: clipboardLink = `/${currentLang}/clipboard`;
    $: discoverLink = `/${currentLang}/discover`;
    $: historyLink = `/${currentLang}/history`;
    $: remuxLink = `/${currentLang}/remux`;
    $: faqLink = `/${currentLang}/faq`;
    $: settingsLink = `/${currentLang}${defaultNavPage("settings")}`;
    $: accountLink = `/${currentLang}/account`;
    $: aboutLink = `/${currentLang}${defaultNavPage("about")}`;
</script>

<svelte:window bind:innerWidth={screenWidth} />

<nav id="sidebar" aria-label={$t("a11y.tabs.tab_panel")}>
    <CobaltLogo />
    <div id="sidebar-tabs" role="tablist">
        <div id="sidebar-actions" class="sidebar-inner-container">
            <SidebarTab tabName="save" tabLink={homeLink}>
                <IconDownload />
            </SidebarTab>
            <SidebarTab tabName="clipboard" tabLink={clipboardLink}>
                <IconClipboard />
            </SidebarTab>
            <SidebarTab tabName="discover" tabLink={discoverLink}>
                <IconVideo />
            </SidebarTab>
            <SidebarTab tabName="history" tabLink={historyLink}>
                <IconHistory />
            </SidebarTab>
            <!-- Remux page doesn't exist yet
            <SidebarTab tabName="remux" tabLink={remuxLink} beta>
                <IconRepeat />
            </SidebarTab>
            -->
            <SidebarTab tabName="settings" tabLink={settingsLink}>
                <IconSettings />
            </SidebarTab>
            <SidebarTab tabName="account" tabLink={accountLink}>
                <IconUserCircle />
            </SidebarTab>
        </div>
        <div id="sidebar-info" class="sidebar-inner-container">
            <!--
            <SidebarTab tabName="donate" tabLink="/donate">
                <IconHeart />
            </SidebarTab>
            <SidebarTab tabName="updates" tabLink="/updates">
                <IconComet />
            </SidebarTab>
            -->
            <SidebarTab tabName="faq" tabLink={faqLink}>
                <IconComet />
            </SidebarTab>
            <SidebarTab tabName="about" tabLink={aboutLink}>
                <IconInfoCircle />
            </SidebarTab>
        </div>
    </div>
</nav>

<style>
    #sidebar,
    #sidebar-tabs,
    .sidebar-inner-container {
        display: flex;
        flex-direction: column;
    }

    #sidebar {
        background: var(--sidebar-bg);
        min-height: 100vh;
        width: calc(var(--sidebar-width) + var(--sidebar-inner-padding) * 2);
        position: sticky;
        top: 0;
        padding: calc(var(--padding) * 1.2) var(--sidebar-inner-padding);
        box-sizing: border-box;
        flex-shrink: 0;
    }

    #sidebar-tabs {
        height: 100%;
        justify-content: space-between;
        padding: 0;
        gap: var(--padding);
        overflow-y: auto;
    }

    .sidebar-inner-container {
        gap: 8px;
    }

    #sidebar-tabs::-webkit-scrollbar {
        display: none;
    }

    @media screen and (max-width: 535px) {
        #sidebar,
        #sidebar-tabs,
        .sidebar-inner-container {
            flex-direction: row;
        }

        #sidebar {
            width: 100%;
            height: var(--sidebar-height-mobile);
            min-height: unset;
            position: fixed;
            top: unset;
            bottom: 0;
            justify-content: center;
            align-items: flex-start;
            z-index: 3;
            padding: 0;
        }

        #sidebar::before {
            content: "";
            z-index: 1;
            width: 100%;
            height: 100%;
            display: block;
            position: absolute;
            pointer-events: none;
            background: var(--sidebar-mobile-gradient);
        }

        #sidebar-tabs {
            overflow-y: visible;
            overflow-x: scroll;
            padding-bottom: 0;
            padding: var(--sidebar-inner-padding) 0;
            height: fit-content;
            gap: var(--sidebar-inner-padding);
        }

        #sidebar :global(.sidebar-inner-container:first-child) {
            padding-left: calc(var(--border-radius) * 2);
        }

        #sidebar :global(.sidebar-inner-container:last-child) {
            padding-right: calc(var(--border-radius) * 2);
        }
    }

    /* add padding for notch / dynamic island in landscape */
    @media screen and (orientation: landscape) {
        :global([data-iphone="true"]) #sidebar {
            padding-left: env(safe-area-inset-left);
        }
    }
</style>
