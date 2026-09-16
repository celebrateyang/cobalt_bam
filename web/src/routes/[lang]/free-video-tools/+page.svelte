<script lang="ts">
    import env from '$lib/env';
    import { t } from '$lib/i18n/translations';
    import { getSeoRuntimeContent } from '$lib/seo/runtime-content';
    import {
        additionalSupportedServices,
        capabilityServices,
        toolCapabilities,
    } from '$lib/seo/capabilities';

    export let data: { lang: string };

    const fallbackHost = env.HOST || 'freesavevideo.online';
    const toolDescriptionKeys: Record<string, string[]> = {
        remux: ['remux.seo.description'],
        videorecord: ['home.cards.videorecord.desc'],
        clipboard: ['clipboard.guide.summary'],
        discover: ['general.seo.discover.description'],
        'random-chat': ['random-chat.header.subtitle', 'random-chat.header.membership_disclosure'],
    };

    $: canonicalUrl = `https://${fallbackHost}/${data.lang}/free-video-tools`;
    $: langPrefix = `/${data.lang}`;
    $: runtimeContent = getSeoRuntimeContent(data.lang);
    $: productQuestion = String($t('faq.items.what_is.q'));
    $: productAnswer = String($t('faq.items.what_is.a'));
    $: localizedPageTitle = `${productQuestion} ${String($t('home.tools.title'))} | FreeSaveVideo`;
    $: localizedPageDesc = productAnswer.replace(/\s+/g, ' ').trim();
    $: primaryServices = capabilityServices.slice(0, 14);
    $: serviceNames = [
        ...primaryServices.map((service) => service.name),
        ...additionalSupportedServices,
    ];
    $: toolLinks = toolCapabilities.map((tool) => {
        const localizedTool = runtimeContent.freeTools.find(
            (item) => `/${item.path}` === tool.path,
        );
        return {
            id: tool.id,
            name: localizedTool?.title ?? String($t('home.tools.title')),
            description: (toolDescriptionKeys[tool.id] ?? ['home.tools.description'])
                .map((key) => String($t(key))).join(' '),
            href: `${langPrefix}${tool.path}`,
        };
    });
    $: displayedCoreFeatures = [
        String($t('home.capabilities.supported.title')),
        String($t('home.capabilities.collection.title')),
        String($t('home.capabilities.batch.title')),
        String($t('home.capabilities.watermark.title')),
        String($t('home.capabilities.audio.title')),
    ];
    $: displayedPolicy = [
        String($t('faq.items.private_paid.a')),
        String($t('faq.items.privacy_logs.a')),
        String($t('remux.seo.description')),
    ];
    $: localizedFaqs = [
        {
            q: productQuestion,
            a: productAnswer,
        },
        {
            q: String($t('faq.items.supported_platforms.q')),
            a: String($t('faq.items.supported_platforms.a')),
        },
        {
            q: String($t('faq.items.privacy_logs.q')),
            a: String($t('faq.items.privacy_logs.a')),
        },
    ];
    $: platformTitle = String($t('faq.items.supported_platforms.q'));
    $: pageKeywords = [localizedPageTitle, ...serviceNames].join(',');
    $: appJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        '@id': `${canonicalUrl}#app`,
        name: 'FreeSaveVideo',
        url: canonicalUrl,
        inLanguage: data.lang,
        applicationCategory: 'MultimediaApplication',
        isAccessibleForFree: true,
        description: localizedPageDesc,
        featureList: displayedCoreFeatures,
        knowsAbout: serviceNames,
        offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
        },
    };
    $: faqJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        inLanguage: data.lang,
        mainEntity: localizedFaqs.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: {
                '@type': 'Answer',
                text: item.a,
            },
        })),
    };
    $: itemListJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        inLanguage: data.lang,
        itemListElement: toolLinks.map((tool, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: tool.name,
            url: `https://${fallbackHost}${tool.href}`,
        })),
    };
    $: serviceItemListJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: platformTitle,
        inLanguage: data.lang,
        itemListElement: primaryServices.map((service, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: service.name,
            url: service.landingSlug
                ? `https://${fallbackHost}${langPrefix}/download/${service.landingSlug}`
                : canonicalUrl,
        })),
    };
    $: structuredData = [appJsonLd, faqJsonLd, itemListJsonLd, serviceItemListJsonLd];
</script>

