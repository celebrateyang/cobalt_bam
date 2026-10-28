<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { page } from '$app/stores';
    import type { SeoLandingLocaleContent } from '$lib/seo/landing-pages';
    import type { PlatformDownloadConfig } from '$lib/seo/platform-download-landings';
    import { getPlatformFormCopy, parsePlatformDownloadInput } from '$lib/seo/platform-download-input';

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
    $: copy = getPlatformFormCopy(lang);
    $: inputId = `${config.id}-source-url`;
    $: isRu = lang === 'ru';

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

<main class="platform-page" style={`--platform-accent:${config.accent}`} tabindex="-1" data-first-focus data-focus-ring-hidden>
    <nav class="breadcrumb" aria-label={isRu ? 'Навигация' : 'Breadcrumb'}>
        <a href={`/${lang}`}>{isRu ? 'Главная' : 'Home'}</a><span>/</span>
        <a href={`/${lang}/download`}>{isRu ? 'Загрузки' : 'Download'}</a><span>/</span>
        <span>{config.name}</span>
    </nav>
    <header class="hero">
        <div class="hero-copy">
            <p class="eyebrow"><span aria-hidden="true"></span> FreeSaveVideo / {config.name}</p>
            <h1>{content.h1}</h1>
            <p class="lede">{content.lede}</p>
            <ul class="tags" aria-label={isRu ? 'Возможности' : 'At a glance'}>
                {#each content.heroTags ?? [] as tag}<li>{tag}</li>{/each}
            </ul>
        </div>
        <section class="download-desk" aria-labelledby="download-form-title">
            <p id="download-form-title" class="desk-title">{config.name}</p>
            <form on:submit|preventDefault={submit} aria-busy={busy}>
                <label for={inputId}>{copy.label}</label>
                <input id={inputId} bind:value={input} on:input={() => { hasError = false; message = ''; }} type="text" inputmode="url"
                    autocomplete="off" spellcheck="false" placeholder={config.placeholder} required disabled={!ready || busy}
                    aria-describedby={`${inputId}-hint ${inputId}-status`} aria-invalid={hasError} />
                <button type="submit" disabled={!ready || busy}>{busy ? copy.busy : copy.action}<span aria-hidden="true">↓</span></button>
                <p id={`${inputId}-hint`} class="hint">{copy.hint}</p>
                <p id={`${inputId}-status`} class="status" class:error={hasError} role="status" aria-live="polite">{message}</p>
                <noscript><p>{isRu ? 'Включите JavaScript для подготовки загрузки на этой странице.' : 'Enable JavaScript to prepare a download on this page.'}</p></noscript>
            </form>
        </section>
    </header>

    <section class="source-section" aria-labelledby="source-heading">
        <div class="section-label"><span>01</span><h2 id="source-heading">{content.supportedLinksTitle}</h2></div>
        <div class="source-grid">
            {#each content.supportedLinks ?? [] as link, index}
                <article><h3>{link.title}</h3><p>{link.description}</p>{#if config.formats[index]}<code>{config.formats[index]}</code>{/if}</article>
            {/each}
        </div>
        <p class="shape-note">{isRu ? 'Примеры показывают формат адреса. Вставьте ссылку на нужный вам ролик.' : 'Copy the complete link from the source Share menu. The patterns above show which part identifies your video or post.'}</p>
    </section>

    <section class="walkthrough" aria-labelledby="steps-heading">
        <div class="section-label"><span>02</span><h2 id="steps-heading">{content.stepsTitle}</h2></div>
        <ol>{#each content.steps as step, index}<li><span aria-hidden="true">0{index + 1}</span><p>{step}</p></li>{/each}</ol>
    </section>

    <div class="editorial-grid">
        <section class="result-note" aria-labelledby="result-heading">
            <p class="eyebrow">{isRu ? 'Результат' : 'The result'}</p>
            <h2 id="result-heading">{content.featuresTitle}</h2>
            <ul>{#each content.features as feature}<li>{feature}</li>{/each}</ul>
        </section>
        <div class="explanations">
            {#each content.sections ?? [] as section}
                <section><h2>{section.title}</h2>{#each section.paragraphs as paragraph}<p>{paragraph}</p>{/each}</section>
            {/each}
        </div>
    </div>

    <section class="questions" aria-labelledby="questions-heading">
        <div class="section-label"><span>03</span><h2 id="questions-heading">{content.faqTitle}</h2></div>
        {#each content.faqs as faq}<details><summary>{faq.q}<span aria-hidden="true">+</span></summary><p>{faq.a}</p></details>{/each}
    </section>
    <footer>
        {#if related.length}
            <nav aria-label={isRu ? 'Другие платформы' : 'Other platforms'}>{#each related as link}<a href={`/${lang}/download/${link.slug}`}>{link.name} <span aria-hidden="true">↗</span></a>{/each}</nav>
        {/if}
        <p>{content.disclaimer}</p>
    </footer>
</main>

<style>
    .platform-page { width:100%; max-width:1160px; box-sizing:border-box; padding:30px 26px 64px; color:var(--text); font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
    .platform-page :global(*) { font-family:inherit; }
    .breadcrumb { display:flex; gap:12px; flex-wrap:wrap; color:var(--subtext); font-size:12px; line-height:1.7; }
    a { color:inherit; text-underline-offset:4px; }
    .breadcrumb a { text-decoration:none; }
    .hero { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,1fr); gap:54px; align-items:center; padding:48px 0 44px; }
    .eyebrow { display:flex; align-items:center; gap:8px; color:var(--subtext); font-size:12px; letter-spacing:.05em; line-height:1.6; font-weight:650; }
    .eyebrow span { width:8px; height:8px; background:var(--platform-accent); border-radius:50%; }
    h1 { font-size:clamp(32px,4.3vw,52px); line-height:1.12; letter-spacing:-.04em; margin:18px 0; text-wrap:balance; }
    .lede { margin:0; font-size:17px; line-height:1.85; color:var(--subtext); }
    .tags { display:flex; flex-wrap:wrap; gap:8px; list-style:none; margin:22px 0 0; padding:0; }
    .tags li { border:1px solid var(--button-stroke); border-radius:6px; padding:5px 9px; font-size:11px; line-height:1.7; }
    .download-desk { min-width:0; border:1px solid var(--button-stroke); border-top:4px solid var(--platform-accent); border-radius:16px; padding:26px; background:var(--popup-bg); }
    .desk-title { margin:0 0 24px; font-size:20px; font-weight:700; letter-spacing:-.03em; }
    label { display:block; font-size:13px; font-weight:650; margin:0 0 12px; }
    input { width:100%; min-width:0; box-sizing:border-box; padding:16px 13px; border:1px solid var(--button-stroke); border-radius:10px; background:var(--background); color:var(--text); font-size:14px; }
    button { display:flex; width:100%; align-items:center; justify-content:space-between; gap:12px; min-height:50px; margin-top:12px; padding:13px 16px; border:0; border-radius:10px; background:var(--button-active-bg); color:var(--button-active-text); font:inherit; font-size:14px; font-weight:650; cursor:pointer; }
    button:disabled { opacity:.6; cursor:default; }
    input:focus-visible,button:focus-visible,a:focus-visible,summary:focus-visible { outline:2px solid var(--platform-accent); outline-offset:4px; }
    .hint,.status { font-size:12px; line-height:1.75; color:var(--subtext); overflow-wrap:anywhere; }
    .hint { margin:14px 0 0; } .status { min-height:1.75em; margin:8px 0 0; } .error { color:var(--red,#bc3333); }
    .source-section,.walkthrough,.questions { border-top:1px solid var(--button-stroke); padding:30px 0; }
    .section-label { display:flex; gap:14px; align-items:baseline; margin-bottom:24px; }
    .section-label > span { color:var(--subtext); font-size:12px; }
    h2 { font-size:clamp(20px,2.3vw,27px); line-height:1.4; margin:0 0 18px; letter-spacing:-.025em; text-wrap:balance; }
    .section-label h2 { margin:0; }
    h3 { font-size:15px; margin:0 0 10px; line-height:1.6; }
    .source-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:28px; }
    .source-grid p,.explanations p { font-size:14px; line-height:1.9; color:var(--subtext); }
    code { display:block; font-size:11px; line-height:1.8; overflow-wrap:anywhere; color:var(--text); }
    .shape-note { color:var(--subtext); font-size:11px; line-height:1.8; margin:20px 0 0; }
    ol { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:28px; padding:0; margin:0; list-style:none; }
    ol li { display:flex; gap:14px; } ol span { color:var(--platform-accent); font-size:13px; font-weight:700; line-height:1.9; }
    ol p { font-size:14px; color:var(--subtext); line-height:1.9; margin:0; }
    .editorial-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.45fr); gap:54px; padding:24px 0 36px; }
    .result-note { border:1px solid var(--button-stroke); border-radius:14px; padding:24px; align-self:start; }
    .result-note .eyebrow { margin:0 0 12px; } .result-note h2 { font-size:22px; }
    .result-note ul { margin:0; padding-left:18px; } .result-note li { padding:6px 0; color:var(--subtext); font-size:14px; line-height:1.8; }
    .explanations section + section { margin-top:28px; } .explanations h2 { font-size:20px; } .explanations p:last-child { margin-bottom:0; }
    details { border-bottom:1px solid var(--button-stroke); } summary { display:flex; gap:24px; justify-content:space-between; padding:20px 0; font-size:15px; font-weight:600; cursor:pointer; list-style:none; line-height:1.7; }
    summary::-webkit-details-marker { display:none; } summary span { font-size:19px; font-weight:400; } details[open] summary span { transform:rotate(45deg); }
    details p { max-width:850px; margin:0 0 22px; color:var(--subtext); font-size:14px; line-height:1.9; }
    footer nav { display:flex; flex-wrap:wrap; gap:12px; padding:12px 0; } footer a { border:1px solid var(--button-stroke); border-radius:8px; padding:9px 12px; font-size:12px; text-decoration:none; }
    footer p { color:var(--subtext); font-size:11px; line-height:1.9; margin-top:22px; }
    @media(max-width:820px) { .hero { grid-template-columns:1fr; gap:28px; padding-top:30px; } .source-grid,ol { grid-template-columns:1fr; gap:24px; } .editorial-grid { grid-template-columns:1fr; gap:28px; } }
    @media(max-width:480px) { .platform-page { padding:22px 16px 40px; } .download-desk { padding:20px; } .lede { font-size:16px; } h1 { font-size:34px; } }
</style>
