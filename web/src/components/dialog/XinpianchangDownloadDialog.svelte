<script lang="ts">
    import { onMount } from 'svelte';
    import { t } from '$lib/i18n/translations';
    import DialogContainer from './DialogContainer.svelte';
    import ExtensionInstallPrompt from './ExtensionInstallPrompt.svelte';
    import { detectFreeSaveVideoExtensionInstalled, openFreeSaveVideoExtensionStore } from '$lib/extension/freesavevideo';

    export let id: string;
    export let sourceUrl: string;
    export let dismissable = true;
    let close: () => void;
    let installed = false;
    onMount(() => {
        let active = true;
        const refresh = () => {
            void detectFreeSaveVideoExtensionInstalled().then(value => { if (active) installed = value; });
        };
        refresh();
        window.addEventListener('focus', refresh);
        return () => { active = false; window.removeEventListener('focus', refresh); };
    });
    $: safeSourceUrl = /^https:\/\/(?:www\.)?xinpianchang\.com\/a\d+(?:[/?#]|$)/i.test(sourceUrl)
        ? sourceUrl : 'https://www.xinpianchang.com/';
</script>

<DialogContainer {id} {dismissable} bind:close>
    <div class="dialog-body xpc-dialog">
        <h2>{$t('dialog.xinpianchang.title')}</h2>
        <p>{$t('dialog.xinpianchang.body')}</p>
        {#if installed}
            <strong>FreeSaveVideo Downloader</strong>
            <p>{$t('dialog.xinpianchang.installed')}</p>
        {:else}
            <ExtensionInstallPrompt
                titleKey="dialog.xinpianchang.install_title"
                bodyKey="dialog.xinpianchang.install_body"
                onInstall={openFreeSaveVideoExtensionStore}
                onDismiss={close}
            />
        {/if}
        <a class="source-link" href={safeSourceUrl} target="_blank" rel="noopener noreferrer">
            {$t('dialog.xinpianchang.open')}
        </a>
        <button type="button" on:click={close}>{$t('dialog.xinpianchang.close')}</button>
    </div>
</DialogContainer>

<style>
    .xpc-dialog { gap: 14px; align-items: stretch; width: min(480px, calc(100vw - 60px)); max-height: 85vh; overflow-y: auto; }
    h2, p { margin: 0; }
    p { color: var(--subtext); line-height: 1.5; }
    .source-link, button { padding: 12px; border-radius: 12px; text-align: center; font: inherit; }
    .source-link { color: var(--text); background: var(--button-hover); }
    button { border: 0; cursor: pointer; color: var(--subtext); background: transparent; }
</style>
