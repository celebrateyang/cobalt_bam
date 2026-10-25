<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { page } from '$app/stores';
    import { aparatUi } from '$lib/seo/aparat-landing';
    import { parseAparatInput } from '$lib/seo/aparat-input';

    export let lang = 'en';
    $: ui = lang === 'fa' ? aparatUi.fa : aparatUi.en;
    let input = '';
    let busy = false;
    let messageKey: 'invalid' | 'failure' | 'ready' | 'playlistReady' | '' = '';
    $: message = messageKey ? ui[messageKey] : '';
    let hasError = false;
    let disposed = false;
    onMount(() => { const value = $page.url.searchParams.get('u') || ''; if (parseAparatInput(value)) input = value; });
    onDestroy(() => { disposed = true; });

    async function submit() {
        if (busy) return;
        const parsed = parseAparatInput(input);
        hasError = !parsed;
        messageKey = parsed ? '' : 'invalid';
        if (!parsed) return;
        busy = true;
        try {
            if (parsed.playlist) {
                const { default: API } = await import('$lib/api/api');
                const expanded = await API.expand(parsed.url);
                if (disposed) return;
                if (!expanded || expanded.status !== 'ok' || expanded.kind !== 'aparat-playlist' || !expanded.items.length) throw new Error('playlist_unavailable');
                const { createDialog } = await import('$lib/state/dialogs');
                if (disposed) return;
                createDialog({ id: 'aparat-playlist', type: 'batch', title: expanded.title,
                    items: expanded.items, collectionKey: expanded.collectionKey,
                    collectionSourceUrl: parsed.url, collectionTotalCount: expanded.items.length,
                    downloadMode: 'auto', autoStart: false });
                messageKey = 'playlistReady';
            } else {
                const { savingHandler, buildSaveRequest } = await import('$lib/api/saving-handler');
                if (disposed) return;
                const response = await savingHandler({ request: { ...buildSaveRequest(parsed.url), downloadMode: 'auto', convertGif: false, alwaysProxy: false } });
                if (disposed) return;
                if (response?.status === 'error') throw new Error('video_unavailable');
                if (response) messageKey = 'ready';
            }
        } catch {
            if (!disposed) { hasError = true; messageKey = 'failure'; }
        } finally { if (!disposed) busy = false; }
    }
</script>

<form id="aparat-download" action="/en" method="GET" on:submit|preventDefault={submit} aria-busy={busy}>
    <label for="aparat-url">{ui.label}</label>
    <div class="input-row">
        <input id="aparat-url" name="u" type="url" dir="ltr" bind:value={input} placeholder={ui.placeholder}
            autocomplete="off" spellcheck="false" required disabled={busy} aria-invalid={hasError}
            aria-describedby="aparat-hint aparat-interface aparat-status" />
        <button type="submit" disabled={busy}>{busy ? ui.busy : ui.button}</button>
    </div>
    <p id="aparat-hint" class="hint">{ui.hint}</p>
    <p id="aparat-interface" class="hint">{ui.interfaceNote}</p>
    <p id="aparat-status" class="status" class:error={hasError} role="status" aria-live="polite">{message}</p>
</form>

<style>
    form { scroll-margin-top:24px; width:100%; }
    label { display:block; margin-block-end:12px; font-size:.95rem; font-weight:650; }
    .input-row { display:flex; gap:12px; }
    input { flex:1; min-width:0; width:100%; box-sizing:border-box; padding:17px; border:1px solid var(--input-border); border-radius:12px; background:var(--background); color:var(--text); font:inherit; font-size:1rem; }
    button { padding:16px 24px; border:0; border-radius:12px; background:#b21d50; color:#fff; font:inherit; font-weight:650; min-height:56px; cursor:pointer; }
    button:hover { background:#921840; } button:disabled { opacity:.65; cursor:wait; }
    input:focus-visible,button:focus-visible { outline:2px solid #b21d50 !important; outline-offset:4px; }
    .hint,.status { margin:10px 0 0; color:var(--subtext); font-size:.8rem; line-height:1.8; }
    .status { min-height:1.4em; overflow-wrap:anywhere; } .hint:empty { display:none; }
    .error { color:var(--red,#c33); }
    @media(max-width:640px) { .input-row { flex-direction:column; } button { width:100%; } }
</style>
