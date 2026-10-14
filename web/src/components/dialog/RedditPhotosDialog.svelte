<script lang="ts">
    import { onMount } from 'svelte';
    import { t } from '$lib/i18n/translations';
    import { safeRedditPostUrl } from '$lib/api/reddit-photo-handoff';
    import { detectFreeSaveVideoExtensionInstalled, openFreeSaveVideoExtensionStore } from '$lib/extension/freesavevideo';
    import DialogContainer from './DialogContainer.svelte';
    import ExtensionInstallPrompt from './ExtensionInstallPrompt.svelte';

    export let id: string;
    export let sourceUrl: string;
    export let confirmedPhotos = true;
    export let errorText = '';
    export let dismissable = true;
    let close: () => void;
    let installed = false;
    $: safeSourceUrl = safeRedditPostUrl(sourceUrl) || 'https://www.reddit.com/';
    onMount(() => {
        let active = true;
        const refresh = () => {
            void detectFreeSaveVideoExtensionInstalled().then(value => { if (active) installed = value; });
        };
        refresh();
        window.addEventListener('focus', refresh);
        return () => { active = false; window.removeEventListener('focus', refresh); };
    });
</script>

<DialogContainer {id} {dismissable} bind:close>
    <div class="dialog-body reddit-dialog">
        <h2>{$t(confirmedPhotos ? 'dialog.reddit_photos.title' : 'dialog.reddit_photos.fallback_title')}</h2>
        {#if errorText}<p class="error-text">{errorText}</p>{/if}
        <p>{$t(confirmedPhotos ? 'dialog.reddit_photos.body' : 'dialog.reddit_photos.fallback_body')}</p>
        {#if installed}
            <strong>FreeSaveVideo Downloader</strong>
            <p>{$t('dialog.reddit_photos.installed')}</p>
        {:else}
            <ExtensionInstallPrompt
                titleKey="dialog.reddit_photos.install_title"
                bodyKey="dialog.reddit_photos.install_body"
                onInstall={openFreeSaveVideoExtensionStore}
                onDismiss={close}
            />
        {/if}
        <a class="source-link" href={safeSourceUrl} target="_blank" rel="noopener noreferrer">
            {$t('dialog.reddit_photos.open')}
        </a>
        <button type="button" on:click={close}>{$t('button.gotit')}</button>
    </div>
</DialogContainer>

<style>
    .reddit-dialog { gap: 14px; align-items: stretch; width: min(480px, calc(100vw - 60px)); max-height: 85vh; overflow-y: auto; }
    h2, p { margin: 0; }
    p { color: var(--subtext); line-height: 1.5; }
    .error-text { padding: 10px; background: var(--button-hover); border-radius: 10px; }
    .source-link, button { padding: 12px; border-radius: 12px; text-align: center; font: inherit; }
    .source-link { color: var(--text); background: var(--button-hover); }
    button { border: 0; cursor: pointer; color: var(--subtext); background: transparent; }
</style>
