<script lang="ts">
    import "@fontsource/ibm-plex-mono/400.css";
    import "@fontsource/ibm-plex-mono/400-italic.css";
    import "@fontsource/ibm-plex-mono/500.css";

    import { page } from "$app/stores";
    import { updated } from "$app/stores";
    import { browser } from "$app/environment";
    import { afterNavigate } from "$app/navigation";
    import { getServerInfo } from "$lib/api/server-info";
    import cachedInfo from "$lib/state/server-info";

    import "$lib/polyfills";
    import env from "$lib/env";
    import settings from "$lib/state/settings";

    import { t, setLocale, INTERNAL_locale } from "$lib/i18n/translations";
    import languages from "$i18n/languages.json";

    import { device, app } from "$lib/device";
    import { turnstileCreated } from "$lib/state/turnstile";
    import currentTheme, { statusBarColors } from "$lib/state/theme";

    import Sidebar from "$components/sidebar/Sidebar.svelte";
    import Turnstile from "$components/misc/Turnstile.svelte";
    import NotchSticker from "$components/misc/NotchSticker.svelte";
    import DialogHolder from "$components/dialog/DialogHolder.svelte";
    import ProcessingQueue from "$components/queue/ProcessingQueue.svelte";
    import UpdateNotification from "$components/misc/UpdateNotification.svelte";
    import PwaInstallBanner from "$components/misc/PwaInstallBanner.svelte";

    export let data;

    const supportedLanguages = Object.keys(languages);
    const fallbackHost = env.HOST || "freesavevideo.online";
    const stripYouTube = (value: string) => {
        if (!value) return value;
        let v = value.replace(/YouTube[??,]?\s*/gi, "");
        v = v.replace(/youtube[??,]?\s*/gi, "");
        v = v.replace(/[??,]\s*[??,]+/g, "?");
        v = v.replace(/^\s*[??,]\s*/, "");
        v = v.replace(/\s{2,}/g, " ").trim();
        return v;
    };

    // Set locale based on URL parameter instead of localStorage
    $: if (data.lang) {
        setLocale(data.lang);
    }

    // Get current path without language prefix
    $: currentPath = $page.url.pathname.replace(/^\/[^/]+/, '') || '/';

    $: reduceMotion =
        $settings.appearance.reduceMotion || device.prefers.reducedMotion;
    $: reduceTransparency =
        $settings.appearance.reduceTransparency ||
        device.prefers.reducedTransparency;

    $: spawnTurnstile = !!$cachedInfo?.info?.cobalt?.turnstileSitekey;

    afterNavigate(async() => {
        const to_focus: HTMLElement | null =
            document.querySelector("[data-first-focus]");
        to_focus?.focus();

        if ($page.url.pathname.endsWith("/") || $page.url.pathname.match(/\/[^/]+\/$/)) {
            await getServerInfo();
        }
    });
</script>

<svelte:head>
    <meta property="og:url" content="https://{fallbackHost}{$page.url.pathname}">

    <!-- hreflang tags for SEO -->
    {#each supportedLanguages as lang}
        <link rel="alternate" hreflang={lang} href="https://{fallbackHost}/{lang}{currentPath}" />
    {/each}
    <link rel="alternate" hreflang="x-default" href="https://{fallbackHost}/en{currentPath}" />

    {#if device.is.mobile}
        <meta name="theme-color" content={statusBarColors[$currentTheme]} />
    {/if}

    {#if env.PLAUSIBLE_ENABLED}
        <script
            defer
            data-domain={env.HOST}
            src="https://{env.PLAUSIBLE_HOST}/js/script.js"
        >
        </script>
    {/if}
</svelte:head>

<div style="display: contents" data-theme={browser ? $currentTheme : undefined} lang={data.lang || $INTERNAL_locale}>
    <div
        id="cobalt"
        class:loaded={browser}
        data-iphone={device.is.iPhone}
        data-reduce-motion={reduceMotion}
        data-reduce-transparency={reduceTransparency}
    >
        {#if $updated}
            <UpdateNotification />
        {/if}
        {#if device.is.iPhone && app.is.installed}
            <NotchSticker />
        {/if}
        <DialogHolder />
        <Sidebar />
        <ProcessingQueue />
        <div id="content">
            <PwaInstallBanner />
            {#if (spawnTurnstile && ($page.url.pathname === `/${data.lang}` || $page.url.pathname === `/${data.lang}/`)) || $turnstileCreated}
                <Turnstile />
            {/if}
            <slot></slot>
        </div>
    </div>
</div>

<style>
    :global(*) {
        box-sizing: border-box;
    }

    :global(html, body, #cobalt, #content) {
        margin: 0;
        padding: 0;
        height: 100%;
    }

    :global(body) {
        overflow-y: scroll;
        overscroll-behavior-y: none;
    }

    :global(#cobalt) {
        width: 100%;
        display: flex;
        flex-direction: row;
        background: var(--background);
        color: var(--secondary);
    }

    :global(#content) {
        width: 100%;
        padding: calc(var(--padding) + env(safe-area-inset-top, 0px))
            var(--padding) calc(var(--padding) + env(safe-area-inset-bottom, 0px))
            var(--padding);
        display: flex;
        flex-direction: column;
        align-items: center;
        overflow-x: hidden;
        gap: calc(var(--padding) / 2);
        transition: opacity 0.15s;
    }

    :global(#cobalt:not(.loaded) #content) {
        opacity: 0;
    }

    :global(body[data-reduce-motion="true"]),
    :global(body[data-reduce-motion="true"] *) {
        animation-duration: 0.001s !important;
        transition-duration: 0.001s !important;
    }

    :global(a) {
        color: var(--blue);
        text-decoration: none;
    }

    :global(#cobalt[data-iphone="true"]) {
        padding-top: env(safe-area-inset-top, 0px);
    }
</style>
