<script lang="ts">
    import env from '$lib/env';
    import { getSeoLandingLocale } from '$lib/seo/landing-pages';

    import Omnibox from '$components/save/Omnibox.svelte';
    import SupportedServices from '$components/save/SupportedServices.svelte';

    export let data: {
        lang: string;
        slug: string;
        landing: import('$lib/seo/landing-pages').SeoLandingPage;
        guideSlug: string | null;
        relatedPages: import('$lib/seo/landing-pages').SeoLandingPage[];
    };

    const fallbackHost = env.HOST || 'freesavevideo.online';

    $: localeContent = getSeoLandingLocale(data.landing, data.lang);
    $: isZh = data.lang === 'zh';
    $: canonicalUrl = `https://${fallbackHost}/${data.lang}/download/${data.slug}`;
    $: guideUrl = data.guideSlug ? `/${data.lang}/guide/${data.guideSlug}` : null;
    $: faqUrl = `/${data.lang}/faq`;
    $: guideIndexUrl = `/${data.lang}/guide`;
    $: downloadIndexUrl = `/${data.lang}/download`;
    $: homeUrl = `/${data.lang}`;
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
    $: breadcrumbJsonLd = canonicalUrl
        ? {
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                  {
                      '@type': 'ListItem',
                      position: 1,
                      name: isZh ? '首页' : 'Home',
                      item: `https://${fallbackHost}/${data.lang}`,
                  },
                  {
                      '@type': 'ListItem',
                      position: 2,
                      name: isZh ? '下载' : 'Download',
                      item: `https://${fallbackHost}/${data.lang}/download`,
                  },
              ],
          }
        : null;
    $: structuredData = [faqJsonLd, breadcrumbJsonLd].filter(Boolean);
</script>

