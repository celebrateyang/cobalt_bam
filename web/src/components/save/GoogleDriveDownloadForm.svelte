<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { page } from '$app/stores';
    import { parseGoogleDriveVideoInput } from '$lib/seo/google-drive-input';

    let input = '';
    let busy = false;
    let message = '';
    let hasError = false;
    let disposed = false;

    onMount(() => {
        const candidate = $page.url.searchParams.get('u') || '';
        if (parseGoogleDriveVideoInput(candidate)) input = candidate;
    });
    onDestroy(() => { disposed = true; });

    async function submit() {
        if (busy) return;
        const url = parseGoogleDriveVideoInput(input);
        hasError = !url;
        message = url ? '' : 'Paste a Google Drive video link in the format https://drive.google.com/file/d/FILE_ID/view.';
        if (!url) return;
        busy = true;
        try {
            const { loadTranslations } = await import('$lib/i18n/translations');
            await Promise.all(['save', 'button', 'dialog', 'error', 'auth', 'queue'].map(key => loadTranslations('en', key)));
            const { savingHandler, buildSaveRequest } = await import('$lib/api/saving-handler');
            if (disposed) return;
            const response = await savingHandler({ request: { ...buildSaveRequest(url), downloadMode: 'auto', convertGif: false } });
            if (disposed) return;
            if (response?.status === 'error') {
                hasError = true;
                message = 'Could not prepare this video. Check that the sharing link opens without Google sign-in, then try again.';
            } else if (response) message = 'Download request prepared. Follow the download dialog and task progress to save your video.';
        } catch {
            if (!disposed) { hasError = true; message = 'Could not start the download. Check your connection and try again.'; }
        } finally { if (!disposed) busy = false; }
    }
</script>

<form action="/en" method="GET" on:submit|preventDefault={submit} aria-busy={busy}>
    <label for="google-drive-url">Google Drive video link</label>
    <div class="input-row">
        <input id="google-drive-url" name="u" type="url" bind:value={input} placeholder="https://drive.google.com/file/d/FILE_ID/view"
            autocomplete="off" spellcheck="false" required disabled={busy} aria-invalid={hasError} aria-describedby="google-drive-hint" />
        <button type="submit" disabled={busy}>{busy ? 'Preparing video...' : 'Download Google Drive video'}</button>
    </div>
    <p id="google-drive-hint" class="hint">Paste one publicly accessible video link. Sign-in and download credits may be required.</p>
    <p class="status" class:error={hasError} role="status" aria-live="polite">{message}</p>
</form>

<style>
    form { width:100%; }
    label { display:block; margin-bottom:12px; font-size:14px; font-weight:650; }
    .input-row { display:flex; gap:10px; }
    input { flex:1; width:100%; min-width:0; box-sizing:border-box; border:1px solid var(--button-stroke); border-radius:12px; padding:16px; background:var(--background); color:var(--text); font:inherit; }
    input:focus-visible,button:focus-visible { outline:2px solid var(--text); outline-offset:3px; }
    button { min-height:52px; border:0; border-radius:12px; padding:14px 22px; background:var(--text); color:var(--background); font:inherit; font-weight:650; cursor:pointer; }
    button:disabled { opacity:.6; cursor:default; }
    .hint,.status { margin:12px 0 0; font-size:13px; line-height:1.65; color:var(--subtext); }
    .status { min-height:1.5em; overflow-wrap:anywhere; }
    .error { color:var(--red,#c33); }
    @media(max-width:600px) { .input-row { flex-direction:column; } button { width:100%; } }
</style>
