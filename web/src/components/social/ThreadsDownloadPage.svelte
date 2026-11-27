<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { page } from '$app/stores';
    import type { SeoLandingLocaleContent } from '$lib/seo/landing-pages';
    import type { PlatformDownloadConfig } from '$lib/seo/platform-download-landings';
    import { parsePlatformDownloadInput } from '$lib/seo/platform-download-input';
    import { threadsLocales } from '$lib/seo/threads-locales';
    import { threadsGuidance } from '$lib/seo/threads-guidance';

    export let config: PlatformDownloadConfig;
    export let content: SeoLandingLocaleContent;
    export let lang: string;
    export let related: Array<{ slug: string; name: string }> = [];

    let input = '';
    let busy = false;
    let ready = false;
    let disposed = false;
    let message = '';
    let hasError = false;
    $: copy = threadsLocales[lang] ?? threadsLocales.en;
    $: guidance = threadsGuidance[lang] ?? threadsGuidance.en;
    $: inputId = `${config.id}-source-url`;

    async function submit() {
        if (busy) return;
        message = '';
        hasError = false;
        const url = parsePlatformDownloadInput(config.id, input);
        if (!url) { hasError = true; message = copy.invalid; return; }
        try { sessionStorage.setItem(`fsv.platform-download.${config.id}`, url); } catch { /* Optional storage. */ }
        busy = true;
        try {
            const { loadTranslations } = await import('$lib/i18n/translations');
            await Promise.all(['save', 'button', 'dialog', 'error', 'auth', 'queue'].map(key => loadTranslations(lang, key)));
            const { savingHandler, buildSaveRequest } = await import('$lib/api/saving-handler');
            if (disposed) return;
            // Preserve source audio/animation regardless of the last homepage mode.
            const request = { ...buildSaveRequest(url), downloadMode: 'auto' as const, convertGif: false };
            const response = await savingHandler({ request });
            if (disposed) return;
            if (response?.status === 'error') { hasError = true; message = copy.error; }
            else if (response) message = copy.started;
            // A cancelled dialog produces no success message or automatic retry.
        } catch {
            if (!disposed) { hasError = true; message = copy.error; }
        } finally {
            if (!disposed) busy = false;
        }
    }

    onMount(() => {
        ready = true;
        const candidate = $page.url.searchParams.get('url') || $page.url.searchParams.get('u');
        if (candidate && parsePlatformDownloadInput(config.id, candidate)) input = candidate;
        else {
            try {
                const remembered = sessionStorage.getItem(`fsv.platform-download.${config.id}`) || '';
                if (parsePlatformDownloadInput(config.id, remembered)) input = remembered;
            } catch { /* The form works without storage. */ }
        }
    });
    onDestroy(() => { disposed = true; });
</script>

