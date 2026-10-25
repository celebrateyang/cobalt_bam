<script lang="ts">
    import AparatDownloadForm from '$components/save/AparatDownloadForm.svelte';
    import { aparatUi, aparatUpdatedAt, aparatSlug } from '$lib/seo/aparat-landing';
    import { canonicalOrigin } from '$lib/seo/site';
    import { jsonLdScript } from '$lib/seo/json-ld';
    import type { SeoLandingLocaleContent } from '$lib/seo/landing-pages';
    export let lang = 'en';
    export let content: SeoLandingLocaleContent;
    $: ui = lang === 'fa' ? aparatUi.fa : aparatUi.en;
    $: canonical = `${canonicalOrigin}/${lang}/download/${aparatSlug}`;
    $: structuredData = {
        '@context': 'https://schema.org',
        '@graph': [
            { '@type': 'WebPage', '@id': `${canonical}#page`, url: canonical, name: content.metaTitle,
                description: content.metaDescription, inLanguage: lang, dateModified: aparatUpdatedAt,
                isPartOf: { '@type': 'WebSite', name: 'FreeSaveVideo', url: canonicalOrigin },
                mainEntity: { '@id': `${canonical}#app` },
                citation: ['https://www.aparat.com/shorts/2112380547795222528', 'https://www.aparat.com/playlist/531891'] },
            { '@type': 'WebApplication', '@id': `${canonical}#app`, name: content.h1, url: canonical,
                description: content.lede, applicationCategory: 'MultimediaApplication', operatingSystem: 'Web browser',
                inLanguage: ['en', 'fa'], featureList: content.features, browserRequirements: 'JavaScript enabled for downloading' },
            { '@type': 'FAQPage', '@id': `${canonical}#faq`, inLanguage: lang, mainEntity: content.faqs.map(faq => ({
                '@type': 'Question', name: faq.q, acceptedAnswer: { '@type': 'Answer', text: faq.a },
            })) },
            { '@type': 'HowTo', '@id': `${canonical}#how-to`, name: content.stepsTitle, inLanguage: lang,
                step: content.steps.map((text, i) => ({ '@type': 'HowToStep', position: i + 1, text })) },
            { '@type': 'BreadcrumbList', itemListElement: [
                { '@type': 'ListItem', position: 1, name: ui.home, item: `${canonicalOrigin}/en/download` },
                { '@type': 'ListItem', position: 2, name: content.h1, item: canonical },
            ] },
        ],
    };
</script>

<svelte:head>
    <meta property="og:locale" content={lang === 'fa' ? 'fa_IR' : 'en_US'} />
    <meta property="og:locale:alternate" content={lang === 'fa' ? 'en_US' : 'fa_IR'} />
    {@html jsonLdScript(structuredData)}
</svelte:head>

