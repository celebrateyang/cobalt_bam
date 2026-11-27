<script lang="ts">
    import { getAlternativeUi } from '$lib/seo/alternative-copy';
    import { getAlternativeLabels } from '$lib/seo/alternative-labels';
    import type { LearnPage } from '$lib/seo/learn-pages';

    export let lang = 'en';
    $: ui = getAlternativeUi(lang);
    $: labels = getAlternativeLabels(lang);
    export let article: LearnPage;
    export let relatedArticles: LearnPage[] = [];
    export let relatedDownloads: Array<{ slug: string; title: string; description: string }> = [];

    $: isCobalt = article.slug === 'cobalt-tools-alternative';
    $: isSaveFrom = article.slug === 'savefrom-alternative';
    $: intro = article.alternativeLanding?.intro ?? (isCobalt
        ? 'Your YouTube workflow, back on track. Save public videos, extract audio, or work through a playlist in your browser.'
        : 'A SaveFrom alternative with no pop-up ads. Paste your link, choose your output, and save. No ad clicks required.');
    $: downloadHref = article.alternativeLanding?.downloadHref ?? (isCobalt ? `/${lang}/download/youtube-download` : `/${lang}`);
    $: downloadAction = article.alternativeLanding?.action ?? (isCobalt ? 'Open YouTube downloader' : 'Open downloader');
    $: sectionLabels = lang !== 'en' || article.alternativeLanding ? [] : isCobalt
        ? ['The YouTube support gap', 'Video and audio formats', 'Work with playlists', 'Save your file', 'Is it right for you?']
        : ['Why switch?', 'Compare features', 'Download a video', 'YouTube formats', 'Facebook and Instagram', 'Save on your phone', 'Platforms and batch tasks', 'Is it right for you?'];
</script>

