<script lang="ts">
    import "@fontsource/ibm-plex-mono/400.css";
    import "@fontsource/ibm-plex-mono/400-italic.css";
    import "@fontsource/ibm-plex-mono/500.css";

    import { page } from "$app/stores";
    import { updated } from "$app/stores";
    import { browser } from "$app/environment";
    import { afterNavigate } from "$app/navigation";
    import { onMount } from "svelte";
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
    import UpdateNotification from "$components/misc/UpdateNotification.svelte";
    import PwaInstallBanner from "$components/misc/PwaInstallBanner.svelte";

    export let data;

    const supportedLanguages = Object.keys(languages);
    const fallbackHost = env.HOST || "freesavevideo.online";
    const normalizePathname = (pathname: string) => {
        if (pathname !== "/" && pathname.endsWith("/")) return pathname.replace(/\/+$/, "");
        return pathname;
    };
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

    $: if (browser) {
        document.documentElement.lang = data.lang || $INTERNAL_locale || "en";
    }

    // Get current path without language prefix
    $: canonicalPathname = normalizePathname($page.url.pathname);
    $: currentPath = canonicalPathname.replace(/^\/[^/]+/, "");
    $: canonicalUrl = `https://${fallbackHost}${canonicalPathname}`;

    const buildLangPath = (lang: string) =>
        currentPath ? `/${lang}${currentPath}` : `/${lang}`;

    const noindexPathPatterns = [
        /^\/account(?:\/|$)/,
        /^\/settings(?:\/|$)/,
        /^\/history(?:\/|$)/,
        /^\/invite(?:\/|$)/,
        /^\/donate(?:\/|$)/,
        /^\/updates(?:\/|$)/,
        /^\/console-manage-2025(?:\/|$)/,
    ];

    const nofollowPathPatterns = [
        /^\/console-manage-2025(?:\/|$)/,
    ];

    $: isNoindexPath = noindexPathPatterns.some((pattern) => pattern.test(currentPath));
    $: isNofollowPath = nofollowPathPatterns.some((pattern) => pattern.test(currentPath));
    $: robotsContent = isNoindexPath
        ? (isNofollowPath ? "noindex,nofollow" : "noindex,follow")
        : "index,follow";

    $: reduceMotion =
        $settings.appearance.reduceMotion || device.prefers.reducedMotion;
    $: reduceTransparency =
        $settings.appearance.reduceTransparency ||
        device.prefers.reducedTransparency;

    $: spawnTurnstile = !!$cachedInfo?.info?.cobalt?.turnstileSitekey;
    $: isHomePath =
        $page.url.pathname === `/${data.lang}` ||
        $page.url.pathname === `/${data.lang}/`;

    let DialogHolderComponent: any = null;
    let ProcessingQueueComponent: any = null;
    let deferredShellLoaded = false;
    let turnstileArmed = false;
    $: shouldRenderTurnstile =
        (spawnTurnstile && isHomePath && turnstileArmed) || $turnstileCreated;

    const loadDeferredShell = async () => {
        if (deferredShellLoaded) return;
        deferredShellLoaded = true;

        const [dialogModule, queueModule] = await Promise.all([
            import("$components/dialog/DialogHolder.svelte"),
            import("$components/queue/ProcessingQueue.svelte"),
        ]);

        DialogHolderComponent = dialogModule.default;
        ProcessingQueueComponent = queueModule.default;
    };

    const runOnIdle = (callback: () => void, timeout = 2200) => {
        if (!browser) return () => {};

        if ("requestIdleCallback" in window) {
            const handle = window.requestIdleCallback(callback, { timeout });
            return () => window.cancelIdleCallback?.(handle);
        }

        const handle = window.setTimeout(callback, Math.min(timeout, 1200));
        return () => window.clearTimeout(handle);
    };

    afterNavigate(async() => {
        const to_focus: HTMLElement | null =
            document.querySelector("[data-first-focus]");
        to_focus?.focus();

        if ($page.url.pathname.endsWith("/") || $page.url.pathname.match(/\/[^/]+\/$/)) {
            await getServerInfo();
        }
    });

    onMount(() => {
        const bootDeferredShell = () => {
            void loadDeferredShell();
        };
        const bootTurnstile = () => {
            if (!spawnTurnstile || !isHomePath) return;
            turnstileArmed = true;
        };

        const cancelIdle = runOnIdle(bootDeferredShell, 2800);
        const cancelTurnstileIdle = runOnIdle(bootTurnstile, 7000);

        window.addEventListener("pointerdown", bootDeferredShell, {
            once: true,
            passive: true,
        });
        window.addEventListener("keydown", bootDeferredShell, { once: true });
        window.addEventListener("pointerdown", bootTurnstile, {
            once: true,
            passive: true,
        });
        window.addEventListener("keydown", bootTurnstile, { once: true });

        return () => {
            cancelIdle();
            cancelTurnstileIdle();
            window.removeEventListener("pointerdown", bootDeferredShell);
            window.removeEventListener("keydown", bootDeferredShell);
            window.removeEventListener("pointerdown", bootTurnstile);
            window.removeEventListener("keydown", bootTurnstile);
        };
    });
</script>

<svelte:head>
    <meta name="robots" content={robotsContent} />
    <meta property="og:url" content={canonicalUrl} />
    <link rel="canonical" href={canonicalUrl} />

    <!-- hreflang tags for SEO -->
    {#each supportedLanguages as lang}
        <link
            rel="alternate"
            hreflang={lang}
            href={`https://${fallbackHost}${buildLangPath(lang)}`}
        />
    {/each}
    <link
        rel="alternate"
        hreflang="x-default"
        href={`https://${fallbackHost}${buildLangPath("en")}`}
    />

    {#if device.is.mobile}
        <meta name="theme-color" content={statusBarColors[$currentTheme]} />
    {/if}

    {#if env.PLAUSIBLE_ENABLED}
        <script
            defer
            data-domain={env.HOST}
            src={`https://${env.PLAUSIBLE_HOST}/js/script.js`}
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
        {#if DialogHolderComponent}
            <svelte:component this={DialogHolderComponent} />
        {/if}
        <Sidebar />
        {#if ProcessingQueueComponent}
            <svelte:component this={ProcessingQueueComponent} />
        {/if}
        <div id="content">
            <PwaInstallBanner />
            {#if shouldRenderTurnstile}
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
