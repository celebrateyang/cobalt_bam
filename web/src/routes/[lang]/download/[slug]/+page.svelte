<script lang="ts">
    import env from '$lib/env';
    import { getSeoLandingLocale } from '$lib/seo/landing-pages';
    import { getPlatformKey, getSeoRuntimeContent } from '$lib/seo/runtime-content';

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
    $: discoverUrl = `/${data.lang}/discover`;
    $: guideIndexUrl = `/${data.lang}/guide`;
    $: downloadIndexUrl = `/${data.lang}/download`;
    $: homeUrl = `/${data.lang}`;
    $: downloadHubLabel = isZh ? '\u70ed\u95e8\u5e73\u53f0\u89c6\u9891\u4e0b\u8f7d\u76ee\u5f55' : 'Popular video downloader directory';
    $: currentGuideLabel = isZh
        ? `${localeContent.h1}\u4f7f\u7528\u6307\u5357`
        : `How to use ${localeContent.h1}`;
    $: guideHubLabel = isZh ? '\u70ed\u95e8\u5e73\u53f0\u4e0b\u8f7d\u6307\u5357' : 'Popular download guides';
    $: faqLabel = isZh ? '\u89c6\u9891\u4e0b\u8f7d\u5e38\u89c1\u95ee\u9898' : 'Video download FAQ';
    $: discoverLabel = isZh ? '\u70ed\u95e8\u89c6\u9891\u53d1\u73b0' : 'Trending video discovery';
    $: pageTitle = localeContent.metaTitle;
    $: pageDesc = localeContent.metaDescription;
    $: pageKeywords = localeContent.metaKeywords.join(',');
    $: runtimeContent = getSeoRuntimeContent(data.lang);
    $: contentUpdatedAt = runtimeContent.updatedAt;
    $: platformKey = getPlatformKey(data.slug);
    $: productFaqs = runtimeContent.productFaqs;
    $: productTips = runtimeContent.productTips;
    $: productAdvantages = runtimeContent.productAdvantages;
    $: releaseNotes = runtimeContent.releaseNotes;
    $: platformFaqs = runtimeContent.platformFaqs[platformKey] ?? runtimeContent.platformFaqs.generic;
    $: platformPlaybook =
        runtimeContent.platformPlaybooks[platformKey] ?? runtimeContent.platformPlaybooks.generic;
    $: platformFailureCases =
        runtimeContent.platformFailureCases[platformKey] ?? runtimeContent.platformFailureCases.generic;
    $: freeTools = runtimeContent.freeTools.map((tool) => ({
        title: tool.title,
        desc: tool.desc,
        href: `/${data.lang}/${tool.path}`,
    }));
    $: mergedFaqs = (() => {
        const ordered = [...platformFaqs, ...productFaqs, ...localeContent.faqs];
        const seen = new Set<string>();
        return ordered.filter((item) => {
            if (seen.has(item.q)) return false;
            seen.add(item.q);
            return true;
        });
    })();
    $: faqJsonLd = canonicalUrl
        ? {
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: mergedFaqs.map((item) => ({
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
                      name: isZh ? '\u9996\u9875' : 'Home',
                      item: `https://${fallbackHost}/${data.lang}`,
                  },
                  {
                      '@type': 'ListItem',
                      position: 2,
                      name: isZh ? '\u4e0b\u8f7d' : 'Download',
                      item: `https://${fallbackHost}/${data.lang}/download`,
                  },
                  {
                      '@type': 'ListItem',
                      position: 3,
                      name: localeContent.h1,
                      item: canonicalUrl,
                  },
              ],
          }
        : null;
    $: howToJsonLd = canonicalUrl
        ? {
              '@context': 'https://schema.org',
              '@type': 'HowTo',
              name: localeContent.stepsTitle,
              description: localeContent.lede,
              totalTime: 'PT1M',
              tool: [
                  {
                      '@type': 'HowToTool',
                      name: 'FreeSaveVideo',
                  },
              ],
              step: localeContent.steps.map((step, index) => ({
                  '@type': 'HowToStep',
                  position: index + 1,
                  name: step,
                  text: step,
              })),
          }
        : null;
    $: webPageJsonLd = canonicalUrl
        ? {
              '@context': 'https://schema.org',
              '@type': 'WebPage',
              name: pageTitle,
              description: pageDesc,
              url: canonicalUrl,
              inLanguage: data.lang,
              isPartOf: {
                  '@type': 'WebSite',
                  name: 'FreeSaveVideo',
                  url: `https://${fallbackHost}/${data.lang}`,
              },
              mainEntity: {
                  '@type': 'WebApplication',
                  name: localeContent.h1,
                  applicationCategory: 'MultimediaApplication',
                  operatingSystem: isZh ? '\u6d4f\u89c8\u5668' : 'Web browser',
                  offers: {
                      '@type': 'Offer',
                      price: '0',
                      priceCurrency: 'USD',
                  },
              },
          }
        : null;
    $: structuredData = [webPageJsonLd, faqJsonLd, breadcrumbJsonLd, howToJsonLd].filter(Boolean);
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
    <meta name="twitter:image:alt" content="FreeSaveVideo video downloader preview" />
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

    <main class="container" tabindex="-1" data-first-focus data-focus-ring-hidden>
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
            <a href={homeUrl}>{isZh ? '\u9996\u9875' : 'Home'}</a>
            <span>/</span>
            <a href={downloadIndexUrl}>{isZh ? '\u4e0b\u8f7d' : 'Download'}</a>
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

        <section class="card practical">
            <h2>{isZh ? '实用下载提示' : 'Practical download tips'}</h2>
            <div class="practical-grid">
                <section>
                    <h3>{isZh ? '下载与保存' : 'Download and save flow'}</h3>
                    <ul class="feature-list">
                        {#each productTips as tip}
                            <li>{tip}</li>
                        {/each}
                    </ul>
                </section>
                <section>
                    <h3>{isZh ? '平台优势' : 'Platform advantages'}</h3>
                    <ul class="feature-list">
                        {#each productAdvantages as item}
                            <li>{item}</li>
                        {/each}
                    </ul>
                </section>
            </div>
        </section>

        <section class="card practical">
            <h2>{isZh ? '按平台排查常见问题' : 'Platform-specific troubleshooting'}</h2>
            <div class="faq-list">
                {#each platformFaqs as item}
                    <details class="faq-item">
                        <summary>{item.q}</summary>
                        <p>{item.a}</p>
                    </details>
                {/each}
            </div>
        </section>

        <section class="card practical">
            <h2>{platformPlaybook.heading}</h2>
            <div class="practical-grid">
                <section>
                    <h3>{isZh ? '\u5173\u952e\u5efa\u8bae' : 'Key guidance'}</h3>
                    <ul class="feature-list">
                        {#each platformPlaybook.notes as note}
                            <li>{note}</li>
                        {/each}
                    </ul>
                </section>
                <section>
                    <h3>{isZh ? '\u6210\u529f\u68c0\u67e5\u6e05\u5355' : 'Success checklist'}</h3>
                    <ul class="feature-list">
                        {#each platformPlaybook.checklist as item}
                            <li>{item}</li>
                        {/each}
                    </ul>
                </section>
            </div>
        </section>

        <section class="card practical">
            <h2>{isZh ? '\u5e73\u53f0\u6545\u969c\u6848\u4f8b\u4e0e\u4fee\u590d\u8def\u5f84' : 'Failure cases and fix paths'}</h2>
            <div class="case-grid">
                {#each platformFailureCases as failure}
                    <article class="failure-case">
                        <h3>{failure.title}</h3>
                        <p class="case-symptoms">{failure.symptoms}</p>
                        <ol class="case-fixes">
                            {#each failure.fixes as step}
                                <li>{step}</li>
                            {/each}
                        </ol>
                    </article>
                {/each}
            </div>
        </section>

        <section class="card faq">
            <h2>{localeContent.faqTitle}</h2>
            <div class="faq-list">
                {#each mergedFaqs as item}
                    <details class="faq-item">
                        <summary>{item.q}</summary>
                        <p>{item.a}</p>
                    </details>
                {/each}
            </div>
        </section>

        <section class="card related">
            <h2>{isZh ? '\u76f8\u5173\u9875\u9762' : 'Related links'}</h2>
            <div class="related-grid">
                <section class="related-column">
                    <h3>{isZh ? '\u6838\u5fc3\u5165\u53e3' : 'Core pages'}</h3>
                    <div class="related-links">
                        <a class="related-link related-link--primary" href={downloadIndexUrl}>
                            {downloadHubLabel}
                        </a>
                        {#if guideUrl}
                            <a class="related-link" href={guideUrl}>
                                {currentGuideLabel}
                            </a>
                        {/if}
                        <a class="related-link" href={guideIndexUrl}>
                            {guideHubLabel}
                        </a>
                        <a class="related-link" href={faqUrl}>
                            {faqLabel}
                        </a>
                        <a class="related-link" href={discoverUrl}>
                            {discoverLabel}
                        </a>
                    </div>
                </section>

                <section class="related-column">
                    <h3>{isZh ? '\u540c\u7c7b\u4e0b\u8f7d\u9875' : 'Similar downloads'}</h3>
                    <div class="related-links">
                        {#each data.relatedPages.slice(0, 6) as related}
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

        <section class="card related">
            <h2>{isZh ? '\u514d\u79ef\u5206\u5de5\u5177' : 'Free tools without points'}</h2>
            <div class="related-links">
                {#each freeTools as tool}
                    <a class="related-link related-link--download" href={tool.href}>
                        <span class="related-link-title">{tool.title}</span>
                        <span class="related-link-desc">{tool.desc}</span>
                    </a>
                {/each}
            </div>
        </section>

        <section class="card updates">
            <h2>{isZh ? '内容更新记录' : 'Content update notes'}</h2>
            <p class="update-meta">
                {isZh ? '最后更新：' : 'Last updated: '}
                <time datetime={contentUpdatedAt}>{contentUpdatedAt}</time>
            </p>
            <ul class="feature-list">
                {#each releaseNotes as note}
                    <li>{note}</li>
                {/each}
            </ul>
        </section>

        <p class="disclaimer">{localeContent.disclaimer}</p>
    </main>
</div>

<style>
    .page {
        --download-surface: color-mix(in srgb, var(--popup-bg) 94%, #ffffff);
        --download-panel: color-mix(in srgb, var(--popup-bg) 86%, #ffffff);
        --download-panel-hover: color-mix(in srgb, var(--button-hover) 70%, #ffffff);
        --download-border: color-mix(in srgb, var(--button-stroke) 72%, rgba(0, 0, 0, 0.1));
        --download-heading: var(--text);
        --download-copy: var(--text);
        --download-muted: var(--subtext);
        --download-accent: var(--secondary-600);
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
        max-width: 1120px;
        display: flex;
        flex-direction: column;
        gap: calc(var(--padding) / 1.1);
    }

    .services {
        width: 100%;
        max-width: 1120px;
    }

    .hero {
        display: flex;
        flex-direction: column;
        gap: 18px;
        padding: 22px;
        border-radius: calc(var(--border-radius) * 1.6);
        border: 1px solid var(--button-stroke);
        background: linear-gradient(135deg, rgba(var(--accent-rgb), 0.11), var(--download-surface));
        box-shadow: var(--button-box-shadow);
    }

    .hero-copy {
        width: 100%;
        max-width: 760px;
    }

    .hero-copy h1 {
        font-size: clamp(26px, 3.4vw, 36px);
        line-height: 1.15;
        margin: 0;
        letter-spacing: -0.02em;
        color: var(--download-heading);
    }

    .lede {
        margin: 10px 0 0 0;
        color: var(--download-muted);
        font-size: 15.5px;
        line-height: 1.6;
    }

    .hero-omnibox {
        width: 100%;
        box-sizing: border-box;
        background: transparent;
        border-radius: calc(var(--border-radius) * 1.25);
        padding: 6px 0 0;
        border: 0;
        box-shadow: none;
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
        color: var(--download-accent);
        text-decoration: none;
    }

    .crumb-links a:hover {
        text-decoration: underline;
    }

    .crumb-current {
        opacity: 0.82;
    }

    .card {
        background: var(--download-surface);
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
        color: var(--download-heading);
    }

    .section-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: calc(var(--padding) / 1.25);
    }

    .practical-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 12px;
    }

    .practical-grid h3 {
        margin: 0 0 8px;
        font-size: 14px;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: var(--download-accent);
    }

    .case-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 12px;
    }

    .failure-case {
        border: 1px solid var(--download-border);
        border-radius: 12px;
        background: var(--download-panel);
        padding: 12px;
        display: grid;
        gap: 8px;
    }

    .failure-case h3 {
        margin: 0;
        font-size: 0.98rem;
        color: var(--download-heading);
    }

    .case-symptoms {
        margin: 0;
        color: var(--download-muted);
        font-size: 0.9rem;
        line-height: 1.5;
    }

    .case-fixes {
        margin: 0;
        padding-left: 18px;
        display: grid;
        gap: 6px;
        color: var(--download-copy);
        line-height: 1.55;
    }

    .step-list,
    .feature-list {
        margin: 0;
        padding: 0;
        display: grid;
        gap: 10px;
        color: var(--download-copy);
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
        background: var(--download-panel);
        border: 1px solid var(--download-border);
    }

    .step-list li::before {
        content: counter(step);
        width: 30px;
        height: 30px;
        display: grid;
        place-items: center;
        border-radius: 10px;
        background: rgba(var(--accent-rgb), 0.2);
        color: var(--download-accent);
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
        background: var(--download-panel);
        border-radius: calc(var(--border-radius));
        padding: 12px 14px;
        border: 1px solid var(--download-border);
    }

    .faq-item summary {
        cursor: pointer;
        font-weight: 600;
        color: var(--download-heading);
        list-style: none;
        outline: none;
    }

    .faq-item summary::-webkit-details-marker {
        display: none;
    }

    .faq-item p {
        margin: 8px 0 0 0;
        color: var(--download-muted);
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
        color: var(--download-accent);
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
        border: 1px solid var(--download-border);
        background: var(--download-panel);
        color: var(--download-copy);
        text-decoration: none;
        line-height: 1.45;
    }

    .related-link:hover {
        background: var(--download-panel-hover);
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

    .updates .feature-list {
        margin-top: 0;
    }

    .update-meta {
        margin: 0 0 10px;
        color: var(--download-muted);
        font-size: 0.9rem;
    }

    .disclaimer {
        margin: 4px 0 0;
        padding: 0 2px;
        color: var(--download-muted);
        font-size: 13px;
        line-height: 1.6;
        text-align: center;
    }

    @media screen and (max-width: 700px) {
        .hero {
            padding: 18px;
        }

        .card {
            padding: calc(var(--padding) / 1.5);
        }

        .hero-omnibox {
            padding: 4px 0 0;
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
