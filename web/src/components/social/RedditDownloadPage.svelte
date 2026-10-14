<script lang="ts">
    import SourceDownloadForm from '$components/social/SourceDownloadForm.svelte';
    import type { SeoLandingLocaleContent } from '$lib/seo/landing-pages';
    export let lang: string;
    export let content: SeoLandingLocaleContent;
    export let guideSlug: string | null;
</script>

<main class="reddit-page" tabindex="-1" data-first-focus data-focus-ring-hidden>
    <header>
        <p class="eyebrow">FreeSaveVideo / Reddit</p>
        <h1>{content.h1}</h1>
        <p class="lede">{content.lede}</p>
    </header>
    <section class="download-desk" aria-label={content.h1}>
        <SourceDownloadForm platform="reddit" {lang} hint={content.steps[0]} />
        <div class="url-shapes"><code>reddit.com/r/…/comments/…</code><code>reddit.com/r/…/s/…</code><code>redd.it/…</code></div>
    </section>
    <section class="audio-story" aria-labelledby="reddit-audio-title">
        <h2 id="reddit-audio-title">{content.featuresTitle}</h2>
        <div class="track-flow">
            {#each content.features as title, index}
                <article>
                    <span class="track-number" aria-hidden="true">0{index + 1}</span>
                    <h3>{title}</h3><p>{content.facts?.[index]}</p>
                </article>
            {/each}
        </div>
    </section>
    <div class="reading-desk">
        <section class="walkthrough"><h2>{content.stepsTitle}</h2><ol>{#each content.steps as step}<li>{step}</li>{/each}</ol></section>
        <section class="questions" aria-labelledby="reddit-questions-title">
            <h2 id="reddit-questions-title">{content.faqTitle}</h2>
            {#each content.faqs as faq}<article><h3>{faq.q}</h3><p>{faq.a}</p></article>{/each}
        </section>
    </div>
    <footer>
        {#if guideSlug}<a href={`/${lang}/guide/${guideSlug}`}>{content.stepsTitle} ↗</a>{/if}
        <p>{content.disclaimer}</p>
    </footer>
</main>

<style>
    .reddit-page { --social-accent:var(--accent-strong); width:100%; max-width:1100px; box-sizing:border-box; padding:36px 22px 64px; color:var(--text); font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
    .reddit-page :global(*) { font-family:inherit; }
    header { max-width:820px; padding:12px 0 30px; }
    .eyebrow { font-size:13px; font-weight:650; letter-spacing:.06em; color:var(--subtext); }
    h1 { font-size:clamp(30px,4.5vw,48px); line-height:1.13; letter-spacing:-.035em; margin:16px 0; text-wrap:balance; }
    .lede { font-size:18px; line-height:1.8; color:var(--subtext); margin:0; }
    .download-desk { border:1px solid var(--button-stroke); border-top:4px solid var(--social-accent); border-radius:16px; padding:26px; background:var(--popup-bg); }
    .url-shapes { display:flex; gap:10px 22px; flex-wrap:wrap; padding-top:8px; color:var(--subtext); }
    code { font-size:12px; overflow-wrap:anywhere; }
    .audio-story { padding:38px 0 32px; }
    h2 { margin:0 0 24px; font-size:clamp(21px,2.4vw,28px); line-height:1.4; }
    .track-flow { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:28px; }
    .track-flow article { border-top:1px solid var(--button-stroke); padding-top:18px; }
    .track-number { color:var(--social-accent); font-size:13px; font-weight:700; }
    h3 { font-size:17px; line-height:1.5; margin:12px 0 10px; }
    p,li { line-height:1.8; }
    .track-flow p,.questions p { color:var(--subtext); margin:0; }
    .reading-desk { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,2fr); gap:44px; border-top:1px solid var(--button-stroke); padding-top:32px; }
    ol { padding-left:22px; } li { padding:0 0 20px 8px; }
    .questions article + article { margin-top:26px; }
    footer { margin-top:40px; border-top:1px solid var(--button-stroke); padding-top:24px; }
    footer p { color:var(--subtext); font-size:12px; } a { color:var(--text); text-underline-offset:4px; }
    @media(max-width:700px) { .reddit-page { padding:20px 16px 40px; } .download-desk { padding:18px; } .track-flow,.reading-desk { grid-template-columns:1fr; gap:24px; } .lede { font-size:16px; } }
</style>
