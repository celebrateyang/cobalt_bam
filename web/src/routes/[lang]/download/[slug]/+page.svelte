<script lang="ts">
    import env from '$lib/env';
    import { getSeoLandingLocale } from '$lib/seo/landing-pages';

    import Omnibox from '$components/save/Omnibox.svelte';
    import SupportedServices from '$components/save/SupportedServices.svelte';

    export let data: {
        lang: string;
        slug: string;
        landing: import('$lib/seo/landing-pages').SeoLandingPage;
    };

    const fallbackHost = env.HOST || 'freesavevideo.online';

    $: localeContent = getSeoLandingLocale(data.landing, data.lang);
    $: canonicalUrl = `https://${fallbackHost}/${data.lang}/download/${data.slug}`;
    $: pageTitle = localeContent.metaTitle;
    $: pageDesc = localeContent.metaDescription;
    $: pageKeywords = localeContent.metaKeywords.join(',');
    $: faqJsonLd = canonicalUrl
        ? {
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: localeContent.faqs.map((item) => ({
                  '@type': 'Question',
                  name: item.q,
                  acceptedAnswer: {
                      '@type': 'Answer',
                      text: item.a,
                  },
              })),
          }
        : null;
</script>

<svelte:head>
    <title>{pageTitle}</title>
    <meta name="description" content={pageDesc} />
    <meta name="keywords" content={pageKeywords} />
    <meta name="applicable-device" content="pc,mobile" />
    <meta http-equiv="Cache-Control" content="no-transform" />
    <meta name="robots" content="index,follow" />
    <meta property="og:title" content={pageTitle} />
    <meta property="og:description" content={pageDesc} />
    <meta property="og:type" content="website" />
    <meta property="og:url" content={canonicalUrl} />
    <link rel="canonical" href={canonicalUrl} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={pageTitle} />
    <meta name="twitter:description" content={pageDesc} />
    <meta name="twitter:image" content={`https://${fallbackHost}/og.png`} />
    {#if faqJsonLd}
        {@html `<script type="application/ld+json">${JSON.stringify(faqJsonLd).replace(/</g, '\\u003c')}</script>`}
    {/if}
</svelte:head>

<div class="page">
    <SupportedServices />

    <main class="container" tabindex="-1" data-first-focus>
        <header class="hero">
            <h1>{localeContent.h1}</h1>
            <p class="lede">{localeContent.lede}</p>
        </header>

        <section class="omnibox">
            <Omnibox />
        </section>

        <section class="card">
            <h2>{localeContent.stepsTitle}</h2>
            <ol class="list">
                {#each localeContent.steps as step}
                    <li>{step}</li>
                {/each}
            </ol>
        </section>

        <section class="card">
            <h2>{localeContent.featuresTitle}</h2>
            <ul class="list">
                {#each localeContent.features as feature}
                    <li>{feature}</li>
                {/each}
            </ul>
        </section>

        <section class="card faq">
            <h2>{localeContent.faqTitle}</h2>
            <div class="faq-list">
                {#each localeContent.faqs as item}
                    <details class="faq-item">
                        <summary>{item.q}</summary>
                        <p>{item.a}</p>
                    </details>
                {/each}
            </div>
        </section>

        <p class="disclaimer">{localeContent.disclaimer}</p>
    </main>
</div>

<style>
    .page {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: calc(var(--padding) / 2);
    }

    .container {
        width: 100%;
        max-width: 980px;
        display: flex;
        flex-direction: column;
        gap: calc(var(--padding) / 1.25);
    }

    .hero h1 {
        font-size: 32px;
        line-height: 1.2;
        margin: 0;
        letter-spacing: -0.02em;
        color: var(--secondary);
    }

    .lede {
        margin: 8px 0 0 0;
        color: var(--secondary);
        opacity: 0.85;
        font-size: 15px;
        line-height: 1.6;
    }

    .omnibox {
        display: flex;
        justify-content: center;
    }

    .card {
        background: var(--button);
        border-radius: calc(var(--border-radius) * 1.25);
        padding: calc(var(--padding) / 1.25);
        box-shadow:
            var(--button-box-shadow),
            0 0 10px 10px var(--button-stroke);
    }

    .card h2 {
        margin: 0 0 10px 0;
        font-size: 18px;
        letter-spacing: -0.01em;
        color: var(--secondary);
    }

    .list {
        margin: 0;
        padding-left: 18px;
        display: grid;
        gap: 8px;
        color: var(--secondary);
        opacity: 0.9;
        line-height: 1.6;
    }

    .faq-list {
        display: grid;
        gap: 10px;
    }

    .faq-item {
        background: var(--button-elevated);
        border-radius: calc(var(--border-radius));
        padding: 10px 12px;
    }

    .faq-item summary {
        cursor: pointer;
        font-weight: 600;
        color: var(--secondary);
        list-style: none;
        outline: none;
    }

    .faq-item summary::-webkit-details-marker {
        display: none;
    }

    .faq-item p {
        margin: 8px 0 0 0;
        color: var(--secondary);
        opacity: 0.85;
        line-height: 1.6;
    }

    .disclaimer {
        margin: 0;
        padding: 0 2px;
        color: var(--secondary);
        opacity: 0.7;
        font-size: 13px;
        line-height: 1.6;
        text-align: center;
    }

    @media screen and (max-width: 700px) {
        .hero h1 {
            font-size: 26px;
        }

        .card {
            padding: calc(var(--padding) / 1.5);
        }
    }
</style>

