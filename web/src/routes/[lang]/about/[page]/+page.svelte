<script lang="ts">
	import type { PageData } from './$types';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n/translations';
	import { DISCORD_SUPPORT_URL } from '$lib/support';
	export let data: PageData;
</script>

{#if $page.params.page === 'contact'}
    <section class="discord-contact" aria-labelledby="discord-contact-title">
        <h2 id="discord-contact-title">{$t("save.support.discord")}</h2>
        <p>{$t("save.support.body")}</p>
        <a href={DISCORD_SUPPORT_URL} target="_blank" rel="noopener noreferrer">{DISCORD_SUPPORT_URL}</a>
    </section>
{/if}
<svelte:component this={data.component} />

<style>
    .discord-contact { padding: 20px; margin-bottom: 24px; border: 1px solid var(--popup-stroke); border-radius: 12px; background: var(--accent-background); }
    h2 { margin: 0 0 12px; font-size: 20px; color: var(--text); }
    p { color: var(--subtext); line-height: 1.6; }
    a { color: var(--accent-strong); overflow-wrap: anywhere; text-underline-offset: 3px; }
</style>