<svelte:head>
    <title>{localizedPageTitle}</title>
    <meta name="description" content={localizedPageDesc} />
    <meta
        name="keywords"
        content={pageKeywords}
    />
    <meta property="og:title" content={localizedPageTitle} />
    <meta property="og:description" content={localizedPageDesc} />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={localizedPageTitle} />
    <meta name="twitter:description" content={localizedPageDesc} />
    <meta name="twitter:image" content={`https://${fallbackHost}/og-share-v3.png`} />
    {#each structuredData as ld}
        {@html `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`}
    {/each}
</svelte:head>

<main class="geo-page" tabindex="-1" data-first-focus data-focus-ring-hidden>
    <section class="hero">
        <p class="eyebrow">{$t('home.tools.title')}</p>
        <h1>{productQuestion}</h1>
        <p>{productAnswer}</p>
        <div class="hero-actions">
            <a href={`${langPrefix}`}>{$t('faq.actions.home')}</a>
            <a href={`${langPrefix}/download`}>{$t('faq.actions.directory')}</a>
            <a href="/capabilities.json">capabilities.json</a>
        </div>
    </section>

    <section class="fact-block">
        <h2>{$t('home.capabilities.aria')}</h2>
        <div class="feature-grid">
            {#each displayedCoreFeatures as feature}
                <span>{feature}</span>
            {/each}
        </div>
    </section>

    <section class="fact-block">
        <h2>{platformTitle}</h2>
        <p>{$t('faq.items.supported_platforms.a')}</p>
        <div class="service-list">
            {#each serviceNames as service}
                <span>{service}</span>
            {/each}
        </div>
    </section>

    <section class="fact-block">
        <h2>{$t('home.tools.title')}</h2>
        <div class="tool-grid">
            {#each toolLinks as tool}
                <article>
                    <h3><a href={tool.href}>{tool.name}</a></h3>
                    <p>{tool.description}</p>
                </article>
            {/each}
        </div>
    </section>

    <section class="fact-block">
        <h2>{$t('faq.sections.privacy')}</h2>
        <ul>
            {#each displayedPolicy as item}
                <li>{item}</li>
            {/each}
        </ul>
    </section>

    <section class="fact-block">
        <h2>{$t('tabs.faq')}</h2>
        <div class="faq-list">
            {#each faqJsonLd.mainEntity as item}
                <details>
                    <summary>{item.name}</summary>
                    <p>{item.acceptedAnswer.text}</p>
                </details>
            {/each}
        </div>
    </section>
</main>

<style>
    .geo-page {
        width: min(1100px, calc(100% - 32px));
        margin: 0 auto;
        padding: 16px 0 48px;
        display: flex;
        flex-direction: column;
        gap: 18px;
    }

    .hero,
    .fact-block {
        background: var(--button);
        border: 1px solid var(--button-stroke);
        border-radius: calc(var(--border-radius) * 1.25);
        box-shadow: var(--button-box-shadow);
        padding: clamp(18px, 3vw, 28px);
    }

    .hero {
        background: linear-gradient(135deg, rgba(var(--accent-rgb), 0.16), var(--button));
    }

    .eyebrow {
        margin: 0 0 8px;
        color: rgba(var(--accent-rgb), 0.92);
        font-size: 0.8rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.08em;
    }

    h1,
    h2,
    h3,
    p {
        color: var(--secondary);
    }

    h1 {
        margin: 0;
        font-size: clamp(2rem, 4vw, 3.3rem);
        line-height: 1.08;
    }

    h2 {
        margin: 0 0 12px;
        font-size: clamp(1.25rem, 2vw, 1.65rem);
    }

    h3 {
        margin: 0;
        font-size: 1rem;
    }

    p,
    li {
        line-height: 1.65;
    }

    .hero p,
    .fact-block > p {
        max-width: 860px;
        margin: 10px 0 0;
        opacity: 0.88;
    }

    .hero-actions,
    .feature-grid,
    .service-list {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
    }

    .hero-actions {
        margin-top: 18px;
    }

    .hero-actions a,
    .feature-grid span,
    .service-list span {
        display: inline-flex;
        align-items: center;
        min-height: 34px;
        padding: 7px 11px;
        border-radius: 999px;
        border: 1px solid var(--button-stroke);
        background: var(--button-elevated);
        color: var(--secondary);
        text-decoration: none;
        font-size: 0.9rem;
    }

    .tool-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 14px;
    }

    .tool-grid article,
    .faq-list details {
        border: 1px solid var(--button-stroke);
        background: var(--button-elevated);
        border-radius: var(--border-radius);
        padding: 14px;
    }

    .tool-grid a {
        color: var(--secondary);
    }

    .tool-grid p {
        margin: 8px 0 12px;
        font-size: 0.94rem;
        opacity: 0.86;
    }

    .faq-list {
        display: grid;
        gap: 10px;
    }

    .faq-list summary {
        cursor: pointer;
        color: var(--secondary);
        font-weight: 700;
    }

    .faq-list p {
        margin: 8px 0 0;
        opacity: 0.86;
    }

    ul {
        margin: 0;
        padding-left: 20px;
        color: var(--secondary);
    }
</style>
