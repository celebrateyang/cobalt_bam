<script lang="ts">
    import SourceDownloadForm from '$components/social/SourceDownloadForm.svelte';
    import type { SeoLandingLocaleContent } from '$lib/seo/landing-pages';
    export let lang: string;
    export let content: SeoLandingLocaleContent;
    export let guideSlug: string | null;
</script>

<main class="pinterest-page" tabindex="-1" data-first-focus data-focus-ring-hidden>
    <div class="pin-workspace">
        <header>
            <p class="eyebrow">FreeSaveVideo / Pinterest</p>
            <h1>{content.h1}</h1><p class="lede">{content.lede}</p>
            <div class="pin-form"><SourceDownloadForm platform="pinterest" {lang} hint={content.steps[0]} /></div>
            <div class="url-shapes"><code>pinterest.com/pin/…</code><code>pin.it/…</code></div>
        </header>
        <aside aria-labelledby="pin-steps-title">
            <span class="pin-symbol" aria-hidden="true">↗</span>
            <h2 id="pin-steps-title">{content.stepsTitle}</h2>
            <ol>{#each content.steps as step}<li>{step}</li>{/each}</ol>
        </aside>
    </div>
    <section class="media-board" aria-labelledby="pin-media-title">
        <h2 id="pin-media-title">{content.featuresTitle}</h2>
        <div class="media-types">
            {#each content.features as title, index}
                <article class:video={index === 0}>
                    <div class="format-stamp" aria-hidden="true">{['MP4', 'JPG', 'GIF'][index]}</div>
                    <h3>{title}</h3><p>{content.facts?.[index]}</p>
                </article>
            {/each}
        </div>
    </section>
    <section class="pin-questions" aria-labelledby="pin-questions-title">
        <h2 id="pin-questions-title">{content.faqTitle}</h2>
        {#each content.faqs as faq}<details open><summary>{faq.q}</summary><p>{faq.a}</p></details>{/each}
    </section>
    <footer>
        {#if guideSlug}<a href={`/${lang}/guide/${guideSlug}`}>{content.stepsTitle} ↗</a>{/if}
        <p>{content.disclaimer}</p>
    </footer>
</main>

<style>
    .pinterest-page { --social-accent:var(--accent-strong); width:100%; max-width:1100px; box-sizing:border-box; padding:36px 22px 64px; color:var(--text); font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
    .pinterest-page :global(*) { font-family:inherit; }
    .pin-workspace { display:grid; grid-template-columns:minmax(0,1.7fr) minmax(0,1fr); gap:32px; align-items:start; padding:12px 0 38px; }
    .eyebrow { font-size:13px; font-weight:650; letter-spacing:.06em; color:var(--subtext); }
    h1 { font-size:clamp(30px,4.5vw,46px); line-height:1.13; letter-spacing:-.035em; margin:16px 0; text-wrap:balance; }
    .lede { font-size:17px; line-height:1.8; color:var(--subtext); }
    .pin-form { margin-top:26px; }
    .url-shapes { display:flex; gap:12px 22px; flex-wrap:wrap; color:var(--subtext); font-size:12px; }
    code { overflow-wrap:anywhere; }
    aside { border-radius:26px; border:1px solid var(--button-stroke); background:var(--popup-bg); padding:28px; margin-top:8px; }
    .pin-symbol { display:inline-grid; place-items:center; width:44px; height:44px; border-radius:50%; background:var(--accent-background); color:var(--social-accent); font-size:24px; margin-bottom:18px; }
    h2 { font-size:clamp(21px,2.4vw,27px); line-height:1.4; margin:0 0 22px; }
    ol { padding-left:22px; margin-bottom:0; } li { padding-left:6px; margin-bottom:16px; line-height:1.7; } li:last-child { margin:0; }
    .media-board { border-top:1px solid var(--button-stroke); padding-top:32px; }
    .media-types { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; align-items:start; }
    .media-types article { border-radius:20px; border:1px solid var(--button-stroke); padding:24px; background:var(--popup-bg); }
    .media-types .video { border-top:4px solid var(--social-accent); }
    .format-stamp { display:flex; align-items:center; height:60px; color:var(--subtext); font-weight:750; font-size:30px; letter-spacing:-.04em; }
    .video .format-stamp { color:var(--social-accent); }
    h3 { font-size:17px; line-height:1.5; margin:14px 0 10px; }
    p { line-height:1.8; } .media-types p { color:var(--subtext); margin:0; }
    .pin-questions { margin-top:40px; max-width:820px; }
    details { border-top:1px solid var(--button-stroke); padding:18px 0; } summary { font-size:17px; font-weight:650; cursor:pointer; line-height:1.6; } details p { color:var(--subtext); margin:12px 0 0; }
    footer { margin-top:32px; border-top:1px solid var(--button-stroke); padding-top:24px; }
    footer p { color:var(--subtext); font-size:12px; } a { color:var(--text); text-underline-offset:4px; }
    @media(max-width:700px) { .pinterest-page { padding:20px 16px 40px; } .pin-workspace,.media-types { grid-template-columns:1fr; gap:20px; } aside { padding:22px; } }
</style>