<main class="alternative-page" tabindex="-1" data-first-focus data-focus-ring-hidden>
    <nav class="breadcrumbs" aria-label={ui.toc}>
        <a href={`/${lang}`}>{lang === 'en' ? 'Home' : ui.home}</a><span aria-hidden="true">/</span>
        <a href={`/${lang}/learn`}>{lang === 'en' ? 'Learn' : ui.learn}</a><span aria-hidden="true">/</span>
        <span>{article.alternativeLanding?.name ?? (isCobalt ? 'Cobalt.tools alternative' : 'SaveFrom alternative')}</span>
    </nav>

    <article>
        <header class="hero">
            <div class="hero-copy">
                <p class="eyebrow"><span class="dot"></span> {lang === 'en' ? 'A different way to download' : ui.category}</p>
                <h1>{article.title}</h1>
                <p class="intro">{intro}</p>
                {#if isSaveFrom}
                    <form class="article-download" action={`/${lang}`} method="GET">
                        <label for="savefrom-video-link">{lang === 'en' ? 'Paste a public video link' : ui.paste}</label>
                        <div class="article-download-row">
                            <input id="savefrom-video-link" name="u" type="url" required placeholder="https://..." aria-describedby="savefrom-link-hint" />
                            <button class="cta" type="submit">{lang === 'en' ? 'Continue' : ui.continue} <span aria-hidden="true">&rarr;</span></button>
                        </div>
                        <p id="savefrom-link-hint">{lang === 'en' ? 'Opens FreeSaveVideo with your link ready to process.' : ui.hint}</p>
                    </form>
                {/if}
                <div class="hero-actions">
                    <a class="cta" href={downloadHref}>{downloadAction} <span aria-hidden="true">&rarr;</span></a>
                    <a class="text-link" href="#how-it-works">{lang === 'en' ? 'See how it works' : ui.how} <span aria-hidden="true">&darr;</span></a>
                </div>
                <div class="byline"><span class="author-mark" aria-hidden="true">F</span><a href={`/${lang}/about/general`} rel="author">FreeSaveVideo Learn</a><span class="separator" aria-hidden="true">&middot;</span><span>{article.readingTime}</span><span class="date">{lang === 'en' ? 'Updated' : ui.updated} <time datetime={article.updatedAt}>{article.updatedAt}</time></span></div>
            </div>

            <div class="workflow" aria-label={ui.how}>
                <div class="workflow-top"><span class="mini-mark" aria-hidden="true">F<span>&darr;</span></span><span>{lang === 'en' ? 'LINK IN. FILE OUT.' : ui.save}</span><span class="workflow-dots" aria-hidden="true">&bull; &bull; &bull;</span></div>
                <div class="link-example"><span class="link-symbol" aria-hidden="true">&#8599;</span><span>{isCobalt ? 'youtube.com/watch?v=...' : ui.paste}</span><span class="link-check" aria-hidden="true">&#10003;</span></div>
                <div class="flow-line" aria-hidden="true"></div>
                <div class="file-example">
                    <div class="play-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m9 6 9 6-9 6V6Z" fill="currentColor" /></svg></div>
                    <div><strong>{lang === 'en' ? (isCobalt ? 'Video or audio. Your choice.' : 'Your video, ready to save.') : `${ui.video} / ${ui.audio}`}</strong><span>{lang === 'en' ? 'Available formats depend on the source' : ui.formats}</span></div>
                    <span class="file-arrow" aria-hidden="true">&darr;</span>
                </div>
                <div class="workflow-steps" aria-hidden="true"><span><b>01</b> {lang === 'en' ? 'Paste' : ui.paste}</span><span><b>02</b> {lang === 'en' ? 'Choose' : ui.choose}</span><span><b>03</b> {lang === 'en' ? 'Save' : ui.save}</span></div>
                <p class="workflow-note">{lang === 'en' ? 'No pop-up ads. No ad clicks. Clear saving steps.' : ui.note}</p>
            </div>
        </header>

        <section class="quick-answer" id="quick-answer" aria-labelledby="quick-answer-title">
            <div class="quick-heading"><span class="eyebrow">{lang === 'en' ? 'The short version' : ui.learn}</span><h2 id="quick-answer-title">{lang === 'en' ? 'Quick answer' : ui.quick}</h2></div>
            <p>{article.summary}</p>
        </section>

        {#if isCobalt}
            <aside class="reading-suggestion" aria-label={ui.more}>
                <p>{lang === 'en' ? 'Comparing another browser downloader?' : ui.more}</p>
                <a href={`/${lang}/learn/savefrom-alternative`}>{lang === 'en' ? 'See the SaveFrom.net alternative for online video downloads' : labels[1]} <span aria-hidden="true">&rarr;</span></a>
            </aside>
        {/if}

        <div class="reading-layout">
            <aside class="contents">
                <nav aria-label={ui.toc}>
                    <p class="eyebrow">{lang === 'en' ? 'On this page' : ui.toc}</p>
                    {#each article.sections as section, index}
                        <a href={`#section-${index + 1}`}><span class="toc-number">0{index + 1}</span>{sectionLabels[index] ?? section.heading}</a>
                    {/each}
                    <a href="#comparison"><span class="toc-number">{String(article.sections.length + 1).padStart(2, '0')}</span>{lang === 'en' ? 'At a glance' : ui.compare}</a>
                    <a href="#questions"><span class="toc-number">{String(article.sections.length + 2).padStart(2, '0')}</span>{lang === 'en' ? 'Common questions' : ui.faq}</a>
                </nav>
                <div class="side-note"><span class="eyebrow">{lang === 'en' ? 'No pop-up ads' : ui.note}</span><p>{lang === 'en' ? 'No advertisement clicks required. Use the download result or the completed queue item Save control to save your file.' : article.table?.rows.at(-1)?.[1]}</p></div>
            </aside>

            <div class="reading-body">
                <section class="takeaways" aria-labelledby="takeaways-title">
                    <p class="eyebrow">{lang === 'en' ? 'Keep in mind' : ui.learn}</p><h2 id="takeaways-title">{lang === 'en' ? 'What to know before switching' : ui.compare}</h2>
                    <ul>{#each article.keyTakeaways as item}<li><span class="check" aria-hidden="true">&#10003;</span><span>{item}</span></li>{/each}</ul>
                </section>

                {#if article.workflows?.length}
                    <section class="workflow-options" aria-labelledby="workflows-title">
                        <p class="eyebrow">{lang === 'en' ? 'Put it to use' : ui.learn}</p><h2 id="workflows-title">{lang === 'en' ? 'Try the workflow you need' : ui.open}</h2>
                        <div class="workflow-grid">
                            {#each article.workflows as workflow}
                                <a class="workflow-card" href={workflow.href}>
                                    <h3>{workflow.title}</h3><p>{workflow.description}</p>
                                    <span>{workflow.action} <span aria-hidden="true">&rarr;</span></span>
                                </a>
                            {/each}
                        </div>
                    </section>
                {/if}

                {#each article.sections as section, index}
                    {#if index === (article.slug === 'savefrom-alternative' && lang === 'en' ? 2 : 1)}<div id="how-it-works" class="anchor"></div>{/if}
                    <section class="prose-section" id={`section-${index + 1}`}>
                        <div class="section-heading"><span class="section-number" aria-hidden="true">0{index + 1}</span><h2>{section.heading}</h2></div>
                        {#each section.body as paragraph}<p>{paragraph}</p>{/each}
                        {#if section.bullets?.length}<ul class="prose-list">{#each section.bullets as item}<li>{item}</li>{/each}</ul>{/if}
                    </section>
                {/each}

                {#if article.table}
                    <section class="prose-section comparison" id="comparison">
                        <p class="eyebrow">{lang === 'en' ? 'At a glance' : ui.compare}</p><h2>{lang === 'en' ? (isCobalt ? 'Choose the workflow that fits' : 'A clearer path to your download') : ui.compare}</h2>
                        <!-- Keyboard users need to focus this region to scroll the table. -->
                        <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
                        <div class="table-wrap" role="region" aria-label={ui.compare} tabindex="0">
                            <table>
                                <thead><tr>{#each article.table.headers as heading}<th scope="col">{heading}</th>{/each}</tr></thead>
                                <tbody>{#each article.table.rows as row}<tr>{#each row as cell, index}{#if index === 0}<th scope="row">{cell}</th>{:else}<td>{cell}</td>{/if}{/each}</tr>{/each}</tbody>
                            </table>
                        </div>
                        <p class="table-hint">{lang === 'en' ? 'On smaller screens, swipe the table to compare.' : ui.formats}</p>
                    </section>
                {/if}

                {#if article.sources?.length}
                    <section class="sources" aria-labelledby="sources-title"><h2 id="sources-title">{lang === 'en' ? 'Sources and verification' : ui.sources}</h2>{#each article.sources as source}<p><a href={source.href} rel="noreferrer noopener">{source.title} <span aria-hidden="true">&#8599;</span></a><span class="source-note">{source.note}</span></p>{/each}</section>
                {/if}

                <section class="prose-section questions" id="questions"><p class="eyebrow">{lang === 'en' ? 'A few useful answers' : ui.learn}</p><h2>{lang === 'en' ? 'Common questions' : ui.faq}</h2><div class="faq-list">{#each article.faqs as item}<details><summary>{item.q}<span class="plus" aria-hidden="true">+</span></summary><p>{item.a}</p></details>{/each}</div></section>
            </div>
        </div>

        <section class="closing-cta"><div><p class="eyebrow">{lang === 'en' ? 'Ready when you are' : ui.open}</p><h2>{lang === 'en' ? (isCobalt ? 'Start with one YouTube link.' : 'Your next download starts with a link.') : ui.paste}</h2><p>{lang === 'en' ? 'Choose a public video you own or have permission to save.' : ui.permission}</p></div><a class="cta" href={downloadHref}>{lang === 'en' ? (isCobalt ? 'Try YouTube downloader' : 'Try FreeSaveVideo') : ui.open} <span aria-hidden="true">&rarr;</span></a></section>
    </article>

    <section class="related" aria-labelledby="related-title"><div class="related-heading"><div><p class="eyebrow">{lang === 'en' ? 'Keep exploring' : ui.learn}</p><h2 id="related-title">{lang === 'en' ? 'Find your next step' : ui.more}</h2></div><a class="text-link" href={`/${lang}/learn`}>{lang === 'en' ? 'All guides' : ui.all} <span aria-hidden="true">&rarr;</span></a></div>
        <div class="related-grid">{#each relatedArticles as item}<a class="related-card" href={`/${lang}/learn/${item.slug}`}><span class="eyebrow">{lang === 'en' ? 'From the Learn library' : ui.learn} <span aria-hidden="true">&#8599;</span></span><h3>{item.title}</h3><p>{item.description}</p></a>{/each}</div>
        <div class="download-links"><span>{lang === 'en' ? 'Go straight to a downloader' : ui.open}</span>{#each relatedDownloads as item}<a href={`/${lang}/download/${item.slug}`}>{item.title} <span aria-hidden="true">&rarr;</span></a>{/each}</div>
    </section>
</main>

<style>
    h1, h2, h3, .link-example, .file-example { overflow-wrap: anywhere; }
    .workflow-steps { flex-wrap: wrap; }
    .workflow-steps span { min-width: 0; overflow-wrap: anywhere; }
    .alternative-page { --ink: var(--text, #282828); --muted: var(--subtext, #75757e); --line: color-mix(in srgb, var(--text) 13%, transparent); --green: var(--accent-strong, #4f7f1c); --tint: color-mix(in srgb, var(--accent) 9%, var(--background)); width: min(1160px, calc(100% - 64px)); margin: 0 auto; padding: 28px 0 80px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: var(--ink); line-height: 1.7; min-width: 0; }
    .alternative-page :global(*) { box-sizing: border-box; font-family: inherit; user-select: text; -webkit-user-select: text; }
    article, .hero-copy, .reading-body, .reading-layout, .comparison, .table-wrap, .related-grid, .related-card { min-width: 0; }
    a { color: inherit; text-decoration: none; } p { margin: 0 0 18px; } h1, h2, h3 { color: var(--ink); font-family: inherit; font-weight: 650; letter-spacing: -0.035em; text-wrap: balance; }
    h1 { font-size: clamp(34px, 4.1vw, 54px); line-height: 1.09; max-width: 730px; margin: 18px 0 22px; } h2 { font-size: clamp(23px, 2.3vw, 30px); line-height: 1.24; margin: 0 0 22px; } h3 { font-size: 23px; line-height: 1.3; }
    .breadcrumbs { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; color: var(--muted); margin-bottom: 38px; } .breadcrumbs a:hover { color: var(--green); }
    .hero { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); align-items: center; gap: 44px; padding: 14px 0 48px; }
    .eyebrow { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; line-height: 1.5; color: var(--green); margin: 0 0 12px; }
    .hero-copy > .eyebrow { display: flex; align-items: center; gap: 8px; } .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
    .intro { font-size: 17px; line-height: 1.75; color: var(--muted); max-width: 580px; }
    .hero-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 20px; margin: 28px 0; }
    .article-download { margin-top: 24px; }
    .article-download label { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600; }
    .article-download-row { display: flex; gap: 8px; }
    .article-download input { flex: 1; min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--background); color: var(--ink); font-size: 15px; }
    .article-download input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .article-download button { cursor: pointer; flex-shrink: 0; }
    .article-download > p { margin: 8px 0 0; font-size: 11px; color: var(--muted); }
    .reading-suggestion { border-bottom: 1px solid var(--line); padding-bottom: 24px; margin: -28px 0 36px; font-size: 13px; }
    .reading-suggestion p { margin: 0 0 4px; color: var(--muted); }
    .reading-suggestion a { color: var(--green); text-decoration: underline; text-underline-offset: 3px; }
    @media (max-width: 480px) { .article-download-row { flex-direction: column; } }
    .cta { display: inline-flex; justify-content: center; align-items: center; gap: 20px; padding: 13px 19px; background: #355b20; border: 1px solid #355b20; color: #fff; border-radius: 8px; font-size: 13px; font-weight: 650; line-height: 1.5; transition: background 160ms ease; } .cta:hover { background: #244315; } .cta span { font-size: 20px; line-height: 1; }
    .text-link { font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 9px; } .text-link:hover { color: var(--green); text-decoration: underline; text-underline-offset: 5px; }
    .byline { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 10px; color: var(--muted); } .author-mark { display: inline-grid; place-items: center; width: 23px; height: 23px; background: var(--tint); border-radius: 50%; color: var(--green); font-weight: 700; } .date { flex-basis: 100%; padding-left: 31px; }
    .workflow { padding: 28px; border: 1px solid var(--line); background: radial-gradient(ellipse at 80% 20%, color-mix(in srgb, var(--accent) 15%, transparent), transparent 70%), var(--button); border-radius: 18px; transform: rotate(1.5deg); }
    .workflow-top { display: flex; align-items: center; gap: 9px; font-size: 9px; font-weight: 650; letter-spacing: 0.1em; color: var(--muted); margin-bottom: 26px; } .mini-mark { color: var(--green); font-size: 23px; font-weight: 750; letter-spacing: -2px; } .mini-mark span { font-size: 18px; } .workflow-dots { margin-left: auto; letter-spacing: 2px; }
    .link-example { display: flex; align-items: center; gap: 10px; padding: 13px 12px; border: 1px solid var(--line); border-radius: 7px; background: var(--background); font-size: 11px; } .link-symbol { color: var(--muted); font-size: 20px; } .link-check { margin-left: auto; color: var(--green); }
    .flow-line { height: 24px; margin-left: 24px; border-left: 1px dashed var(--green); }
    .file-example { display: flex; align-items: center; gap: 12px; background: var(--background); border: 1px solid var(--line); border-radius: 10px; padding: 16px 12px; box-shadow: 0 8px 20px #00000005; } .file-example strong { display: block; font-size: 12px; line-height: 1.4; } .file-example div > span { display: block; margin-top: 4px; font-size: 9px; color: var(--muted); } .play-icon { display: grid; place-items: center; width: 40px; height: 48px; flex: 0 0 40px; border-radius: 6px; background: var(--tint); color: var(--green); } .play-icon svg { width: 23px; height: 23px; } .file-arrow { margin-left: auto; color: var(--green); font-size: 22px; }
    .workflow-steps { display: flex; justify-content: space-between; gap: 12px; margin-top: 26px; font-size: 10px; } .workflow-steps b { display: block; color: var(--green); font-size: 10px; margin-bottom: 3px; } .workflow-note { border-top: 1px solid var(--line); padding-top: 13px; margin: 18px 0 0; font-size: 9px; color: var(--muted); }
    .quick-answer { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 32px; background: var(--tint); border-left: 3px solid var(--accent); border-radius: 0 10px 10px 0; padding: 28px 32px; margin-bottom: 54px; } .quick-heading h2 { font-size: 23px; margin: 7px 0 0; } .quick-answer > p { font-size: 15px; margin: 0; }
    .reading-layout { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 64px; align-items: start; } .contents { position: sticky; top: 32px; } .contents nav > a { display: flex; gap: 12px; padding: 9px 0; color: var(--muted); font-size: 12px; line-height: 1.45; } .contents nav > a:hover { color: var(--green); } .toc-number { font-size: 9px; opacity: 0.7; padding-top: 2px; } .side-note { border-top: 1px solid var(--line); padding-top: 21px; margin-top: 25px; } .side-note p { font-size: 12px; color: var(--muted); line-height: 1.7; }
    .takeaways { padding-bottom: 30px; } .takeaways h2 { font-size: 24px; } .takeaways ul { display: grid; gap: 15px; padding: 0; margin: 0; list-style: none; } .takeaways li { display: flex; gap: 12px; font-size: 14px; line-height: 1.8; } .check { flex: 0 0 22px; display: grid; place-items: center; border-radius: 50%; width: 22px; height: 22px; margin-top: 2px; background: var(--tint); color: var(--green); font-size: 11px; }
    .workflow-options { margin: 0 0 34px; }
    .workflow-options h2 { font-size: 24px; }
    .workflow-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .workflow-card { display: flex; flex-direction: column; min-width: 0; padding: 20px 16px; border: 1px solid var(--line); border-radius: 10px; }
    .workflow-card:hover { border-color: var(--accent); background: var(--tint); }
    .workflow-card h3 { font-size: 17px; line-height: 1.4; margin: 0 0 12px; }
    .workflow-card p { font-size: 12px; color: var(--muted); line-height: 1.8; }
    .workflow-card > span { margin-top: auto; padding-top: 8px; font-size: 11px; font-weight: 600; color: var(--green); }
    @media (max-width: 1000px) { .workflow-grid { grid-template-columns: minmax(0, 1fr); } }
    .prose-section { padding: 34px 0; border-top: 1px solid var(--line); scroll-margin-top: 28px; } .section-heading { display: flex; align-items: baseline; gap: 13px; } .section-number { font-size: 11px; font-weight: 650; color: var(--green); flex: 0 0 auto; } .prose-section p { font-size: 15px; line-height: 1.9; } .prose-section p:last-child { margin-bottom: 0; } .prose-list { padding-left: 20px; font-size: 14px; line-height: 1.9; } .prose-list li + li { margin-top: 10px; } .prose-list li::marker { color: var(--accent); } .anchor { scroll-margin-top: 28px; }
    .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; } table { width: 100%; border-collapse: collapse; min-width: 540px; font-size: 12px; line-height: 1.7; } th, td { text-align: left; vertical-align: top; padding: 17px; border-bottom: 1px solid var(--line); } thead th { background: var(--tint); font-size: 10px; font-weight: 650; } tbody th { font-weight: 600; width: 22%; } tbody td:last-child { background: color-mix(in srgb, var(--accent) 4%, var(--background)); } tbody tr:last-child :is(th, td) { border-bottom: 0; } .table-hint { display: none; }
    .sources { border-left: 2px solid var(--line); padding: 4px 0 4px 20px; margin: 2px 0 34px; } .sources h2 { font-size: 15px; letter-spacing: -0.01em; margin-bottom: 12px; } .sources p { margin: 0; font-size: 12px; } .sources a { color: var(--green); text-decoration: underline; text-underline-offset: 3px; } .source-note { display: block; color: var(--muted); font-size: 11px; margin-top: 7px; }
    .faq-list { border-top: 1px solid var(--line); } details { border-bottom: 1px solid var(--line); } summary { cursor: pointer; list-style: none; display: flex; align-items: baseline; justify-content: space-between; gap: 20px; padding: 20px 0; font-size: 14px; font-weight: 600; line-height: 1.6; } summary::-webkit-details-marker { display: none; } .plus { flex: 0 0 auto; font-size: 20px; font-weight: 400; color: var(--green); transition: transform 160ms ease; } details[open] .plus { transform: rotate(45deg); } details > p { color: var(--muted); padding: 0 25px 22px 0; font-size: 14px; }
    .closing-cta { display: flex; align-items: center; justify-content: space-between; gap: 28px; background: var(--tint); border-radius: 14px; padding: 34px 40px; margin-top: 38px; } .closing-cta h2 { margin-bottom: 10px; font-size: 28px; } .closing-cta p:last-child { font-size: 13px; color: var(--muted); margin: 0; } .closing-cta .cta { flex: 0 0 auto; }
    .related { border-top: 1px solid var(--line); margin-top: 64px; padding-top: 30px; } .related-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 24px; } .related-heading h2 { margin: 0; } .related-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; } .related-card { border: 1px solid var(--line); padding: 25px; border-radius: 10px; transition: border-color 160ms ease, background 160ms ease; } .related-card:hover { border-color: var(--accent); background: var(--tint); } .related-card > .eyebrow { display: flex; justify-content: space-between; } .related-card h3 { margin: 12px 0; } .related-card p { font-size: 13px; color: var(--muted); margin: 0; }
    .download-links { display: flex; flex-wrap: wrap; gap: 10px 20px; font-size: 11px; padding-top: 24px; } .download-links > span { color: var(--muted); } .download-links a:hover { text-decoration: underline; } .download-links a { color: var(--green); }
    a:focus-visible, summary:focus-visible, .table-wrap:focus-visible { outline: 2px solid var(--accent); outline-offset: 5px; border-radius: 4px; }
    @media (min-width: 1300px) { .alternative-page { padding-top: 40px; } .hero { gap: 64px; padding-bottom: 60px; } }
    @media (max-width: 1000px) { .hero { gap: 26px; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); } .workflow { padding: 20px; } .reading-layout { grid-template-columns: 170px minmax(0, 1fr); gap: 32px; } .quick-answer { grid-template-columns: 150px minmax(0, 1fr); gap: 20px; } }
    @media (max-width: 760px) { .alternative-page { width: calc(100% - 40px); padding-top: 20px; } .breadcrumbs { margin-bottom: 28px; font-size: 11px; } .hero { grid-template-columns: minmax(0, 1fr); gap: 30px; padding: 0 0 36px; } h1 { font-size: 40px; max-width: 620px; } .intro { font-size: 16px; } .workflow { transform: none; padding: 22px; max-width: 500px; width: 100%; } .workflow-top { margin-bottom: 18px; } .workflow-steps { margin-top: 20px; } .workflow-note { margin-top: 15px; } .quick-answer { grid-template-columns: minmax(0, 1fr); gap: 14px; padding: 24px; margin-bottom: 32px; } .quick-heading { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; } .quick-heading .eyebrow { margin: 0; } .quick-heading h2 { margin: 0; } .reading-layout { grid-template-columns: minmax(0, 1fr); gap: 32px; } .contents { position: static; } .contents nav { display: flex; flex-wrap: wrap; gap: 0 20px; padding-bottom: 20px; border-bottom: 1px solid var(--line); } .contents nav > .eyebrow { flex-basis: 100%; } .contents nav > a { padding: 6px 0; font-size: 12px; } .side-note { display: none; } .prose-section { padding: 28px 0; } .closing-cta { flex-direction: column; align-items: flex-start; padding: 28px; } .related { margin-top: 42px; } }
    @media (max-width: 480px) { .alternative-page { width: calc(100% - 32px); } h1 { font-size: 34px; } .hero-actions { gap: 16px; margin: 24px 0; } .hero-actions .cta { width: 100%; } .workflow { border-radius: 12px; } .quick-answer { padding: 22px 20px; } .quick-answer > p { font-size: 14px; line-height: 1.85; } .section-heading { gap: 10px; } .prose-section p { font-size: 14px; } .table-hint { display: block; font-size: 11px !important; color: var(--muted); margin: 10px 0 0; } .related-grid { grid-template-columns: minmax(0, 1fr); } .related-heading { align-items: flex-end; } .related-heading h2 { font-size: 23px; } .related-heading > a { flex: 0 0 auto; } .closing-cta .cta { width: 100%; } }
    @media (prefers-reduced-motion: reduce) { .cta, .plus, .related-card { transition: none; } }
</style>
