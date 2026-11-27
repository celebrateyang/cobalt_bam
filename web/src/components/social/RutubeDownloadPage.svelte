<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { page } from '$app/stores';
    import type { SeoLandingLocaleContent } from '$lib/seo/landing-pages';
    import type { PlatformDownloadConfig } from '$lib/seo/platform-download-landings';
    import { parsePlatformDownloadInput } from '$lib/seo/platform-download-input';
    import { rutubeLocales } from '$lib/seo/rutube-locales';

    export let config: PlatformDownloadConfig;
    export let content: SeoLandingLocaleContent;
    export let lang: string;
    export let related: Array<{ slug: string; name: string }> = [];

    let input = '';
    let ready = false;
    let busy = false;
    let disposed = false;
    let hasError = false;
    let message = '';
    $: copy = rutubeLocales[lang] ?? rutubeLocales.en;
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
            const response = await savingHandler({ request: { ...buildSaveRequest(url), downloadMode: 'auto' as const, convertGif: false } });
            if (disposed) return;
            if (response?.status === 'error') { hasError = true; message = copy.error; }
            else if (response) message = copy.started;
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
            } catch { /* Optional storage. */ }
        }
    });
    onDestroy(() => { disposed = true; });
</script>

<main class="rutube-page" tabindex="-1" data-first-focus data-focus-ring-hidden>
    <nav class="crumb" aria-label={copy.directory}><a href={`/${lang}`}>{copy.home}</a><span>/</span><a href={`/${lang}/download`}>{copy.directory}</a><span>/</span><span>RUTUBE</span></nav>
    <header class="hero">
        <div class="hero-copy"><p class="eyebrow">RUTUBE / VIDEO + SHORTS</p><h1>{content.h1}</h1><p class="lead">{content.lede}</p></div>
        <div class="screen-art" aria-hidden="true"><div class="screen"><span>▶</span><div class="screen-line"></div></div><div class="short"><span>▶</span></div><div class="art-caption">RUTUBE <span>VIDEO / SHORTS</span></div></div>
    </header>
    <section class="download" aria-label={copy.label}>
        <form on:submit|preventDefault={submit} aria-busy={busy}>
            <label for={inputId}>{copy.label}</label>
            <div class="input-row"><input id={inputId} bind:value={input} on:input={() => { hasError = false; message = ''; }} type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder={config.placeholder} required disabled={!ready || busy} aria-describedby={`${inputId}-hint ${inputId}-status`} aria-invalid={hasError} /><button type="submit" disabled={!ready || busy}>{busy ? copy.busy : copy.action}</button></div>
            <p id={`${inputId}-hint`} class="hint">{copy.hint}</p><p id={`${inputId}-status`} class:error={hasError} class="status" role="status" aria-live="polite">{message}</p>
        </form>
    </section>
    <section class="formats"><div><p class="eyebrow">01 / RUTUBE</p><h2>{copy.linkTitle}</h2><p>{copy.linkDescription}</p><div class="examples"><code>rutube.ru/video/…</code><code>rutube.ru/shorts/…</code><code>rutube.ru/play/embed/…</code></div></div><div class="format-cards"><h2>{content.featuresTitle}</h2>{#each content.features as feature, i}<article><span>0{i + 1}</span><p>{feature}</p></article>{/each}</div></section>
    <section class="steps"><p class="eyebrow">02 / DOWNLOAD</p><h2>{content.stepsTitle}</h2><ol>{#each content.steps as step, i}<li><span>0{i + 1}</span><p>{step}</p></li>{/each}</ol></section>
    <section class="phones"><div><p class="eyebrow">03 / MOBILE</p><h2>{copy.phoneTitle}</h2></div><div class="phone-cards"><article><h3>iPhone / iPad</h3><p>{copy.iphone}</p></article><article><h3>Android</h3><p>{copy.android}</p></article></div></section>
    {#if content.sections?.length}<section class="extra">{#each content.sections as section}<article><h2>{section.title}</h2>{#each section.paragraphs as paragraph}<p>{paragraph}</p>{/each}</article>{/each}</section>{/if}
    <section class="faq"><p class="eyebrow">04 / FAQ</p><h2>{content.faqTitle}</h2>{#each content.faqs as faq}<details><summary>{faq.q}<span aria-hidden="true">+</span></summary><p>{faq.a}</p></details>{/each}</section>
    <footer>{#if related.length}<nav aria-label={copy.directory}>{#each related as link}<a href={`/${lang}/download/${link.slug}`}>{link.name}</a>{/each}</nav>{/if}<p>{content.disclaimer}</p></footer>
</main>

<style>
    .rutube-page{width:100%;max-width:1160px;padding:28px 26px 72px;box-sizing:border-box;color:var(--text);font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.rutube-page :global(*){box-sizing:border-box}p{line-height:1.7}a{color:inherit;text-underline-offset:4px}.crumb{display:flex;gap:12px;flex-wrap:wrap;font-size:14px;color:var(--subtext)}.crumb a{text-decoration:none}.eyebrow{font-size:12px;letter-spacing:.12em;font-weight:750;color:var(--subtext)}.hero{display:grid;grid-template-columns:1fr .8fr;align-items:center;gap:70px;padding:70px 0 55px}h1{font-size:clamp(40px,5.5vw,66px);line-height:1.08;letter-spacing:-.045em;margin:20px 0}.lead{max-width:600px;color:var(--subtext);font-size:18px}.screen-art{position:relative;min-height:250px;padding:18px 50px 20px 0}.screen{height:210px;border:1px solid var(--button-stroke);border-radius:20px;background:var(--button);display:grid;place-items:center;font-size:32px}.screen-line{position:absolute;bottom:55px;left:25px;right:100px;height:4px;background:var(--subtext);opacity:.35;border-radius:4px}.short{position:absolute;right:0;bottom:5px;width:92px;height:155px;border:6px solid var(--popup-bg);border-radius:22px;background:var(--button-active-bg);color:var(--button-active-text);display:grid;place-items:center}.art-caption{display:flex;justify-content:space-between;gap:10px;margin-top:12px;font-size:12px;font-weight:700;color:var(--subtext)}.download{border:1px solid var(--button-stroke);border-radius:20px;background:var(--popup-bg);padding:32px}label{display:block;font-size:16px;font-weight:700;margin-bottom:12px}.input-row{display:flex;gap:10px}input{min-width:0;flex:1;padding:15px;border:1px solid var(--button-stroke);border-radius:10px;background:var(--background);color:var(--text);font:inherit;font-size:16px}button{padding:15px 24px;border:0;border-radius:10px;background:var(--button-active-bg);color:var(--button-active-text);font:inherit;font-weight:700;cursor:pointer}button:disabled{opacity:.6;cursor:default}.hint,.status{color:var(--subtext);font-size:14px}.status{min-height:1.5em;margin-bottom:0}.error{color:var(--red,#bc3333)}input:focus-visible,button:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid var(--text);outline-offset:4px}h2{font-size:clamp(26px,3vw,38px);line-height:1.2;letter-spacing:-.03em;margin:12px 0 20px}h3{font-size:18px;margin:0 0 10px}.formats,.phones{display:grid;grid-template-columns:1fr 1fr;gap:72px;padding:90px 0;border-bottom:1px solid var(--button-stroke)}.formats p,.phones p,.extra p{color:var(--subtext)}.examples{display:grid;gap:8px;margin-top:24px}code{padding:10px 12px;background:var(--button);border-radius:8px;overflow-wrap:anywhere}.format-cards article{display:flex;gap:20px;align-items:baseline;border-bottom:1px solid var(--button-stroke)}.format-cards article span,.steps li span{font-weight:700;color:var(--subtext)}.steps{padding:80px 0;border-bottom:1px solid var(--button-stroke)}ol{display:grid;grid-template-columns:repeat(3,1fr);gap:32px;list-style:none;padding:10px 0 0}ol li{border-top:1px solid var(--button-stroke);padding-top:18px}ol p{color:var(--subtext)}.phone-cards{display:grid;gap:12px}.phone-cards article{padding:22px;border:1px solid var(--button-stroke);border-radius:14px;background:var(--popup-bg)}.phone-cards p{margin:0}.extra{display:grid;grid-template-columns:repeat(2,1fr);gap:30px;padding:70px 0;border-bottom:1px solid var(--button-stroke)}.extra h2{font-size:23px}.faq{padding:80px 0 40px}details{border-bottom:1px solid var(--button-stroke)}summary{display:flex;justify-content:space-between;gap:20px;padding:20px 0;font-weight:700;cursor:pointer;list-style:none}summary::-webkit-details-marker{display:none}summary span{font-size:22px}details[open] summary span{transform:rotate(45deg)}details p{max-width:800px;color:var(--subtext);margin:0 0 20px}footer nav{display:flex;gap:10px;flex-wrap:wrap}footer nav a{padding:9px 12px;border:1px solid var(--button-stroke);border-radius:9px;text-decoration:none;font-size:14px}footer>p{color:var(--subtext);font-size:14px}
    @media(max-width:800px){.hero,.formats,.phones{grid-template-columns:1fr;gap:30px}.hero{padding:45px 0}.screen-art{max-width:460px}.formats,.phones{padding:60px 0}}
    @media(max-width:520px){.rutube-page{padding:22px 16px 48px}.download{padding:22px}.input-row{flex-direction:column}.input-row button{width:100%;min-height:52px}ol,.extra{grid-template-columns:1fr;gap:18px}h1{font-size:40px}.screen-art{display:none}}
</style>
