<script lang="ts">
    import { onMount, onDestroy, tick } from 'svelte';
    import { page } from '$app/stores';
    import { getYouTubeCopy } from '$lib/youtube/copy';
    import { parseYouTubeInput, formatYouTubeDuration } from '$lib/youtube/input';
    import type { YouTubeVideo } from '$lib/types/youtube';
    import type { CobaltSettings } from '$lib/types/settings';
    import type { CobaltExpandOkResponse } from '$lib/types/expand';
    import type { SeoLandingLocaleContent } from '$lib/seo/landing-pages';

    export let lang: string;
    export let content: SeoLandingLocaleContent;
    export let guideSlug: string | null = null;

    const examples = ['2026 top songs', 'learn guitar', 'Japan travel'];
    const STORAGE_KEY = 'fsv.youtube.workspace.v1';
    let input = '';
    let inputElement: HTMLInputElement;
    let panelElement: HTMLElement;
    let selected: YouTubeVideo | null = null;
    let items: YouTubeVideo[] = [];
    let resultQuery = '';
    let hasSearched = false;
    let searching = false;
    let downloadBusy = false;
    let message = '';
    let notice = '';
    let playlist: CobaltExpandOkResponse | null = null;
    let searchController: AbortController | null = null;
    let requestNumber = 0;
    let disposed = false;
    let mode: CobaltSettings['save']['downloadMode'] = 'auto';
    let quality: CobaltSettings['save']['videoQuality'] = '1080';
    let audioFormat: CobaltSettings['save']['audioFormat'] = 'mp3';
    let audioBitrate: CobaltSettings['save']['audioBitrate'] = '128';

    $: copy = getYouTubeCopy(lang);
    $: parsedInput = parseYouTubeInput(input);
    $: submitLabel = parsedInput?.kind === 'search' || !parsedInput ? copy.search : copy.open;

    function remember() {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ input, selected, mode, quality, audioFormat, audioBitrate }));
        } catch { /* Storage can be disabled by the browser. */ }
    }

    async function selectVideo(video: YouTubeVideo) {
        selected = video;
        notice = '';
        message = '';
        remember();
        await tick();
        panelElement?.focus({ preventScroll: true });
        panelElement?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }

    function errorText(code: string) {
        if (code.includes('invalid_query')) return copy.invalid;
        if (code.includes('busy') || code.includes('rate_exceeded')) return copy.busy;
        if (code.includes('timeout') || code.includes('timed_out')) return copy.timeout;
        return copy.error;
    }

    async function submit(value = input) {
        if (downloadBusy) return;
        searchController?.abort();
        const number = ++requestNumber;
        input = value;
        message = '';
        notice = '';
        const parsed = parseYouTubeInput(value);
        if (!parsed) { searching = false; message = copy.invalid; return; }
        selected = null;
        playlist = null;
        items = [];
        hasSearched = false;
        if (parsed.kind === 'video') {
            searching = false;
            await selectVideo({ id: parsed.id, url: parsed.url, title: `YouTube / ${parsed.id}`, channel: '', duration: null, thumbnail: `https://i.ytimg.com/vi/${parsed.id}/hqdefault.jpg` });
            return;
        }
        searching = true;
        resultQuery = parsed.kind === 'search' ? parsed.query : copy.playlist;
        const controller = new AbortController();
        searchController = controller;
        try {
            const { default: API } = await import('$lib/api/api');
            if (disposed || number !== requestNumber) return;
            if (parsed.kind === 'playlist') {
                const response = await API.expand(parsed.url);
                if (disposed || number !== requestNumber) return;
                if (!response || response.status === 'error') { message = copy.error; return; }
                playlist = response;
                const seen = new Set<string>();
                items = response.items.flatMap(item => {
                    const video = parseYouTubeInput(item.url);
                    if (video?.kind !== 'video' || item.availability === 'platform_restricted' || seen.has(video.id)) return [];
                    seen.add(video.id);
                    return [{
                        id: video.id, url: video.url, title: item.title || `YouTube / ${video.id}`,
                        channel: '', duration: item.duration ?? null,
                        thumbnail: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
                    }];
                });
            } else {
                const response = await API.searchYouTube(parsed.query, controller.signal);
                if (disposed || number !== requestNumber) return;
                if (response.status === 'error') { message = errorText(response.error.code); return; }
                items = response.items;
            }
            hasSearched = true;
        } catch {
            if (!controller.signal.aborted && !disposed && number === requestNumber) message = copy.error;
        } finally {
            if (!disposed && number === requestNumber) searching = false;
        }
    }

    async function paste() {
        try { input = await navigator.clipboard.readText(); inputElement?.focus(); }
        catch { message = copy.clipboard; inputElement?.focus(); }
    }

    function clear() {
        searchController?.abort();
        requestNumber++;
        input = '';
        items = [];
        selected = null;
        playlist = null;
        searching = false;
        hasSearched = false;
        message = '';
        notice = '';
        try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
        inputElement?.focus();
    }

    async function downloadSelected() {
        if (!selected || downloadBusy) return;
        downloadBusy = true;
        notice = '';
        remember();
        try {
            const { loadTranslations } = await import('$lib/i18n/translations');
            await Promise.all(['save', 'button', 'dialog', 'error', 'auth', 'queue'].map(key => loadTranslations(lang, key)));
            const { savingHandler, buildSaveRequest } = await import('$lib/api/saving-handler');
            const request = {
                ...buildSaveRequest(selected.url), downloadMode: mode, videoQuality: quality,
                youtubeVideoCodec: 'h264' as const, youtubeVideoContainer: 'mp4' as const,
                audioFormat, audioBitrate, convertGif: false,
            };
            const response = await savingHandler({ request });
            if (response && response.status !== 'error') notice = copy.started;
        } catch { message = copy.downloadError; }
        finally { if (!disposed) downloadBusy = false; }
    }

    async function downloadPlaylist() {
        if (!playlist || !items.length || downloadBusy) return;
        downloadBusy = true;
        remember();
        try {
        const { loadTranslations, t } = await import('$lib/i18n/translations');
        await Promise.all(['button', 'dialog', 'error', 'auth'].map(key => loadTranslations(lang, key)));
        const { createDialog } = await import('$lib/state/dialogs');
        const { get } = await import('svelte/store');
        const { default: serverInfo } = await import('$lib/state/server-info');
        const configuredMax = get(serverInfo)?.info.cobalt.batchMaxItems;
        const max = typeof configuredMax === 'number' && configuredMax >= 0 ? Math.floor(configuredMax) : 20;
        if (max > 0 && items.length > max) {
            createDialog({
                id: 'youtube-playlist-limit', type: 'small', meowbalt: 'error',
                title: get(t)('dialog.batch.limit.title'),
                bodyText: get(t)('dialog.batch.limit.body', { count: items.length, max }),
                buttons: [{ text: get(t)('button.gotit'), main: true, action: () => {} }],
            });
            return;
        }
        const allowedIds = new Set(items.map(item => item.id));
        createDialog({
            id: 'youtube-playlist', type: 'batch', title: playlist.title || copy.playlist,
            items: playlist.items.filter(item => {
                const video = parseYouTubeInput(item.url);
                return video?.kind === 'video' && allowedIds.delete(video.id);
            }), collectionKey: playlist.collectionKey,
            collectionSourceUrl: input.trim(),
            downloadMode: mode,
        });
        } catch { message = copy.downloadError; }
        finally { if (!disposed) downloadBusy = false; }
    }

    onMount(() => {
        try {
            const state = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
            if (state && typeof state.input === 'string') {
                input = state.input;
                const video = parseYouTubeInput(state.selected?.url || '');
                if (video?.kind === 'video') selected = {
                    id: video.id, url: video.url, thumbnail: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
                    title: typeof state.selected.title === 'string' ? state.selected.title.slice(0, 300) : `YouTube / ${video.id}`,
                    channel: typeof state.selected.channel === 'string' ? state.selected.channel.slice(0, 150) : '',
                    duration: typeof state.selected.duration === 'number' ? state.selected.duration : null,
                };
                if (['auto', 'audio', 'mute'].includes(state.mode)) mode = state.mode;
                if (['max', '2160', '1440', '1080', '720', '480', '360'].includes(state.quality)) quality = state.quality;
                if (['mp3', 'best', 'opus', 'wav'].includes(state.audioFormat)) audioFormat = state.audioFormat;
                if (['128', '256', '320'].includes(state.audioBitrate)) audioBitrate = state.audioBitrate;
            }
        } catch {}
        const url = $page.url.searchParams.get('url');
        const query = $page.url.searchParams.get('q');
        if (url || query) void submit(url || query || '');
        void import('$lib/api/server-info').then(({ getServerInfo }) => getServerInfo());
    });

    onDestroy(() => { disposed = true; requestNumber++; searchController?.abort(); });
