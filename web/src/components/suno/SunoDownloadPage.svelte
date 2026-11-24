<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { page } from '$app/stores';
    import type { SeoLandingLocaleContent } from '$lib/seo/landing-pages';
    import type { CobaltSettings } from '$lib/types/settings';
    import { sunoLocales } from '$lib/seo/suno-locales';
    import { sunoAudioCopy } from '$lib/seo/suno-audio-copy';

    export let lang: string;
    export let content: SeoLandingLocaleContent;

    let input = '';
    let mode: 'audio' | 'auto' = 'audio';
    let format: CobaltSettings['save']['audioFormat'] = 'mp3';
    let busy = false;
    let ready = false;
    let disposed = false;
    let message = '';
    let hasError = false;
    const english = ['Home','Downloaders','FOR THE SONGS YOU WANT TO KEEP','Suno song downloader.','Keep the feeling.','Download a public Suno song as audio, or save its available video as MP4. Your next listen is just a link away.','Audio & video','Works in your browser','YOUR DOWNLOAD',"Let\'s find your song.",'A public Suno link is all you need.','Song or share link','What would you like to save?','Audio','Listen anywhere','Video','Available MP4','Audio format','Best available (M4A)','Supports public','Sign in when prompted; points or membership usage may apply.','Preparing...','Download audio','Download video','Enter a public Suno song or share link.','Could not prepare this song. Check that it is public and try again.','Your audio is being prepared in the download queue.','Your video is ready in the download dialog.','THE AUDIO, YOUR WAY','YOUR SONG','MP3 · WAV · MORE','SOUND GOOD?','Just the audio.','All the feeling.',"Choose Audio to extract a song's sound from its available MP4 video, then save it in your preferred format. Processing happens in your browser.","The audio comes from the video's track; it isn't a separate original Suno audio export. Availability and quality depend on the source.",'Choose audio format','A FEW SIMPLE STEPS',"Start with a song that's publicly accessible on Suno.",'Copy the link','Pick your format','Save your song','GOOD TO KNOW','The details','matter.','Everything you need to know before saving your song.','READY WHEN YOU ARE','Keep the songs','you love close.','Paste your Suno link and choose how you want to listen.','Download a song','More downloaders','Help & FAQ','Enable JavaScript to prepare a download, or open the downloader.','Breadcrumb','Related links'];
    $: audioCopy = sunoAudioCopy[lang] ?? sunoAudioCopy.en;
    $: ui = (sunoLocales[lang]?.ui ?? english).map((value, index) =>
        index === 18 ? audioCopy.best : index === 34 ? audioCopy.description : index === 35 ? audioCopy.limitation : value);
    const bars = [19, 31, 23, 46, 36, 55, 29, 67, 42, 76, 51, 88, 58, 72, 44, 94, 63, 81, 46, 70, 53, 84, 39, 64, 48, 73, 36, 57, 27, 43, 22, 31];

    function parseSunoUrl(value: string): string | null {
        try {
            const url = new URL(value.trim());
            if (url.protocol !== 'https:' || !['suno.com', 'www.suno.com'].includes(url.hostname) || url.username || url.password || url.port) return null;
            if (!/^\/(?:s\/[a-z0-9]{1,64}|song\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/?$/i.test(url.pathname)) return null;
            return url.toString();
        } catch { return null; }
    }

    async function submit() {
        if (busy) return;
        message = ''; hasError = false;
        const url = parseSunoUrl(input);
        if (!url) { hasError = true; message = ui[24]; return; }
        busy = true;
        try {
            const { loadTranslations } = await import('$lib/i18n/translations');
            await Promise.all(['save', 'button', 'dialog', 'error', 'auth', 'queue'].map(key => loadTranslations(lang, key)));
            const { savingHandler, buildSaveRequest } = await import('$lib/api/saving-handler');
            if (disposed) return;
            const response = await savingHandler({ request: { ...buildSaveRequest(url), downloadMode: mode, audioFormat: format } });
            if (disposed) return;
            if (response?.status === 'error') { hasError = true; message = ui[25]; }
            else if (response) message = mode === 'audio' ? ui[26] : ui[27];
        } catch {
            if (!disposed) { hasError = true; message = ui[25]; }
        } finally { if (!disposed) busy = false; }
    }

    onMount(() => {
        ready = true;
        const candidate = $page.url.searchParams.get('url') || $page.url.searchParams.get('u');
        if (candidate && parseSunoUrl(candidate)) input = candidate;
    });
    onDestroy(() => { disposed = true; });
</script>

<main class="suno-page" tabindex="-1" data-first-focus data-focus-ring-hidden>
    <nav class="crumb" aria-label={ui[54]}><a href={`/${lang}`}>{ui[0]}</a><span>/</span><a href={`/${lang}/download`}>{ui[1]}</a><span>/</span><span>Suno</span></nav>

    <section class="hero" aria-labelledby="suno-title">
        <div class="hero-copy">
            <p class="eyebrow"><span class="tiny-disc" aria-hidden="true"></span> {ui[2]}</p>
            <h1 id="suno-title">{ui[3]}<br /><em>{ui[4]}</em></h1>
            <p class="lede">{ui[5]}</p>
            <div class="hero-pills"><span>{ui[6]}</span><span>{ui[7]}</span></div>
        </div>
        <div class="record-art" aria-hidden="true">
            <div class="record-glow"></div><div class="record"><div class="record-label"><span>♪</span></div></div>
            <div class="art-tag"><span class="art-icon">♫</span><div><strong>{ui[6]}</strong><small>{ui[7]}</small></div></div>
        </div>
    </section>

    <section class="download-card" id="download" aria-labelledby="form-title">
        <div class="card-heading"><div><span class="kicker">{ui[8]}</span><h2 id="form-title">{ui[9]}</h2></div><span class="card-note">{ui[10]}</span></div>
        <form on:submit|preventDefault={submit} action={`/${lang}`} method="GET" aria-busy={busy}>
            <label for="suno-url">{ui[11]}</label>
            <div class="link-input"><span aria-hidden="true">↗</span><input id="suno-url" name="u" bind:value={input} on:input={() => { message = ''; hasError = false; }} type="url" placeholder="https://suno.com/s/..." autocomplete="url" required aria-invalid={hasError} aria-describedby="suno-hint suno-status" /></div>
            <div class="controls">
                <fieldset><legend>{ui[12]}</legend><div class="mode-options"><label class:chosen={mode === 'audio'}><input type="radio" name="suno-mode" value="audio" bind:group={mode} /><span>♫</span><span><strong>{ui[13]}</strong><small>{ui[14]}</small></span></label><label class:chosen={mode === 'auto'}><input type="radio" name="suno-mode" value="auto" bind:group={mode} /><span>▷</span><span><strong>{ui[15]}</strong><small>{ui[16]}</small></span></label></div></fieldset>
                {#if mode === 'audio'}<div class="format"><label for="suno-format">{ui[17]}</label><select id="suno-format" bind:value={format}><option value="mp3">MP3</option><option value="wav">WAV</option><option value="ogg">OGG</option><option value="opus">Opus</option><option value="best">{ui[18]}</option></select></div>{/if}
            </div>
            <div class="submit-row"><p id="suno-hint">{ui[19]} <strong>suno.com/s/</strong> · <strong>suno.com/song/</strong><br />{ui[20]}</p><button type="submit" disabled={busy || !ready}>{busy ? ui[21] : mode === 'audio' ? ui[22] : ui[23]} <span aria-hidden="true">↓</span></button></div>
            <p id="suno-status" class:error={hasError} class="status" role="status" aria-live="polite">{message}</p>
            <noscript><p>{ui[53]} <a href={`/${lang}`}>{ui[1]}</a></p></noscript>
        </form>
    </section>

    <section class="sound-section" aria-labelledby="sound-title">
        <div class="wave-panel"><div class="wave-top"><span>{ui[28]}</span><span>♫</span></div><div class="wave" aria-hidden="true">{#each bars as height}<i style={`height:${height}%`}></i>{/each}</div><div class="wave-bottom"><span>{ui[29]}</span><span>{ui[30]}</span></div></div>
        <div class="sound-copy"><p class="kicker">{ui[31]}</p><h2 id="sound-title">{ui[32]}<br /><em>{ui[33]}</em></h2><p>{ui[34]}</p><p class="fine-print">{ui[35]}</p><a class="text-link" href="#download">{ui[36]} <span aria-hidden="true">↗</span></a></div>
    </section>

    <section class="how" aria-labelledby="how-title"><div class="section-heading"><div><p class="kicker">{ui[37]}</p><h2 id="how-title">{content.stepsTitle}</h2></div><p>{ui[38]}</p></div><div class="steps"><article><span class="step-icon">↗</span><h3>{ui[39]}</h3><p>{content.steps[0]}</p></article><article><span class="step-icon">♫</span><h3>{ui[40]}</h3><p>{content.steps[1]}</p></article><article><span class="step-icon">↓</span><h3>{ui[41]}</h3><p>{content.steps[2]}</p></article></div></section>

    <section class="details-section" aria-labelledby="details-title"><div><p class="kicker">{ui[42]}</p><h2 id="details-title">{ui[43]}<br /><em>{ui[44]}</em></h2><p>{ui[45]}</p></div><div class="faq-list">{#each content.faqs as faq}<details><summary>{faq.q}<span aria-hidden="true">+</span></summary><p>{faq.a}</p></details>{/each}</div></section>

    <section class="last-call"><div><p class="kicker">{ui[46]}</p><h2>{ui[47]}<br />{ui[48]}</h2><p>{ui[49]}</p></div><a href="#download">{ui[50]} <span aria-hidden="true">↓</span></a></section>
    <footer><p>{content.disclaimer}</p><nav aria-label={ui[55]}><a href={`/${lang}/download`}>{ui[51]}</a><a href={`/${lang}/faq`}>{ui[52]}</a></nav></footer>
</main>

<style>
    .suno-page { --sun-line:var(--button-stroke); --sun-soft:var(--button); width:100%;max-width:1160px;box-sizing:border-box;padding:24px 26px 76px;color:var(--text);font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
    .suno-page :global(*) { box-sizing:border-box; } a { color:inherit;text-underline-offset:4px; } p { line-height:1.7; } .crumb { display:flex;gap:10px;align-items:center;color:var(--subtext);font-size:.82rem; } .crumb a { text-decoration:none; } .crumb a:hover { text-decoration:underline; }
    .hero { position:relative;display:grid;grid-template-columns:1.12fr .88fr;align-items:center;min-height:380px;overflow:hidden;padding:32px 12px 56px; } .hero-copy { position:relative;z-index:1; } .eyebrow,.kicker { font-size:.73rem;font-weight:750;letter-spacing:.12em;color:var(--accent-strong); } .eyebrow { display:flex;align-items:center;gap:9px; } .tiny-disc { width:9px;height:9px;background:var(--accent);border-radius:50%; } h1,h2,h3,p { margin-top:0; } h1 { font-size:clamp(2.7rem,5.7vw,5rem);line-height:1.02;letter-spacing:-.065em;margin:23px 0; } h1 em,h2 em { color:var(--accent-strong);font-family:Georgia,serif;font-weight:400; } .lede { max-width:490px;font-size:1.08rem;line-height:1.75;color:var(--subtext); } .hero-pills { display:flex;gap:10px;flex-wrap:wrap;margin-top:24px; } .hero-pills span { border:1px solid var(--sun-line);border-radius:40px;padding:8px 13px;font-size:.8rem;font-weight:600; }
    .record-art { position:relative;min-height:320px;display:grid;place-items:center; } .record-glow { position:absolute;width:310px;height:310px;border-radius:50%;background:rgba(var(--accent-rgb),.13);filter:blur(45px); } .record { position:relative;width:280px;aspect-ratio:1;border-radius:50%;background:repeating-radial-gradient(circle,#1e1e25 0 3px,#2c2c35 4px 5px,#191920 6px 8px);box-shadow:0 25px 55px #0004,0 0 0 1px #ffffff18;display:grid;place-items:center;transform:rotate(-13deg); } .record-label { width:37%;aspect-ratio:1;border-radius:50%;background:var(--accent);display:grid;place-items:center;color:white;font-size:2.4rem;border:6px solid #ffffff2b; } .record-label:after { content:'';position:absolute;width:8px;height:8px;border-radius:50%;background:white; } .record-label span { transform:translateY(-18px); } .art-tag { position:absolute;bottom:24px;right:4%;display:flex;align-items:center;gap:12px;padding:14px 18px;border:1px solid var(--sun-line);background:var(--popup-bg);border-radius:14px;box-shadow:0 12px 32px #0002; } .art-icon { display:grid;place-items:center;width:38px;height:38px;border-radius:10px;color:var(--accent-strong);background:rgba(var(--accent-rgb),.12);font-size:1.2rem; } .art-tag strong,.art-tag small { display:block; } .art-tag strong { font-size:.8rem; } .art-tag small { margin-top:4px;color:var(--subtext);font-size:.72rem; }
    .download-card { position:relative;z-index:2;border:1px solid var(--sun-line);border-radius:24px;background:var(--popup-bg);padding:30px;box-shadow:0 20px 55px rgba(0,0,0,.08); } .card-heading { display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:24px; } .card-heading h2 { margin:6px 0 0;font-size:1.6rem;letter-spacing:-.04em; } .card-note { color:var(--subtext);font-size:.84rem; } form>label,legend,.format label { display:block;font-size:.84rem;font-weight:700;margin-bottom:9px; } .link-input { display:flex;align-items:center;gap:12px;border:1px solid var(--sun-line);border-radius:12px;background:var(--background);padding:0 16px; } .link-input span { color:var(--accent);font-size:1.2rem; } .link-input input { width:100%;min-width:0;height:56px;background:transparent;border:0;outline:0;color:var(--text);font:inherit;font-size:.96rem; } .link-input:focus-within { outline:2px solid var(--accent);outline-offset:2px; } .controls { display:flex;align-items:end;gap:22px;margin-top:22px; } fieldset { padding:0;border:0;margin:0;flex:1;min-width:0; } .mode-options { display:flex;gap:10px; } .mode-options label { display:flex;align-items:center;gap:11px;flex:1;min-height:68px;border:1px solid var(--sun-line);border-radius:12px;padding:10px 14px;cursor:pointer; } .mode-options label.chosen { border-color:var(--accent);background:rgba(var(--accent-rgb),.08); } .mode-options input { accent-color:var(--accent); } .mode-options label>span:first-of-type { font-size:1.25rem;color:var(--accent-strong); } .mode-options strong,.mode-options small { display:block; } .mode-options strong { font-size:.86rem; } .mode-options small { margin-top:3px;color:var(--subtext);font-size:.74rem; } .format { width:190px; } select { width:100%;height:68px;border:1px solid var(--sun-line);border-radius:12px;background:var(--background);color:var(--text);padding:0 12px;font:inherit; } .submit-row { display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:24px; } .submit-row p { margin:0;color:var(--subtext);font-size:.8rem; } button,.last-call>a { display:inline-flex;justify-content:center;align-items:center;gap:26px;min-height:52px;padding:12px 22px;border:0;border-radius:11px;background:var(--button-active-bg);color:var(--button-active-text);font:inherit;font-size:.9rem;font-weight:700;text-decoration:none;cursor:pointer; } button:disabled { opacity:.65;cursor:wait; } button span,.last-call>a span { font-size:1.2rem; } .status { margin:10px 0 0;min-height:1.3em;color:var(--subtext);font-size:.84rem; } .status.error { color:var(--red,#c73535); } :is(a,button,input,select,summary):focus-visible { outline:2px solid var(--accent);outline-offset:3px; }
    .sound-section { display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center;padding:110px 10px; } .wave-panel { min-height:285px;padding:25px;border-radius:22px;background:var(--sun-soft);border:1px solid var(--sun-line);display:flex;flex-direction:column;justify-content:space-between; } .wave-top,.wave-bottom { display:flex;justify-content:space-between;color:var(--subtext);font-size:.7rem;font-weight:700;letter-spacing:.1em; } .wave-top span:last-child { font-size:1.4rem;color:var(--accent-strong); } .wave { display:flex;align-items:center;justify-content:center;gap:5px;height:140px; } .wave i { width:5px;min-height:4px;border-radius:8px;background:var(--accent);opacity:.8; } .sound-copy h2,.section-heading h2,.details-section h2,.last-call h2 { font-size:clamp(2rem,3.6vw,3.3rem);line-height:1.08;letter-spacing:-.055em;margin:15px 0 22px; } .sound-copy>p:not(.kicker),.details-section>div>p:not(.kicker) { color:var(--subtext); } .sound-copy .fine-print { font-size:.84rem; } .text-link { display:inline-block;margin-top:10px;font-size:.9rem;font-weight:700;color:var(--accent-strong); }
    .how { border-top:1px solid var(--sun-line);padding:66px 10px 90px; } .section-heading { display:flex;justify-content:space-between;align-items:end;gap:30px; } .section-heading>p { max-width:270px;color:var(--subtext); } .steps { display:grid;grid-template-columns:repeat(3,1fr);gap:30px;margin-top:32px; } .steps article { border-top:1px solid var(--sun-line);padding-top:24px; } .step-icon { display:grid;place-items:center;width:44px;height:44px;border-radius:13px;background:rgba(var(--accent-rgb),.1);color:var(--accent-strong);font-size:1.25rem;margin-bottom:24px; } .steps h3 { font-size:1.05rem;margin-bottom:10px; } .steps p { color:var(--subtext);font-size:.92rem; }
    .details-section { display:grid;grid-template-columns:.8fr 1.2fr;gap:70px;border-top:1px solid var(--sun-line);padding:70px 10px 90px; } details { border-bottom:1px solid var(--sun-line); } summary { list-style:none;cursor:pointer;display:flex;justify-content:space-between;gap:20px;align-items:center;padding:20px 0;font-size:.98rem;font-weight:650;line-height:1.5; } summary::-webkit-details-marker { display:none; } summary span { font-size:1.4rem;font-weight:400;color:var(--accent-strong); } details[open] summary span { transform:rotate(45deg); } details p { color:var(--subtext);font-size:.9rem;margin:0 0 20px; }
    .last-call { display:flex;justify-content:space-between;gap:24px;align-items:center;padding:42px;border-radius:24px;background:var(--sun-soft);border:1px solid var(--sun-line); } .last-call h2 { margin:10px 0 15px; } .last-call p:last-child { margin:0;color:var(--subtext); } .last-call>a { flex-shrink:0; } footer { display:flex;justify-content:space-between;gap:25px;padding:32px 4px 0;color:var(--subtext);font-size:.8rem; } footer p { max-width:620px;margin:0; } footer nav { display:flex;gap:20px;flex-wrap:wrap;align-content:start; }
    @media(max-width:760px) { .suno-page { padding:20px 16px 55px; } .hero { grid-template-columns:1fr;padding:42px 4px 30px; } .record-art { min-height:235px;margin-top:20px; } .record { width:200px; } .record-glow { width:230px;height:230px; } .art-tag { right:3%;bottom:0; } .download-card { padding:22px 18px;border-radius:20px; } .card-heading { display:block; } .card-note { display:block;margin-top:10px; } .controls { display:block; } .format { width:100%;margin-top:16px; } select { height:52px; } .submit-row { align-items:stretch;flex-direction:column; } button { width:100%; } .sound-section { grid-template-columns:1fr;gap:34px;padding:70px 0; } .wave-panel { min-height:230px; } .wave { height:100px;gap:4px; } .wave i { width:4px; } .section-heading { display:block; } .steps { grid-template-columns:1fr;gap:8px; } .step-icon { margin-bottom:14px; } .how { padding:45px 0 60px; } .details-section { grid-template-columns:1fr;gap:20px;padding:50px 0 65px; } .last-call { align-items:flex-start;flex-direction:column;padding:28px; } footer { flex-direction:column; } }
</style>
