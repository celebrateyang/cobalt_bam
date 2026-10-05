<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import IconCheck from "@tabler/icons-svelte/IconCheck.svelte";
    import IconPuzzle from "@tabler/icons-svelte/IconPuzzle.svelte";
    import IconGift from "@tabler/icons-svelte/IconGift.svelte";
</script>

<div class="trust-row">
    <span><IconCheck size={16} /> {$t("home.welcome.no_ads")}</span>
    <a href="#free-options"><IconGift size={16} /> {$t("home.welcome.free_options")}</a>
    <a class="desktop-extension" href="#free-extension-title"><IconPuzzle size={16} /> {$t("home.welcome.free_plugin")}</a>
</div>

<style>
    .trust-row :global(*) { font-family: Arial, sans-serif; }
    .trust-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px 22px; margin: 12px 0 2px; font-family: Arial, sans-serif; font-size: 13px; }
    span, a { display: inline-flex; align-items: center; gap: 6px; color: var(--subtext); }
    a { text-underline-offset: 3px; }
    .trust-row :global(svg) { color: var(--accent-strong); }
    a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    @media (max-width: 767px) { .desktop-extension { display: none; } }
</style>