<main class="threads-page" tabindex="-1" data-first-focus data-focus-ring-hidden>
    <nav class="crumb" aria-label={copy.directory}><a href={`/${lang}`}>{copy.home}</a><span>/</span><a href={`/${lang}/download`}>{copy.directory}</a><span>/</span><span>Threads</span></nav>

    <header class="hero">
        <div class="intro">
            <p class="eyebrow">Threads</p>
            <h1>{content.h1}</h1>
            <p class="lead">{content.lede}</p>
            <div class="chips"><span>{copy.video}</span><span>{copy.photo}</span><span>{copy.multiple}</span></div>
        </div>
        <section class="post-card" aria-hidden="true">
            <div class="post-header"><span class="avatar">@</span><div><strong>Threads</strong><small>{copy.mediaTitle}</small></div><span class="dots">...</span></div>
            <div class="post-art" aria-hidden="true"><div class="play">&#9654;</div><div class="photo"><span></span></div></div>
            <div class="post-footer"><span>{copy.video}</span><span>{copy.photo}</span><span>{copy.multiple}</span></div>
        </section>
    </header>

    <section class="download" aria-labelledby="form-title">
        <div class="form-intro"><p class="eyebrow">Threads</p><h2 id="form-title">{copy.formTitle}</h2><p>{copy.formIntro}</p></div>
        <form on:submit|preventDefault={submit} aria-busy={busy}>
            <label for={inputId}>{copy.label}</label>
            <input id={inputId} bind:value={input} on:input={() => { hasError = false; message = ''; }} type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder={config.placeholder} required disabled={!ready || busy} aria-describedby={`${inputId}-hint ${inputId}-status`} aria-invalid={hasError} />
            <button type="submit" disabled={!ready || busy}>{busy ? copy.busy : copy.action}</button>
            <p id={`${inputId}-hint`} class="hint">{copy.hint}</p>
            <p id={`${inputId}-status`} class="status" class:error={hasError} role="status" aria-live="polite">{message}</p>
        </form>
    </section>

    <section class="media-guide" aria-labelledby="media-title">
        <div><p class="eyebrow">Threads</p><h2 id="media-title">{copy.mediaTitle}</h2><p>{content.lede}</p></div>
        <div class="media-list"><article><span class="symbol">&#9654;</span><div><h3>{copy.video}</h3><p>{content.features[0]}</p></div></article><article><span class="symbol">&#9633;</span><div><h3>{copy.photo}</h3><p>{content.features[1]}</p></div></article><article><span class="symbol">&#9638;</span><div><h3>{copy.multiple}</h3><p>{content.features[2]}</p></div></article></div>
    </section>

    <section class="how" aria-labelledby="how-title"><h2 id="how-title">{content.stepsTitle}</h2><ol>{#each content.steps as step, index}<li><span>{index + 1}</span><p>{step}</p></li>{/each}</ol></section>
    <section class="phone-guide" aria-labelledby="phone-title">
        <h2 id="phone-title">{guidance.title}</h2>
        <div class="phone-grid">
            <article><h3>iPhone / iPad</h3><p>{guidance.iphone}</p></article>
            <article><h3>Android</h3><p>{guidance.android}</p></article>
        </div>
        <div class="help-grid">
            <article><h3>{guidance.troubleshootingTitle}</h3><p>{guidance.troubleshooting}</p></article>
            <article><h3>{guidance.accountTitle}</h3><p>{guidance.account}</p></article>
        </div>
    </section>
    <section class="details" aria-labelledby="links-title"><div><h2 id="links-title">{copy.linkTitle}</h2><p>{copy.linkDescription}</p><div class="examples"><code>threads.com/@username/post/...</code><code>threads.net/@username/post/...</code><code>threads.com/t/...</code><code>threads.com/share/...</code></div></div><div class="explanations">{#each content.sections ?? [] as section}<section><h3>{section.title}</h3>{#each section.paragraphs as paragraph}<p>{paragraph}</p>{/each}</section>{/each}</div></section>
    <section class="faq" aria-labelledby="faq-title"><h2 id="faq-title">{content.faqTitle}</h2>{#each content.faqs as faq}<details><summary>{faq.q}<span aria-hidden="true">+</span></summary><p>{faq.a}</p></details>{/each}</section>
    <footer>{#if related.length}<nav aria-label={copy.directory}>{#each related as link}<a href={`/${lang}/download/${link.slug}`}>{link.name}</a>{/each}</nav>{/if}<p>{content.disclaimer}</p></footer>
</main>

<style>
    .threads-page { width:100%;max-width:1160px;padding:28px 26px 72px;box-sizing:border-box;color:var(--text);font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
    .threads-page :global(*) { box-sizing:border-box; } a { color:inherit;text-underline-offset:4px; } p { line-height:1.75; } .crumb { display:flex;gap:12px;flex-wrap:wrap;font-size:14px;color:var(--subtext); } .crumb a { text-decoration:none; }
    .hero { display:grid;grid-template-columns:1fr .9fr;gap:72px;align-items:center;padding:70px 0 64px; } .eyebrow { font-size:13px;font-weight:700;letter-spacing:.1em;color:var(--subtext); } h1 { font-size:clamp(42px,5.5vw,68px);line-height:1.05;letter-spacing:-.055em;margin:20px 0; } .lead { font-size:18px;color:var(--subtext);max-width:520px; } .chips { display:flex;gap:8px;flex-wrap:wrap;margin-top:26px; } .chips span,.post-footer span { border:1px solid var(--button-stroke);padding:7px 12px;border-radius:30px;font-size:14px; }
    .post-card { background:var(--popup-bg);border:1px solid var(--button-stroke);border-radius:24px;padding:22px;box-shadow:0 20px 60px #00000016;transform:rotate(2deg); } .post-header { display:flex;gap:12px;align-items:center; } .avatar { width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:var(--button-active-bg);color:var(--button-active-text);font-size:22px; } .post-header strong,.post-header small { display:block; } .post-header small { color:var(--subtext);margin-top:4px;font-size:13px; } .dots { margin-left:auto;font-weight:bold; } .post-art { display:grid;grid-template-columns:1.4fr 1fr;gap:8px;height:220px;margin:20px 0 16px; } .play,.photo { display:grid;place-items:center;border-radius:14px;background:var(--button); } .play { font-size:32px;color:var(--text); } .photo { background:var(--background);border:1px solid var(--button-stroke); } .photo span { width:45%;height:45%;border:2px solid var(--subtext);border-radius:8px;transform:rotate(-8deg); } .post-footer { display:flex;gap:7px;flex-wrap:wrap; } .post-footer span { font-size:12px; }
    .download { display:grid;grid-template-columns:.85fr 1.15fr;gap:50px;padding:36px;border:1px solid var(--button-stroke);border-radius:22px;background:var(--popup-bg); } h2 { font-size:clamp(27px,3.4vw,38px);line-height:1.16;letter-spacing:-.035em;margin:12px 0 18px; } .form-intro p:last-child,.media-guide>div>p:last-child,.details p { color:var(--subtext); } label { display:block;font-size:14px;font-weight:650;margin-bottom:10px; } input { width:100%;padding:15px;border:1px solid var(--button-stroke);border-radius:10px;background:var(--background);color:var(--text);font:inherit;font-size:16px; } button { width:100%;min-height:52px;margin-top:10px;border:0;border-radius:10px;background:var(--button-active-bg);color:var(--button-active-text);font:inherit;font-weight:700;cursor:pointer; } button:disabled { opacity:.6;cursor:default; } .hint,.status { font-size:14px;color:var(--subtext);overflow-wrap:anywhere; } .status { min-height:1.6em;margin-bottom:0; } .error { color:var(--red,#bc3333); } input:focus-visible,button:focus-visible,a:focus-visible,summary:focus-visible { outline:2px solid var(--text);outline-offset:4px; }
    .media-guide,.details { display:grid;grid-template-columns:1fr 1fr;gap:80px;padding:90px 0;border-bottom:1px solid var(--button-stroke); } .media-list article { display:flex;gap:18px;padding:20px 0;border-bottom:1px solid var(--button-stroke); } .media-list article:first-child { padding-top:0; } .symbol { flex:0 0 44px;height:44px;display:grid;place-items:center;border-radius:12px;background:var(--button);font-size:20px; } h3 { font-size:18px;margin:0 0 8px; } .media-list p,.explanations p { margin:0;color:var(--subtext); } .how { padding:80px 0;border-bottom:1px solid var(--button-stroke); } ol { display:grid;grid-template-columns:repeat(3,1fr);gap:28px;list-style:none;padding:12px 0 0; } ol span { display:grid;place-items:center;width:36px;height:36px;border:1px solid var(--button-stroke);border-radius:50%;font-weight:700; } ol p { color:var(--subtext); } .examples { display:grid;gap:8px;margin-top:24px; } code { overflow-wrap:anywhere;background:var(--button);padding:10px 12px;border-radius:8px;font-size:14px; } .explanations section+section { margin-top:32px; } .explanations p+p { margin-top:12px; }
    .faq { padding:80px 0 40px; } details { border-bottom:1px solid var(--button-stroke); } summary { display:flex;justify-content:space-between;gap:20px;padding:20px 0;font-size:16px;font-weight:650;cursor:pointer;list-style:none; } summary::-webkit-details-marker { display:none; } summary span { font-size:22px; } details[open] summary span { transform:rotate(45deg); } details p { color:var(--subtext);max-width:800px;margin:0 0 20px; } footer nav { display:flex;gap:10px;flex-wrap:wrap; } footer nav a { padding:9px 12px;border:1px solid var(--button-stroke);border-radius:9px;text-decoration:none;font-size:14px; } footer>p { color:var(--subtext);font-size:14px;margin-top:24px; }
    .phone-guide { padding:80px 0;border-bottom:1px solid var(--button-stroke); } .phone-grid,.help-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px; } .phone-grid { margin-top:28px; } .phone-grid article { padding:24px;border:1px solid var(--button-stroke);border-radius:14px;background:var(--popup-bg); } .phone-guide p { margin:0;color:var(--subtext); } .help-grid { margin-top:36px; }
    @media(max-width:800px) { .hero,.download,.media-guide,.details { grid-template-columns:1fr;gap:32px; } .hero { padding:45px 0; } .post-card { transform:none;max-width:520px; } .media-guide,.details { padding:60px 0; } }
    @media(max-width:520px) { .threads-page { padding:22px 16px 48px; } .download { padding:22px; } .post-art { height:165px; } ol,.phone-grid,.help-grid { grid-template-columns:1fr;gap:18px; } h1 { font-size:42px; } }
</style>