</script>

<main class="youtube-page" tabindex="-1" data-first-focus data-focus-ring-hidden>
    <header class="hero">
        <div class="hero-copy">
            <p class="eyebrow"><span class="brand-mark" aria-hidden="true">▶</span> {copy.eyebrow}</p>
            <h1>{content.h1}</h1>
            <p class="hero-line">{copy.intro}</p>
            <p class="description">{copy.description}</p>
        </div>
        <div class="hero-art" aria-hidden="true">
            <div class="art-card art-back"><span>SHORTS</span><i></i><i></i><i></i></div>
            <div class="art-card art-front"><span>YOUTUBE</span><b>▶</b><div><span>MP4</span><span>MP3</span><span>HD</span></div></div>
        </div>
    </header>

    <section class="search-box" aria-label={copy.input}>
        <form on:submit|preventDefault={() => submit()}>
            <label for="youtube-query">{copy.input}</label>
            <div class="input-row">
                <span class="search-icon" aria-hidden="true">⌕</span>
                <input id="youtube-query" bind:this={inputElement} bind:value={input} placeholder={copy.placeholder} autocomplete="off" maxlength="2048" disabled={downloadBusy} aria-describedby="youtube-search-note" />
                {#if input}<button type="button" class="utility" on:click={clear} disabled={downloadBusy} aria-label={copy.clear}>×</button>
                {:else}<button type="button" class="utility paste" on:click={paste}>{copy.paste}</button>{/if}
                <button class="primary search-submit" type="submit" disabled={!input.trim() || searching || downloadBusy}>{searching ? copy.searching : submitLabel}<span aria-hidden="true">↗</span></button>
            </div>
        </form>
        <div class="examples"><span>{copy.try}</span>{#each examples as example}<button disabled={searching || downloadBusy} on:click={() => submit(example)}>{example}<span aria-hidden="true">↗</span></button>{/each}</div>
        <p class="search-note" id="youtube-search-note">{copy.searchNote}</p>
    </section>

    {#if message}<p class="error" role="alert">{message}</p>{/if}

    {#if selected}
        <section class="download-panel" bind:this={panelElement} tabindex="-1" aria-labelledby="youtube-selected-heading">
            <div class="selected-media"><img src={selected.thumbnail} alt="" /><span class="duration">{formatYouTubeDuration(selected.duration)}</span></div>
            <div class="download-controls">
                <div class="panel-heading"><p class="eyebrow">{copy.selected}</p><button class="text-button" disabled={downloadBusy} on:click={() => { selected = null; remember(); notice = ''; inputElement?.focus(); }}>{copy.change}</button></div>
                <h2 id="youtube-selected-heading">{selected.title}</h2>
                {#if selected.channel}<p class="channel">{selected.channel}</p>{/if}
                <fieldset class="mode-options" disabled={downloadBusy}><legend class="sr-only">{copy.choose}</legend>
                    {#each [['auto', copy.video], ['audio', copy.audio], ['mute', copy.mute]] as option}
                        <label class:active={mode === option[0]}><input type="radio" name="youtube-mode" value={option[0]} bind:group={mode} />{option[1]}</label>
                    {/each}
                </fieldset>
                <div class="format-options">
                    {#if mode === 'audio'}
                        <label>{copy.format}<select bind:value={audioFormat} disabled={downloadBusy}><option value="mp3">MP3</option><option value="best">M4A / Opus</option><option value="opus">Opus</option><option value="wav">WAV</option></select></label>
                        {#if audioFormat === 'mp3'}<label>{copy.bitrate}<select bind:value={audioBitrate} disabled={downloadBusy}><option value="128">128 kbps</option><option value="256">256 kbps</option><option value="320">320 kbps</option></select></label>{/if}
                    {:else}
                        <label>{copy.quality}<select bind:value={quality} disabled={downloadBusy}><option value="max">{copy.best}</option><option value="2160">2160p / 4K</option><option value="1440">1440p / 2K</option><option value="1080">1080p / Full HD</option><option value="720">720p / HD</option><option value="480">480p</option><option value="360">360p</option></select></label>
                        <p class="format-tag">MP4 <span>H.264</span></p>
                    {/if}
                </div>
                <p class="muted">{copy.sourceNote}</p>
                <div class="download-actions"><button class="primary" disabled={downloadBusy} on:click={downloadSelected}>{downloadBusy ? copy.downloading : copy.download}<span aria-hidden="true">↓</span></button><a href={selected.url} target="_blank" rel="noopener noreferrer nofollow">{copy.watch} ↗</a></div>
                {#if notice}<p class="notice" role="status">{notice}</p>{/if}
            </div>
        </section>
    {/if}

    {#if searching || hasSearched}
        <section class="results" aria-labelledby="youtube-results-heading" aria-busy={searching}>
            <div class="section-heading"><div><p class="eyebrow">{playlist ? copy.playlist : copy.results}</p><h2 id="youtube-results-heading">{resultQuery}</h2></div>{#if !searching}<span>{items.length}</span>{/if}{#if playlist && items.length}<button class="secondary" on:click={downloadPlaylist} disabled={downloadBusy}>{copy.batch}</button>{/if}</div>
            {#if searching}<p role="status" class="muted">{copy.searching}</p><div class="video-grid">{#each [1,2,3,4,5,6] as index}<div class="skeleton" aria-hidden="true"><div></div><i></i><i></i></div>{/each}</div>
            {:else if !items.length}<div class="empty"><h3>{copy.empty}</h3><p>{copy.emptyBody}</p></div>
            {:else}<p class="muted">{copy.choose}</p><div class="video-grid">{#each items as video (video.id)}<button class="video-card" class:chosen={selected?.id === video.id} on:click={() => selectVideo(video)} disabled={downloadBusy} aria-label={`${copy.select}: ${video.title}`} aria-pressed={selected?.id === video.id}><div class="thumbnail"><img src={video.thumbnail} alt="" loading="lazy" /><span class="duration">{formatYouTubeDuration(video.duration)}</span><span class="card-play" aria-hidden="true">▶</span></div><div class="card-copy"><h3>{video.title}</h3><p>{video.channel}</p><span class="card-action">{selected?.id === video.id ? copy.selected : copy.select}<b aria-hidden="true">↗</b></span></div></button>{/each}</div>{/if}
        </section>
    {:else if !selected}<section class="empty initial"><span class="empty-mark" aria-hidden="true">▶</span><h2>{copy.ready}</h2><p>{copy.readyBody}</p></section>{/if}

    <section class="steps" aria-label={copy.guide}>{#each [[copy.step1,copy.step1Body],[copy.step2,copy.step2Body],[copy.step3,copy.step3Body]] as step,index}<article><span class="step-number">0{index+1}</span><div><h2>{step[0]}</h2><p>{step[1]}</p></div></article>{/each}</section>
    <section class="faq"><div class="section-heading"><h2>{content.faqTitle}</h2><span>FAQ</span></div>{#each content.faqs as faq}<details><summary>{faq.q}<span aria-hidden="true">+</span></summary><p>{faq.a}</p></details>{/each}</section>
    <footer><h2>{copy.related}</h2><div>{#if guideSlug}<a href={`/${lang}/guide/${guideSlug}`}>{copy.guide} ↗</a>{/if}<a href={`/${lang}/download/youtube-shorts-download`}>{copy.shorts} ↗</a><a href={`/${lang}/download`}>{copy.tools} ↗</a></div></footer>
</main>

<style>
    .youtube-page { --yt-accent:#d83d32; --yt-soft:color-mix(in srgb,var(--popup-bg) 92%,#f3c7a1); --yt-line:color-mix(in srgb,var(--button-stroke) 75%,#999); width:100%;max-width:1160px;padding:22px 24px 64px;color:var(--text);font-family:Arial,Helvetica,sans-serif; }
    .hero { display:grid;grid-template-columns:1.5fr 1fr;align-items:center;gap:48px;padding:30px 0 40px; }
    .eyebrow { color:var(--yt-accent);font-size:11px;font-weight:700;letter-spacing:.14em;line-height:1.5;margin:0 0 16px; }
    .brand-mark { display:inline-grid;place-items:center;width:27px;height:20px;background:var(--yt-accent);border-radius:6px;color:white;margin-right:8px;font-size:12px; }
    h1 { font-size:clamp(32px,4vw,52px);font-weight:750;letter-spacing:-.045em;line-height:1.12;margin:0;max-width:740px; }
    .hero-line { font-size:22px;line-height:1.4;margin:20px 0 12px;letter-spacing:-.025em; }
    .description { color:var(--subtext);font-size:15px;line-height:1.75;max-width:590px;margin:0; }
    .hero-art { position:relative;height:220px; }
    .art-card { position:absolute; width:250px;height:173px; border:1px solid var(--yt-line);border-radius:18px;padding:18px;box-shadow:0 16px 35px #0000000c; }
    .art-back { right:45px;top:0;transform:rotate(-10deg);background:var(--yt-soft); }
    .art-back span,.art-front>span { font-size:10px;font-weight:700;letter-spacing:.13em; }
    .art-back i { display:inline-block;background:color-mix(in srgb,var(--yt-accent) 18%,var(--popup-bg));width:52px;height:90px;border-radius:9px;margin:15px 9px 0 0; }
    .art-front { right:0;top:40px;transform:rotate(7deg);background:var(--popup-bg); }
    .art-front b { display:grid;place-items:center;font-size:38px;color:white;background:var(--yt-accent);border-radius:16px;width:90px;height:65px;margin:14px auto; }
    .art-front div { display:flex;justify-content:center;gap:8px; }
    .art-front div span { border:1px solid var(--yt-line);border-radius:4px;padding:3px 8px;font-size:10px; }
    .search-box { background:var(--popup-bg);border:1px solid var(--yt-line);border-radius:20px;padding:26px;box-shadow:0 12px 40px #00000006; }
    form>label { display:block;font-size:13px;font-weight:700;margin-bottom:12px; }
    .input-row { display:flex;align-items:center;border:1px solid var(--yt-line);border-radius:12px;padding:7px;gap:8px;background:var(--background); }
    .input-row:focus-within { border-color:var(--yt-accent);box-shadow:0 0 0 3px #d83d3218; }
    .search-icon { font-size:30px;margin:0 4px 0 10px;color:var(--subtext); }
    input:not([type=radio]) { min-width:0;flex:1;background:transparent;border:0;color:var(--text);padding:10px 0;font:inherit;font-size:15px;outline:0; }
    button,a,select { -webkit-tap-highlight-color:transparent; }
    button { font:inherit;cursor:pointer; }
    button:disabled { cursor:default;opacity:.6; }
    .primary { display:inline-flex;justify-content:center;align-items:center;gap:18px;border:0;background:var(--yt-accent);color:#fff;font-size:14px;font-weight:700;border-radius:9px;padding:15px 22px;min-height:48px; }
    .primary:hover:not(:disabled) { background:#b92d26; }
    .utility { background:transparent;border:0;color:var(--subtext);padding:8px;font-size:24px; }
    .paste { font-size:12px; }
    .examples { display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:17px; }
    .examples>span { font-size:12px;color:var(--subtext);margin-right:5px; }
    .examples button { display:flex;gap:14px;font-size:12px;background:var(--yt-soft);color:var(--text);border:1px solid transparent;border-radius:20px;padding:7px 12px; }
    .examples button:hover { border-color:var(--yt-accent); }
    .search-note,.muted { font-size:12px;color:var(--subtext);line-height:1.7; }
    .search-note { margin:16px 0 0; }
    .error { padding:16px 20px;background:#d83d3212;border:1px solid #d83d3240;border-radius:12px;color:var(--text);line-height:1.6; }
    .download-panel { display:grid;grid-template-columns:1fr 1.4fr;gap:30px;background:var(--popup-bg);border:1px solid var(--yt-line);border-radius:20px;padding:25px;margin-top:30px;scroll-margin:20px; }
    .selected-media { position:relative;align-self:start;border-radius:12px;overflow:hidden;aspect-ratio:16/9;background:var(--yt-soft); }
    .selected-media img,.thumbnail img { width:100%;height:100%;object-fit:cover; }
    .duration { position:absolute;bottom:10px;right:10px;font-size:12px;color:#fff;background:#151515dd;border-radius:4px;padding:4px 6px; }
    .duration:empty { display:none; }
    .panel-heading { display:flex;align-items:center;justify-content:space-between;gap:10px; }
    .panel-heading .eyebrow { margin:0; }
    .text-button { border:0;background:transparent;color:var(--subtext);font-size:11px;padding:6px; }
    .download-controls h2 { font-size:20px;line-height:1.5;letter-spacing:-.02em;margin:12px 0;overflow-wrap:anywhere; }
    .channel { color:var(--subtext);font-size:13px; }
    .mode-options { display:flex;gap:5px;border:0;border-radius:10px;padding:5px;margin:20px 0;background:var(--yt-soft); }
    .mode-options label { flex:1;position:relative;font-size:12px;text-align:center;padding:10px 4px;cursor:pointer;border:1px solid transparent;border-radius:7px; }
    .mode-options input { position:absolute;opacity:0;width:1px;height:1px; }
    .mode-options label.active { color:var(--yt-accent);background:var(--popup-bg);border-color:var(--yt-line);font-weight:700; }
    .mode-options label:focus-within { outline:2px solid var(--yt-accent); }
    .format-options { display:flex;gap:15px;align-items:end; }
    .format-options label { display:grid;gap:8px;font-size:12px;flex:1; }
    select { width:100%;font:inherit;color:var(--text);border:1px solid var(--yt-line);border-radius:8px;background:var(--popup-bg);padding:12px; }
    .format-tag { font-size:13px;font-weight:700;border:1px solid var(--yt-line);padding:12px;border-radius:8px;margin:0; }
    .format-tag span { color:var(--subtext);font-weight:400;margin-left:8px; }
    .download-actions { display:flex;align-items:center;gap:20px;margin-top:18px; }
    .download-actions .primary { flex:1; }
    .download-actions a { color:var(--subtext);font-size:12px; }
    .notice { color:var(--text);background:var(--yt-soft);padding:12px;border-radius:8px;font-size:13px;line-height:1.6; }
    .results { margin:38px 0; }
    .section-heading { display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px; }
    .section-heading .eyebrow { margin-bottom:6px; }
    .section-heading h2 { font-size:24px;letter-spacing:-.025em;margin:0;overflow-wrap:anywhere; }
    .section-heading>span { color:var(--subtext);font-size:12px;border:1px solid var(--yt-line);border-radius:20px;padding:6px 12px; }
    .video-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;margin-top:20px; }
    .video-card { display:block;width:100%;overflow:hidden;padding:0;text-align:left;background:var(--popup-bg);color:var(--text);border:1px solid var(--yt-line);border-radius:13px;transition:transform .15s,border-color .15s; }
    .video-card:hover:not(:disabled) { transform:translateY(-3px);border-color:var(--yt-accent); }
    .video-card.chosen { border-color:var(--yt-accent);box-shadow:0 0 0 2px #d83d3218; }
    .thumbnail { position:relative;aspect-ratio:16/9;background:var(--yt-soft); }
    .card-play { display:grid;place-items:center;position:absolute;inset:0;color:white;background:#00000010;font-size:24px;opacity:0; }
    .video-card:hover .card-play { opacity:1; }
    .card-copy { padding:15px; }
    .card-copy h3 { margin:0;font-size:14px;line-height:1.6;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:45px; }
    .card-copy p { color:var(--subtext);font-size:12px;margin:10px 0 16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
    .card-action { display:flex;justify-content:space-between;gap:10px;color:var(--yt-accent);font-size:12px;font-weight:700; }
    .skeleton { padding-bottom:15px;background:var(--popup-bg);border:1px solid var(--yt-line);border-radius:13px;overflow:hidden; }
    .skeleton div { aspect-ratio:16/9;background:var(--yt-soft); }
    .skeleton i { display:block;background:var(--yt-soft);height:12px;width:80%;margin:15px; }
    .skeleton i:last-child { width:45%; }
    .empty { text-align:center;padding:48px 20px;color:var(--subtext); }
    .empty h2,.empty h3 { color:var(--text);font-size:20px;letter-spacing:-.02em; }
    .empty p { font-size:14px;line-height:1.7; }
    .empty-mark { display:inline-grid;place-items:center;width:50px;height:42px;border-radius:12px;background:var(--yt-soft);color:var(--yt-accent);font-size:19px; }
    .steps { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid var(--yt-line);border-bottom:1px solid var(--yt-line);padding:28px 0;gap:28px;margin-top:30px; }
    .steps article { display:flex;gap:15px; }
    .step-number { color:var(--yt-accent);font-size:12px;font-weight:700;padding-top:4px; }
    .steps h2 { font-size:16px;margin:0 0 8px; }
    .steps p { color:var(--subtext);font-size:13px;line-height:1.7;margin:0; }
    .faq { margin:42px 0; }
    details { border-bottom:1px solid var(--yt-line); }
    summary { display:flex;justify-content:space-between;gap:20px;padding:20px 0;cursor:pointer;font-size:14px;line-height:1.6;list-style:none; }
    summary::-webkit-details-marker { display:none; }
    summary span { color:var(--yt-accent);font-size:20px; }
    details p { color:var(--subtext);font-size:13px;line-height:1.9;margin:0 0 22px;max-width:850px; }
    footer { background:var(--yt-soft);padding:25px;border-radius:15px; }
    footer h2 { font-size:14px;margin:0 0 16px; }
    footer div { display:flex;flex-wrap:wrap;gap:20px; }
    footer a { color:var(--text);font-size:13px; }
    .secondary { border:1px solid var(--yt-line);border-radius:8px;padding:10px;background:var(--popup-bg);color:var(--text);font-size:12px; }
    .sr-only { position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap; }
    button:focus-visible,a:focus-visible,summary:focus-visible,select:focus-visible { outline:2px solid var(--yt-accent);outline-offset:4px; }
    @media(max-width:900px) { .hero { gap:20px;grid-template-columns:1.8fr 1fr; }.hero-art { transform:scale(.8);transform-origin:right center; }.download-panel { grid-template-columns:1fr 1.5fr;gap:20px; }.video-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    @media(max-width:600px) { .youtube-page { padding:12px 4px 36px; }.hero { display:block;padding:20px 4px 26px; }.hero-art { display:none; }.hero-line { font-size:18px;margin-top:16px; }.search-box { padding:18px 14px;border-radius:15px; }.input-row { flex-wrap:wrap; }.input-row input { width:calc(100% - 90px); }.search-submit { width:100%; }.search-icon { margin-left:4px; }.examples { gap:6px; }.examples>span { width:100%;margin-bottom:4px; }.examples button { padding:7px 9px;gap:8px; }.download-panel { grid-template-columns:1fr;padding:16px;gap:18px; }.video-grid { gap:12px; }.card-copy { padding:11px; }.card-copy h3 { font-size:12px;min-height:39px; }.card-copy p,.card-action { font-size:11px; }.steps { grid-template-columns:1fr;gap:22px; }.download-actions { flex-wrap:wrap; }.download-actions .primary { min-width:65%; }.section-heading h2 { font-size:20px; }.section-heading { flex-wrap:wrap; }.duration { font-size:10px;bottom:6px;right:6px; } }
    @media(prefers-reduced-motion:reduce) { .video-card { transition:none; }.video-card:hover:not(:disabled) { transform:none; } }
</style>
