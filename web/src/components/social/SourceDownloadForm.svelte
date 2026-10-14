<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { page } from '$app/stores';
    import { getSocialFormCopy, parseSocialDownloadInput } from '$lib/seo/social-download-input';
    import type { SocialPlatform } from '$lib/seo/social-download-content';

    export let platform: SocialPlatform;
    export let lang: string;
    export let hint: string;

    let input = '';
    let busy = false;
    let ready = false;
    let message = '';
    let hasError = false;
    let disposed = false;
    $: copy = getSocialFormCopy(lang, platform);
    $: inputId = `${platform}-source-url`;

    async function submit() {
        if (busy) return;
        const url = parseSocialDownloadInput(platform, input);
        message = '';
        hasError = false;
        if (!url) { hasError = true; message = copy.invalid; return; }
        try { sessionStorage.setItem(`fsv.source-download.${platform}`, url); } catch { /* Storage may be disabled. */ }
        busy = true;
        try {
            const { loadTranslations } = await import('$lib/i18n/translations');
            await Promise.all(['save', 'button', 'dialog', 'error', 'auth', 'queue'].map(key => loadTranslations(lang, key)));
            const { savingHandler, buildSaveRequest } = await import('$lib/api/saving-handler');
            if (disposed) return;
            // Explicitly retain source sound and animation even if the homepage was
            // last used in mute/audio mode or with GIF conversion enabled.
            const request = { ...buildSaveRequest(url), downloadMode: 'auto' as const, convertGif: false };
            const response = await savingHandler({ request });
            if (disposed) return;
            if (response?.status === 'error') { hasError = true; message = copy.error; }
            else if (response) message = copy.queued;
            // null also means the user cancelled auth/points confirmation. The
            // existing dialog handles that flow; do not announce a saved file.
        } catch {
            if (!disposed) { hasError = true; message = copy.error; }
        } finally { if (!disposed) busy = false; }
    }

    onMount(() => {
        ready = true;
        const candidate = $page.url.searchParams.get('url') || $page.url.searchParams.get('u');
        if (candidate && parseSocialDownloadInput(platform, candidate)) input = candidate;
        else {
            try {
                const remembered = sessionStorage.getItem(`fsv.source-download.${platform}`) || '';
                if (parseSocialDownloadInput(platform, remembered)) input = remembered;
            } catch { /* The form also works without storage. */ }
        }
    });
    onDestroy(() => { disposed = true; });
</script>

<form on:submit|preventDefault={submit} aria-busy={busy}>
    <label for={inputId}>{copy.label}</label>
    <div class="input-row">
        <input id={inputId} bind:value={input} type="text" inputmode="url" autocomplete="off" spellcheck="false"
            placeholder={platform === 'reddit' ? 'https://www.reddit.com/r/…/comments/…' : 'https://www.pinterest.com/pin/…'}
            aria-describedby={`${inputId}-hint`} aria-invalid={hasError} disabled={busy} required />
        <button type="submit" disabled={!ready || busy}>{busy ? copy.busy : copy.action}</button>
    </div>
    <p id={`${inputId}-hint`} class="hint">{hint}</p>
    <p class="status" class:error={hasError} role="status" aria-live="polite">{message}</p>
</form>

<style>
    form { width:100%; }
    label { display:block; margin-bottom:12px; font-size:14px; font-weight:650; }
    .input-row { display:flex; gap:10px; }
    input { flex:1; width:100%; min-width:0; box-sizing:border-box; border:1px solid var(--button-stroke); border-radius:12px; padding:16px; background:var(--background); color:var(--text); font:inherit; }
    input:focus-visible,button:focus-visible { outline:2px solid var(--social-accent,var(--text)); outline-offset:3px; }
    button { min-height:52px; border:0; border-radius:12px; padding:14px 22px; background:var(--social-accent); color:white; font:inherit; font-weight:650; cursor:pointer; }
    button:disabled { opacity:.6; cursor:default; }
    .hint { margin:12px 0 0; font-size:13px; line-height:1.65; color:var(--subtext); }
    .status { min-height:1.5em; margin:8px 0 0; font-size:14px; line-height:1.6; overflow-wrap:anywhere; }
    .error { color:var(--red,#c33); }
    @media(max-width:600px) { .input-row { flex-direction:column; } button { width:100%; } }
</style>
