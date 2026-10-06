<script lang="ts">
    import { onMount, createEventDispatcher } from 'svelte';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import { t } from '$lib/i18n/translations';
    import Switcher from '$components/buttons/Switcher.svelte';
    import SaveLocationHint from '$components/save/SaveLocationHint.svelte';
    import IconSparkles from '$components/icons/Sparkles.svelte';
    import IconMusic from '$components/icons/Music.svelte';
    import IconMute from '$components/icons/Mute.svelte';
    import IconClipboard from '$components/icons/Clipboard.svelte';
    import type { DownloadModeOption } from '$lib/types/settings';

    export let variant: 'feedback' | 'actions';
    export let lang: string;
    export let mode: DownloadModeOption = 'auto';
    export let disabled = false;
    export let groupLabel = '';
    export let sourceUrl = '';
    export let beforeFeedback: () => void = () => {};

    const dispatch = createEventDispatcher<{ modechange: DownloadModeOption; paste: void }>();
    let feedbackBusy = false;
    $: feedbackUrl = new URL($page.url);
    $: feedbackUrl.searchParams.set('feedback', '1');
    $: feedbackHref = `${feedbackUrl.pathname}${feedbackUrl.search}`;

    async function openFeedback() {
        if (feedbackBusy) return;
        feedbackBusy = true;
        beforeFeedback();
        try {
            const { clerkEnabled, checkSignedIn } = await import('$lib/state/clerk');
            if (clerkEnabled && !await checkSignedIn()) {
                await goto(`/${lang}/account?signin=1&redirect=${encodeURIComponent(feedbackHref)}`);
                return;
            }
            const { createDialog } = await import('$lib/state/dialogs');
            createDialog({ id: 'feedback', type: 'feedback', initialVideoUrl: sourceUrl });
            if ($page.url.searchParams.has('feedback')) {
                const clean = new URL($page.url);
                clean.searchParams.delete('feedback');
                await goto(`${clean.pathname}${clean.search}${clean.hash}`, { replaceState: true, noScroll: true, keepFocus: true });
            }
        } finally {
            feedbackBusy = false;
        }
    }

    onMount(() => {
        if (variant === 'feedback' && $page.url.searchParams.get('feedback') === '1') void openFeedback();
    });
</script>

{#if variant === 'feedback'}
    <a class="feedback-link" href={feedbackHref} on:click|preventDefault={() => void openFeedback()} aria-busy={feedbackBusy}>{$t('tabs.feature.feedback')}</a>
{:else}
    <div class="save-location"><SaveLocationHint collapsible compact inline /></div>
    <div class="actions">
        <Switcher ariaLabel={groupLabel}>
            <button class="button" class:active={mode === 'auto'} aria-pressed={mode === 'auto'} {disabled} on:click={() => dispatch('modechange', 'auto')}><IconSparkles />{$t('save.auto')}</button>
            <button class="button" class:active={mode === 'audio'} aria-pressed={mode === 'audio'} {disabled} on:click={() => dispatch('modechange', 'audio')}><IconMusic />{$t('save.audio')}</button>
            <button class="button" class:active={mode === 'mute'} aria-pressed={mode === 'mute'} {disabled} on:click={() => dispatch('modechange', 'mute')}><IconMute />{$t('save.mute')}</button>
        </Switcher>
        <button class="button paste" {disabled} on:click={() => dispatch('paste')}><IconClipboard />{$t('save.paste')}</button>
    </div>
{/if}

<style>
    .feedback-link { flex:0 0 auto;font-size:12px;line-height:1.2;color:var(--subtext);text-decoration:none;white-space:nowrap; }
    .feedback-link:hover { color:var(--accent);text-decoration:underline; }
    .save-location { display:flex;justify-content:center;margin:6px 0 10px; }
    .actions { display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:40px;margin-top:14px; }
    .button { min-height:36px; }
    @media(max-width:600px) {
        .feedback-link { display:block;text-align:center;padding-top:8px; }
        .actions { flex-direction:column;align-items:stretch;gap:8px; }
        .actions :global(.switcher-parent),.actions :global(.switcher) { width:100%; }
        .actions :global(.switcher .button) { flex:1 1 0; }
        .paste { width:100%; }
    }
</style>
