<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/translations";
    import IconBrandChrome from "@tabler/icons-svelte/IconBrandChrome.svelte";
    import IconArrowUpRight from "@tabler/icons-svelte/IconArrowUpRight.svelte";
    import IconCheck from "@tabler/icons-svelte/IconCheck.svelte";
    import { detectFreeSaveVideoExtensionInstalled, FREESAVEVIDEO_EXTENSION_STORE_URL } from "$lib/extension/freesavevideo";

    export let currentLocale: string;
    let installed = false;
    let mobileDevice = false;
    onMount(() => {
        mobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (!mobileDevice) void detectFreeSaveVideoExtensionInstalled().then((value) => { installed = value; });
    });
</script>

<section class="extension-feature" class:mobile-device={mobileDevice} aria-labelledby="free-extension-title">
    <h2 id="free-extension-title">FreeSaveVideo <span>{$t("home.welcome.free_plugin")}</span></h2>
    <div class="extension-content">
    <div class="copy">
        <h3>{$t("home.welcome.extension_title")}</h3>
        <p>{$t("home.extension.description")}</p>
        <div class="actions">
            {#if installed}
                <span class="installed"><IconCheck size={18} /> {$t("home.extension.installed")}</span>
            {:else if !mobileDevice}
                <a class="install" href={FREESAVEVIDEO_EXTENSION_STORE_URL} target="_blank" rel="noopener noreferrer"><IconBrandChrome size={30} stroke={1.7} /> {$t("home.extension.install")} <IconArrowUpRight size={18} /></a>
            {/if}
            <a class="privacy" href={`/${currentLocale}/about/privacy`}>{$t("about.page.privacy")}</a>
        </div>
        <p class="compatibility">{$t("home.welcome.desktop")}</p>
        <div class="benefits">
            <span><IconCheck size={16} /> {$t("home.browser_use")}</span>
            <span><IconCheck size={16} /> {$t("home.welcome.free_plugin")}</span>
        </div>
    </div>
    <div class="extension-preview">
        <img src="/extension/homepage-preview.png" width="800" height="500" alt={$t("home.welcome.extension_title")} loading="lazy" decoding="async" />
    </div>
    </div>
</section>

<style>
    .extension-feature :global(*) { font-family: Arial, sans-serif; }
    .extension-feature { width: 100%; max-width: 1096px; margin: 0 auto 26px; padding: 34px 30px 36px; box-sizing: border-box; border-radius: 20px; background: linear-gradient(110deg, color-mix(in srgb, var(--background) 94%, #3b82f6 6%), color-mix(in srgb, var(--background) 95%, var(--accent) 5%)); font-family: Arial, sans-serif; }
    h2 { margin: 0 0 30px; text-align: center; font-size: clamp(23px, 2.3vw, 29px); line-height: 1.3; color: var(--text); text-wrap: balance; }
    h2 span { font-weight: inherit; }
    .extension-content { display: grid; grid-template-columns: .85fr 1.15fr; align-items: center; gap: 30px; }
    h3 { margin: 0 0 14px; font-size: clamp(19px, 1.8vw, 23px); line-height: 1.35; color: var(--text); text-wrap: balance; font-weight: 600; }
    .copy p { margin: 0; color: var(--subtext); font-size: 14px; line-height: 1.7; }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 22px; }
    .install, .installed { display: inline-flex; align-items: center; justify-content: center; gap: 12px; min-height: 54px; padding: 0 18px; border: 1px solid var(--surface-2); border-radius: 10px; background: var(--background); color: var(--accent-strong); text-decoration: none; font-size: 16px; font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,.03); }
    .install :global(.icon-brand-chrome) { color: #4285f4; }
    .install:hover { border-color: var(--accent); background: var(--accent-background); }
    .privacy { color: var(--subtext); font-size: 12px; text-underline-offset: 3px; }
    .copy .compatibility { margin-top: 10px; font-size: 12px; }
    .benefits { display: flex; flex-wrap: wrap; gap: 10px 18px; margin-top: 20px; }
    .benefits span { display: inline-flex; align-items: center; gap: 6px; color: var(--subtext); font-size: 12px; }
    .benefits :global(svg) { color: var(--accent-strong); }
    .extension-preview { border: 1px solid var(--surface-2); border-radius: 12px; box-shadow: 0 6px 22px rgba(0,0,0,.12); overflow: hidden; }
    .extension-preview img { display: block; width: 100%; height: auto; }
    a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    .extension-feature.mobile-device { display: none; }
    @media (max-width: 767px) { .extension-feature { display: none; } }
</style>
