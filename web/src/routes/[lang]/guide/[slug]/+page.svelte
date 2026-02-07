<script lang="ts">
    import env from '$lib/env';
    import { getSeoLandingLocale, EN_BRAND, ZH_BRAND } from '$lib/seo/landing-pages';
    import { getRelatedDownloadLinks, getRelatedGuideLinks } from '$lib/seo/internal-links';

    import SupportedServices from '$components/save/SupportedServices.svelte';

    export let data: {
        lang: string;
        slug: string;
        guide: import('$lib/seo/guide-pages').GuidePage;
        landing: import('$lib/seo/landing-pages').SeoLandingPage;
    };

    const fallbackHost = env.HOST || 'freesavevideo.online';

    $: localeContent = getSeoLandingLocale(data.landing, data.lang);
    $: isZh = data.lang === 'zh';
    $: guideTitle = isZh
        ? `${localeContent.h1}指南`
        : `Guide to ${localeContent.h1}`;
    $: pageTitle = `${guideTitle} - ${isZh ? ZH_BRAND : EN_BRAND}`;
    $: pageDesc = isZh
        ? `一步步了解如何下载 ${data.guide.platform} 内容，并查看常见问题与使用建议。`
        : `Step-by-step guide to download ${data.guide.platform} content with tips and FAQs.`;
    $: pageKeywords = localeContent.metaKeywords.join(',');
    $: canonicalUrl = `https://${fallbackHost}/${data.lang}/guide/${data.slug}`;
    $: downloadUrl = `https://${fallbackHost}/${data.lang}/download/${data.guide.landingSlug}`;
    $: guideIndexUrl = `/${data.lang}/guide`;
    $: faqUrl = `/${data.lang}/faq`;
    $: downloadHubUrl = `/${data.lang}/download`;
    $: relatedGuides = getRelatedGuideLinks(data.slug, 4);
    $: relatedDownloads = getRelatedDownloadLinks(data.guide.landingSlug, 4);

    const ctaLabel = isZh ? '去下载' : 'Download Now';
    const ctaHint = isZh ? '跳转到下载页面' : 'Open the downloader';

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
                      name: isZh ? '指南' : 'Guide',
                      item: `https://${fallbackHost}/${data.lang}/guide`,
                  },
                  {
                      '@type': 'ListItem',
                      position: 3,
                      name: guideTitle,
                      item: canonicalUrl,
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
    <meta property="og:title" content={pageTitle} />
    <meta property="og:description" content={pageDesc} />
    <meta property="og:type" content="article" />
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

    <main class="container">
        <section class="hero">
            <div class="hero-copy">
                <p class="eyebrow">{isZh ? '下载指南' : 'Download guide'}</p>
                <h1>{guideTitle}</h1>
                <p class="lede">{localeContent.lede}</p>
                <div class="cta-row">
                    <a class="btn primary" href={downloadUrl}>{ctaLabel}</a>
                    <span class="cta-hint">{ctaHint}</span>
                </div>
            </div>
            <div class="hero-card">
                <h2>{localeContent.stepsTitle}</h2>
                <ol class="step-list">
                    {#each localeContent.steps as step}
                        <li>{step}</li>
                    {/each}
                </ol>
            </div>
        </section>

        <section class="grid">
            <section class="card tips">
                <h2>{localeContent.featuresTitle}</h2>
                <ul>
                    {#each localeContent.features as feature}
                        <li>{feature}</li>
                    {/each}
                </ul>
            </section>
            <section class="card details">
                <h2>{isZh ? '使用说明' : 'Usage notes'}</h2>
                <p>
                    {isZh
                        ? '复制链接后直接粘贴到下载页即可解析。解析结果以平台返回的资源为准。'
                        : 'Copy the link and paste it into the downloader. Results depend on what the platform provides.'}
                </p>
                <p>
                    {isZh
                        ? '如果链接无法解析，请确认内容可公开访问，必要时更换网络或稍后再试。'
                        : 'If a link fails, confirm it is publicly accessible and try again later or switch networks.'}
                </p>
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
            <h2>{isZh ? '延伸链接' : 'Related links'}</h2>
            <div class="related-links">
                <a class="related-link related-link--primary" href={downloadHubUrl}>
                    Download directory
                </a>
                <a class="related-link related-link--primary" href={downloadUrl}>
                    {isZh ? '打开对应下载页' : 'Open downloader page'}
                </a>
                <a class="related-link related-link--primary" href={guideIndexUrl}>
                    {isZh ? '浏览全部下载指南' : 'Browse all guides'}
                </a>
                <a class="related-link related-link--primary" href={faqUrl}>
                    {isZh ? '查看常见问题' : 'Open FAQ'}
                </a>
                {#each relatedGuides as guide}
                    <a class="related-link" href={`/${data.lang}/guide/${guide.slug}`}>
                        {guide.platform} {isZh ? '指南' : 'guide'}
                    </a>
                {/each}
                {#each relatedDownloads as item}
                    <a class="related-link" href={`/${data.lang}/download/${item.slug}`}>
                        {item.platform} {isZh ? '下载页' : 'download page'}
                    </a>
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
        gap: calc(var(--padding) / 1.25);
        padding: 0 var(--padding) calc(var(--padding) * 2);
        background:
            radial-gradient(
                circle at 12% 8%,
                rgba(var(--accent-rgb), 0.12),
                transparent 50%
            ),
            radial-gradient(
                circle at 88% 14%,
                rgba(var(--accent-rgb), 0.08),
                transparent 45%
            );
    }

    .services {
        width: 100%;
        max-width: 1020px;
    }

    .container {
        width: 100%;
        max-width: 1020px;
        display: flex;
        flex-direction: column;
        gap: calc(var(--padding) / 1.1);
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

    .eyebrow {
        margin: 0 0 8px;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: rgba(var(--accent-rgb), 0.9);
        font-weight: 700;
    }

    .hero-copy h1 {
        margin: 0;
        font-size: clamp(24px, 3.2vw, 34px);
        color: var(--secondary);
    }

    .lede {
        margin: 10px 0 0;
        color: var(--secondary);
        opacity: 0.85;
        font-size: 15.5px;
        line-height: 1.6;
    }

    .cta-row {
        margin-top: 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
    }

    .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px 16px;
        border-radius: 999px;
        border: 1px solid var(--surface-2, var(--popup-stroke));
        background: var(--button);
        box-shadow: var(--button-box-shadow);
        font-weight: 700;
        font-size: 0.9rem;
        color: var(--text);
        text-decoration: none;
        white-space: nowrap;
        transition: transform 0.12s ease, background 0.12s ease, opacity 0.12s ease;
    }

    .btn.primary {
        background: var(--accent);
        color: var(--white);
        border-color: transparent;
        box-shadow: none;
    }

    .btn.primary:hover {
        background: var(--accent-hover);
    }

    .cta-hint {
        color: var(--secondary);
        opacity: 0.7;
        font-size: 0.9rem;
    }

    .hero-card {
        background: var(--button);
        border-radius: calc(var(--border-radius) * 1.2);
        padding: 16px;
        border: 1px solid var(--button-stroke);
        box-shadow:
            var(--button-box-shadow),
            0 0 12px rgba(0, 0, 0, 0.08);
    }

    .hero-card h2 {
        margin: 0 0 10px;
        font-size: 18px;
        color: var(--secondary);
    }

    .step-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 10px;
        counter-reset: step;
    }

    .step-list li {
        counter-increment: step;
        display: grid;
        grid-template-columns: 28px 1fr;
        gap: 12px;
        align-items: start;
        padding: 10px 12px;
        border-radius: 12px;
        background: var(--button-elevated);
        border: 1px solid var(--button-stroke);
    }

    .step-list li::before {
        content: counter(step);
        width: 28px;
        height: 28px;
        display: grid;
        place-items: center;
        border-radius: 9px;
        background: rgba(var(--accent-rgb), 0.2);
        color: var(--secondary);
        font-weight: 700;
    }

    .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: calc(var(--padding) / 1.25);
    }

    .card {
        background: var(--button);
        border-radius: calc(var(--border-radius) * 1.25);
        padding: calc(var(--padding) / 1.25);
        border: 1px solid var(--button-stroke);
        box-shadow:
            var(--button-box-shadow),
            0 0 10px 10px var(--button-stroke);
    }

    .card h2 {
        margin: 0 0 10px;
        font-size: 18px;
        color: var(--secondary);
    }

    .tips ul {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 10px;
        color: var(--secondary);
        opacity: 0.92;
        line-height: 1.6;
    }

    .tips li {
        position: relative;
        padding-left: 22px;
    }

    .tips li::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0.6em;
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: rgba(var(--accent-rgb), 0.8);
    }

    .details p {
        margin: 0 0 10px;
        color: var(--secondary);
        opacity: 0.85;
        line-height: 1.6;
    }

    .details p:last-child {
        margin-bottom: 0;
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
        margin: 8px 0 0;
        color: var(--secondary);
        opacity: 0.85;
        line-height: 1.6;
    }

    .related h2 {
        margin: 0 0 10px;
        font-size: 18px;
        color: var(--secondary);
    }

    .related-links {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }

    .related-link {
        display: flex;
        align-items: center;
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
        border-color: rgba(var(--accent-rgb), 0.3);
        background: rgba(var(--accent-rgb), 0.1);
        font-weight: 600;
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

    @media screen and (max-width: 800px) {
        .hero {
            grid-template-columns: 1fr;
            padding: 18px;
        }

        .hero-card {
            padding: 14px;
        }

        .step-list li {
            grid-template-columns: 24px 1fr;
        }

        .step-list li::before {
            width: 24px;
            height: 24px;
        }
    }
</style>