<svelte:head>
    <title>{pageTitle}</title>
    <meta name="description" content={pageDesc} />
    <meta name="keywords" content={pageKeywords} />
    <meta name="applicable-device" content="pc,mobile" />
    <meta http-equiv="Cache-Control" content="no-transform" />
    <meta property="og:title" content={pageTitle} />
    <meta property="og:description" content={pageDesc} />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={pageTitle} />
    <meta name="twitter:description" content={pageDesc} />
    <meta name="twitter:image" content={`https://${fallbackHost}/og.png`} />
    {#if structuredData.length}
        {#each structuredData as ld}
            {@html `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`}
        {/each}
    {/if}
</svelte:head>

<div class="page">
    <div class="services">
        <SupportedServices />
    </div>

    <main class="container" tabindex="-1" data-first-focus>
        <section class="hero">
            <div class="hero-copy">
                <h1>{localeContent.h1}</h1>
                <p class="lede">{localeContent.lede}</p>
            </div>
            <div class="hero-omnibox">
                <Omnibox />
            </div>
        </section>

        <nav class="crumb-links" aria-label="Breadcrumb">
            <a href={homeUrl}>{isZh ? '首页' : 'Home'}</a>
            <span>/</span>
            <a href={downloadIndexUrl}>{isZh ? '下载' : 'Download'}</a>
            <span>/</span>
            <span class="crumb-current">{localeContent.h1}</span>
        </nav>

        <section class="section-grid">
            <section class="card steps">
                <h2>{localeContent.stepsTitle}</h2>
                <ol class="step-list">
                    {#each localeContent.steps as step}
                        <li>{step}</li>
                    {/each}
                </ol>
            </section>

            <section class="card features">
                <h2>{localeContent.featuresTitle}</h2>
                <ul class="feature-list">
                    {#each localeContent.features as feature}
                        <li>{feature}</li>
                    {/each}
                </ul>
            </section>
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

        <section class="card related">
            <h2>{isZh ? '相关页面' : 'Related links'}</h2>
            <div class="related-grid">
                <section class="related-column">
                    <h3>{isZh ? '核心入口' : 'Core pages'}</h3>
                    <div class="related-links">
                        <a class="related-link related-link--primary" href={downloadIndexUrl}>
                            {isZh ? '下载目录' : 'Download directory'}
                        </a>
                        {#if guideUrl}
                            <a class="related-link" href={guideUrl}>
                                {isZh ? '查看该平台指南' : 'Read the platform guide'}
                            </a>
                        {/if}
                        <a class="related-link" href={guideIndexUrl}>
                            {isZh ? '浏览全部指南' : 'Browse all guides'}
                        </a>
                        <a class="related-link" href={faqUrl}>
                            {isZh ? '打开 FAQ' : 'Open FAQ'}
                        </a>
                    </div>
                </section>

                <section class="related-column">
                    <h3>{isZh ? '同类下载页' : 'Similar downloads'}</h3>
                    <div class="related-links">
                        {#each data.relatedPages.slice(0, 4) as related}
                            {@const relatedLocale = getSeoLandingLocale(related, data.lang)}
                            <a
                                class="related-link related-link--download"
                                href={`/${data.lang}/download/${related.slug}`}
                                title={relatedLocale.h1}
                            >
                                <span class="related-link-title">{relatedLocale.h1}</span>
                                <span class="related-link-desc">{relatedLocale.lede}</span>
                            </a>
                        {/each}
                    </div>
                </section>
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
        gap: calc(var(--padding) / 1.5);
        padding: 0 var(--padding) calc(var(--padding) * 2);
        background:
            radial-gradient(
                circle at 12% 8%,
                rgba(var(--accent-rgb), 0.12),
                transparent 50%
            ),
            radial-gradient(
                circle at 88% 12%,
                rgba(var(--accent-rgb), 0.08),
                transparent 45%
            );
    }

    .container {
        width: 100%;
        max-width: 980px;
        display: flex;
        flex-direction: column;
        gap: calc(var(--padding) / 1.1);
    }

    .services {
        width: 100%;
        max-width: 980px;
    }

    .hero {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
        gap: 20px;
        padding: 22px;
        border-radius: calc(var(--border-radius) * 1.6);
        border: 1px solid var(--button-stroke);
        background: linear-gradient(
            135deg,
            rgba(var(--accent-rgb), 0.16),
            var(--button)
        );
        box-shadow: var(--button-box-shadow);
    }

    .hero-copy h1 {
        font-size: clamp(26px, 3.4vw, 36px);
        line-height: 1.15;
        margin: 0;
        letter-spacing: -0.02em;
        color: var(--secondary);
    }

    .lede {
        margin: 10px 0 0 0;
        color: var(--secondary);
        opacity: 0.85;
        font-size: 15.5px;
        line-height: 1.6;
    }

    .hero-omnibox {
        background: var(--button);
        border-radius: calc(var(--border-radius) * 1.25);
        padding: 14px;
        border: 1px solid var(--button-stroke);
        box-shadow:
            var(--button-box-shadow),
            0 0 14px rgba(0, 0, 0, 0.08);
    }

    .crumb-links {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        font-size: 0.86rem;
        color: var(--subtext);
    }

    .crumb-links a {
        color: var(--secondary);
        text-decoration: none;
    }

    .crumb-links a:hover {
        text-decoration: underline;
    }

    .crumb-current {
        opacity: 0.82;
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

    .section-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: calc(var(--padding) / 1.25);
    }

    .step-list,
    .feature-list {
        margin: 0;
        padding: 0;
        display: grid;
        gap: 10px;
        color: var(--secondary);
        opacity: 0.92;
        line-height: 1.6;
    }

    .step-list {
        list-style: none;
        counter-reset: step;
    }

    .step-list li {
        counter-increment: step;
        display: grid;
        grid-template-columns: 32px 1fr;
        gap: 12px;
        align-items: start;
        padding: 12px 12px;
        border-radius: 14px;
        background: var(--button-elevated);
        border: 1px solid var(--button-stroke);
    }

    .step-list li::before {
        content: counter(step);
        width: 30px;
        height: 30px;
        display: grid;
        place-items: center;
        border-radius: 10px;
        background: rgba(var(--accent-rgb), 0.2);
        color: var(--secondary);
        font-weight: 700;
    }

    .feature-list {
        list-style: none;
    }

    .feature-list li {
        position: relative;
        padding-left: 22px;
    }

    .feature-list li::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0.6em;
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: rgba(var(--accent-rgb), 0.8);
    }

    .faq-list {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }

    .faq-item {
        background: var(--button-elevated);
        border-radius: calc(var(--border-radius));
        padding: 12px 14px;
        border: 1px solid var(--button-stroke);
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

    .related-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 12px;
    }

    .related-column {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .related-column h3 {
        margin: 0;
        font-size: 14px;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: rgba(var(--accent-rgb), 0.9);
    }

    .related-links {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
    }

    .related-link {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        min-height: 40px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid var(--button-stroke);
        background: var(--button-elevated);
        color: var(--secondary);
        text-decoration: none;
        line-height: 1.45;
    }

    .related-link:hover {
        background: var(--button-hover);
    }

    .related-link--primary {
        border-color: rgba(var(--accent-rgb), 0.35);
        background: rgba(var(--accent-rgb), 0.14);
        color: var(--secondary);
    }

    .related-link--download {
        min-height: 56px;
    }

    .related-link-title {
        font-weight: 600;
    }

    .related-link-desc {
        font-size: 0.83rem;
        opacity: 0.82;
    }

    .disclaimer {
        margin: 4px 0 0;
        padding: 0 2px;
        color: var(--secondary);
        opacity: 0.7;
        font-size: 13px;
        line-height: 1.6;
        text-align: center;
    }

    @media screen and (max-width: 700px) {
        .hero {
            grid-template-columns: 1fr;
            padding: 18px;
        }

        .card {
            padding: calc(var(--padding) / 1.5);
        }

        .hero-omnibox {
            padding: 12px;
        }

        .crumb-links {
            font-size: 0.8rem;
        }

        .step-list li {
            grid-template-columns: 26px 1fr;
        }

        .step-list li::before {
            width: 26px;
            height: 26px;
        }
    }
</style>