<div class="aparat-page" lang={lang} dir={lang === 'fa' ? 'rtl' : 'ltr'}>
    <header>
        <a class="brand" href="/en" dir="ltr">FreeSaveVideo<span class="brand-dot"></span></a>
        <nav aria-label={ui.language}>
            <a href="/en/download/aparat-video-downloader" lang="en" hreflang="en" aria-current={lang === 'en' ? 'page' : undefined}>English</a>
            <a href="/fa/download/aparat-video-downloader" lang="fa" hreflang="fa" aria-current={lang === 'fa' ? 'page' : undefined}>فارسی</a>
        </nav>
    </header>
    <main>
        <section class="hero" aria-labelledby="aparat-title">
            <div>
                <p class="eyebrow">{ui.eyebrow}</p>
                <h1 id="aparat-title">{content.h1}</h1>
                <p class="lede">{content.lede}</p>
                <ul class="tags">{#each content.heroTags || [] as tag}<li>{tag}</li>{/each}</ul>
            </div>
            <aside class="summary" aria-label={ui.summary}>
                <div class="file-icon" aria-hidden="true"><span>MP4</span><span class="play">▶</span></div>
                <dl>
                    <div><dt>{ui.result}</dt><dd>{ui.source}</dd></div>
                    <div><dt>{ui.quality}</dt><dd>{ui.qualityValue}</dd></div>
                    <div><dt>{ui.access}</dt><dd>{ui.accessValue}</dd></div>
                </dl>
            </aside>
        </section>

        <section class="download-card" aria-label={ui.label}><AparatDownloadForm {lang} /></section>
        <div class="facts">{#each content.facts || [] as fact}<p>{fact}</p>{/each}</div>

        <section class="section" aria-labelledby="aparat-links">
            <h2 id="aparat-links">{content.supportedLinksTitle}</h2>
            <div class="link-cards">{#each content.supportedLinks || [] as link, i}
                <article><span class="number" aria-hidden="true">0{i + 1}</span><h3>{link.title}</h3><p><bdi dir="ltr">{link.description.split(' — ')[0]}</bdi><span>{link.description.split(' — ').slice(1).join(' — ')}</span></p></article>
            {/each}</div>
        </section>

        <div class="two-column section">
            <section><h2>{content.stepsTitle}</h2><ol>{#each content.steps as step}<li>{step}</li>{/each}</ol></section>
            <section><h2>{content.featuresTitle}</h2><ul class="features">{#each content.features as feature}<li>{feature}</li>{/each}</ul></section>
        </div>

        {#each content.sections || [] as section}
            <section class="section prose"><h2>{section.title}</h2>{#each section.paragraphs as paragraph}<p>{paragraph}</p>{/each}</section>
        {/each}

        <section class="evidence section" aria-labelledby="aparat-evidence">
            <div><p class="eyebrow"><time datetime={aparatUpdatedAt}>{ui.reviewed}</time></p><h2 id="aparat-evidence">{ui.evidence}</h2></div>
            <div><p>{ui.evidenceBody}</p><div class="source-links">
                <a href="https://www.aparat.com/shorts/2112380547795222528" target="_blank" rel="noopener noreferrer">{ui.sampleVideo}</a>
                <a href="https://www.aparat.com/playlist/531891" target="_blank" rel="noopener noreferrer">{ui.samplePlaylist}</a>
            </div></div>
        </section>

        <section class="section faq" id="aparat-faq"><h2>{content.faqTitle}</h2>{#each content.faqs as faq}
            <details><summary>{faq.q}</summary><p>{faq.a}</p></details>
        {/each}</section>
        <section class="bottom-cta"><h2>{content.h1}</h2><a class="cta" href="#aparat-download">{ui.back}</a><p>{content.disclaimer}</p></section>
    </main>
    <footer><p>{ui.footer}</p><div><a href="/en/download">{ui.home}</a><a href="/en/about/privacy">{ui.privacy}</a><a href="/en/about/terms">{ui.terms}</a></div></footer>
</div>

<style>
    .aparat-page { width:100%; max-width:1140px; padding:8px 24px 48px; color:var(--text); font-family:Arial,Tahoma,sans-serif; text-align:start; }
    .aparat-page :global(*) { font-family:inherit; } .aparat-page :global(p),.aparat-page :global(li),.aparat-page :global(dd) { user-select:text; }
    header { display:flex; justify-content:space-between; align-items:center; gap:20px; padding:20px 0 30px; border-bottom:1px solid var(--button-stroke); }
    .brand { display:flex; align-items:center; gap:6px; font-weight:750; font-size:1.1rem; letter-spacing:-.04em; color:var(--text); }
    .brand-dot { width:7px; height:7px; background:#b21d50; border-radius:50%; }
    nav { display:flex; gap:4px; } nav a { padding:8px 14px; border-radius:24px; font-size:.85rem; color:var(--subtext); } nav a[aria-current='page'] { background:var(--button); color:var(--text); font-weight:650; }
    .hero { display:grid; grid-template-columns:minmax(0,1.7fr) minmax(250px,1fr); gap:56px; align-items:center; padding:58px 0 34px; }
    .eyebrow { color:#b21d50; font-size:.75rem; font-weight:700; letter-spacing:.08em; margin:0 0 16px; }
    h1 { font-size:clamp(2.3rem,4.6vw,3.7rem); font-weight:750; letter-spacing:-.045em; line-height:1.12; max-width:720px; text-wrap:balance; }
    .lede { font-size:1.08rem; line-height:1.85; color:var(--subtext); margin:22px 0; max-width:650px; }
    .tags { display:flex; flex-wrap:wrap; gap:8px; padding:0; list-style:none; } .tags li { border:1px solid var(--button-stroke); border-radius:20px; padding:7px 11px; font-size:.76rem; }
    .summary { padding:26px; border:1px solid var(--button-stroke); border-radius:24px; background:var(--button); }
    .file-icon { width:100px; height:108px; border-radius:16px 32px 16px 16px; border:1px solid rgba(178,29,80,.2); background:rgba(178,29,80,.07); display:flex; flex-direction:column; justify-content:space-between; padding:14px; color:#b21d50; font-weight:750; direction:ltr; }
    .play { align-self:flex-end; font-size:1.3rem; } dl { margin:24px 0 0; } dl div { padding:12px 0; border-top:1px solid var(--button-stroke); } dt { font-size:.73rem; color:var(--subtext); margin-bottom:6px; } dd { margin:0; font-size:.86rem; line-height:1.6; font-weight:600; }
    .download-card { padding:28px; border:1px solid var(--input-border); border-radius:18px; box-shadow:0 8px 36px rgba(0,0,0,.035); }
    .facts { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin:20px 0 36px; } .facts p { color:var(--subtext); font-size:.8rem; line-height:1.8; padding-inline-start:14px; border-inline-start:2px solid rgba(178,29,80,.45); }
    .section { padding:36px 0; border-top:1px solid var(--button-stroke); } h2 { font-size:1.65rem; letter-spacing:-.025em; font-weight:700; line-height:1.4; margin:0 0 24px; } h3 { font-size:1.08rem; font-weight:650; letter-spacing:0; line-height:1.6; }
    p,li { line-height:1.85; } .link-cards { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; } article { border:1px solid var(--button-stroke); border-radius:16px; padding:22px; } article p { color:var(--subtext); font-size:.86rem; overflow-wrap:anywhere; } .number { display:block; color:#b21d50; font-size:.75rem; font-weight:650; margin-bottom:20px; }
    .two-column { display:grid; grid-template-columns:1fr 1fr; gap:52px; } ol,.features { padding-inline-start:22px; margin:0; } ol li,.features li { padding-inline-start:6px; margin-bottom:16px; color:var(--subtext); font-size:.93rem; }
    .prose p { max-width:860px; color:var(--subtext); font-size:.96rem; } .evidence { display:grid; grid-template-columns:1fr 2fr; gap:40px; } .evidence p { color:var(--subtext); font-size:.87rem; margin-top:0; } .evidence .eyebrow { color:#b21d50; } .source-links { display:flex; flex-wrap:wrap; gap:12px 22px; font-size:.8rem; } .source-links a,footer a { color:var(--text); text-decoration:underline; text-underline-offset:4px; }
    details { padding:20px 0; border-bottom:1px solid var(--button-stroke); } summary { cursor:pointer; font-weight:600; line-height:1.7; } details p { color:var(--subtext); font-size:.91rem; max-width:860px; margin:14px 0 0; } .bottom-cta { text-align:center; background:var(--button); border-radius:22px; padding:38px 28px; margin:32px 0; } .bottom-cta h2 { font-size:1.6rem; } .cta { display:inline-flex; padding:14px 24px; border-radius:12px; background:#b21d50; color:white; font-weight:650; } .bottom-cta p { font-size:.8rem; color:var(--subtext); max-width:750px; margin:20px auto 0; }
    footer { display:flex; justify-content:space-between; align-items:center; gap:20px; padding-top:24px; color:var(--subtext); font-size:.75rem; } footer div { display:flex; gap:18px; flex-wrap:wrap; }
    [dir='rtl'] h1,[dir='rtl'] h2 { letter-spacing:0; line-height:1.65; } [dir='rtl'] .eyebrow { letter-spacing:0; } [dir='rtl'] .lede { line-height:2; } [dir='rtl'] .hero { gap:40px; }
    article bdi { display:block; font-size:.8rem; margin-block-end:8px; overflow-wrap:anywhere; }
    @media(max-width:850px) { .hero { gap:28px; grid-template-columns:minmax(0,1.4fr) minmax(220px,1fr); } .link-cards { grid-template-columns:1fr; } .two-column { gap:32px; } }
    @media(max-width:640px) { .aparat-page { padding:0 8px 32px; } header { padding:16px 0 22px; } .hero { grid-template-columns:1fr; padding:34px 0 24px; gap:20px; } h1 { font-size:2.35rem; } .summary { display:none; } .download-card { padding:20px 16px; } .facts,.two-column,.evidence { grid-template-columns:1fr; gap:16px; } .facts { margin-bottom:22px; } .facts p { margin:4px 0; } .section { padding:28px 0; } h2 { font-size:1.4rem; } footer { align-items:flex-start; flex-direction:column; gap:8px; } nav a { padding:7px 10px; } }
</style>
