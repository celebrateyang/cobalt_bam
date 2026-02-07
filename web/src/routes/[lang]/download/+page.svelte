<script lang="ts">
    import env from '$lib/env';

    import SupportedServices from '$components/save/SupportedServices.svelte';

    export let data: {
        lang: string;
        cards: Array<{
            slug: string;
            h1: string;
            lede: string;
            keywords: string[];
            guideSlug: string | null;
        }>;
    };

    const fallbackHost = env.HOST || 'freesavevideo.online';

    $: isZh = data.lang === 'zh';
    $: pageTitle = isZh ? '下载目录' : 'Download directory';
    $: pageDesc = isZh
        ? '按平台浏览全部下载页面，并快速进入对应指南与常见问题。'
        : 'Browse all downloader landing pages by platform, with quick links to guides and FAQ.';
    $: canonicalUrl = `https://${fallbackHost}/${data.lang}/download`;

    $: breadcrumbJsonLd = {
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
                name: pageTitle,
                item: canonicalUrl,
            },
        ],
    };

    $: itemListJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: data.cards.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: item.h1,
            url: `https://${fallbackHost}/${data.lang}/download/${item.slug}`,
        })),
    };
</script>

<svelte:head>
    <title>{pageTitle}</title>
    <meta name="description" content={pageDesc} />
    <meta property="og:title" content={pageTitle} />
    <meta property="og:description" content={pageDesc} />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={pageTitle} />
    <meta name="twitter:description" content={pageDesc} />
    <meta name="twitter:image" content={`https://${fallbackHost}/og.png`} />
    <script type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
    </script>
    <script type="application/ld+json">
        {JSON.stringify(itemListJsonLd)}
    </script>
</svelte:head>

<div class="page">
    <div class="services">
        <SupportedServices />
    </div>

    <main class="container" tabindex="-1" data-first-focus>
        <section class="hero card">
            <p class="eyebrow">{isZh ? '平台聚合页' : 'Platform index'}</p>
            <h1>{pageTitle}</h1>
            <p class="lede">{pageDesc}</p>
            <div class="hero-links">
                <a class="hero-link" href={`/${data.lang}`}>
                    {isZh ? '返回首页下载' : 'Back to home downloader'}
                </a>
                <a class="hero-link" href={`/${data.lang}/guide`}>
                    {isZh ? '查看下载指南' : 'Browse guides'}
                </a>
                <a class="hero-link" href={`/${data.lang}/faq`}>
                    FAQ
                </a>
            </div>
        </section>

        <section class="grid" aria-label={pageTitle}>
            {#each data.cards as item}
                <article class="card item-card">
                    <h2>{item.h1}</h2>
                    <p>{item.lede}</p>

                    <div class="chips">
                        {#each item.keywords as keyword}
                            <span class="chip">{keyword}</span>
                        {/each}
                    </div>

                    <div class="actions">
                        <a class="btn btn-primary" href={`/${data.lang}/download/${item.slug}`}>
                            {isZh ? '打开下载页' : 'Open download page'}
                        </a>
                        {#if item.guideSlug}
                            <a class="btn" href={`/${data.lang}/guide/${item.guideSlug}`}>
                                {isZh ? '查看指南' : 'View guide'}
                            </a>
                        {/if}
                    </div>
                </article>
            {/each}
        </section>
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
        max-width: 1100px;
    }

    .container {
        width: 100%;
        max-width: 1100px;
        display: flex;
        flex-direction: column;
        gap: calc(var(--padding) / 1.1);
    }

    .card {
        background: var(--button);
        border-radius: calc(var(--border-radius) * 1.25);
        padding: calc(var(--padding) / 1.1);
        border: 1px solid var(--button-stroke);
        box-shadow:
            var(--button-box-shadow),
            0 0 10px 10px var(--button-stroke);
    }

    .hero {
        padding: 22px;
    }

    .eyebrow {
        margin: 0 0 8px;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: rgba(var(--accent-rgb), 0.9);
        font-weight: 700;
    }

    .hero h1 {
        margin: 0;
        font-size: clamp(24px, 3.2vw, 36px);
        color: var(--secondary);
    }

    .lede {
        margin: 10px 0 0;
        color: var(--secondary);
        opacity: 0.85;
        font-size: 15.5px;
        line-height: 1.6;
    }

    .hero-links {
        margin-top: 14px;
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
    }

    .hero-link {
        display: inline-flex;
        align-items: center;
        min-height: 38px;
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid var(--button-stroke);
        background: var(--button-elevated);
        color: var(--secondary);
        text-decoration: none;
        font-weight: 600;
    }

    .hero-link:hover {
        background: var(--button-hover);
    }

    .grid {
        display: grid;
        gap: calc(var(--padding) / 1.2);
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }

    .item-card h2 {
        margin: 0;
        color: var(--secondary);
        font-size: 18px;
        line-height: 1.35;
    }

    .item-card p {
        margin: 8px 0 0;
        color: var(--secondary);
        opacity: 0.86;
        line-height: 1.55;
        min-height: 48px;
    }

    .chips {
        margin-top: 12px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .chip {
        display: inline-flex;
        align-items: center;
        min-height: 26px;
        padding: 4px 9px;
        border-radius: 999px;
        border: 1px solid var(--button-stroke);
        background: var(--button-elevated);
        color: var(--subtext);
        font-size: 0.78rem;
    }

    .actions {
        margin-top: 14px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 36px;
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid var(--button-stroke);
        background: var(--button-elevated);
        color: var(--secondary);
        text-decoration: none;
        font-weight: 600;
    }

    .btn:hover {
        background: var(--button-hover);
    }

    .btn-primary {
        background: var(--accent);
        color: var(--white);
        border-color: transparent;
    }

    .btn-primary:hover {
        background: var(--accent-hover);
    }

    @media (max-width: 640px) {
        .hero,
        .card {
            border-radius: 14px;
        }

        .item-card p {
            min-height: 0;
        }

        .actions,
        .hero-links {
            display: grid;
            grid-template-columns: 1fr;
        }
    }
</style>
